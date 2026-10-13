/**
 * Per-connection state: hello/auth, command correlation, event sequencing
 * ring buffer (ADR-0001: 2h/10k replay window), and session subscriptions.
 */

import type { WebSocket } from "ws";
import {
	type CommandId,
	type CommandName,
	PROTOCOL_VERSION,
	type WireError,
	responseErr,
	responseOk,
} from "@pie/protocol";

export interface ConnectionSend {
	(payload: object): void;
}

export const RING_MAX_ENTRIES = 10_000;

export class ClientConnection {
	readonly id: string;
	caps: Set<string> = new Set();
	identity: { version: string; hostname: string; os: string } | null = null;
	subscribed = new Set<string>();
	authenticated = false;
	private nextSeq = 0;
	private ring: Array<{ seq: number; ev: string; data: unknown }> = [];
	private pendingCommands = new Map<CommandId, CommandName>();

	constructor(
		readonly ws: WebSocket,
		private readonly sendRaw: (text: string) => void,
	) {
		this.id = `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}

	assignSeqAndSend(ev: string, data: unknown): void {
		const seq = this.nextSeq++;
		this.ring.push({ seq, ev, data });
		if (this.ring.length > RING_MAX_ENTRIES) this.ring.splice(0, this.ring.length - RING_MAX_ENTRIES);
		this.sendRaw(JSON.stringify({ ev, seq, data }) + "\n");
	}

	replaySince(sinceSeq: number): { replayed: boolean; resumedAtSeq: number } {
		for (const frame of this.ring) {
			if (frame.seq > sinceSeq) {
				this.sendRaw(JSON.stringify({ ev: frame.ev, seq: frame.seq, data: frame.data }) + "\n");
			}
		}
		return { replayed: true, resumedAtSeq: this.nextSeq - 1 };
	}

	ok(id: CommandId, cmd: CommandName, data: unknown): void {
		this.sendRaw(JSON.stringify(responseOk(id, cmd, data)) + "\n");
	}

	err(id: CommandId, error: WireError): void {
		this.sendRaw(JSON.stringify(responseErr(id, error)) + "\n");
	}

	trackPending(id: CommandId, cmd: CommandName): void {
		this.pendingCommands.set(id, cmd);
	}
	untrackPending(id: CommandId): void {
		this.pendingCommands.delete(id);
	}

	close(): void {
		try {
			this.ws.close();
		} catch {
			// ignore
		}
	}
}
