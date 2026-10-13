/**
 * Command routing: typed registry + handler execution context.
 * Handlers consume protocol args and return protocol results; Pi SDK types
 * stay confined to host-session/pi layers.
 */

import {
	type CommandName,
	ErrorCodes,
	type EventName,
	type WireError,
} from "@pie/protocol";
import type { SessionRegistry } from "../core/daemon.js";
import type { ClientConnection } from "./connection.js";

export interface CommandContext {
	registry: SessionRegistry;
	/** The requesting connection (for presentation locks). */
	connection: ClientConnection;
	/** Server identity from hello. */
	serverId: string;
	/** Ping a currently-running agent (daemon.status). */
	uptimeMs: number;
}

export type CommandHandler = (args: Record<string, unknown>, ctx: CommandContext) => Promise<unknown>;

export class CommandRouter {
	private handlers = new Map<CommandName, CommandHandler>();

	register(cmd: CommandName, handler: CommandHandler): void {
		this.handlers.set(cmd, handler);
	}

	has(cmd: string): boolean {
		return this.handlers.has(cmd as CommandName);
	}

	async dispatch(
		cmd: string,
		args: Record<string, unknown>,
		ctx: CommandContext,
	): Promise<{ ok: true; data: unknown } | { ok: false; error: WireError }> {
		const handler = this.handlers.get(cmd as CommandName);
		if (!handler) {
			return {
				ok: false,
				error: {
					code: ErrorCodes.notImplemented,
					message: `Command not implemented in this daemon: ${cmd}`,
				},
			};
		}
		try {
			const data = await handler(args, ctx);
			return { ok: true, data };
		} catch (err) {
			const e = err as { code?: string; message?: string };
			const map: Record<string, string> = {
				// HostSessionError codes -> wire error codes (identity where possible)
				steer_or_follow_required: ErrorCodes.steerOrFollowRequired,
				session_streaming: ErrorCodes.sessionStreaming,
				session_compacting: ErrorCodes.sessionCompacting,
				not_found: ErrorCodes.notFound,
			};
			const wireCode = e.code ? (map[e.code] ?? e.code) : ErrorCodes.internal;
			return {
				ok: false,
				error: {
					code: wireCode,
					message: e.message ?? String(err),
					retryable: wireCode === ErrorCodes.sessionStreaming || wireCode === ErrorCodes.sessionCompacting,
				},
			};
		}
	}
}

export function wireError(code: string, message: string): WireError {
	return { code, message };
}

/** Broadcast event helper shared by handlers (permission gates etc.). */
export type Broadcaster = (ev: EventName, data: unknown, sessionId: string) => void;
