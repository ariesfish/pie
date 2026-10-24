import { HostSessionError } from "../../core/host-session.js";
import type { CommandRouter } from "../commands.js";
import { optionalString, requiredString } from "./args.js";
import type { HandlerDeps } from "./deps.js";
import { requireHost } from "./shared.js";

export function registerResourceCommands(router: CommandRouter, deps: HandlerDeps): void {
	// --- packages + skills (P2c) -------------------------------------------------
	router.register("packages.list", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		return deps.packageService.list(workspaceId, deps.piAgentDir);
	});
	router.register("packages.install", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		const source = requiredString(args, "source");
		const project = args["project"] === true;
		return deps.packageService.install(workspaceId, deps.piAgentDir, source, project);
	});
	router.register("packages.remove", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		const source = requiredString(args, "source");
		const project = args["project"] === true;
		return deps.packageService.remove(workspaceId, deps.piAgentDir, source, project);
	});
	router.register("packages.update", async (args) => {
		const workspaceId = requiredString(args, "workspaceId");
		const source = optionalString(args, "source");
		return deps.packageService.update(workspaceId, deps.piAgentDir, source);
	});
	router.register("skills.list", async (args) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		return { skills: host.skillsList() };
	});
	router.register("skills.read", async (args) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		const filePath = requiredString(args, "filePath");
		return { content: host.readSkill(filePath) };
	});

	router.register("resources.overview", async (args) => {
		const host = requireHost(deps, args);
		if (host instanceof HostSessionError) throw host;
		return {
			extensions: host.extensionsOverview(),
			commands: host.commandsOverview(),
			skills: host.skillsOverview(),
			promptTemplates: host.promptTemplatesOverview(),
		};
	});
}
