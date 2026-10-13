/**
 * PieConnection: hello handshake, command correlation, ordered event
 * delivery, and reconnect resync (ADR-0001).
 */

import {
	type ClientCapability,
	type ClientInfo,
	type HelloAck,
	type CommandId,
	type CommandName,
	type CommandResult,
	type EventEnvelope,
	JsonlDecoder,
	PROTOCOL_VERSION,
	parseServerPacket,
	request,
} from "@pie/protocol";
import type { Transport, TransportFactory } from "./transport.js";

export type EventListener = (event: EventEnvelope) => void;

export interface PieConnectionOptions {
	transportFactory: TransportFactory;
	client: ClientInfo;
	caps?: ClientCapability[];
	/** Auth token; see architecture.md §9. */
	token: string;
	/** Expected protocol major; defaults to this build's PROTOCOL_VERSION. */
	protocolVersion?: number;
	/** Timeout for the whole handshake (ms). */
	helloTimeoutMs?: number;
	/** Called when an event-gap is detected (missed frames); default: no-op. */
	onGap?: (gapFrom: number, gapTo: number) => void;
}

export class PieConnectionError extends Error {
	constructor(
		message: string,
		readonly code?: string,
	) {
		super(message);
		this.name = "PieConnectionError";
	}
}

export type ConnectionState = "connecting" | "ready" | "closed";

interface HandshakeHooks {
	resolve: (ack: HelloAck) => void;
	reject: (err: Error) => void;
}

export class PieConnection {
	static async connect(options: PieConnectionOptions): Promise<PieConnection> {
		const hooks: HandshakeHooks = { resolve: () => {}, reject: () => {} };
		const handshakePromise = new Promise<HelloAck>((resolve, reject) => {
			hooks.resolve = resolve;
			hooks.reject = reject;
		});

		const conn = new PieConnection(options, { handshakePromise, hooks });

		const transport = await options.transportFactory({
			onMessage: (line) => conn.onLine(line),
			onClose: () => conn.onClosed(),
			onError: (err) => {
				if (conn.state === "connecting") conn.hooks.reject(err);
				else conn.closeListeners.forEach((l) => l(err));
			},
		});
		conn.transport = transport;

		const timer = setTimeout(
			() => conn.hooks.reject(new PieConnectionError("handshake timeout")),
			options.helloTimeoutMs ?? 8000,
		);
		try {
			// Send hello immediately after open.
			const hello = {
				hello: {
					v: options.protocolVersion ?? PROTOCOL_VERSION,
					client: options.client,
					caps: options.caps ?? ["treeSync", "extWidgets"],
					auth: { method: "token", token: options.token },
				},
			};
			transport.send(JSON.stringify(hello));
			const ack = await handshakePromise;
			conn.state = "ready";
			return conn;
		} finally {
			clearTimeout(timer);
		}
	}

	// --- public read-only state ----------------------------------------------

	get isReady(): boolean {
		return this.state === "ready";
	}
	get connectionState(): ConnectionState {
		return this.state;
	}
	/** Last event seq received on this connection (for sync on reconnect). */
	get lastSeq(): number {
		return this.seq;
	}
	/** The handshake result. Rejects if connecting failed. */
	get hello(): Promise<HelloAck> {
		return this.handshakePromise;
	}

	// --- subscriptions ----------------------------------------------------------

	onEvent(listener: EventListener): () => void {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}

	onClose(listener: (err?: Error) => void): () => void {
		this.closeListeners.add(listener);
		return () => this.closeListeners.delete(listener);
	}

	// --- commands -----------------------------------------------------------------

	async request<C extends CommandName>(cmd: C, args?: unknown): Promise<CommandResult<C>> {
		if (!this.transport) throw new PieConnectionError("not connected");
		const id: CommandId = `c-${++this.nextCommandId}`;
		const p = new Promise<CommandResult<C>>((resolve, reject) => {
			this.pending.set(id, {
				resolve: (data) => resolve(data as CommandResult<C>),
				reject,
			});
		});
		this.transport.send(JSON.stringify(request(id, cmd, args ?? {})));
		return p;
	}

	/** After a reconnect, ask the daemon to replay missed events. */
	async resync(): Promise<void> {
		await this.request("sync", { sinceSeq: this.lastSeq });
	}

	close(): void {
		if (this.state === "closed") return;
		this.state = "closed";
		try {
			this.transport?.close();
		} catch {
			// ignore
		}
		this.failPending(new PieConnectionError("connection closed"));
		this.closeListeners.forEach((l) => l());
	}

	// --- internals -------------------------------------------------------------------

	private state: ConnectionState = "connecting";
	private transport?: Transport;
	private seq = -1;
	private nextCommandId = 0;
	private pending = new Map<CommandId, { resolve: (d: unknown) => void; reject: (e: Error) => void }>();
	private eventListeners = new Set<EventListener>();
	private closeListeners = new Set<(err?: Error) => void>();
	private readonly hooks: HandshakeHooks;
	private readonly handshakePromise: Promise<HelloAck>;

	private constructor(
		private readonly options: PieConnectionOptions,
		start: { handshakePromise: Promise<HelloAck>; hooks: HandshakeHooks },
	) {
		this.hooks = start.hooks;
		this.handshakePromise = start.handshakePromise;
	}

	private onLine(line: string): void {
		let packet: ReturnType<typeof parseServerPacket>;
		try {
			packet = parseServerPacket(line);
		} catch (err) {
			this.hooks.reject(err as Error);
			this.close();
			return;
		}
		if ("helloAck" in packet) {
			this.seq = packet.helloAck.eventSeq - 1;
			this.hooks.resolve(packet.helloAck);
			return;
		}
		if ("fatal" in packet) {
			this.hooks.reject(new PieConnectionError(packet.fatal.message, packet.fatal.code));
			this.close();
			return;
		}
		if ("ev" in packet) {
			this.handleEvent(packet);
			return;
		}
		if (packet.ok) this.pending.get(packet.id)?.resolve(packet.data);
		else this.pending.get(packet.id)?.reject(new PieConnectionError(packet.error.message, packet.error.code));
		this.pending.delete(packet.id);
	}

	private handleEvent(event: EventEnvelope): void {
		// Ordered delivery: strictly increasing seq. A gap means missed frames —
		// surface it so upper layers can issue `resync()` (ADR-0001 §5.4).
		if (event.seq <= this.seq) return; // duplicate (replay overlap); ignore
		if (event.seq !== this.seq + 1) {
			this.options.onGap?.(this.seq + 1, event.seq);
		}
		this.seq = event.seq;
		this.eventListeners.forEach((l) => l(event));
	}

	private onClosed(): void {
		if (this.state === "closed") return;
		this.close();
	}

	private failPending(err: Error): void {
		for (const waiters of this.pending.values()) waiters.reject(err);
		this.pending.clear();
	}
}

// The decoder is intentionally unused here — `ws` transports deliver complete
// text frames that map to lines in `onLine`; chunk-neutral byte transports can
// pre-decode with protocol.JsonlDecoder before calling onLine.
export type { JsonlDecoder };
export type { Transport, TransportFactory };
