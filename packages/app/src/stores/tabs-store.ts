// Tabs store, W1c-3: backed by the split-tree layout (workspace-layout-actions
// port). The tree is the source of truth; the flat `tabs`/`activeTabId`
// projections exist so existing selectors keep working. Public surface keeps
// the W1c-1 convenience opens and adds pane operations (split/move/close).
import { create } from "zustand";

import {
	buildDeterministicWorkspaceTabId,
	normalizeWorkspaceTabTarget,
} from "@/workspace-tabs/identity";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
	DEFAULT_PANE_ID,
	type WorkspaceLayout,
	canDismissPaneInLayout,
	closePaneInLayout,
	closeTabInLayout,
	collectAllTabs,
	createNewWorkspaceTab,
	createTabInLayout,
	findPaneById,
	focusPaneInLayout,
	focusTabInLayout,
	findPaneContainingTab,
	moveTabToPaneInLayout,
	openTabInLayoutFocused,
	reorderPaneTabsInLayout,
	resizeSplitInLayout,
	restoreWorkspaceLayout,
	splitPaneInLayout,
} from "./workspace-layout-actions";
import {
	DEFAULT_RAIL_WIDTH,
	clampRailWidth,
	readLayoutRecord,
	writeLayoutRecord,
} from "./workspace-layout-record";

/** Right-rail content mode; null = rail hidden (desktop). */
export type ExplorerMode = "files" | "changes" | "resources" | "usage" | "activity" | null;

/** Compact (mobile) panel targets — paseo mobile-panels semantics. */
export type MobilePanelView = "home" | "sessions" | "explorer";

export interface MobilePanelSelection {
	target: MobilePanelView;
	/** Bumped on every programmatic change; gestures race-check against it. */
	revision: number;
}

const MAX_TREE_DEPTH = 5;

interface TabsState {
	/** The split-tree layout — source of truth (paseo workspace layout). */
	layout: WorkspaceLayout;
	/** Projections so W1c-1 selectors keep working. */
	tabs: WorkspaceTab[];
	activeTabId: string | null;

	openTab: (target: WorkspaceTabTarget) => string;
	moveTab: (tabId: string, toIndex: number) => void;
	/** Reorder tabs within a pane by explicit id order (dnd drop end). */
	reorderPaneTabs: (paneId: string, tabIds: string[]) => void;
	closeTab: (tabId: string) => void;
	setActive: (tabId: string) => void;
	activeTarget: () => WorkspaceTabTarget | null;
	/** [W3e] Cycle focus within the focused pane's tab strip (command palette). */
	focusTabRelative: (delta: 1 | -1) => void;
	/** [W3e] Close sibling tabs of the active tab in its pane (command palette). */
	closeSiblingTabs: (which: "others" | "left" | "right") => void;

	// Pane operations (W1c-3).
	focusPane: (paneId: string) => void;
	splitPaneWithTab: (tabId: string, position: "left" | "right" | "top" | "bottom") => void;
	moveTabToPane: (tabId: string, toPaneId: string) => void;
	closePane: (paneId: string) => void;
	resizeSplit: (groupId: string, sizes: number[]) => void;
	canClosePane: (paneId: string) => boolean;

	// Convenience opens (openTab under the hood).
	openSession: (sessionId: string) => void;
	openNew: () => void;
	openFiles: () => void;
	openChanges: () => void;

	explorerMode: ExplorerMode;
	/** Desktop left sidebar (workspaces + sessions tree) visibility. */
	sidebarVisible: boolean;
	setExplorerMode: (mode: ExplorerMode) => void;
	toggleRail: () => void;
	toggleSidebar: () => void;
	railWidth: number;
	setRailWidth: (px: number) => void;

	treeExpanded: Record<string, boolean>;
	toggleExpanded: (path: string) => void;

	mobilePanel: MobilePanelSelection;
	showMobileHome: () => void;
	showMobileSessions: () => void;
	showMobileExplorer: (mode?: Exclude<ExplorerMode, null>) => void;
	toggleMobileExplorer: (mode?: Exclude<ExplorerMode, null>) => void;

	workspaceKey: string | null;
	hydrate: (workspaceKey: string) => void;
}

/** Only a target change bumps the revision (paseo setMobilePanelTarget). */
function setMobilePanelTarget(
	selection: MobilePanelSelection,
	target: MobilePanelView,
): MobilePanelSelection {
	if (selection.target === target) return selection;
	return { target, revision: selection.revision + 1 };
}

function projectLayout(layout: WorkspaceLayout): Pick<TabsState, "layout" | "tabs" | "activeTabId"> {
	const tabs = collectAllTabs(layout.root);
	const focusedPane = findPaneById(layout.root, layout.focusedPaneId);
	const activeTabId = focusedPane?.focusedTabId ?? null;
	return { layout, tabs, activeTabId };
}


function persistLayout(get: () => TabsState): void {
	const { workspaceKey, layout, explorerMode, railWidth, sidebarVisible } = get();
	if (!workspaceKey) return;
	writeLayoutRecord(workspaceKey, { layout, explorerMode, railWidth, sidebarVisible });
}

/** Module-init layout: a sole-pane creator workspace, with the tabs/
 * activeTabId projections pre-computed — the projection must never desync
 * from the initial layout or a fresh mount renders an empty strip and panel
 * until the first openTab (caught by the walkthrough). */
const initialLayout = restoreWorkspaceLayout({
	root: { kind: "pane", pane: { id: DEFAULT_PANE_ID, tabIds: [], focusedTabId: null } },
	focusedPaneId: DEFAULT_PANE_ID,
});

export const useTabsStore = create<TabsState>((set, get) => {
	const applyLayout = (next: WorkspaceLayout | null, persist = true): void => {
		if (!next) return;
		set(projectLayout(next));
		if (persist) persistLayout(get);
	};

	return {
		...projectLayout(initialLayout),
		workspaceKey: null,

		hydrate: (workspaceKey) => {
			if (get().workspaceKey === workspaceKey) return;
			const record = readLayoutRecord(workspaceKey);
			set({
				...projectLayout(restoreWorkspaceLayout(record.layout)),
				explorerMode: record.explorerMode,
				sidebarVisible: record.sidebarVisible ?? true,
				railWidth: record.railWidth,
				workspaceKey,
			});
		},

		openTab: (target) => {
			const normalized = normalizeWorkspaceTabTarget(target);
			if (!normalized) return "";
			const { layout } = get();
			if (normalized.kind === "new_tab") {
				const focusedPane =
					findPaneById(layout.root, layout.focusedPaneId) ?? null;
				const creatorTab =
					focusedPane?.tabIds.find((tabId) => {
						const tab = get().tabs.find((t) => t.tabId === tabId);
						return tab?.target.kind === "new_tab";
					}) ?? null;
				if (creatorTab) {
					applyLayout(focusTabInLayout({ layout, tabId: creatorTab }) ?? layout);
					return creatorTab;
				}
				const next = allocateCreatorInFocusedPane(layout, Date.now());
				applyLayout(next);
				return "";
			}
			const result = openTabInLayoutFocused({
				layout,
				target: normalized,
				now: Date.now(),
				placement: { mode: "focused" },
			});
			if (!result) return "";
			applyLayout(result.layout);
			return result.tabId;
		},

		moveTab: (tabId, toIndex) => {
			const { layout } = get();
			const pane = findPaneContainingTab(layout.root, tabId);
			if (!pane) return;
			const tabIds = pane.tabIds.slice();
			const from = tabIds.indexOf(tabId);
			if (from === -1) return;
			tabIds.splice(from, 1);
			const clamped = Math.max(0, Math.min(tabIds.length, toIndex));
			tabIds.splice(clamped, 0, tabId);
			applyLayout(reorderPaneTabsInLayout({ layout, paneId: pane.id, tabIds }));
		},

		reorderPaneTabs: (paneId, tabIds) => {
			applyLayout(reorderPaneTabsInLayout({ layout: get().layout, paneId, tabIds }));
		},

		closeTab: (tabId) => {
			applyLayout(closeTabInLayout({ layout: get().layout, tabId }));
		},

		setActive: (tabId) => {
			applyLayout(focusTabInLayout({ layout: get().layout, tabId }));
		},

		focusTabRelative: (delta) => {
			const { layout } = get();
			const pane = findPaneById(layout.root, layout.focusedPaneId);
			if (!pane || pane.tabIds.length === 0) return;
			const current = pane.tabIds.indexOf(pane.focusedTabId ?? "");
			const index = current < 0 ? 0 : current;
			const next = (index + delta + pane.tabIds.length) % pane.tabIds.length;
			const tabId = pane.tabIds[next];
			if (tabId) applyLayout(focusTabInLayout({ layout, tabId }));
		},

		closeSiblingTabs: (which) => {
			const { layout } = get();
			const pane = findPaneById(layout.root, layout.focusedPaneId);
			const keep = pane?.focusedTabId ?? null;
			if (!pane || !keep) return;
			const index = pane.tabIds.indexOf(keep);
			if (index < 0) return;
			const closeIds =
				which === "others"
					? pane.tabIds.filter((id) => id !== keep)
					: which === "left"
						? pane.tabIds.slice(0, index)
						: pane.tabIds.slice(index + 1);
			let next = layout;
			for (const id of closeIds) {
				next = closeTabInLayout({ layout: next, tabId: id }) ?? next;
			}
			applyLayout(next);
		},

		activeTarget: () => {
			const { tabs, activeTabId } = get();
			return tabs.find((t) => t.tabId === activeTabId)?.target ?? null;
		},

		focusPane: (paneId) => {
			applyLayout(focusPaneInLayout({ layout: get().layout, paneId }));
		},

		splitPaneWithTab: (tabId, position) => {
			const { layout } = get();
			const sourcePane = findPaneContainingTab(layout.root, tabId);
			const targetPaneId = sourcePane?.id ?? layout.focusedPaneId ?? DEFAULT_PANE_ID;
			const result = splitPaneInLayout({
				layout,
				tabId,
				targetPaneId,
				position,
				createNodeId: (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
				maxTreeDepth: MAX_TREE_DEPTH,
			});
			applyLayout(result?.layout ?? null);
		},

		moveTabToPane: (tabId, toPaneId) => {
			applyLayout(moveTabToPaneInLayout({ layout: get().layout, tabId, toPaneId }));
		},

		closePane: (paneId) => {
			applyLayout(closePaneInLayout({ layout: get().layout, paneId }));
		},

		resizeSplit: (groupId, sizes) => {
			applyLayout(resizeSplitInLayout({ layout: get().layout, groupId, sizes }));
		},

		canClosePane: (paneId) => canDismissPaneInLayout(get().layout, paneId),

		openSession: (sessionId) => {
			get().openTab({ kind: "session", sessionId });
		},

		openNew: () => {
			get().openTab({ kind: "new_tab" });
		},

		openFiles: () => {
			get().openTab({ kind: "files" });
		},

		openChanges: () => {
			get().openTab({ kind: "changes" });
		},

		explorerMode: null,
		sidebarVisible: true,

		toggleSidebar: () => {
			set((s) => ({ sidebarVisible: !s.sidebarVisible }));
			persistLayout(get);
		},

		setExplorerMode: (mode) => {
			set({ explorerMode: mode });
			persistLayout(get);
		},

		toggleRail: () => {
			const mode = get().explorerMode;
			set({ explorerMode: mode == null ? "files" : null });
			persistLayout(get);
		},

		railWidth: DEFAULT_RAIL_WIDTH,

		setRailWidth: (px) => {
			set({ railWidth: clampRailWidth(px) });
			persistLayout(get);
		},

		treeExpanded: {},

		toggleExpanded: (path) =>
			set((s) => ({ treeExpanded: { ...s.treeExpanded, [path]: !s.treeExpanded[path] } })),

		mobilePanel: { target: "home", revision: 0 },

		showMobileHome: () =>
			set((s) => ({ mobilePanel: setMobilePanelTarget(s.mobilePanel, "home") })),

		showMobileSessions: () =>
			set((s) => ({ mobilePanel: setMobilePanelTarget(s.mobilePanel, "sessions") })),

		showMobileExplorer: (mode) => {
			set((s) => ({
				mobilePanel: setMobilePanelTarget(s.mobilePanel, "explorer"),
				...(mode ? { explorerMode: mode } : {}),
			}));
		},

		toggleMobileExplorer: (mode) =>
			set((s) =>
				s.mobilePanel.target === "explorer"
					? { mobilePanel: setMobilePanelTarget(s.mobilePanel, "home") }
					: {
							mobilePanel: setMobilePanelTarget(s.mobilePanel, "explorer"),
							...(mode ? { explorerMode: mode } : {}),
						},
			),
	};
});

/** The focused pane's creator entry — allocates an independent creator tab
 * when the focused pane has none (upstream create-tab pathway). */
function allocateCreatorInFocusedPane(layout: WorkspaceLayout, now: number): WorkspaceLayout {
	const paneId = layout.focusedPaneId ?? DEFAULT_PANE_ID;
	const pane = findPaneById(layout.root, paneId);
	if (!pane) return layout;
	const hasCreator = collectAllTabs(layout.root).some(
		(tab) => tab.target.kind === "new_tab" && pane.tabIds.includes(tab.tabId),
	);
	if (hasCreator) return layout;
	const result = createTabInLayout({
		layout,
		target: { kind: "new_tab" },
		now,
		placement: { mode: "pane", paneId },
		createTabId: () => `tab_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
	});
	return result?.layout ?? layout;
}
