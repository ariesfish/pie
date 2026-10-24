import type { CommandRouter } from "../commands.js";
import { DAEMON_VERSION } from "../../version.js";
import type { HandlerDeps } from "./deps.js";

export function registerSystemCommands(router: CommandRouter, deps: HandlerDeps): void {
	router.register("daemon.status", async (_args, ctx) => ({
		version: DAEMON_VERSION,
		serverId: ctx.serverId,
		pi: { version: deps.piVersion, agentDir: deps.piAgentDir },
		uptimeMs: ctx.uptimeMs,
		attachedClients: deps.attachedClients(),
		openSessions: deps.registry.size,
	}));

	router.register("sync", async (args, ctx) => ctx.connection.replaySince(Number(args["sinceSeq"] ?? -1)));

	router.register("workspace.list", async () => ({ workspaces: deps.registry.workspacesInfo() }));
}
