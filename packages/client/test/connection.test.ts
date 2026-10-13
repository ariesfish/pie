import { describe, expect, it } from "vitest";
import { PieConnection } from "../src/connection.js";
import type { Transport, TransportFactory, TransportHandlers } from "../src/transport.js";

/**
 * In-memory transport pair: frames written by the client are handed to a
 * scriptable server that can answer requests and push events.
 */
class FakeServer {
	handlers!: TransportHandlers;
	clientTransport!: Transport;
	lines: string[] = [];
	respond: (line: string, server: FakeServer) => void = () => {};

	factory(): TransportFactory {
		return (handlers) => {
			this.handlers = handlers;
			this.clientTransport = {
				send: (line) => {
					this.lines.push(line);
					// defer to next tick to mimic socket async
					queueMicrotask(() => this.respond(line, this));
				},
				close: () => this.handlers.onClose(),
			};
			return Promise.resolve(this.clientTransport);
		};
	}

	/** Server -> client frames */
	push(line: string): void {
		this.handlers.onMessage(line);
	}
}

function okResponse(id: string, data: unknown): string {
	return JSON.stringify({ id, ok: true, data });
}

const ack = JSON.stringify({
	helloAck: {
		v: 1,
		serverId: "srv-1",
		daemon: { version: "0.1.0", hostname: "test", os: "test" },
		pi: { version: "1.1.0", agentDir: "~/.pi/agent" },
		eventSeq: 0,
	},
});

function connect(fake: FakeServer): Promise<PieConnection> {
	return PieConnection.connect({
		transportFactory: fake.factory(),
		client: { kind: "web", version: "0.1.0", platform: "browser" },
		token: "secret",
		helloTimeoutMs: 2000,
	});
}

describe("PieConnection", () => {
	it("performs the hello handshake and exposes the ack", async () => {
		const fake = new FakeServer();
		fake.respond = (line, server) => {
			const packet = JSON.parse(line);
			if (packet.hello) {
				expect(packet.hello.auth.token).toBe("secret");
				server.push(ack);
			}
		};
		const conn = await connect(fake);
		const helloAck = await conn.hello;
		expect(helloAck.serverId).toBe("srv-1");
		expect(conn.isReady).toBe(true);
	});

	it("correlates command responses by id, out of order", async () => {
		const fake = new FakeServer();
		const pendingLines: string[] = [];
		fake.respond = (line) => {
			const packet = JSON.parse(line);
			if (packet.cmd) pendingLines.push(line);
			if (packet.hello) fake.push(ack);
		};
		const conn = await connect(fake);
		const p1 = conn.request("daemon.status", {});
		const p2 = conn.request("session.list", { workspaceId: "/repo" });
		// Let the fake server (which processes send() on a microtask) observe both frames.
		await new Promise((r) => setTimeout(r, 0));
		// answer the second request first
		const l2 = pendingLines.pop() as string;
		const l1 = pendingLines.pop() as string;
		const id2 = JSON.parse(l2).id;
		const id1 = JSON.parse(l1).id;
		fake.push(okResponse(id2, { sessions: [] }));
		fake.push(
			okResponse(id1, {
				version: "0.1.0",
				serverId: "srv",
				pi: { version: "1.1.0", agentDir: "x" },
				uptimeMs: 1,
				attachedClients: 1,
				openSessions: 0,
			}),
		);
		await expect(p2).resolves.toEqual({ sessions: [] });
		await expect(p1).resolves.toMatchObject({ version: "0.1.0" });
	});

	it("rejects on a wire error and reports the code", async () => {
		const fake = new FakeServer();
		fake.respond = (line, server) => {
			const packet = JSON.parse(line);
			if (packet.hello) server.push(ack);
			if (packet.cmd) {
				server.push(
					JSON.stringify({ id: packet.id, ok: false, error: { code: "not_found", message: "no session" } }),
				);
			}
		};
		const conn = await connect(fake);
		await expect(conn.request("session.attach", { sessionId: "nope" })).rejects.toMatchObject({
			code: "not_found",
		});
	});

	it("delivers events in order, flags gaps, and dedupes replays", async () => {
		const fake = new FakeServer();
		const gaps: Array<[number, number]> = [];
		let conn!: PieConnection;
		const seen: number[] = [];
		fake.respond = (line, server) => {
			const packet = JSON.parse(line);
			if (packet.hello) server.push(ack);
			if (packet.cmd) {
				// push 0, 1, then 4 (gap!), then 4 again (replay dedupe), then answer
				server.push(JSON.stringify({ ev: "daemon.sessions.changed", seq: 0, data: {} }));
				server.push(JSON.stringify({ ev: "daemon.sessions.changed", seq: 1, data: {} }));
				server.push(JSON.stringify({ ev: "daemon.sessions.changed", seq: 4, data: {} }));
				server.push(JSON.stringify({ ev: "daemon.sessions.changed", seq: 4, data: {} }));
				server.push(okResponse(packet.id, { replayed: true, resumedAtSeq: 4 }));
			}
		};
		conn = await connect(fake);
		conn.onEvent((e) => seen.push(e.seq));
		const onGap = (from: number, to: number) => gaps.push([from, to]);
		(conn as unknown as { options: { onGap?: typeof onGap } }).options.onGap = onGap;
		await conn.request("sync", { sinceSeq: -1 });
		// Wait a tick for queued microtasks.
		await new Promise((r) => setTimeout(r, 10));
		expect(seen).toEqual([0, 1, 4]);
		expect(gaps).toEqual([[2, 4]]);
		expect(conn.lastSeq).toBe(4);
	});

	it("fails pending commands on close", async () => {
		const fake = new FakeServer();
		fake.respond = (line, server) => {
			const packet = JSON.parse(line);
			if (packet.hello) server.push(ack);
		};
		const conn = await connect(fake);
		const p = conn.request("daemon.status", {});
		await new Promise((r) => setTimeout(r, 5));
		fake.handlers.onClose();
		await expect(p).rejects.toThrow(/closed/i);
		expect(conn.connectionState).toBe("closed");
	});

	it("propagates fatal handshake errors", async () => {
		const fake = new FakeServer();
		fake.respond = (_line, server) => {
			server.push(JSON.stringify({ fatal: { code: "auth_failed", message: "bad token" } }));
		};
		await expect(connect(fake)).rejects.toMatchObject({ code: "auth_failed" });
	});
});
