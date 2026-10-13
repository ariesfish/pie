// Layout record sanitization (W1c-3): the persistence boundary. Records
// carry the split tree (v2); flat records written by W1c-2 migrate into a
// single-pane tree on read. Everything passes sanitizeLayoutRecord first.
import { describe, expect, it } from "vitest";

import { sanitizeLayoutRecord } from "../src/stores/workspace-layout-record";
import { findPaneById, collectAllTabs } from "../src/stores/workspace-layout-actions";

describe("sanitizeLayoutRecord (v2, tree)", () => {
	it("falls back to the default layout for garbage input", () => {
		const record = sanitizeLayoutRecord(null);
		expect(record.layout.focusedPaneId).toBeTruthy();
		expect(record.explorerMode).toBeNull();
		expect(record.railWidth).toBe(264);
		const panes = (function collect(node: unknown): unknown[] {
			const n = node as { kind: string; pane?: unknown; group?: { children: unknown[] } };
			if (n?.kind === "pane") return [n.pane];
			return (n?.group?.children ?? []).flatMap(collect);
		})(record.layout.root);
		expect(panes.length).toBeGreaterThan(0);
		expect(collectAllTabs(record.layout.root).some((t) => t.target.kind === "new_tab")).toBe(
			true,
		);
	});

	it("migrates v1 flat records into a single-pane tree", () => {
		const record = sanitizeLayoutRecord({
			tabs: [
				{ tabId: "session_01a1", target: { kind: "session", sessionId: "01a1" }, createdAt: 5 },
				{ tabId: "files", target: { kind: "files" }, createdAt: 6 },
			],
			activeTabId: "files",
			explorerMode: "changes",
			railWidth: 300,
		});

		const tabs = collectAllTabs(record.layout.root);
		expect(tabs.map((t) => t.tabId).sort()).toEqual(["files", "session_01a1"]);
		// v1 active tab carries into the pane focus.
		expect(record.layout.focusedPaneId).toBeTruthy();
		const pane = findPaneById(record.layout.root, record.layout.focusedPaneId);
		expect(pane?.focusedTabId).toBe("files");
		expect(record.explorerMode).toBe("changes");
		expect(record.railWidth).toBe(300);
	});

	it("keeps a valid split tree and sanitizes rail fields", () => {
		const record = sanitizeLayoutRecord({
			layout: {
				root: {
					kind: "group",
					group: {
						id: "g1",
						direction: "horizontal",
						sizes: [0.5, 0.5],
						children: [
							{
								kind: "pane",
								pane: {
									id: "p1",
									tabIds: ["session_x"],
									focusedTabId: "session_x",
									tabs: [{ tabId: "session_x", target: { kind: "session", sessionId: "x" } }],
								},
							},
							{
								kind: "pane",
								pane: {
									id: "p2",
									tabIds: ["changes"],
									focusedTabId: "changes",
									tabs: [{ tabId: "changes", target: { kind: "changes" } }],
								},
							},
						],
					},
				},
				focusedPaneId: "p1",
			},
			railWidth: 9000,
		});

		expect(record.railWidth).toBe(520);
		expect(findPaneById(record.layout.root, "p1")).not.toBeNull();
		expect(findPaneById(record.layout.root, "p2")).not.toBeNull();
		expect(record.layout.focusedPaneId).toBe("p1");
	});

	it("drops tree nodes with unknown kinds and unknown targets", () => {
		const record = sanitizeLayoutRecord({
			layout: {
				root: {
					kind: "group",
					group: {
						id: "g1",
						direction: "diagonal",
						children: [
							{ kind: "pane", pane: { id: "p1", tabIds: [], focusedTabId: null, tabs: [] } },
							{ kind: "warp", warp: {} },
							{
								kind: "pane",
								pane: {
									id: "p2",
									tabIds: ["t"],
									focusedTabId: "t",
									tabs: [{ tabId: "t", target: { kind: "terminal", terminalId: "x" } }],
								},
							},
						],
					},
				},
				focusedPaneId: "p2",
			},
		});
		// diagonal direction rejects the group; the whole layout falls back.
		expect(findPaneById(record.layout.root, "p1")).toBeNull();
	});
});
