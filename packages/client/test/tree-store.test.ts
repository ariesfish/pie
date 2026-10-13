import { describe, expect, it } from "vitest";
import { event as ev, type SessionSnapshot } from "@pie/protocol";
import { GapDetectedError, SessionTreeStore } from "../src/tree-store.js";

function snapshot(): SessionSnapshot {
	return {
		sessionId: "s-1",
		sessionFile: "/tmp/s1.jsonl",
		workspaceId: "/repo",
		snapshotVersion: 1 as const,
		tree: [
			{ id: "e1", parentId: null, type: "message", timestamp: "2025-10-10T10:00:00Z" },
			{ id: "e2", parentId: "e1", type: "message", timestamp: "2025-10-10T10:00:01Z" },
			{ id: "e3", parentId: "e2", type: "message", timestamp: "2025-10-10T10:00:02Z" },
		],
		leafId: "e3",
		entries: [
			{
				id: "e1",
				parentId: null,
				timestamp: "2025-10-10T10:00:00Z",
				type: "message",
				message: { role: "user", content: "hello" },
			},
			{
				id: "e2",
				parentId: "e1",
				timestamp: "2025-10-10T10:00:01Z",
				type: "message",
				message: { role: "assistant", content: [{ type: "text", text: "hi" }], provider: "x", model: "m" },
			},
			{
				id: "e3",
				parentId: "e2",
				timestamp: "2025-10-10T10:00:02Z",
				type: "message",
				message: { role: "user", content: "and then?" },
			},
		],
		state: {
			isStreaming: false,
			isCompacting: false,
			isRetrying: false,
			autoCompaction: true,
			steeringMode: "all" as const,
			followUpMode: "all" as const,
			pendingMessages: 0,
			messageCount: 3,
		},
		queues: { steering: [], followUp: [] },
	};
}

describe("SessionTreeStore", () => {
	it("derives the timeline along the active path", () => {
		const store = new SessionTreeStore();
		store.applySnapshot(snapshot());
		expect(store.timeline().map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
		expect(store.currentLeafId).toBe("e3");
	});

	it("appends entries that extend the leaf", () => {
		const store = new SessionTreeStore();
		store.applySnapshot(snapshot());
		store.applyEvent(
			ev("session.entry.appended", 10, {
				sessionId: "s-1",
				leafId: "e4",
				entry: {
					id: "e4",
					parentId: "e3",
					type: "message",
					timestamp: "2025-10-10T10:00:03Z",
					message: { role: "user", content: "go on" },
				},
			}),
		);
		expect(store.timeline().map((e) => e.id)).toEqual(["e1", "e2", "e3", "e4"]);
	});

	it("grows a fork without moving the leaf (rewind-then-partition case)", () => {
		const store = new SessionTreeStore();
		store.applySnapshot(snapshot());
		// A new branch entry off e2, but leaf stays e3 (fork preview side branch)
		store.applyEvent(
			ev("session.entry.appended", 10, {
				sessionId: "s-1",
				leafId: "e3",
				entry: {
					id: "e2b",
					parentId: "e2",
					type: "message",
					timestamp: "2025-10-10T10:00:02Z",
					message: { role: "user", content: "alt branch" },
				},
			}),
		);
		expect(store.currentLeafId).toBe("e3");
		expect(store.timeline().map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
		// e3 is the on-path entry with a sibling → it is the fork point.
		expect(store.forkPoints()).toEqual(["e3"]);
		expect(store.childrenOf("e2")).toEqual(["e2b", "e3"]);
		expect(store.stats.branchTips).toBe(2);
		// Switching the observed leaf switches the timeline.
		store.applyEvent(ev("session.leaf.changed", 11, { sessionId: "s-1", leafId: "e2b", cause: "fork" }));
		expect(store.timeline().map((e) => e.id)).toEqual(["e1", "e2", "e2b"]);
	});

	it("orders sibling children by timestamp", () => {
		const store = new SessionTreeStore();
		store.applySnapshot(snapshot());
		store.applyEvent(
			ev("session.entry.appended", 10, {
				sessionId: "s-1",
				leafId: "e3",
				entry: {
					id: "e2b",
					parentId: "e2",
					type: "message",
					timestamp: "2025-10-10T09:59:59Z", // earlier than e3
					message: { role: "user", content: "older sibling" },
				},
			}),
		);
		expect(store.childrenOf("e2")).toEqual(["e2b", "e3"]);
	});

	it("throws GapDetectedError when a parent is unknown (lost frames)", () => {
		const store = new SessionTreeStore();
		store.applySnapshot(snapshot());
		expect(() =>
			store.applyEvent(
				ev("session.entry.appended", 10, {
					sessionId: "s-1",
					leafId: "eX",
					entry: {
						id: "eX",
						parentId: "missing-parent",
						type: "message",
						timestamp: "2025-10-10T10:00:03Z",
						message: { role: "user", content: "?" },
					},
				}),
			),
		).toThrow(GapDetectedError);
	});

	it("tracks queues and coarse state", () => {
		const store = new SessionTreeStore();
		store.applySnapshot(snapshot());
		store.applyEvent(
			ev("session.queue.changed", 12, { sessionId: "s-1", steering: ["wait"], followUp: [] }),
		);
		expect(store.currentQueues.steering).toEqual(["wait"]);
		store.applyEvent(
			ev("session.state.changed", 13, {
				sessionId: "s-1",
				isStreaming: true,
				isCompacting: false,
				isRetrying: false,
				pendingMessages: 1,
			}),
		);
		expect(store.currentState?.isStreaming).toBe(true);
		expect(store.currentState?.pendingMessages).toBe(1);
	});

	it("ignores non-state events (deltas, tools, ext UI) without error", () => {
		const store = new SessionTreeStore();
		store.applySnapshot(snapshot());
		expect(() => {
			store.applyEvent(
				ev("session.partial.delta", 20, { sessionId: "s-1", kind: "text", contentIndex: 0, delta: "x" }),
			);
			store.applyEvent(
				ev("session.tool.started", 21, { sessionId: "s-1", toolCallId: "t1", toolName: "read", args: {} }),
			);
			store.applyEvent(
				ev("session.ext.widget", 22, { sessionId: "s-1", key: "todo", lines: ["a"] }),
			);
		}).not.toThrow();
		expect(store.timeline().length).toBe(3);
	});
});
