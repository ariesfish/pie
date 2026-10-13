/**
 * Wire envelopes and the JSONL codec (architecture.md §5.1, §5.4).
 *
 * Framing rules (learned from Pi RPC's JSONL design):
 * - One complete JSON object per line, terminated by LF.
 * - A parser must split ONLY on LF (never on U+2028/U+2029, which are valid
 *   inside JSON strings and are treated as line breaks by Node's readline).
 * - A single preceding CR is stripped to accept CRLF input.
 */

import type { CommandArgs, CommandName, CommandResult } from "./commands.js";
import type { CommandId } from "./ids.js";
import type { EventData, EventName } from "./events.js";
import type { FatalError, Hello, HelloAck } from "./hello.js";
import type { WireError } from "./errors.js";

// ---------------------------------------------------------------------------
// Envelope shapes
// ---------------------------------------------------------------------------

/** Client -> daemon request. IDs are client-generated unique strings. */
export interface ClientRequest {
	id: CommandId;
	cmd: CommandName;
	args: unknown;
}

export interface ResponseOk {
	id: CommandId;
	ok: true;
	data: unknown;
}

export interface ResponseErr {
	id: CommandId;
	ok: false;
	error: WireError;
}

export type ServerResponse = ResponseOk | ResponseErr;

/**
 * Daemon -> client event. `seq` is connection-level and strictly increasing.
 * Mapped union over EventPayloadMap: switching on `ev` narrows `data`.
 */
export type EventEnvelope = import("./events.js").EventFrameMap[keyof import("./events.js").EventFrameMap];

export type ClientPacket = { hello: Hello } | ClientRequest;
export type ServerPacket = { helloAck: HelloAck } | { fatal: FatalError } | ServerResponse | EventEnvelope;

// ---------------------------------------------------------------------------
// Typed envelope constructors (daemon side)
// ---------------------------------------------------------------------------

export function request(id: CommandId, cmd: CommandName, args: unknown = {}): ClientRequest {
	return { id, cmd, args };
}

export function responseOk(id: CommandId, cmd: CommandName, data: unknown): ResponseOk {
	void cmd; // cmd retained for future server-side logging/correlation
	return { id, ok: true, data };
}

export function responseErr(id: CommandId, error: WireError): ResponseErr {
	return { id, ok: false, error };
}

export function event<E extends EventName>(ev: E, seq: number, data: EventData<E>): EventEnvelope {
	return { ev, seq, data } as EventEnvelope;
}

// ---------------------------------------------------------------------------
// JSONL codec
// ---------------------------------------------------------------------------

/** Hard limit per JSONL frame (default 16 MiB mirrors pi-protocol defaults). */
export const MAX_FRAME_BYTES = 16 * 1024 * 1024;

export class ProtocolValidationError extends Error {
	constructor(message: string, readonly raw?: string) {
		super(message);
		this.name = "ProtocolValidationError";
	}
}

export function encodeClientPacket(packet: ClientPacket): string {
	return `${JSON.stringify(packet)}\n`;
}

export function encodeServerPacket(packet: ServerPacket): string {
	return `${JSON.stringify(packet)}\n`;
}

/** Platform-neutral incremental UTF-8 decoding (non-streaming TextDecoder fallback). */
function decodeUtf8(chunk: Uint8Array): string {
	const td = (globalThis as { TextDecoder?: new () => { decode(d: Uint8Array): string } }).TextDecoder;
	if (td) return new td().decode(chunk);
	// Fallback for hosts without TextDecoder.
	const buf = typeof Buffer !== "undefined" ? Buffer.from(chunk) : null;
	if (!buf) throw new ProtocolValidationError("No UTF-8 decoder available");
	return buf.toString("utf8");
}

/**
 * Streaming decoder: feed arbitrary chunks (Uint8Array/string), get complete
 * JSONL frames out. Handles partial frames, CRLF, and empty lines.
 */
export class JsonlDecoder {
	private buf = "";
	constructor(
		private readonly maxFrameBytes = MAX_FRAME_BYTES,
	) {}

	/** Returns complete decoded lines; incomplete data stays buffered. */
	push(chunk: string | Uint8Array): string[] {
		if (typeof chunk !== "string") {
			this.buf += decodeUtf8(chunk);
		} else {
			this.buf += chunk;
		}
		if (this.buf.length > this.maxFrameBytes * 4) {
			throw new ProtocolValidationError("Buffer overflow: no newline in recent frames");
		}
		const lines: string[] = [];
		for (;;) {
			const i = this.buf.indexOf("\n");
			if (i === -1) break;
			let line = this.buf.slice(0, i);
			if (line.endsWith("\r")) line = line.slice(0, -1);
			this.buf = this.buf.slice(i + 1);
			if (line.length > this.maxFrameBytes) {
				throw new ProtocolValidationError(`Frame exceeds ${this.maxFrameBytes} bytes`);
			}
			if (line.length > 0) lines.push(line);
		}
		return lines;
	}

	/** Flush remaining buffered content (e.g. on close, when the peer omitted the final LF). */
	flush(): string | null {
		const rest = this.buf.trim();
		this.buf = "";
		return rest.length > 0 ? rest : null;
	}
}

// ---------------------------------------------------------------------------
// Packet parsers with structural validation
// ---------------------------------------------------------------------------

function parseJson(line: string): Record<string, unknown> {
	let v: unknown;
	try {
		v = JSON.parse(line);
	} catch (err) {
		throw new ProtocolValidationError(`Invalid JSON frame: ${(err as Error).message}`, line);
	}
	if (v === null || typeof v !== "object" || Array.isArray(v)) {
		throw new ProtocolValidationError("Frame must be a JSON object", line);
	}
	return v as Record<string, unknown>;
}

export function parseClientPacket(line: string): ClientPacket {
	const o = parseJson(line);
	if (o["hello"] !== undefined) {
		const h = o["hello"] as Partial<Hello>;
		if (typeof h.v !== "number" || !h.client || !h.auth) {
			throw new ProtocolValidationError("hello: missing v/client/auth", line);
		}
		return { hello: h as Hello };
	}
	if (typeof o["id"] === "string" && typeof o["cmd"] === "string") {
		return { id: o["id"], cmd: o["cmd"] as CommandName, args: o["args"] ?? {} };
	}
	throw new ProtocolValidationError("client frame must be {hello} or {id, cmd, args}", line);
}

export function parseServerPacket(line: string): ServerPacket {
	const o = parseJson(line);
	if (o["helloAck"] !== undefined) return { helloAck: o["helloAck"] as HelloAck };
	if (o["fatal"] !== undefined) return { fatal: o["fatal"] as FatalError };
	if (typeof o["id"] === "string") {
		if (o["ok"] === true) return { id: o["id"], ok: true, data: o["data"] };
		if (o["ok"] === false && o["error"]) {
			return { id: o["id"], ok: false, error: o["error"] as WireError };
		}
		throw new ProtocolValidationError("response frame must carry ok:boolean", line);
	}
	if (typeof o["ev"] === "string" && typeof o["seq"] === "number") {
		return { ev: o["ev"] as EventName, seq: o["seq"], data: o["data"] ?? {} } as EventEnvelope;
	}
	throw new ProtocolValidationError("server frame must be helloAck/fatal/response/event", line);
}

/** Decode a client line typed by command: convenience for daemon dispatch. */
export function parseTypedCommand<C extends CommandName>(
	line: string,
): { id: CommandId; cmd: C; args: CommandArgs<C> } {
	const packet = parseClientPacket(line);
	if (!("cmd" in packet)) throw new ProtocolValidationError("expected a command frame", line);
	return packet as { id: CommandId; cmd: C; args: CommandArgs<C> };
}
