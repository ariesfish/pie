import {
	CONFIG_FILES,
	type ConfigApplySessionResult,
	type ConfigFile,
	type ModelProviderDraft,
} from "@pie/protocol";
import type { CommandRouter } from "../commands.js";
import { ConfigError } from "../../services/config-service.js";
import { optionalString, requiredString } from "./args.js";
import type { HandlerDeps } from "./deps.js";

const CONFIG_FILE_SET = new Set<string>(CONFIG_FILES);
export const CONFIG_APPLY_TIMEOUT_MS = 10_000;

function configFiles(args: Record<string, unknown>): ConfigFile[] {
	const value = args["files"];
	if (!Array.isArray(value) || value.length === 0) {
		throw new ConfigError("invalid_args", "invalid_args");
	}
	if (value.some((file) => typeof file !== "string" || !CONFIG_FILE_SET.has(file))) {
		throw new ConfigError("invalid_args", "invalid_args");
	}
	const files = value as ConfigFile[];
	if (new Set(files).size !== files.length) {
		throw new ConfigError("invalid_args", "invalid_args");
	}
	return files;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			timer = setTimeout(() => reject(new Error("config apply timed out")), ms);
		}),
	]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}

function configFile(args: Record<string, unknown>): ConfigFile {
	const value = requiredString(args, "file");
	if (!CONFIG_FILE_SET.has(value)) {
		throw new ConfigError("invalid_args", "invalid_args");
	}
	return value as ConfigFile;
}

export function registerConfigCommands(router: CommandRouter, deps: HandlerDeps): void {
	router.register("config.overview", async () => deps.configService.overview());

	router.register("config.read", async (args) => deps.configService.read(configFile(args)));

	router.register("config.write", async (args) => {
		const file = configFile(args);
		const content = requiredString(args, "content");
		const written = await deps.configService.write(file, content, optionalString(args, "expectedRevision"));
		deps.onConfigChanged?.();
		return written;
	});

	router.register("config.models.upsertProvider", async (args) => {
		const written = await deps.configService.upsertProvider(
			args["draft"] as ModelProviderDraft,
			optionalString(args, "expectedRevision"),
		);
		deps.onConfigChanged?.();
		return written;
	});

	router.register("config.models.removeProvider", async (args) => {
		const written = await deps.configService.removeProvider(
			requiredString(args, "providerId"),
			optionalString(args, "expectedRevision"),
		);
		deps.onConfigChanged?.();
		return written;
	});

	router.register("config.models.setDefault", async (args) => {
		const written = await deps.configService.setDefaultModel(
			requiredString(args, "provider"),
			requiredString(args, "model"),
			optionalString(args, "expectedRevision"),
		);
		deps.onConfigChanged?.();
		return written;
	});

	router.register("config.apply", async (args) => {
		const files = configFiles(args);
		const hosts = deps.registry.open;
		const settled = await Promise.allSettled(
			hosts.map((host) => withTimeout(host.applyConfig(files), CONFIG_APPLY_TIMEOUT_MS)),
		);
		const sessions: ConfigApplySessionResult[] = settled.map((result, index) =>
			result.status === "fulfilled"
				? { sessionId: hosts[index]!.sessionId, ...result.value }
				: { sessionId: hosts[index]!.sessionId, status: "error" },
		);
		deps.onConfigChanged?.();
		return { sessions };
	});
}
