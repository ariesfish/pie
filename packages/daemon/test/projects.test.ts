import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { vi } from "vitest";
import { WebSocket } from "ws";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("../src/serve-page.js", () => ({ readIndexAndMeta: async () => null }));

const { DaemonServer } = await import("../src/server/server.js");

const dir = mkdtempSync(join(tmpdir(), "pie-proj-"));
const agentHome = join(dir, "agent-home");
mkdirSync(join(agentHome, "sessions"), { recursive: true });
// workspace container: two git sub-repos, one plain dir, one ignored nest.
const workspace = join(dir, "workspace");
mkdirSync(workspace, { recursive: true });
mkdirSync(join(workspace, "repo-a", ".git"), { recursive: true });
mkdirSync(join(workspace, "repo-b", ".git"), { recursive: true });
mkdirSync(join(workspace, "plain-dir"), { recursive: true });
mkdirSync(join(workspace, "node_modules", ".git"), { recursive: true });
const repoAPath = join(workspace, "repo-a");

let server: InstanceType<typeof DaemonServer>;
let ws: WebSocket;

function connect(): Promise<void> {
	return new Promise((resolve, reject) => {
		ws = new WebSocket("ws://127.0.0.1:8878");
		ws.on("error", reject);
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
		ws.on("message", (raw) => {
			const text = typeof raw === "string" ? raw : Buffer.from(raw as ArrayBuffer).toString("utf8");
			for (const line of text.split("\n")) {
				if (!line.trim()) continue;
				const msg = JSON.parse(line);
				if (msg.helloAck) resolve();
			}
		});
	});
}

async function call(cmd: string, args: Record<string, unknown>): Promise<any> {
	const id = `r-${Math.random().toString(36).slice(2)}`;
	return (await new Promise((resolve, reject) => {
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
}

beforeAll(async () => {
	vi.stubEnv("PI_CODING_AGENT_DIR", agentHome);
	server = new DaemonServer({
		listenHost: "127.0.0.1",
		listenPort: 8878,
		token: "t",
		agentDir: agentHome,
		servePage: false,
		piVersion: "1.1.0",
		piAgentDir: agentHome,
	});
	await server.start();
	await connect();
}, 20_000);

afterAll(async () => {
	await server.stop();
	rmSync(dir, { recursive: true, force: true });
});

describe("workspace.projects", () => {
	it("lists git sub-repos, ignoring non-repos and node_modules", async () => {
		const res = await call("workspace.projects", { workspaceId: workspace });
		expect(res.projects.map((p: { name: string }) => p.name)).toEqual(["repo-a", "repo-b"]);
	});

	it("returns empty (not an error) for a missing workspace path", async () => {
		const res = await call("workspace.projects", { workspaceId: join(dir, "nope") });
		expect(res.projects).toEqual([]);
	});
});

describe("session.list recursive", () => {
	it("includes project-cwd sessions under the workspace, not at its root", async () => {
		// Land a real pi session file whose cwd is repo-a.
		const mgr = SessionManager.continueRecent(repoAPath, join(agentHome, "sessions"));
		mgr.appendMessage({ role: "user", content: "project session body" } as never);

		const flat = await call("session.list", { workspaceId: workspace });
		expect(flat.sessions.every((s: { workspaceId: string }) => s.workspaceId === workspace)).toBe(true);

		const deep = await call("session.list", { workspaceId: workspace, recursive: true });
		const hit = deep.sessions.find((s: { firstMessage: string }) => s.firstMessage.includes("project session body"));
		expect(hit).toBeTruthy();
		expect(hit.workspaceId).toBe(repoAPath);
	});
});
