/**
 * Pi config files behind the daemon. The service deliberately exposes only
 * settings/models/mcp as raw JSON: auth.json contains credentials and is
 * summarized as provider names, never returned.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ConfigFile, ConfigFileInfo } from "@pie/protocol";

const FILE_NAMES: Record<ConfigFile, string> = {
	settings: "settings.json",
	models: "models.json",
	mcp: "mcp.json",
};

const MAX_CONFIG_BYTES = 1024 * 1024;

export class ConfigError extends Error {
	constructor(
		message: string,
		readonly code: "invalid_args" | "invalid_config" | "conflict" | "too_large" | "forbidden",
	) {
		super(message);
		this.name = "ConfigError";
	}
}

function revisionOf(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function parseObject(content: string, file: ConfigFile): Record<string, unknown> {
	let value: unknown;
	try {
		value = JSON.parse(content);
	} catch (err) {
		throw new ConfigError(
			`${FILE_NAMES[file]} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
			"invalid_config",
		);
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new ConfigError(`${FILE_NAMES[file]} must contain a JSON object`, "invalid_config");
	}
	return value as Record<string, unknown>;
}

export class ConfigService {
	private readonly agentDir: string;

	constructor(agentDir?: string) {
		this.agentDir = agentDir ?? getAgentDir();
	}

	private pathOf(file: ConfigFile): string {
		return join(this.agentDir, FILE_NAMES[file]);
	}

	async read(file: ConfigFile): Promise<ConfigFileInfo & { content: string }> {
		const path = this.pathOf(file);
		let content = "";
		try {
			content = await readFile(path, "utf8");
		} catch (err) {
			const code = (err as NodeJS.ErrnoException).code;
			if (code !== "ENOENT") throw err;
			return { file, path, exists: false, revision: "", content: "" };
		}
		return { file, path, exists: true, revision: revisionOf(content), content };
	}

	async write(
		file: ConfigFile,
		content: string,
		expectedRevision?: string,
	): Promise<{ file: ConfigFile; revision: string }> {
		if (Buffer.byteLength(content, "utf8") > MAX_CONFIG_BYTES) {
			throw new ConfigError(`${FILE_NAMES[file]} exceeds the 1 MiB cap`, "too_large");
		}
		parseObject(content, file);
		const current = await this.read(file);
		if (expectedRevision !== undefined && expectedRevision !== current.revision) {
			throw new ConfigError(
				`${FILE_NAMES[file]} changed on disk; reload before saving`,
				"conflict",
			);
		}
		const path = this.pathOf(file);
		await mkdir(dirname(path), { recursive: true });
		const tmp = `${path}.pie-tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
		await writeFile(tmp, content, "utf8");
		await rename(tmp, path);
		return { file, revision: revisionOf(content) };
	}

	async overview(): Promise<{
		agentDir: string;
		files: Record<ConfigFile, ConfigFileInfo>;
		authProviders: string[];
		settings: {
			defaultProvider?: string;
			defaultModel?: string;
			defaultThinkingLevel?: string;
			theme?: string;
			defaultProjectTrust?: string;
		};
		models: { providers: string[] };
		mcp: { servers: string[] };
		errors?: Partial<Record<ConfigFile, string>>;
	}> {
		const errors: Partial<Record<ConfigFile, string>> = {};
		const files = {} as Record<ConfigFile, ConfigFileInfo>;
		const contents: Partial<Record<ConfigFile, Record<string, unknown>>> = {};
		for (const file of Object.keys(FILE_NAMES) as ConfigFile[]) {
			const read = await this.read(file);
			files[file] = {
				file,
				path: read.path,
				exists: read.exists,
				revision: read.revision,
			};
			if (!read.exists) continue;
			try {
				contents[file] = parseObject(read.content, file);
			} catch (err) {
				errors[file] = err instanceof Error ? err.message : String(err);
			}
		}

		const settings = contents.settings ?? {};
		const models = contents.models ?? {};
		const providers =
			models.providers && typeof models.providers === "object"
				? Object.keys(models.providers as Record<string, unknown>).sort()
				: [];
		const mcp = contents.mcp ?? {};
		const servers =
			mcp.mcpServers && typeof mcp.mcpServers === "object"
				? Object.keys(mcp.mcpServers as Record<string, unknown>).sort()
				: [];

		return {
			agentDir: this.agentDir,
			files,
			authProviders: await this.authProviders(),
			settings: {
				defaultProvider: typeof settings.defaultProvider === "string" ? settings.defaultProvider : undefined,
				defaultModel: typeof settings.defaultModel === "string" ? settings.defaultModel : undefined,
				defaultThinkingLevel:
					typeof settings.defaultThinkingLevel === "string" ? settings.defaultThinkingLevel : undefined,
				theme: typeof settings.theme === "string" ? settings.theme : undefined,
				defaultProjectTrust:
					typeof settings.defaultProjectTrust === "string" ? settings.defaultProjectTrust : undefined,
			},
			models: { providers },
			mcp: { servers },
			...(Object.keys(errors).length > 0 ? { errors } : {}),
		};
	}

	/** Provider ids only; auth values never cross the wire. */
	private async authProviders(): Promise<string[]> {
		try {
			const content = await readFile(join(this.agentDir, "auth.json"), "utf8");
			const parsed = JSON.parse(content) as Record<string, unknown>;
			return Object.keys(parsed).sort();
		} catch {
			return [];
		}
	}
}
