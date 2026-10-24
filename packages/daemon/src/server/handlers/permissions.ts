import { HostSessionError } from "../../core/host-session.js";
import type { CommandRouter } from "../commands.js";
import { permissionDecision, requiredString, requiredStringArray } from "./args.js";
import type { HandlerDeps } from "./deps.js";

export function registerPermissionCommands(router: CommandRouter, deps: HandlerDeps): void {
	router.register("permission.respond", async (args) => {
		const requestId = requiredString(args, "requestId");
		const decision = permissionDecision(args);
		const answered = [...deps.registry.open].some((h) => h.permissionGate.respond(requestId, decision));
		if (!answered) throw new HostSessionError(`No pending permission: ${requestId}`, "request_not_found");
		return {};
	});

	router.register("permission.respondMany", async (args) => {
		const requestIds = requiredStringArray(args, "requestIds");
		const decision = permissionDecision(args);
		const settled: string[] = [];
		const unknown: string[] = [];
		for (const requestId of requestIds) {
			const answered = [...deps.registry.open].some((h) => h.permissionGate.respond(requestId, decision));
			if (answered) settled.push(requestId);
			else unknown.push(requestId);
		}
		return { settled, unknown };
	});

	router.register("ext.dialog.respond", async (args) => {
		const requestId = requiredString(args, "requestId");
		const answered = [...deps.registry.open].some((h) =>
			h.dialogs.respond(requestId, {
				value: args["value"] as string | undefined,
				confirmed: args["confirmed"] as boolean | undefined,
				cancelled: Boolean(args["cancelled"]),
			}),
		);
		if (!answered) throw new HostSessionError(`No pending dialog: ${requestId}`, "request_not_found");
		return {};
	});
}
