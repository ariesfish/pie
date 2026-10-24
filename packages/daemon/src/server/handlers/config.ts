import { CONFIG_FILES, type ConfigFile, type ModelProviderDraft } from "@pie/protocol";
import type { CommandRouter } from "../commands.js";
import { ConfigError } from "../../services/config-service.js";
import { optionalString, requiredString } from "./args.js";
import type { HandlerDeps } from "./deps.js";

const CONFIG_FILE_SET = new Set<string>(CONFIG_FILES);

function configFile(args: Record<string, unknown>): ConfigFile {
	const value = requiredString(args, "file");
	if (!CONFIG_FILE_SET.has(value)) {
		throw new ConfigError(`Unknown config file: ${value}`, "invalid_args");
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
}
