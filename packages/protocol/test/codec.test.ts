import { describe, expect, it } from "vitest";
import {
	JsonlDecoder,
	MAX_FRAME_BYTES,
	ProtocolValidationError,
	encodeClientPacket,
	encodeServerPacket,
	event,
	negotiateCapabilities,
	parseClientPacket,
	parseServerPacket,
	PROTOCOL_VERSION,
	request,
	responseOk,
} from "../src/index.js";

describe("capability negotiation", () => {
	it("intersects client and daemon caps", () => {
		expect(negotiateCapabilities(["treeSync", "binaryFrames"], ["treeSync"])).toEqual(["treeSync"]);
		expect(negotiateCapabilities(["treeSync"], ["treeSync", "extWidgets"])).toEqual(["treeSync"]);
	});
	it("drops unknown client caps", () => {
		expect(negotiateCapabilities(["treeSync", "quantum"], ["treeSync"])).toEqual(["treeSync"]);
	});
	it("empty intersection is possible", () => {
		expect(negotiateCapabilities([], ["treeSync"])).toEqual([]);
	});
});

describe("envelope constructors", () => {
	it("request round-trips", () => {
		const frame = encodeClientPacket(request("c-1", "daemon.status", {}));
		const parsed = parseClientPacket(frame.trimEnd());
		expect(parsed).toEqual({ id: "c-1", cmd: "daemon.status", args: {} });
	});
	it("response ok round-trips", () => {
		const frame = encodeServerPacket(
			responseOk("c-1", "daemon.status", {
				version: "0.1.0",
				serverId: "srv",
				pi: { version: "1.1.0", agentDir: "~/.pi/agent" },
				uptimeMs: 42,
				attachedClients: 1,
				openSessions: 0,
			}),
		);
		const parsed = parseServerPacket(frame.trimEnd());
		expect(parsed).toMatchObject({ id: "c-1", ok: true });
	});
	it("event round-trips with seq", () => {
		const frame = encodeServerPacket(
			event("session.queue.changed", 7, { sessionId: "s1", steering: [], followUp: ["hi"] }),
		);
		const parsed = parseServerPacket(frame.trimEnd());
		expect(parsed).toEqual({ ev: "session.queue.changed", seq: 7, data: { sessionId: "s1", steering: [], followUp: ["hi"] } });
	});
	it("hello and helloAck round-trip", () => {
		const hello = encodeClientPacket({
			hello: { v: PROTOCOL_VERSION, client: { kind: "app", version: "0.1", platform: "ios" }, auth: { method: "token", token: "t" }, caps: ["treeSync"] },
		});
		expect(parseClientPacket(hello.trimEnd())).toMatchObject({ hello: { v: 1 } });
		const ack = encodeServerPacket({
			helloAck: { v: 1, serverId: "srv", daemon: { version: "0", hostname: "h", os: "darwin" }, pi: { version: "1.1.0", agentDir: "~/.pi/agent" }, eventSeq: 0 },
		});
		expect(parseServerPacket(ack.trimEnd())).toMatchObject({ helloAck: { serverId: "srv" } });
	});
});

describe("JsonlDecoder", () => {
	it("reassembles frames split across chunks", () => {
		const d = new JsonlDecoder();
		const lines = [
			JSON.stringify({ ev: "session.settled", seq: 1, data: { sessionId: "s", aborted: false } }),
			JSON.stringify({ ev: "session.settled", seq: 2, data: { sessionId: "s", aborted: false } }),
			JSON.stringify({ ev: "session.settled", seq: 3, data: { sessionId: "s", aborted: false } }),
		];
		const blob = lines.join("\n") + "\n";
		const mid = Math.floor(blob.length / 2);
		expect(d.push(blob.slice(0, mid))).toEqual(lines.slice(0, 1));
		expect(d.push(blob.slice(mid))).toEqual(lines.slice(1));
		expect(d.flush()).toBeNull();
	});

	it("never splits on U+2028/U+2029 inside JSON strings (the readline lesson)", () => {
		const d = new JsonlDecoder();
		const text = "line\u2028separator\u2029inside";
		const frame = JSON.stringify({ ev: "session.ext.notify", seq: 1, data: { sessionId: "s", message: text } });
		const got = d.push(frame + "\n");
		expect(JSON.parse(got[0] ?? "").data.message).toBe(text);
	});

	it("accepts CRLF and skips empty lines", () => {
		const d = new JsonlDecoder();
		const out = d.push('\r\n{"id":"c-9","cmd":"sync","args":{}}\r\n\r\n');
		expect(out).toEqual(['{"id":"c-9","cmd":"sync","args":{}}']);
	});

	it("flush returns trailing frame without LF", () => {
		const d = new JsonlDecoder();
		d.push('{"id":"c-2","cmd":"daemon.status","args":{}}');
		expect(d.flush()).toBe('{"id":"c-2","cmd":"daemon.status","args":{}}');
		expect(d.flush()).toBeNull();
	});

	it("rejects frames over the size limit", () => {
		const d = new JsonlDecoder(64);
		expect(() => d.push(`{"pad":"${"x".repeat(128)}"}\n`)).toThrow(ProtocolValidationError);
	});

	it("rejects buffer overflow negotiation guard", () => {
		const d = new JsonlDecoder(MAX_FRAME_BYTES);
		expect(() => d.push("x".repeat(MAX_FRAME_BYTES * 5))).toThrow(ProtocolValidationError);
	});
});

describe("packet validation", () => {
	it("rejects non-object frames", () => {
		expect(() => parseServerPacket("[1,2,3]")).toThrow(ProtocolValidationError);
		expect(() => parseServerPacket("null")).toThrow(ProtocolValidationError);
		expect(() => parseServerPacket("garbage")).toThrow(ProtocolValidationError);
	});
	it("rejects malformed client commands", () => {
		expect(() => parseClientPacket('{"id":"c-1"}')).toThrow(ProtocolValidationError);
		expect(() => parseClientPacket('{"cmd":"x"}')).toThrow(ProtocolValidationError);
	});
	it("rejects malformed responses", () => {
		expect(() => parseServerPacket('{"id":"c-1"}')).toThrow(ProtocolValidationError);
	});
});
