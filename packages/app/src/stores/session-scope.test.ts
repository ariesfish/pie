import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyStoreEvent, useConnectionStore } from "./connection-store";
import { useSessionListStore } from "./session-list-store";

function resetStore(conn: unknown = null): void {
	useConnectionStore.setState({
		conn: conn as never,
		sessionId: "s1",
		revision: 0,
		olderHistory: { hasMore: false, cursor: null, loading: false },
		deltaText: "",
		deltaKind: null,
		streaming: false,
		queue: { steering: [], followUp: [] },
		usage: null,
		toolCalls: {},
		widgets: {},
		timeline: [],
		permissions: [],
		permissionSelection: [],
		error: null,
	});
}

function event(ev: string, data: unknown) {
	return { ev, seq: 1, data } as never;
}

describe("session-scoped event routing", () => {
	beforeEach(() => resetStore());
	afterEach(() => vi.restoreAllMocks());

	it("drops streaming deltas from a session that is no longer active", () => {
		applyStoreEvent(event("session.partial.delta", { sessionId: "s2", delta: "old", kind: "text" }));

		expect(useConnectionStore.getState().deltaText).toBe("");
	});

	it("drops snapshots and entries from another session without touching the tree revision", () => {
		const before = useConnectionStore.getState().revision;

		applyStoreEvent(
			event("session.snapshot", {
				snapshot: { sessionId: "s2", tree: [], entries: [], leafId: null },
			}),
		);
		applyStoreEvent(
			event("session.entry.appended", { sessionId: "s2", entry: { id: "e2" }, leafId: "e2" }),
		);

		expect(useConnectionStore.getState().revision).toBe(before);
	});

	it("still applies list-level renames for a non-active session", () => {
		const applyRenamed = vi.spyOn(useSessionListStore.getState(), "applyRenamed");

		applyStoreEvent(event("session.renamed", { sessionId: "s2", name: "renamed" }));

		expect(applyRenamed).toHaveBeenCalledWith("s2", "renamed");
	});

	it("applies events for the active session", () => {
		applyStoreEvent(event("session.partial.delta", { sessionId: "s1", delta: "new", kind: "text" }));

		expect(useConnectionStore.getState().deltaText).toBe("new");
	});

	it("loads one older page through session.entries and updates the cursor", async () => {
		const request = vi.fn().mockResolvedValue({
			entries: [
				{
					id: "e1",
					parentId: null,
					timestamp: "2025-10-10T10:00:00Z",
					type: "message",
					message: { role: "user", content: "older" },
				},
			],
			leafId: "e2",
			hasMore: false,
			nextCursor: null,
		});
		resetStore({ request });
		applyStoreEvent(
			event("session.snapshot", {
				snapshot: {
					sessionId: "s1",
					workspaceId: "/repo",
					snapshotVersion: 1,
					tree: [
						{ id: "e1", parentId: null, type: "message" },
						{ id: "e2", parentId: "e1", type: "message" },
					],
					leafId: "e2",
					entries: [
						{
							id: "e2",
							parentId: "e1",
							timestamp: "2025-10-10T10:00:01Z",
							type: "message",
							message: { role: "assistant", content: "newer" },
						},
					],
					entryWindow: { hasMore: true, nextCursor: "e2" },
					state: {
						isStreaming: false,
						isCompacting: false,
						isRetrying: false,
						autoCompaction: true,
						steeringMode: "all",
						followUpMode: "all",
						pendingMessages: 0,
						messageCount: 2,
					},
					queues: { steering: [], followUp: [] },
				},
			}),
		);

		expect(useConnectionStore.getState().olderHistory).toEqual({
			hasMore: true,
			cursor: "e2",
			loading: false,
		});

		await useConnectionStore.getState().loadOlderEntries();

		expect(request).toHaveBeenCalledWith("session.entries", {
			sessionId: "s1",
			before: "e2",
			limit: 100,
		});
		expect(useConnectionStore.getState().olderHistory).toMatchObject({
			hasMore: false,
			cursor: null,
			loading: false,
		});
	});

	it("records activity as typed events, not display strings", () => {
		applyStoreEvent(event("session.run.started", { sessionId: "s1" }));
		applyStoreEvent(
			event("session.queue.changed", { sessionId: "s1", steering: ["a"], followUp: ["b"] }),
		);
		applyStoreEvent(
			event("session.tool.started", { sessionId: "s1", toolCallId: "t1", toolName: "bash" }),
		);

		expect(useConnectionStore.getState().timeline).toMatchObject([
			{ kind: "run" },
			{ kind: "queue", count: 2 },
			{ kind: "tool", name: "bash" },
		]);
		expect(useConnectionStore.getState().timeline[0]).not.toHaveProperty("text");
	});

	it("navigates and forks through the session commands", async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce({ cancelled: false })
			.mockResolvedValueOnce({ sessionId: "s2", sessionFile: "/tmp/s2.jsonl" })
			.mockResolvedValue({});
		resetStore({ request });

		await useConnectionStore.getState().navigateToEntry("e1");
		expect(request).toHaveBeenNthCalledWith(1, "session.navigate", {
			sessionId: "s1",
			entryId: "e1",
		});

		const forked = await useConnectionStore.getState().forkAtEntry("e1");
		expect(forked).toBe("s2");
		expect(request).toHaveBeenNthCalledWith(2, "session.forkAt", {
			sessionId: "s1",
			entryId: "e1",
			position: "at",
		});
		expect(request.mock.calls.slice(2).map((call) => call[0])).toEqual([
			"session.detach",
			"session.attach",
		]);
		expect(useConnectionStore.getState().sessionId).toBe("s2");
	});

	it("detaches the previous session before attaching the next one", async () => {
		const request = vi.fn().mockResolvedValue({});
		resetStore({ request });

		await useConnectionStore.getState().switchSession("s2");

		expect(request.mock.calls.map((call) => call[0])).toEqual([
			"session.detach",
			"session.attach",
		]);
		expect(request).toHaveBeenNthCalledWith(1, "session.detach", { sessionId: "s1" });
		expect(useConnectionStore.getState().sessionId).toBe("s2");
	});
});
