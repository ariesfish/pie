/**
 * Pi config files behind the daemon. Only settings/models/mcp are exposed as
 * JSON; auth.json is summarized as provider ids and never leaves the host.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { ErrorCodes, stripJsonComments } from "@pie/protocol";
import { MODEL_PROVIDER_ID_PATTERN, type CommandResult, type ConfigFile, type ConfigFileInfo, type ModelProviderDraft } from "@pie/protocol";

const FILE_NAMES: Record<ConfigFile, string> = {
	settings: "settings.json",
	models: "models.json",
	mcp: "mcp.json",
};

const MAX_CONFIG_BYTES = 1024 * 1024;
const LOCK_RETRY_MS = 20;
const LOCK_TIMEOUT_MS = 3000;

type ConfigErrorCode =
	| "invalid_args"
	| typeof ErrorCodes.configInvalid
	| typeof ErrorCodes.configConflict
	| typeof ErrorCodes.configTooLarge;

export class ConfigError extends Error {
	constructor(message: string, readonly code: ConfigErrorCode) {
		super(message);
		this.name = "ConfigError";
	}
}

function revisionOf(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setOptional(
	target: Record<string, unknown>,
	key: string,
	value: string | number | undefined,
): void {
	if (value === undefined) return;
	if (typeof value === "string" && value.trim().length === 0) {
		delete target[key];
		return;
	}
	target[key] = value;
}

function validateProviderDraft(draft: ModelProviderDraft): void {
	if (
		!draft ||
		typeof draft.id !== "string" ||
		!MODEL_PROVIDER_ID_PATTERN.test(draft.id) ||
		["__proto__", "prototype", "constructor"].includes(draft.id)
	) {
		throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
	}
	if (draft.name !== undefined && typeof draft.name !== "string") {
		throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
	}
	if (draft.baseUrl !== undefined && typeof draft.baseUrl !== "string") {
		throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
	}
	if (draft.api !== undefined && typeof draft.api !== "string") {
		throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
	}
	if (draft.apiKey !== undefined && typeof draft.apiKey !== "string") {
		throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
	}
	if (!Array.isArray(draft.models)) {
		throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
	}
	const ids = new Set<string>();
	for (const model of draft.models) {
		if (!model || typeof model.id !== "string" || model.id.trim().length === 0) {
			throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
		}
		if (ids.has(model.id)) {
			throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
		}
		ids.add(model.id);
		for (const key of ["name"] as const) {
			if (model[key] !== undefined && typeof model[key] !== "string") {
				throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
			}
		}
		for (const key of ["contextWindow", "maxTokens"] as const) {
			const value = model[key];
			if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
				throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
			}
		}
	}
}

function stripBom(content: string): string {
	return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function parseObject(content: string, file: ConfigFile): Record<string, unknown> {
	const text = stripBom(content);
	let value: unknown;
	try {
		// Pi accepts comments/trailing commas in models.json only; settings.json
		// and mcp.json must stay strict or Pi silently resets them to defaults.
		value = JSON.parse(file === "models" ? stripJsonComments(text) : text);
	} catch {
		throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
	}
	if (!isRecord(value)) {
		throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
	}
	return value;
}

export class ConfigService {
	private readonly agentDir: string;
	private readonly lockTails = new Map<string, Promise<void>>();

	constructor(agentDir?: string) {
		this.agentDir = agentDir ?? getAgentDir();
	}

	private pathOf(file: ConfigFile): string {
		return join(this.agentDir, FILE_NAMES[file]);
	}

	/**
	 * In-process serialization plus a `<file>.lock` directory. Pi's
	 * proper-lockfile uses the same directory convention, so the daemon and a
	 * concurrent `pi` process take the same lock.
	 */
	private async withLock<T>(file: ConfigFile, fn: () => Promise<T>): Promise<T> {
		const path = this.pathOf(file);
		const previous = this.lockTails.get(path) ?? Promise.resolve();
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.lockTails.set(path, previous.then(() => gate));
		await previous;

		const lockDir = `${path}.lock`;
		const deadline = Date.now() + LOCK_TIMEOUT_MS;
		let acquired = false;
		const owner = randomBytes(8).toString("hex");
		try {
			await mkdir(dirname(path), { recursive: true });
			for (;;) {
				try {
					await mkdir(lockDir);
					acquired = true;
					break;
				} catch (err) {
					if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
					const info = await stat(lockDir).catch(() => null);
					if (info && Date.now() - info.mtimeMs > 10_000) {
						await rm(lockDir, { recursive: true, force: true }).catch(() => {});
						if (Date.now() > deadline) {
							throw new ConfigError("config_conflict", ErrorCodes.configConflict);
						}
						await sleep(LOCK_RETRY_MS);
						continue;
					}
					if (Date.now() > deadline) {
						throw new ConfigError("config_conflict", ErrorCodes.configConflict);
					}
					await sleep(LOCK_RETRY_MS);
				}
			}
			await writeFile(join(lockDir, "owner"), owner, "utf8");
			return await fn();
		} finally {
			if (acquired) {
				const current = await readFile(join(lockDir, "owner"), "utf8").catch(() => null);
				if (current === owner) await rm(lockDir, { recursive: true, force: true }).catch(() => {});
			}
			release();
		}
	}

	private async readUnlocked(file: ConfigFile): Promise<ConfigFileInfo & { content: string }> {
		const path = this.pathOf(file);
		let content: string;
		try {
			content = await readFile(path, "utf8");
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
			return { file, path, exists: false, revision: "", content: "" };
		}
		if (Buffer.byteLength(content, "utf8") > MAX_CONFIG_BYTES) {
			throw new ConfigError("config_too_large", ErrorCodes.configTooLarge);
		}
		return { file, path, exists: true, revision: revisionOf(content), content };
	}

	async read(file: ConfigFile): Promise<ConfigFileInfo & { content: string }> {
		return this.withLock(file, () => this.readUnlocked(file));
	}

	private async writeUnlocked(
		file: ConfigFile,
		content: string,
		expectedRevision?: string,
	): Promise<{ file: ConfigFile; revision: string }> {
		if (Buffer.byteLength(content, "utf8") > MAX_CONFIG_BYTES) {
			throw new ConfigError("config_too_large", ErrorCodes.configTooLarge);
		}
		parseObject(content, file);
		const current = await this.readUnlocked(file);
		if (expectedRevision !== undefined && expectedRevision !== current.revision) {
			throw new ConfigError("config_conflict", ErrorCodes.configConflict);
		}
		const path = this.pathOf(file);
		const target = await realpath(path).catch(() => path);
		const previousMode = await stat(target).then((info) => info.mode & 0o777).catch(() => null);
		const tmp = `${target}.pie-tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
		await writeFile(tmp, content, { encoding: "utf8", mode: 0o600 });
		try {
			if (previousMode !== null) await chmod(tmp, previousMode);
			await rename(tmp, target);
		} catch (err) {
			await rm(tmp, { force: true }).catch(() => {});
			throw err;
		}
		return { file, revision: revisionOf(content) };
	}

	async write(
		file: ConfigFile,
		content: string,
		expectedRevision?: string,
	): Promise<{ file: ConfigFile; revision: string }> {
		return this.withLock(file, () => this.writeUnlocked(file, content, expectedRevision));
	}

	async upsertProvider(
		draft: ModelProviderDraft,
		expectedRevision?: string,
	): Promise<{ revision: string }> {
		validateProviderDraft(draft);
		return this.withLock("models", async () => {
			const read = await this.readUnlocked("models");
			const data = read.exists ? parseObject(read.content, "models") : {};
			const providers = isRecord(data.providers) ? { ...data.providers } : {};
			const candidate = providers[draft.id];
			const existing: Record<string, unknown> = isRecord(candidate) ? candidate : {};
			const next: Record<string, unknown> = { ...existing };
			setOptional(next, "name", draft.name);
			setOptional(next, "baseUrl", draft.baseUrl);
			setOptional(next, "api", draft.api);
			if (draft.apiKey !== undefined) {
				if (draft.apiKey.length > 0) next.apiKey = draft.apiKey;
				else delete next.apiKey;
			}
			const existingModels = Array.isArray(existing.models)
				? existing.models.filter(isRecord)
				: [];
			const byId = new Map(existingModels.map((model) => [String(model.id), model]));
			next.models = draft.models.map((model) => {
				const merged: Record<string, unknown> = { ...(byId.get(model.id) ?? {}), id: model.id };
				setOptional(merged, "name", model.name);
				setOptional(merged, "contextWindow", model.contextWindow);
				setOptional(merged, "maxTokens", model.maxTokens);
				return merged;
			});
			providers[draft.id] = next;
			data.providers = providers;
			const written = await this.writeUnlocked(
				"models",
				JSON.stringify(data, null, 2) + "\n",
				expectedRevision ?? read.revision,
			);
			await this.clearDefaultIfModelMissing(draft.id, draft.models.map((model) => model.id));
			return { revision: written.revision };
		});
	}

	async removeProvider(providerId: string, expectedRevision?: string): Promise<{ revision: string }> {
		return this.withLock("models", async () => {
			const read = await this.readUnlocked("models");
			const data = read.exists ? parseObject(read.content, "models") : {};
			const providers = isRecord(data.providers) ? { ...data.providers } : {};
			if (!Object.hasOwn(providers, providerId)) {
				throw new ConfigError("invalid_args", "invalid_args");
			}
			if (expectedRevision !== undefined && expectedRevision !== read.revision) {
				throw new ConfigError("config_conflict", ErrorCodes.configConflict);
			}
			// Only after the CAS check: a stale delete must not clear the default.
			await this.clearDefaultForDeletedProvider(providerId);
			delete providers[providerId];
			data.providers = providers;
			const written = await this.writeUnlocked(
				"models",
				JSON.stringify(data, null, 2) + "\n",
				expectedRevision ?? read.revision,
			);
			return { revision: written.revision };
		});
	}

	private async clearDefaultIfModelMissing(providerId: string, modelIds: string[]): Promise<void> {
		await this.withLock("settings", async () => {
			const read = await this.readUnlocked("settings");
			if (!read.exists) return;
			const data = parseObject(read.content, "settings");
			if (data.defaultProvider !== providerId) return;
			if (typeof data.defaultModel === "string" && modelIds.includes(data.defaultModel)) return;
			delete data.defaultProvider;
			delete data.defaultModel;
			await this.writeUnlocked("settings", JSON.stringify(data, null, 2) + "\n", read.revision);
		});
	}

	private async clearDefaultForDeletedProvider(providerId: string): Promise<void> {
		await this.withLock("settings", async () => {
			const read = await this.readUnlocked("settings");
			if (!read.exists) return;
			const data = parseObject(read.content, "settings");
			if (data.defaultProvider !== providerId) return;
			delete data.defaultProvider;
			delete data.defaultModel;
			await this.writeUnlocked(
				"settings",
				JSON.stringify(data, null, 2) + "\n",
				read.revision,
			);
		});
	}

	async setDefaultModel(
		provider: string,
		model: string,
		expectedRevision?: string,
	): Promise<{ revision: string }> {
		if (!provider.trim() || !model.trim()) {
			throw new ConfigError("config_invalid", ErrorCodes.configInvalid);
		}
		return this.withLock("settings", async () => {
			const read = await this.readUnlocked("settings");
			const data = read.exists ? parseObject(read.content, "settings") : {};
			data.defaultProvider = provider.trim();
			data.defaultModel = model.trim();
			const written = await this.writeUnlocked(
				"settings",
				JSON.stringify(data, null, 2) + "\n",
				expectedRevision ?? read.revision,
			);
			return { revision: written.revision };
		});
	}

	async overview(): Promise<CommandResult<"config.overview">> {
		const errors: Partial<Record<ConfigFile, string>> = {};
		const files = {} as Record<ConfigFile, ConfigFileInfo>;
		const contents: Partial<Record<ConfigFile, Record<string, unknown>>> = {};
		for (const file of Object.keys(FILE_NAMES) as ConfigFile[]) {
			const read = await this.read(file);
			files[file] = { file, path: read.path, exists: read.exists, revision: read.revision };
			if (!read.exists) continue;
			try {
				contents[file] = parseObject(read.content, file);
			} catch (err) {
				errors[file] = err instanceof Error ? err.message : String(err);
			}
		}

		const settings = contents.settings ?? {};
		const models = contents.models ?? {};
		const providerMap =
			isRecord(models.providers) ? (models.providers as Record<string, Record<string, unknown>>) : {};
		const providers = Object.keys(providerMap).sort();
		const providerDetails = providers.map((id) => {
			const provider = providerMap[id] ?? {};
			const modelsList = Array.isArray(provider.models) ? provider.models.filter(isRecord) : [];
			return {
				id,
				name: typeof provider.name === "string" ? provider.name : undefined,
				baseUrl: typeof provider.baseUrl === "string" ? provider.baseUrl : undefined,
				api: typeof provider.api === "string" ? provider.api : undefined,
				modelCount: modelsList.length,
				hasApiKey: typeof provider.apiKey === "string" && provider.apiKey.length > 0,
				models: modelsList.map((model) => ({
					id: String(model.id ?? ""),
					name: typeof model.name === "string" ? model.name : undefined,
					contextWindow: typeof model.contextWindow === "number" ? model.contextWindow : undefined,
					maxTokens: typeof model.maxTokens === "number" ? model.maxTokens : undefined,
				})),
			};
		});
		const mcp = contents.mcp ?? {};
		const servers =
			isRecord(mcp.mcpServers) ? Object.keys(mcp.mcpServers).sort() : [];

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
			models: { providers, details: providerDetails },
			mcp: { servers },
			...(Object.keys(errors).length > 0 ? { errors } : {}),
		};
	}

	/** Provider ids only; credential values never leave the daemon. */
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
