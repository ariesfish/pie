/**
 * session.rename wire semantics:
 *  - regression: open-session rename (broadcast + list)
 *  - new: closed on-disk session rename (no attach, durable session_info entry)
 *  - new: empty / whitespace-only name = explicit clear
 * Hermetic temp agent dir; no LLM calls.
 */

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { SessionManager } from "@earendil-works/pi-coding-agent";

vi.mock("../src/serve-page.js", () => ({ readIndexAndMeta: async () => null }));

const { DaemonServer } = await import("../src/server/server.js");

const PORT = 8889;
const TOKEN = "rename-token";

let server: InstanceType<typeof DaemonServer>;
let dir: string;
let agentHome: string;
let sessionsDir: string;
let workspace: string;

type ServerPacket = Record<string, any>;

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), "pie-rename-"));
	agentHome = join(dir, "agent-home");
	sessionsDir = join(agentHome, "sessions");
	mkdirSync(sessionsDir, { recursive: true });
	workspace = join(dir, "workspace");
	mkdirSync(workspace, { recursive: true });

	server = new DaemonServer({
		listenHost: "127.0.0.1",
		listenPort: PORT,
		token: TOKEN,
		agentDir: agentHome,
		servePage: false,
		piVersion: "1.1.0",
		piAgentDir: agentHome,
	});
	await server.start();
});

afterAll(async () => {
	await server?.stop();
	rmSync(dir, { recursive: true, force: true });
});

/** Minimal wire client; waitForEvent consumes matched events from the queue. */
class WireClient {
	private ws: WebSocket;
	private next = 0;
	private pending = new Map<string, { resolve: (d: any) => void; reject: (e: Error) => void }>();
	events: ServerPacket[] = [];

	static async connect(): Promise<WireClient> {
		const ws = await new Promise<WebSocket>((resolve, reject) => {
			const s = new WebSocket(`ws://127.0.0.1:${PORT}`);
			s.on("open", () => resolve(s));
			s.on("error", reject);
		});
		const client = new WireClient(ws);
		const status = await client.request("daemon.status");
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

	/** Consumes the first matching event (so repeated renames can each be awaited). */
	waitForEvent(ev: string, timeoutMs = 3000): Promise<ServerPacket> {
		const consume = (): ServerPacket | null => {
			const i = this.events.findIndex((e) => e.ev === ev);
			if (i !== -1) return this.events.splice(i, 1)[0]!;
			return null;
		};
		const found = consume();
		if (found) return Promise.resolve(found);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error(`timeout waiting for ${ev}`)), timeoutMs);
			const check = () => {
				const f = consume();
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

/** Fabricate a closed on-disk session file the daemon never opened. */
function createDiskSession(cwd: string, name?: string): string {
	const mgr = SessionManager.create(cwd, sessionsDir);
	// A user message flushes the file to disk (pi writes lazily: no conversation, no file).
	mgr.appendMessage({ role: "user", content: "disk session body" } as never);
	if (name !== undefined) mgr.appendSessionInfo(name);
	return mgr.getSessionId();
}

/** Last line of a session file, parsed as JSON. */
function tailEntry(path: string): any {
	const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
	return JSON.parse(lines[lines.length - 1]!);
}

describe("session.rename wire semantics", () => {
	it("renames a closed on-disk session without opening it", async () => {
		const id = createDiskSession(workspace);
		const client = await WireClient.connect();
		await client.request("workspace.open", { path: workspace });

		await client.request("session.rename", { sessionId: id, name: "重构探索" });

		const listed = await client.request("session.list", { workspaceId: workspace });
		const row = listed.sessions.find((s: any) => s.sessionId === id);
		expect(row).toBeTruthy();
		expect(row.name).toBe("重构探索");
		expect(row.open).toBe(false);
		const tail = tailEntry(row.path);
		expect(tail.type).toBe("session_info");
		expect(tail.name).toBe("重构探索");
		client.close();
	});

	it("open-session rename path still works, broadcasts, and clears on empty", async () => {
		const client = await WireClient.connect();
		await client.request("workspace.open", { path: workspace });
		const created = await client.request("session.create", { workspaceId: workspace });
		await client.request("session.attach", { sessionId: created.sessionId });

		await client.request("session.rename", { sessionId: created.sessionId, name: "打开中改名" });
		const renamed = await client.waitForEvent("session.renamed");
		expect(renamed.data.name).toBe("打开中改名");

		await client.request("session.rename", { sessionId: created.sessionId, name: "" });
		const cleared = await client.waitForEvent("session.renamed");
		expect(cleared.data.name ?? "").toBe("");

		const listed = await client.request("session.list", { workspaceId: workspace });
		const row = listed.sessions.find((s: any) => s.sessionId === created.sessionId);
		expect(row.name ?? "").toBe("");
		client.close();
	});

	it("empty and whitespace-only names explicitly clear a closed session's name", async () => {
		const id = createDiskSession(workspace, "旧名字");
		const client = await WireClient.connect();

		await client.request("session.rename", { sessionId: id, name: "" });
		let listed = await client.request("session.list", { workspaceId: workspace });
		let row = listed.sessions.find((s: any) => s.sessionId === id);
		expect(row.name ?? "").toBe("");
		expect(tailEntry(row.path).name ?? "").toBe("");

		await client.request("session.rename", { sessionId: id, name: "重命名后" });
		await client.request("session.rename", { sessionId: id, name: "   " });
		listed = await client.request("session.list", { workspaceId: workspace });
		row = listed.sessions.find((s: any) => s.sessionId === id);
		expect(row.name ?? "").toBe("");
		expect(tailEntry(row.path).name ?? "").toBe("");
		client.close();
	});

	it("rejects unknown session ids with not_found", async () => {
		const client = await WireClient.connect();
		await expect(
			client.request("session.rename", { sessionId: "no-such-session", name: "x" }),
		).rejects.toThrow(/not found/);
		client.close();
	});
});
