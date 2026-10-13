import { describe, expect, it, vi } from "vitest";
import { PermissionGate, createPermissionExtension } from "../src/pi/permissions.js";
import type { WirePermissionRequest, PermissionDecision } from "../src/pi/permissions.js";

function makeGate(opts: Partial<ConstructorParameters<typeof PermissionGate>[0]> = {}) {
	const published: WirePermissionRequest[] = [];
	const gate = new PermissionGate({
		mode: "ask",
		sessionId: () => "s-1",
		publish: (request) => published.push(request),
		timeoutMs: 500,
		...opts,
	});
	return { gate, published };
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
