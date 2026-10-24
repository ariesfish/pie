import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyStoreEvent, useConnectionStore } from "./connection-store";
import { useSessionListStore } from "./session-list-store";

function resetStore(conn: unknown = null): void {
	useConnectionStore.setState({
		conn: conn as never,
		sessionId: "s1",
		revision: 0,
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
