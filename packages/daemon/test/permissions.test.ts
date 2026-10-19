import { describe, expect, it, vi } from "vitest";
import { PermissionGate, createPermissionExtension } from "../src/pi/permissions.js";
import type { WirePermissionRequest, WirePermissionSettled, PermissionDecision } from "../src/pi/permissions.js";

function makeGate(opts: Partial<ConstructorParameters<typeof PermissionGate>[0]> = {}) {
	const published: WirePermissionRequest[] = [];
	const settled: WirePermissionSettled[] = [];
	const gate = new PermissionGate({
		mode: "ask",
		sessionId: () => "s-1",
		publish: (request) => published.push(request),
		publishSettled: (s) => settled.push(s),
		timeoutMs: 500,
		...opts,
	});
	return { gate, published, settled };
}

/** Drive one intercept; optionally auto-answer from the "client" when published. */
async function runIntercept(
	gate: PermissionGate,
	published: WirePermissionRequest[],
	opts: {
		answer?: PermissionDecision;
		toolName?: string;
		input?: Record<string, unknown>;
		annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean };
	} = {},
): Promise<unknown> {
	const promise = gate.intercept(opts.toolName ?? "bash", opts.input ?? { command: "rm -rf build" }, opts.annotations);
	if (opts.answer) {
		await vi.waitFor(() => expect(published.length).toBeGreaterThan(0), { timeout: 500 });
		gate.respond(published[published.length - 1]!.requestId, opts.answer);
	}
	return promise;
}

describe("PermissionGate.needsApproval (annotation formula from docs)", () => {
	it("allows read-only", () => {
		expect(PermissionGate.needsApproval({ readOnlyHint: true })).toBe(false);
	});
	it("asks for destructive", () => {
		expect(PermissionGate.needsApproval({ destructiveHint: true })).toBe(true);
	});
	it("defaults unknown annotations to ask (MCP defaults)", () => {
		expect(PermissionGate.needsApproval(undefined)).toBe(true);
		expect(PermissionGate.needsApproval({})).toBe(true);
	});
	it("open world asks when not read-only", () => {
		expect(PermissionGate.needsApproval({ openWorldHint: true })).toBe(true);
	});
});

describe("PermissionGate", () => {
	it("off mode never asks", async () => {
		const { gate, published } = makeGate({ mode: "off" });
		expect(await runIntercept(gate, published)).toBeUndefined();
		expect(published).toHaveLength(0);
	});

	it("annotations mode skips read-only but asks for the rest", async () => {
		const { gate, published } = makeGate({ mode: "annotations" });
		// read-only: no card at all
		expect(
			await runIntercept(gate, published, {
				toolName: "read",
				input: { path: "x" },
				annotations: { readOnlyHint: true },
			}),
		).toBeUndefined();
		expect(published).toHaveLength(0);
		// unannotated tool: card + deny blocks
		expect(await runIntercept(gate, published, { answer: "deny", toolName: "bash" })).toEqual({
			block: true,
			reason: "bash was not approved by the user",
		});
		expect(published).toHaveLength(1);
	});

	it("ask mode asks for everything", async () => {
		const { gate, published } = makeGate({ mode: "ask" });
		expect(
			await runIntercept(gate, published, {
				answer: "allow",
				toolName: "read",
				input: { path: "x" },
				annotations: { readOnlyHint: true },
			}),
		).toBeUndefined();
		expect(published).toHaveLength(1);
	});

	it("allowSession remembers the tool for the session", async () => {
		const { gate, published } = makeGate({ mode: "ask" });
		expect(await runIntercept(gate, published, { answer: "allowSession", toolName: "bash" })).toBeUndefined();
		// Second call: no new card, no block.
		expect(await runIntercept(gate, published, { toolName: "bash" })).toBeUndefined();
		expect(published).toHaveLength(1);
	});

	it("deny blocks with a model-readable reason", async () => {
		const { gate, published } = makeGate({ mode: "ask" });
		expect(await runIntercept(gate, published, { answer: "deny", toolName: "bash" })).toEqual({
			block: true,
			reason: "bash was not approved by the user",
		});
	});

	it("timeout resolves as deny (fail-safe)", async () => {
		const { gate } = makeGate({ mode: "ask", timeoutMs: 40 });
		expect(await gate.intercept("bash", {})).toEqual({
			block: true,
			reason: "bash was not approved by the user",
		});
	});

	it("denyAll settles pending as deny (session dispose)", async () => {
		const { gate, published } = makeGate({ mode: "ask" });
		const promise = gate.intercept("bash", {});
		await vi.waitFor(() => expect(published.length).toBe(1), { timeout: 500 });
		published.length = 0;
		gate.denyAll();
		expect(await promise).toEqual({ block: true, reason: "bash was not approved by the user" });
	});

	it("respond returns false for unknown requestId", () => {
		const { gate } = makeGate({ mode: "ask" });
		expect(gate.respond("nope", "allow")).toBe(false);
	});

	it("request payload carries annotations, reason and timeouts", async () => {
		const { gate, published } = makeGate({ mode: "annotations", timeoutMs: 12345 });
		const pending = gate.intercept("write", { path: "x", content: "y" }, { destructiveHint: true });
		await vi.waitFor(() => expect(published.length).toBe(1), { timeout: 500 });
		const request = published[0]!;
		expect(request).toMatchObject({
			sessionId: "s-1",
			toolName: "write",
			argsPreview: { path: "x", content: "y" },
			annotations: { destructiveHint: true },
			reason: "policy=annotations",
			timeoutMs: 12345,
		});
		gate.respond(request.requestId, "deny");
		expect(await pending).toMatchObject({ block: true });
	});

	it("args preview is truncated for huge inputs", async () => {
		const { gate, published } = makeGate({ mode: "ask" });
		const pending = gate.intercept("write", { content: "x".repeat(5000) });
		await vi.waitFor(() => expect(published.length).toBe(1), { timeout: 500 });
		const request = published[0]!;
		expect((request.argsPreview["content"] as string).length).toBeLessThanOrEqual(2001);
		gate.respond(request.requestId, "deny");
		await pending;
	});
});

describe("PermissionGate settled events (session.permission.settled)", () => {
	it("respond 结算 → settled source=user,后续不再有 timeout settled", async () => {
		const { gate, published, settled } = makeGate({ mode: "ask", timeoutMs: 50 });
		const pending = gate.intercept("bash", { command: "ls" });
		await vi.waitFor(() => expect(published.length).toBe(1), { timeout: 500 });
		expect(gate.respond(published[0]!.requestId, "allow")).toBe(true);
		expect(await pending).toBeUndefined();
		expect(settled).toEqual([{ requestId: published[0]!.requestId, sessionId: "s-1", source: "user" }]);
		// timer 已清:等到超时点过后,不再新增事件(无 timeout settled、无重复结算)
		await new Promise((r) => setTimeout(r, 90));
		expect(settled).toHaveLength(1);
	});

	it("timeout 到期 → settled source=timeout + deny(fail-safe 不变)", async () => {
		const { gate, published, settled } = makeGate({ mode: "ask", timeoutMs: 40 });
		const pending = gate.intercept("bash", { command: "ls" });
		await vi.waitFor(() => expect(published.length).toBe(1), { timeout: 500 });
		expect(await pending).toEqual({ block: true, reason: "bash was not approved by the user" });
		expect(settled).toEqual([{ requestId: published[0]!.requestId, sessionId: "s-1", source: "timeout" }]);
	});

	it("denyAll → 每张 pending 一条 settled source=dispose", async () => {
		const { gate, published, settled } = makeGate({ mode: "ask" });
		const p1 = gate.intercept("bash", { command: "a" });
		const p2 = gate.intercept("write", { path: "x" });
		await vi.waitFor(() => expect(published.length).toBe(2), { timeout: 500 });
		gate.denyAll();
		expect(await p1).toEqual({ block: true, reason: "bash was not approved by the user" });
		expect(await p2).toEqual({ block: true, reason: "write was not approved by the user" });
		expect(settled.map((s) => s.source)).toEqual(["dispose", "dispose"]);
		expect(new Set(settled.map((s) => s.requestId))).toEqual(new Set(published.map((p) => p.requestId)));
	});

	it("allowSession → settled source=user + 会话允许集记忆(同工具不再出卡)", async () => {
		const { gate, published, settled } = makeGate({ mode: "ask" });
		const p1 = gate.intercept("bash", { command: "a" });
		await vi.waitFor(() => expect(published.length).toBe(1), { timeout: 500 });
		expect(gate.respond(published[0]!.requestId, "allowSession")).toBe(true);
		expect(await p1).toBeUndefined();
		// 第二次同工具:直接放行,无新请求、无新 settled
		expect(await gate.intercept("bash", { command: "b" })).toBeUndefined();
		expect(published).toHaveLength(1);
		expect(settled).toEqual([{ requestId: published[0]!.requestId, sessionId: "s-1", source: "user" }]);
	});

	it("多张卡逐 respond 排空 pending(批量结算的 gate 底座)", async () => {
		const { gate, published, settled } = makeGate({ mode: "ask" });
		const p1 = gate.intercept("bash", { command: "a" });
		const p2 = gate.intercept("write", { path: "x" });
		const p3 = gate.intercept("edit", { path: "y" });
		await vi.waitFor(() => expect(published.length).toBe(3), { timeout: 500 });
		for (const p of published) expect(gate.respond(p.requestId, "allow")).toBe(true);
		expect(await Promise.all([p1, p2, p3])).toEqual([undefined, undefined, undefined]);
		expect(settled).toHaveLength(3);
		expect(settled.every((s) => s.source === "user")).toBe(true);
	});

	it("respond unknown id → false 且无 settled", () => {
		const { gate, settled } = makeGate({ mode: "ask" });
		expect(gate.respond("perm-unknown", "allow")).toBe(false);
		expect(settled).toHaveLength(0);
	});
});

describe("createPermissionExtension", () => {
	it("registers exactly one tool_call handler via pi.on", () => {
		const registered: string[] = [];
		const fakeApi = {
			on: (event: string) => {
				registered.push(event);
			},
			getAllTools: () => [],
		};
		(createPermissionExtension(makeGate().gate) as (pi: unknown) => void)(fakeApi);
		expect(registered).toEqual(["tool_call"]);
	});
});
