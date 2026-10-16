import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocket } from "ws";
import { vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/serve-page.js", () => ({ readIndexAndMeta: async () => null }));

// Cold agent-home session boot can be slow; give hooks room.
const HOOK_TIMEOUT = 30_000;

const { DaemonServer } = await import("../src/server/server.js");

const dir = mkdtempSync(join(tmpdir(), "pie-sum-"));
mkdirSync(join(dir, "agent-home", "sessions"), { recursive: true });
const workspace = join(dir, "workspace");
mkdirSync(workspace, { recursive: true });

let server: InstanceType<typeof DaemonServer>;
const appEvents: Array<{ ev: string; data: any }> = [];
let ws: WebSocket;

function connect(): Promise<void> {
	return new Promise((resolve, reject) => {
		ws = new WebSocket("ws://127.0.0.1:8877");
		ws.on("error", reject);
		ws.on("message", (raw) => {
			const text = typeof raw === "string" ? raw : Buffer.from(raw as ArrayBuffer).toString("utf8");
			for (const line of text.split("\n")) {
				if (!line.trim()) continue;
				const msg = JSON.parse(line);
				if (msg.ev) appEvents.push({ ev: msg.ev, data: msg.data });
				else if (msg.helloAck) resolve();
			}
		});
		ws.on("open", () => {
			ws.send(
				JSON.stringify({
					hello: {
						v: 1,
						client: { kind: "cli", version: "0.1.0", platform: "test" },
						caps: ["treeSync"],
						auth: { method: "token", token: "t" },
					},
				}) + "\n",
			);
		});
	});
}

async function call(cmd: string, args: Record<string, unknown>): Promise<any> {
	const id = `r-${Math.random().toString(36).slice(2)}`;
	const res = (await new Promise((resolve, reject) => {
		const onMsg = (raw: any) => {
			const msg = JSON.parse(String(raw));
			if (msg.id === id) {
				ws.off("message", onMsg);
				if (msg.ok) resolve(msg.data);
				else reject(new Error(msg.error?.message ?? "err"));
			}
		};
		ws.on("message", onMsg);
		ws.send(JSON.stringify({ id, cmd, args }) + "\n");
	})) as any;
	return res;
}

beforeAll(
	async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", join(dir, "agent-home"));
		server = new DaemonServer({
			listenHost: "127.0.0.1",
			listenPort: 8877,
			token: "t",
			agentDir: join(dir, "agent-home"),
			servePage: false,
			piVersion: "1.1.0",
			piAgentDir: join(dir, "agent-home"),
		});
		await server.start();
		await connect();
	},
	HOOK_TIMEOUT,
);

afterAll(async () => {
	await server.stop();
	rmSync(dir, { recursive: true, force: true });
});

describe("session.summary.updated", () => {
	it(
		"broadcasts a live row once the session file lands (no stale placeholder)",
		async () => {
			const { sessionId } = await call("session.create", { workspaceId: workspace });
			// Subscribe like a real viewer (broadcast is per-session filtered).
			await call("session.attach", { sessionId });

			// Hermetic agent-home has no model, so session.prompt cannot run a
			// turn. Drive the same production path directly: append a real user
			// message through pi's sessionManager (the file lands), then push a
			// turn.ended through the forwarding path emitSessionSummary hooks.
			const host = (server.registry as any).get(sessionId);
			expect(host).toBeTruthy();
			host.session.sessionManager.appendMessage({
				role: "user",
				content: "hi, who reads this?",
			} as any);
			expect(String(host.sessionFile ?? "").length).toBeGreaterThan(0);
			appEvents.length = 0;
			(server as any).forwardBySession({
				ev: "session.turn.ended",
				data: { sessionId },
			});
			await vi.waitFor(
				() => {
					const hit = appEvents.find(
						(e) => e.ev === "session.summary.updated" && e.data.sessionId === sessionId,
					);
					expect(hit).toBeTruthy();
					expect(String(hit!.data.item.firstMessage)).toContain("reads this");
					expect(hit!.data.item.messageCount).toBeGreaterThan(0);
					expect(String(hit!.data.item.path).length).toBeGreaterThan(0);
				},
				{ timeout: 20_000, interval: 250 },
			);
		},
		HOOK_TIMEOUT,
	);
});
