import type { ConfigFile } from "@pie/protocol";
import type { CommandRouter } from "../commands.js";
import { ConfigError } from "../../services/config-service.js";
import { optionalString, requiredString } from "./args.js";
import type { HandlerDeps } from "./deps.js";

const CONFIG_FILES = new Set<ConfigFile>(["settings", "models", "mcp"]);

function configFile(args: Record<string, unknown>): ConfigFile {
	const value = requiredString(args, "file");
	if (!CONFIG_FILES.has(value as ConfigFile)) {
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
		return deps.configService.write(file, content, optionalString(args, "expectedRevision"));
	});
}
