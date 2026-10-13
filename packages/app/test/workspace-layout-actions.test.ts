// Split-tree layout operations (W1c-3) — ported semantics of paseo's
// workspace-layout-actions: split creation/insertion, dedup-reveal on open,
// close cascades (successor focus, sibling fallback, empty-pane teardown) and
// the placement rules that keep tabs where the user put them.
import { describe, expect, it } from "vitest";

import {
	DEFAULT_PANE_ID,
	canDismissPaneInLayout,
	closePaneInLayout,
	closeTabInLayout,
	collectAllPanes,
	collectAllTabs,
	createNewWorkspaceTab,
	createDefaultLayout,
	findPaneById,
	findPaneContainingTab,
	focusTabInLayout,
	moveTabToPaneInLayout,
	openTabInLayoutFocused,
	resizeSplitInLayout,
	splitPaneInLayout,
	clampNormalizedSizes,
} from "../src/stores/workspace-layout-actions";

let nodeCounter = 0;
const createNodeId = (prefix: string) => `t_${prefix}_${(nodeCounter += 1)}`;

function openSession(layout: ReturnType<typeof createDefaultLayout>, sessionId: string) {
	const result = openTabInLayoutFocused({
		layout,
		target: { kind: "session", sessionId },
		now: 1,
		placement: { mode: "focused" },
	});
	if (!result) throw new Error(`open failed: ${sessionId}`);
	return result;
}

describe("default layout", () => {
	it("starts with a single pane holding a creator tab", () => {
		const layout = createDefaultLayout();
		expect(collectAllPanes(layout.root)).toHaveLength(1);
		const tabs = collectAllTabs(layout.root);
		expect(tabs).toHaveLength(1);
		expect(tabs[0]?.target.kind).toBe("new_tab");
		expect(layout.focusedPaneId).toBe(DEFAULT_PANE_ID);
	});
});

describe("open / reveal semantics", () => {
	it("opening an existing target reveals it instead of duplicating", () => {
		let { layout } = openSession(createDefaultLayout(), "s1");
		const result = openSession(layout, "s1");
		expect(result.tabId).toBe("session_s1");
		expect(collectAllTabs(result.layout.root).filter((t) => t.tabId === "session_s1")).toHaveLength(1);
		layout = result.layout;
	});

	it("opening a session replaces the sole creator tab (paseo rule)", () => {
		const result = openSession(createDefaultLayout(), "s1");
		const kinds = collectAllTabs(result.layout.root).map((t) => t.target.kind);
		expect(kinds).toEqual(["session"]);
	});
});

describe("split panes", () => {
	it("splits a pane and moves the tab into the new pane", () => {
		const opened = openSession(createDefaultLayout(), "s1");
		const split = splitPaneInLayout({
			layout: opened.layout,
			tabId: "session_s1",
			targetPaneId: DEFAULT_PANE_ID,
			position: "right",
			createNodeId,
			maxTreeDepth: 5,
		});
		expect(split).not.toBeNull();
		const panes = collectAllPanes(split!.layout.root);
		expect(panes).toHaveLength(2);
		expect(split!.layout.focusedPaneId).toBe(split!.paneId);
		expect(findPaneContainingTab(split!.layout.root, "session_s1")?.id).toBe(split!.paneId);
		// The source pane regains a creator tab rather than going empty.
		const source = findPaneById(split!.layout.root, DEFAULT_PANE_ID);
		expect(source?.tabIds.length).toBe(1);
		expect(collectAllTabs(split!.layout.root).find((t) => t.tabId === source?.tabIds[0])?.target.kind).toBe("new_tab");
	});

	it("same-direction splits insert siblings without deepening the tree (paseo rule)", () => {
		const opened = openSession(createDefaultLayout(), "s1");
		let layout = opened.layout;
		for (let i = 0; i < 3; i += 1) {
			const split = splitPaneInLayout({
				layout,
				tabId: "session_s1",
				targetPaneId: layout.focusedPaneId ?? DEFAULT_PANE_ID,
				position: "right",
				createNodeId,
				maxTreeDepth: 3,
			});
			expect(split).not.toBeNull();
			if (split) layout = split.layout;
		}
		expect(collectAllPanes(layout.root)).toHaveLength(4);
	});

	it("refuses splits beyond the max tree depth (alternating directions)", () => {
		let layout = openSession(createDefaultLayout(), "s1").layout;
		const positions: Array<"right" | "bottom"> = ["right", "bottom"];
		let last: ReturnType<typeof splitPaneInLayout> = null;
		for (const position of positions) {
			last = splitPaneInLayout({
				layout,
				tabId: "session_s1",
				targetPaneId: layout.focusedPaneId ?? DEFAULT_PANE_ID,
				position,
				createNodeId,
				maxTreeDepth: 2,
			});
			if (last) layout = last.layout;
		}
		// right (depth 2 — allowed) → bottom (depth 3 — refused at cap 2).
		expect(last).toBeNull();
	});
});

describe("close cascades", () => {
	it("closing the focused tab focuses its neighbor", () => {
		let layout = openSession(createDefaultLayout(), "s1").layout;
		layout = openSession(layout, "s2").layout;
		const pane = findPaneContainingTab(layout.root, "session_s1");
		expect(pane?.focusedTabId).toBe("session_s2");
		const next = closeTabInLayout({ layout, tabId: "session_s2" });
		expect(next).not.toBeNull();
		const paneAfter = findPaneContainingTab(next!.root, "session_s1");
		expect(paneAfter?.focusedTabId).toBe("session_s1");
	});

	it("closing the last real tab of a split keeps the workspace on the remaining pane", () => {
		const opened = openSession(createDefaultLayout(), "s1");
		const split = splitPaneInLayout({
			layout: opened.layout,
			tabId: "session_s1",
			targetPaneId: DEFAULT_PANE_ID,
			position: "right",
			createNodeId,
			maxTreeDepth: 5,
		})!;
		expect(canDismissPaneInLayout(split.layout, split.paneId)).toBe(true);
		const closed = closePaneInLayout({ layout: split.layout, paneId: split.paneId });
		expect(closed).not.toBeNull();
		expect(collectAllPanes(closed!.root).map((p) => p.id)).toEqual([DEFAULT_PANE_ID]);
	});

	it("the last visible pane can never be dismissed", () => {
		const layout = createDefaultLayout();
		expect(canDismissPaneInLayout(layout, DEFAULT_PANE_ID)).toBe(false);
		expect(closePaneInLayout({ layout, paneId: DEFAULT_PANE_ID })).toBeNull();
	});
});

describe("pane focus & move", () => {
	it("focusing a tab in another pane moves the workspace focus there", () => {
		const opened = openSession(createDefaultLayout(), "s1");
		const split = splitPaneInLayout({
			layout: opened.layout,
			tabId: "session_s1",
			targetPaneId: DEFAULT_PANE_ID,
			position: "right",
			createNodeId,
			maxTreeDepth: 5,
		});
		if (!split) throw new Error("split failed");
		// Place a second session into the creator-only main pane explicitly
		// (pane placement), then move it across panes.
		const second = openTabInLayoutFocused({
			layout: split.layout,
			target: { kind: "session", sessionId: "s2" },
			now: 2,
			placement: { mode: "pane", paneId: DEFAULT_PANE_ID },
		});
		if (!second) throw new Error("open s2 failed");
		expect(findPaneContainingTab(second.layout.root, "session_s2")?.id).toBe(DEFAULT_PANE_ID);

		const moved = moveTabToPaneInLayout({
			layout: second.layout,
			tabId: "session_s2",
			toPaneId: split.paneId,
		});
		if (!moved) throw new Error("move failed");
		expect(findPaneContainingTab(moved.root, "session_s2")?.id).toBe(split.paneId);
		expect(moved.focusedPaneId).toBe(split.paneId);
		const pane = findPaneById(moved.root, split.paneId);
		expect(pane?.focusedTabId).toBe("session_s2");
	});

	it("moving a sole creator tab hands the pane over (close cascade)", () => {
		const layout = createDefaultLayout();
		const split = splitPaneInLayout({
			layout,
			tabId: layout.root.kind === "pane" ? layout.root.pane.tabIds[0]! : "",
			targetPaneId: DEFAULT_PANE_ID,
			position: "right",
			createNodeId,
			maxTreeDepth: 5,
		})!;
		// main now holds the only creator tab; split pane holds the original one.
		const creatorPane = findPaneById(split.layout.root, DEFAULT_PANE_ID);
		const creatorTabId = creatorPane?.tabIds[0];
		expect(creatorTabId).toBeTruthy();
		const moved = moveTabToPaneInLayout({
			layout: split.layout,
			tabId: creatorTabId!,
			toPaneId: split.paneId,
		});
		// The emptied pane resolves by removal, not by an empty shell.
		expect(moved).not.toBeNull();
		expect(findPaneById(moved!.root, DEFAULT_PANE_ID)).toBeNull();
	});
});

describe("resize", () => {
	it("clamps sizes: no child below the minimum share", () => {
		expect(clampNormalizedSizes([0.99, 0.01])).toEqual([0.9, 0.1]);
		expect(clampNormalizedSizes([1])).toEqual([1]);
	});

	it("resizeSplitInLayout applies clamped sizes to the group", () => {
		const opened = openSession(createDefaultLayout(), "s1");
		const split = splitPaneInLayout({
			layout: opened.layout,
			tabId: "session_s1",
			targetPaneId: DEFAULT_PANE_ID,
			position: "right",
			createNodeId,
			maxTreeDepth: 5,
		})!;
		const groupId = split.layout.root.kind === "group" ? split.layout.root.group.id : null;
		expect(groupId).toBeTruthy();
		const resized = resizeSplitInLayout({ layout: split.layout, groupId: groupId!, sizes: [0.95, 0.05] });
		const group = resized.root.kind === "group" ? resized.root.group : null;
		expect(group?.sizes[0]).toBeCloseTo(0.9, 5);
		expect(group?.sizes[1]).toBeCloseTo(0.1, 5);
	});
});

describe("createNewWorkspaceTab", () => {
	it("allocates independent creator identities", () => {
		const a = createNewWorkspaceTab();
		const b = createNewWorkspaceTab();
		expect(a.tabId).not.toBe(b.tabId);
		expect(a.target.kind).toBe("new_tab");
	});
});
