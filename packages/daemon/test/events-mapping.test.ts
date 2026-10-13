import { describe, expect, it, vi } from "vitest";
import { PartialCoalescer, mapSessionEvent, partialDeltaFromUpdate } from "../src/pi/events.js";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

describe("PartialCoalescer", () => {
	it("merges same-key deltas within the window", async () => {
		const emitted: unknown[] = [];
		const coalescer = new PartialCoalescer((d) => emitted.push(d), 10);
		coalescer.push({ sessionId: "s", kind: "text", contentIndex: 0, delta: "Hel" }, "s");
		coalescer.push({ sessionId: "s", kind: "text", contentIndex: 0, delta: "lo " }, "s");
		coalescer.push({ sessionId: "s", kind: "text", contentIndex: 0, delta: "world" }, "s");
		expect(emitted).toEqual([]); // held within the window
		coalescer.flush();
		expect(emitted).toEqual([
			{ sessionId: "s", kind: "text", contentIndex: 0, delta: "Hello world" },
		]);
	});

	it("auto-flushes after the window elapses", async () => {
		vi.useFakeTimers();
		const emitted: unknown[] = [];
		const coalescer = new PartialCoalescer((d) => emitted.push(d), 16);
		coalescer.push({ sessionId: "s", kind: "text", contentIndex: 0, delta: "a" }, "s");
		expect(emitted).toEqual([]);
		vi.advanceTimersByTime(20);
		expect(emitted).toEqual([{ sessionId: "s", kind: "text", contentIndex: 0, delta: "a" }]);
		vi.useRealTimers();
	});

	it("separates different keys (kind/contentIndex/messageId) in order", () => {
		const emitted: unknown[] = [];
		const coalescer = new PartialCoalescer((d) => emitted.push(d), 10);
		coalescer.push({ sessionId: "s", kind: "text", contentIndex: 0, delta: "t1" }, "s");
		coalescer.push({ sessionId: "s", kind: "thinking", contentIndex: 0, delta: "think" }, "s");
		coalescer.push({ sessionId: "s", kind: "thinking", contentIndex: 0, delta: " more" }, "s");
		coalescer.push({ sessionId: "s", kind: "text", contentIndex: 1, delta: "t2" }, "s");
		coalescer.flush();
		expect(emitted).toEqual([
			{ sessionId: "s", kind: "text", contentIndex: 0, delta: "t1" },
			{ sessionId: "s", kind: "thinking", contentIndex: 0, delta: "think more" },
			{ sessionId: "s", kind: "text", contentIndex: 1, delta: "t2" },
		]);
	});

	it("never emits deltas out of order relative to flush calls", () => {
		const emitted: string[] = [];
		const coalescer = new PartialCoalescer((d) => emitted.push(`delta:${d.delta}`), 10);
		coalescer.push({ sessionId: "s", kind: "text", contentIndex: 0, delta: "a" }, "s");
		// host flushes before any non-delta event
		coalescer.flush();
		emitted.push("event:tool_started");
		expect(emitted).toEqual(["delta:a", "event:tool_started"]);
	});
});

describe("mapSessionEvent", () => {
	it("maps run lifecycle", () => {
		expect(mapSessionEvent({ type: "agent_start" } as AgentSessionEvent, "s1")).toEqual([
			{ ev: "session.run.started", data: { sessionId: "s1" } },
		]);
		expect(mapSessionEvent({ type: "agent_end", messages: [], willRetry: true } as AgentSessionEvent, "s1")).toEqual([
			{ ev: "session.run.ended", data: { sessionId: "s1", willRetry: true } },
		]);
		expect(mapSessionEvent({ type: "agent_settled", aborted: false } as AgentSessionEvent, "s1")).toEqual([
			{ ev: "session.settled", data: { sessionId: "s1", aborted: false } },
		]);
	});

	it("maps queues with copied arrays", () => {
		const steering = ["a"];
		const followUp = ["b"];
		const out = mapSessionEvent({ type: "queue_update", steering, followUp } as AgentSessionEvent, "s1");
		const data = out[0]!.data as { steering: string[]; followUp: string[] };
		expect(data.steering).toEqual(["a"]);
		expect(data.steering).not.toBe(steering);
	});

	it("maps tool execution start with parent id passthrough", () => {
		const out = mapSessionEvent(
			{
				type: "tool_execution_start",
				toolCallId: "t1",
				toolName: "read",
				args: { path: "x" },
				parentToolCallId: "t0",
			} as never,
			"s1",
		);
		expect(out[0]!.ev).toBe("session.tool.started");
		expect(out[0]!.data).toMatchObject({ toolCallId: "t1", toolName: "read", parentToolCallId: "t0" });
	});

	it("maps entry_appended and leaves leafId for the host to fill", () => {
		const out = mapSessionEvent(
			{
				type: "entry_appended",
				entry: { type: "message", id: "e1", parentId: null, timestamp: "t", message: { role: "user", content: "hi" } },
			} as AgentSessionEvent,
			"s1",
		);
		const data = out[0]!.data as { leafId: null; entry: { id: string } };
		expect(data.entry.id).toBe("e1");
		expect(data.leafId).toBeNull();
	});

	it("maps compaction and retry events", () => {
		const compaction = mapSessionEvent({ type: "compaction_start", reason: "threshold" } as never, "s1");
		expect(compaction[0]).toMatchObject({ ev: "session.compaction.started" });
		const retry = mapSessionEvent(
			{ type: "auto_retry_start", attempt: 1, maxAttempts: 3, delayMs: 500, errorMessage: "x" } as never,
			"s1",
		);
		expect(retry[0]).toMatchObject({ ev: "session.retry.started" });
	});

	it("returns nothing for message_update and bash_execution_update (coalescer domain)", () => {
		expect(
			mapSessionEvent(
				{ type: "message_update", message: {}, assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "x", partial: {} } } as never,
				"s1",
			),
		).toEqual([]);
		expect(mapSessionEvent({ type: "bash_execution_update", delta: "x" } as never, "s1")).toEqual([]);
	});

	it("drops unknown event types", () => {
		expect(mapSessionEvent({ type: "future_event" } as never, "s1")).toEqual([]);
	});
});

describe("partialDeltaFromUpdate", () => {
	const update = (assistantMessageEvent: unknown) =>
		({ type: "message_update", message: {}, assistantMessageEvent }) as never;

	it("maps text/thinking/toolargs deltas", () => {
		expect(partialDeltaFromUpdate(update({ type: "text_delta", contentIndex: 0, delta: "a" }), "s")).toEqual({
			sessionId: "s",
			kind: "text",
			contentIndex: 0,
			delta: "a",
		});
		expect(partialDeltaFromUpdate(update({ type: "thinking_delta", contentIndex: 1, delta: "b" }), "s")).toMatchObject({ kind: "thinking" });
		expect(partialDeltaFromUpdate(update({ type: "toolcall_delta", contentIndex: 2, delta: "c" }), "s")).toMatchObject({ kind: "toolArgs" });
	});

	it("returns null for non-delta assistant events", () => {
		expect(partialDeltaFromUpdate(update({ type: "text_start", contentIndex: 0 }), "s")).toBeNull();
		expect(partialDeltaFromUpdate(update({ type: "done", reason: "stop" }), "s")).toBeNull();
	});
});
