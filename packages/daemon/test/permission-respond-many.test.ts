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

const dir = mkdtempSync(join(tmpdir(), "pie-permbatch-"));
mkdirSync(join(dir, "agent-home", "sessions"), { recursive: true });
const workspace = join(dir, "workspace");
mkdirSync(workspace, { recursive: true });

let server: InstanceType<typeof DaemonServer>;
const appEvents: Array<{ ev: string; data: any }> = [];
let ws: WebSocket;

function connect(): Promise<void> {
	return new Promise((resolve, reject) => {
		ws = new WebSocket("ws://127.0.0.1:8881");
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
			listenPort: 8881,
			token: "t",
			agentDir: join(dir, "agent-home"),
			servePage: false,
			piVersion: "1.1.0",
			piAgentDir: join(dir, "agent-home"),
			permissionMode: "ask",
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

/** Open a session, subscribe, and expose the host's permission gate (production path). */
async function openSession(): Promise<{ sessionId: string; gate: any; host: any }> {
	const { sessionId } = await call("session.create", { workspaceId: workspace });
	await call("session.attach", { sessionId });
	const host = (server.registry as any).get(sessionId);
	expect(host).toBeTruthy();
	return { sessionId, gate: host.permissionGate, host };
}

async function waitFor(predicate: () => void, timeout = 20_000): Promise<void> {
	await vi.waitFor(predicate, { timeout, interval: 100 });
}

describe("permission.respondMany + session.permission.settled (wire)", () => {
	it(
		"批量 allow:全结算 + 定时器不动 + settled(user) 逐张广播",
		async () => {
			const { gate } = await openSession();
			appEvents.length = 0;
			const p1 = gate.intercept("bash", { command: "echo one" });
			const p2 = gate.intercept("write", { path: "a.txt", content: "x" });
			await waitFor(() => {
				expect(appEvents.filter((e) => e.ev === "session.permission.request")).toHaveLength(2);
			});
			const ids = appEvents.filter((e) => e.ev === "session.permission.request").map((e) => e.data.requestId);

			const res = await call("permission.respondMany", { requestIds: ids, decision: "allow" });
			expect(res.settled.sort()).toEqual([...ids].sort());
			expect(res.unknown).toEqual([]);

			await waitFor(() => {
				expect(appEvents.filter((e) => e.ev === "session.permission.settled" && e.data.source === "user")).toHaveLength(2);
			});
			// allow → 拦截放行(undefined = 不 block)
			expect(await Promise.all([p1, p2])).toEqual([undefined, undefined]);
		},
		HOOK_TIMEOUT,
	);

	it(
		"混合批:已知 id 结算,unknown 报告且不报错(服务端权威撤卡依据)",
		async () => {
			const { gate } = await openSession();
			appEvents.length = 0;
			const p = gate.intercept("edit", { path: "y", content: "z" });
			await waitFor(() => {
				expect(appEvents.filter((e) => e.ev === "session.permission.request")).toHaveLength(1);
			});
			const requestId = appEvents.find((e) => e.ev === "session.permission.request")!.data.requestId;

			const res = await call("permission.respondMany", {
				requestIds: [requestId, "perm-bogus-1", "perm-bogus-2"],
				decision: "deny",
			});
			expect(res.settled).toEqual([requestId]);
			expect(res.unknown.sort()).toEqual(["perm-bogus-1", "perm-bogus-2"]);

			await waitFor(() => {
				expect(appEvents.filter((e) => e.ev === "session.permission.settled" && e.data.source === "user")).toHaveLength(1);
			});
			expect(await p).toEqual({ block: true, reason: "edit was not approved by the user" });
		},
		HOOK_TIMEOUT,
	);

	it(
		"单张 respond 回归:仍可结算且 settled(user) 照常广播",
		async () => {
			const { gate } = await openSession();
			appEvents.length = 0;
			const p = gate.intercept("bash", { command: "echo single" });
			await waitFor(() => {
				expect(appEvents.filter((e) => e.ev === "session.permission.request")).toHaveLength(1);
			});
			const requestId = appEvents.find((e) => e.ev === "session.permission.request")!.data.requestId;

			expect(await call("permission.respond", { requestId, decision: "allow" })).toEqual({});
			await waitFor(() => {
				expect(appEvents.filter((e) => e.ev === "session.permission.settled")).toHaveLength(1);
			});
			expect(await p).toBeUndefined();
		},
		HOOK_TIMEOUT,
	);

	it(
		"批量 allowSession:按 toolName 记入会话允许集,同工具不再出卡",
		async () => {
			const { gate } = await openSession();
			appEvents.length = 0;
			const p1 = gate.intercept("webfetch", { url: "https://example.com" });
			await waitFor(() => {
				expect(appEvents.filter((e) => e.ev === "session.permission.request")).toHaveLength(1);
			});
			const requestId = appEvents.find((e) => e.ev === "session.permission.request")!.data.requestId;

			const res = await call("permission.respondMany", { requestIds: [requestId], decision: "allowSession" });
			expect(res.settled).toEqual([requestId]);
			expect(await p1).toBeUndefined();

			// 第二次同工具:既无新卡也无阻塞(会话允许集放行)
			expect(await gate.intercept("webfetch", { url: "https://example.com/2" })).toBeUndefined();
			expect(appEvents.filter((e) => e.ev === "session.permission.request")).toHaveLength(1);
		},
		HOOK_TIMEOUT,
	);

	it(
		"dispose → denyAll:pending 各得一条 settled(source=dispose)",
		async () => {
			const { gate, host } = await openSession();
			appEvents.length = 0;
			const p1 = gate.intercept("bash", { command: "echo d1" });
			const p2 = gate.intercept("write", { path: "d.txt", content: "d" });
			await waitFor(() => {
				expect(appEvents.filter((e) => e.ev === "session.permission.request")).toHaveLength(2);
			});
			host.dispose();
			await waitFor(() => {
				expect(appEvents.filter((e) => e.ev === "session.permission.settled")).toHaveLength(2);
			});
			const settled = appEvents.filter((e) => e.ev === "session.permission.settled");
			expect(settled.map((e) => e.data.source)).toEqual(["dispose", "dispose"]);
			expect(await Promise.allSettled([p1, p2])).toEqual([
				{ status: "fulfilled", value: { block: true, reason: "bash was not approved by the user" } },
				{ status: "fulfilled", value: { block: true, reason: "write was not approved by the user" } },
			]);
		},
		HOOK_TIMEOUT,
	);

	it("decision 非法值:respond/respondMany 双双拒绝(盲转修复)", async () => {
		await expect(call("permission.respond", { requestId: "x", decision: "maybe" })).rejects.toThrow(
			/Invalid permission decision/,
		);
		await expect(
			call("permission.respondMany", { requestIds: ["x"], decision: "allow-all-the-things" }),
		).rejects.toThrow(/Invalid permission decision/);
	});

	it("requestIds 参数校验:非数组拒绝", async () => {
		await expect(call("permission.respondMany", { requestIds: "not-an-array", decision: "allow" })).rejects.toThrow(
			/requestIds/,
		);
	});

	it("单张 respond 未知 id:request_not_found 语义保持", async () => {
		await expect(call("permission.respond", { requestId: "perm-nope", decision: "allow" })).rejects.toThrow(
			/No pending permission/,
		);
	});
});
