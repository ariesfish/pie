// Layout record sanitization (W1c-2): the persistence boundary. Everything
// that goes through localStorage passes sanitizeLayoutRecord first — invalid
// or unknown targets drop, deterministic tab ids re-derive (so legacy records
// with stale ids still hydrate), and the sticky creator tab is always present.
import { describe, expect, it } from "vitest";

import { sanitizeLayoutRecord } from "../src/stores/workspace-layout-record";

describe("sanitizeLayoutRecord", () => {
	it("falls back to the defaults for garbage input", () => {
		expect(sanitizeLayoutRecord(null)).toEqual({
			tabs: expect.arrayContaining([
				expect.objectContaining({ tabId: "new_tab", target: { kind: "new_tab" } }),
			]),
			activeTabId: "new_tab",
			explorerMode: null,
			railWidth: 264,
		});
		expect(sanitizeLayoutRecord("nonsense" as never).activeTabId).toBe("new_tab");
	});

	it("keeps valid tabs and re-derives their deterministic ids", () => {
		const record = sanitizeLayoutRecord({
			tabs: [
				{ tabId: "stale-id", target: { kind: "session", sessionId: "01a1" }, createdAt: 5 },
				{ tabId: "files", target: { kind: "files" }, createdAt: 6 },
			],
			activeTabId: "stale-id",
			explorerMode: "changes",
			railWidth: 300,
		});

		expect(record.tabs.map((t) => t.tabId)).toEqual(["session_01a1", "files", "new_tab"]);
		// A stale active-tab id cannot be trusted after re-derivation — falls
		// back to the creator tab.
		expect(record.activeTabId).toBe("new_tab");
		expect(record.explorerMode).toBe("changes");
		expect(record.railWidth).toBe(300);
	});

	it("restores the active tab when its id matches a live tab", () => {
		const record = sanitizeLayoutRecord({
			tabs: [{ tabId: "anything", target: { kind: "session", sessionId: "01a1" } }],
			activeTabId: "session_01a1",
		});
		expect(record.activeTabId).toBe("session_01a1");
	});

	it("drops invalid and duplicate targets", () => {
		const record = sanitizeLayoutRecord({
			tabs: [
				{ tabId: "x", target: { kind: "session", sessionId: "  " }, createdAt: 1 },
				{ tabId: "x", target: { kind: "terminal", terminalId: "t" }, createdAt: 1 },
				{ tabId: "a", target: { kind: "session", sessionId: "01a1" }, createdAt: 1 },
				{ tabId: "b", target: { kind: "session", sessionId: "01a1" }, createdAt: 2 },
			],
			activeTabId: "x",
		});

		expect(record.tabs.map((t) => t.tabId)).toEqual(["session_01a1", "new_tab"]);
		expect(record.activeTabId).toBe("new_tab");
	});

	it("ensures exactly one sticky creator tab at the end", () => {
		const record = sanitizeLayoutRecord({
			tabs: [
				{ tabId: "new_tab", target: { kind: "new_tab" }, createdAt: 3 },
				{ tabId: "new_tab2", target: { kind: "new_tab" }, createdAt: 4 },
			],
			activeTabId: "new_tab2",
		});

		const creators = record.tabs.filter((t) => t.target.kind === "new_tab");
		expect(creators).toHaveLength(1);
		expect(record.tabs[record.tabs.length - 1]?.tabId).toBe("new_tab");
		// The persisted creator-tab activation falls back to the canonical id.
		expect(record.activeTabId).toBe("new_tab");
	});

	it("clamps the rail width and rejects unknown explorer modes", () => {
		expect(sanitizeLayoutRecord({ railWidth: 50 }).railWidth).toBe(200);
		expect(sanitizeLayoutRecord({ railWidth: 9000 }).railWidth).toBe(520);
		expect(
			sanitizeLayoutRecord({ explorerMode: "terminal" as never }).explorerMode,
		).toBeNull();
	});
});
