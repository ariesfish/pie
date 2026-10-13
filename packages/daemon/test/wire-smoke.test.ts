/**
 * End-to-end smoke test (no LLM calls): boots the daemon with a temporary
 * Pi agent dir, drives the wire protocol over a real WebSocket.
 *
 * Hermetic via process.env.PI_CODING_AGENT_DIR — no ~/.pi/agent writes.
 */

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { DaemonServer } from "../src/server/server.js";

const PORT = 9361;
const TOKEN = "smoke-token";

const AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

let server: DaemonServer;
let dir: string;
let workspace: string;
let previousAgentDir: string | undefined;
let sessionId = "";

type ServerPacket = Record<string, any>;

function wsConnect(): Promise<WebSocket> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
		ws.on("open", () => resolve(ws));
		ws.on("error", reject);
	});
}

class WireClient {
	private ws: WebSocket;
	private next = 0;
	private pending = new Map<string, { resolve: (d: any) => void; reject: (e: Error) => void }>();
	events: ServerPacket[] = [];

	static async connect(): Promise<WireClient> {
		const ws = await wsConnect();
		const client = new WireClient(ws);
		const status = await client.request("daemon.status", {});
		expect(status.version).toBeTruthy();
		return client;
	}

	private constructor(ws: WebSocket) {
		this.ws = ws;
		ws.on("message", (chunk) => {
			const text = typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString("utf8");
			for (const line of text.split("\n")) {
				if (!line.trim()) continue;
				const pkt = JSON.parse(line);
				if (pkt.ev !== undefined) this.events.push(pkt);
				else if (pkt.id) {
					const p = this.pending.get(pkt.id);
					if (p) {
						this.pending.delete(pkt.id);
						if (pkt.ok) p.resolve(pkt.data);
						else p.reject(new Error(pkt.error.message));
					}
				}
			}
		});
		// hello handshake
		ws.send(
			JSON.stringify({
				hello: {
					v: 1,
					client: { kind: "cli", version: "0.1.0", platform: "test" },
					caps: ["treeSync"],
					auth: { method: "token", token: TOKEN },
				},
			}) + "\n",
		);
	}

	request(cmd: string, args: any = {}): Promise<any> {
		return new Promise((resolve, reject) => {
			const id = `c-${++this.next}`;
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, cmd, args }) + "\n");
		});
	}

	waitForEvent(ev: string, timeoutMs = 3000): Promise<ServerPacket> {
		const found = this.events.find((e) => e.ev === ev);
		if (found) return Promise.resolve(found);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), timeoutMs);
			const check = () => {
				const f = this.events.find((e) => e.ev === ev);
				if (f) {
					clearTimeout(timer);
					resolve(f);
				} else setTimeout(check, 20);
			};
			check();
		});
	}

	close(): void {
		this.ws.close();
	}
}

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), "pie-smoke-"));
	mkdirSync(join(dir, "agent-home", "sessions"), { recursive: true });
	workspace = join(dir, "workspace");
	mkdirSync(workspace, { recursive: true });
	previousAgentDir = process.env[AGENT_DIR_ENV];
	process.env[AGENT_DIR_ENV] = join(dir, "agent-home");

	server = new DaemonServer({
		listenHost: "127.0.0.1",
		listenPort: PORT,
		token: TOKEN,
		agentDir: join(dir, "agent-home"),
		servePage: false,
		piVersion: "1.1.0",
		piAgentDir: join(dir, "agent-home"),
	});
	const bound = await server.start();
	expect(bound.port).toBe(PORT);
});

afterAll(async () => {
	await server?.stop();
	rmSync(dir, { recursive: true, force: true });
	if (previousAgentDir === undefined) delete process.env[AGENT_DIR_ENV];
	else process.env[AGENT_DIR_ENV] = previousAgentDir;
});

describe("wire protocol over real WebSocket", () => {
	it("handshakes, creates and attaches a session, snapshots, stats, lists", async () => {
		const client = await WireClient.connect();

		const status = await client.request("daemon.status");
		expect(status.serverId).toBeTruthy();
		expect(status.pi.version).toBe("1.1.0");

		await client.request("workspace.open", { path: workspace });

		const created = await client.request("session.create", { workspaceId: workspace });
		expect(created.sessionId).toBeTruthy();
		sessionId = created.sessionId;

		const attach = await client.request("session.attach", { sessionId });
		expect(attach.presentation).toBe("readwrite");
		expect(attach.sessionId).toBe(sessionId);

		const snapshotFrame = await client.waitForEvent("session.snapshot");
		expect(snapshotFrame.data.snapshot.sessionId).toBe(sessionId);
		expect(snapshotFrame.data.snapshot.state.isStreaming).toBe(false);
		expect(Array.isArray(snapshotFrame.data.snapshot.tree)).toBe(true);

		const stats = await client.request("session.stats", { sessionId });
		expect(stats.sessionId).toBe(sessionId);
		expect(typeof stats.totalMessages).toBe("number");

		const models = await client.request("models.list", { workspaceId: workspace });
		expect(Array.isArray(models.models)).toBe(true);

		const detached = await client.request("session.detach", { sessionId });
		expect(detached).toEqual({});

		const listed = await client.request("session.list", { workspaceId: workspace });
		const mine = listed.sessions.filter((s: { sessionId: string }) => s.sessionId === sessionId);
		expect(mine).toHaveLength(1);
		expect(mine[0].open).toBe(true);

		// Ring replay: reconnect and sync from -1 replays recorded events.
		client.close();
		const client2 = await WireClient.connect();
		await client2.request("session.attach", { sessionId });
		const snap2 = await client2.waitForEvent("session.snapshot");
		expect(snap2.data.snapshot.sessionId).toBe(sessionId);
		client2.close();
	});

	it("workspace.open validates the directory and workspace.list remembers it", async () => {
		const client = await WireClient.connect();

		await expect(client.request("workspace.open", { path: join(dir, "does-not-exist") })).rejects.toThrow(
			/not found/i,
		);
		// A file (not a directory) is also rejected.
		const filePath = join(dir, "not-a-dir.txt");
		writeFileSync(filePath, "x");
		await expect(client.request("workspace.open", { path: filePath })).rejects.toThrow(/not found/i);

		const res = await client.request("workspace.open", { path: workspace });
		expect(res.workspaceId).toBe(workspace);
		expect(res.name).toBeTruthy();

		const listed = await client.request("workspace.list", {});
		const ids = (listed.workspaces as Array<{ workspaceId: string }>).map((w) => w.workspaceId);
		expect(ids).toContain(workspace);
		expect(ids).not.toContain(join(dir, "does-not-exist"));
		client.close();
	});

	it("rejects bad token with fatal auth_failed", async () => {
		const ws = await wsConnect();
		const fatal = new Promise<any>((resolve) => {
			ws.on("message", (chunk) => {
				const text = typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString("utf8");
				for (const line of text.split("\n")) {
					if (line.trim() && line.includes("fatal")) resolve(JSON.parse(line));
				}
			});
		});
		ws.send(
			JSON.stringify({
				hello: {
					v: 1,
					client: { kind: "cli", version: "0", platform: "test" },
					auth: { method: "token", token: "wrong" },
				},
			}) + "\n",
		);
		const got = await fatal;
		expect(got.fatal.code).toBe("auth_failed");
		ws.close();
	});

	it("session tree operations: tree / forkPreview / forkAt / navigate", async () => {
		const client = await WireClient.connect();
		const created = await client.request("session.create", { workspaceId: workspace });
		const sid = created.sessionId as string;
		await client.request("session.attach", { sessionId: sid });

		// tree on an empty fresh session
		const initialTree = await client.request("session.tree", { sessionId: sid });
		expect(Array.isArray(initialTree.tree)).toBe(true);

		// fork before send: not persisted yet -> pi_error (fail-safe)
		await expect(client.request("session.forkAt", { sessionId: sid, entryId: "whatever" })).rejects.toThrow(
			/not been saved yet/,
		);

		// Build a real persisted session via a fixture JSONL, then attach by path.
		const fixtureDir = join(dir, "agent-home", "sessions", "--fixture--");
		mkdirSync(fixtureDir, { recursive: true });
		const fixturePath = join(fixtureDir, "2026-10-11T00-00-00-000Z_fixture0001.jsonl");
		writeFileSync(
			fixturePath,
			[
				JSON.stringify({ type: "session", version: 3, id: "fixture0001", timestamp: "2026-10-11T00:00:00.000Z", cwd: workspace }),
				JSON.stringify({ type: "message", id: "f1", parentId: null, timestamp: "2026-10-11T00:00:01.000Z", message: { role: "user", content: "你好", timestamp: 1 } }),
				JSON.stringify({ type: "message", id: "f2", parentId: "f1", timestamp: "2026-10-11T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "你好！" }], provider: "fake", model: "fake-model", timestamp: 2 } }),
				JSON.stringify({ type: "message", id: "f3", parentId: "f2", timestamp: "2026-10-11T00:00:03.000Z", message: { role: "user", content: "再讲一件事", timestamp: 3 } }),
				JSON.stringify({ type: "message", id: "f4", parentId: "f3", timestamp: "2026-10-11T00:00:04.000Z", message: { role: "assistant", content: [{ type: "text", text: "第二件事" }], provider: "fake", model: "fake-model", timestamp: 4 } }),
			].join("\n") + "\n",
		);
		client.events.length = 0; // drop snapshots from earlier attaches in this client
		const attachOut = await client.request("session.attach", { sessionId: "fixture0001", path: fixturePath });
		expect(attachOut.sessionId).toBe("fixture0001");
		const snap = await client.waitForEvent("session.snapshot", 5000);
		// Pi appends a thinking_level_change entry on restore, so the leaf is a
		// runtime-appended entry after f4 — assert the structural facts instead.
		expect(snap.data.snapshot.tree).toHaveLength(5);
		const pathIds = (snap.data.snapshot.entries as Array<{ id: string }>).map((e) => e.id);
		expect(pathIds.slice(0, 4)).toEqual(["f1", "f2", "f3", "f4"]);
		expect(snap.data.snapshot.leafId).toBe(pathIds[pathIds.length - 1]);

		// forkPreview lists user messages
		const preview = await client.request("session.forkPreview", { sessionId: "fixture0001" });
		const items = preview.items as Array<{ entryId: string; text: string }>;
		expect(items.map((i) => i.entryId)).toEqual(["f1", "f3"]);

		// forkAt at the first assistant message: new session whose leaf is f2
		const forked = await client.request("session.forkAt", {
			sessionId: "fixture0001",
			entryId: "f2",
			position: "at",
		});
		expect(typeof forked.sessionId).toBe("string");
		expect(forked.sessionId).not.toBe("fixture0001");

		client.events.length = 0;
		const forkedAttach = await client.request("session.attach", { sessionId: forked.sessionId, as: "readwrite" });
		expect(forkedAttach.presentation).toBe("readwrite");
		const snap2 = await client.waitForEvent("session.snapshot", 5000);
		const forkIds = (snap2.data.snapshot.entries as Array<{ id: string }>).map((e) => e.id);
		expect(forkIds.slice(0, 2)).toEqual(["f1", "f2"]);
		expect(snap2.data.snapshot.leafId).toBe(forkIds![forkIds!.length - 1] as string);

		// navigate inside the original: target f4 (assistant message) — Pi semantics
		// make non-user targets the new leaf directly; the daemon re-broadcasts a
		// fresh snapshot for subscribers.
		const nav = await client.request("session.navigate", { sessionId: "fixture0001", entryId: "f4" });
		expect(nav.cancelled).toBe(false);
		await new Promise((r) => setTimeout(r, 200));
		const latest = client.events
			.filter((e) => e.ev === "session.snapshot")
			.reverse()
			.find((e) => (e.data.snapshot as { sessionId: string }).sessionId === "fixture0001");
		expect((latest!.data.snapshot as { leafId: string }).leafId).toBe("f4");
		client.close();
	});

	it("resources.overview reports extensions/commands/skills/templates", async () => {
		const client = await WireClient.connect();
		const created = await client.request("session.create", { workspaceId: workspace });
		const sid = created.sessionId as string;
		const overview = await client.request("resources.overview", { sessionId: sid });
		expect(overview).toBeTruthy();
		expect(Array.isArray((overview as { extensions: unknown[] }).extensions)).toBe(true);
		expect(Array.isArray((overview as { commands: unknown[] }).commands)).toBe(true);
		expect(Array.isArray((overview as { skills: unknown[] }).skills)).toBe(true);
		expect(Array.isArray((overview as { promptTemplates: unknown[] }).promptTemplates)).toBe(true);
		const commands = await client.request("commands.list", { sessionId: sid });
		expect(Array.isArray(commands.commands)).toBe(true);
		client.close();
	});

	it("returns not_implemented for unimplemented commands and not_found for unknown sessions", async () => {
		const client = await WireClient.connect();
		// session.switch was removed from the protocol (ADR-0003); unknown
		// commands answer notImplemented.
		await expect(client.request("session.switch", { sessionId: "x", targetSessionPath: "y" })).rejects.toMatchObject({
			message: expect.stringContaining("not implemented"),
		});
		// Stats on an unknown session id -> not_found
		await expect(client.request("session.stats", { sessionId: "does-not-exist" })).rejects.toThrow(
			/Session not open/,
		);
		client.close();
	});
});
