import { HostSessionError, type HostSession } from "../../core/host-session.js";
import type { ClientConnection } from "../connection.js";
import type { HandlerDeps } from "./deps.js";

export function requireHost(
	deps: HandlerDeps,
	args: Record<string, unknown>,
): HostSession | HostSessionError {
	const sessionId = args["sessionId"] as string | undefined;
	const host = sessionId ? deps.registry.get(sessionId) : undefined;
	if (!host) return new HostSessionError(`Session not open: ${String(sessionId)}`, "not_found");
	return host;
}

export function requireWriter(host: HostSession, conn: ClientConnection): HostSessionError | null {
	if (host.writerConnection !== null && host.writerConnection !== conn.id) {
		return new HostSessionError(
			"Another client holds this session's write presentation",
			"presentation_readonly",
		);
	}
	return null;
}

export function permissionOptions(deps: HandlerDeps): {
	permissionMode?: HandlerDeps["permissionMode"];
	permissionTimeoutMs?: number;
} {
	return {
		permissionMode: deps.permissionMode,
		permissionTimeoutMs: deps.permissionTimeoutMs,
	};
}

/** Broadcast a fresh snapshot to a session's subscribers (post-mutation resync). */
export function resyncSnapshot(deps: HandlerDeps, host: HostSession): void {
	deps.broadcast(host.sessionId, "session.snapshot", { snapshot: host.snapshot() });
}
