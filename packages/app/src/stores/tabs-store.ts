// Tabs model, W1c: "tab target = data" (paseo workspace-tabs model port — see
// workspace-tabs/model.ts). A session IS a tab; files/changes are workspace-
// global singletons; the new_tab creator is sticky. Tab ids are deterministic
// (identity.ts), so opening an existing target reveals it instead of
// duplicating. Mobile panel state (mobile-panels port) and the explorer rail
// live here too — one layout store until the W1c-2 split-layout port splits
// persistence out per workspace.
import { create } from "zustand";

import {
	buildDeterministicWorkspaceTabId,
	normalizeWorkspaceTabTarget,
} from "@/workspace-tabs/identity";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import { DEFAULT_RAIL_WIDTH, clampRailWidth } from "@/components/layout/rail-resize-handle";

/** Right-rail content mode; null = rail hidden (desktop). */
export type ExplorerMode = "files" | "changes" | "resources" | "activity" | null;

/** Compact (mobile) panel targets — paseo mobile-panels semantics. */
export type MobilePanelView = "home" | "sessions" | "explorer";

export interface MobilePanelSelection {
	target: MobilePanelView;
	/** Bumped on every programmatic change; gestures race-check against it. */
	revision: number;
}

const NEW_TAB_ID = "new_tab";

interface TabsState {
	tabs: WorkspaceTab[];
	activeTabId: string;

	/** Open a target — reveals the existing tab when the identity matches. */
	openTab: (target: WorkspaceTabTarget) => string;
	/** Reorder (dnd/tab-menu surface); index bounds are clamped. */
	moveTab: (tabId: string, toIndex: number) => void;
	closeTab: (tabId: string) => void;
	setActive: (tabId: string) => void;
	/** The active tab's target (null only transiently). */
	activeTarget: () => WorkspaceTabTarget | null;

	// Convenience opens (openTab under the hood).
	openSession: (sessionId: string) => void;
	openNew: () => void;
	openFiles: () => void;
	openChanges: () => void;

	explorerMode: ExplorerMode;
	setExplorerMode: (mode: ExplorerMode) => void;
	toggleRail: () => void;
	/** Explorer rail width in px (resizable on desktop). */
	railWidth: number;
	setRailWidth: (px: number) => void;

	treeExpanded: Record<string, boolean>;
	toggleExpanded: (path: string) => void;

	mobilePanel: MobilePanelSelection;
	showMobileHome: () => void;
	showMobileSessions: () => void;
	showMobileExplorer: (mode?: Exclude<ExplorerMode, null>) => void;
	toggleMobileExplorer: (mode?: Exclude<ExplorerMode, null>) => void;
}

/** Only a target change bumps the revision (paseo setMobilePanelTarget). */
function setMobilePanelTarget(
	selection: MobilePanelSelection,
	target: MobilePanelView,
): MobilePanelSelection {
	if (selection.target === target) return selection;
	return { target, revision: selection.revision + 1 };
}

const initialTabs: WorkspaceTab[] = [
	{ tabId: NEW_TAB_ID, target: { kind: "new_tab" }, createdAt: 0 },
];

export const useTabsStore = create<TabsState>((set, get) => ({
	tabs: initialTabs,
	activeTabId: NEW_TAB_ID,

	openTab: (target) => {
		const normalized = normalizeWorkspaceTabTarget(target);
		if (!normalized) return "";
		if (normalized.kind === "new_tab") {
			const exists = get().tabs.some((t) => t.tabId === NEW_TAB_ID);
			set((s) => ({
				tabs: exists ? s.tabs : [...s.tabs, { tabId: NEW_TAB_ID, target: normalized, createdAt: Date.now() }],
				activeTabId: NEW_TAB_ID,
			}));
			return NEW_TAB_ID;
		}
		const tabId = buildDeterministicWorkspaceTabId(normalized);
		set((s) => {
			const existing = s.tabs.some((t) => t.tabId === tabId);
			return {
				tabs: existing
					? s.tabs
					: [...s.tabs, { tabId, target: normalized, createdAt: Date.now() }],
				activeTabId: tabId,
			};
		});
		return tabId;
	},

	moveTab: (tabId, toIndex) => {
		set((s) => {
			const from = s.tabs.findIndex((t) => t.tabId === tabId);
			if (from === -1) return s;
			const next = s.tabs.slice();
			const [moved] = next.splice(from, 1);
			const clamped = Math.max(0, Math.min(next.length, toIndex));
			next.splice(clamped, 0, moved);
			return { ...s, tabs: next };
		});
	},

	closeTab: (tabId) => {
		if (tabId === NEW_TAB_ID) return; // the creator tab never closes
		set((s) => {
			const idx = s.tabs.findIndex((t) => t.tabId === tabId);
			if (idx === -1) return s;
			const next = s.tabs.filter((t) => t.tabId !== tabId);
			const activeTabId =
				s.activeTabId === tabId
					? (next[Math.min(idx, next.length - 1)]?.tabId ?? NEW_TAB_ID)
					: s.activeTabId;
			return { ...s, tabs: next, activeTabId };
		});
	},

	setActive: (tabId) => {
		if (get().activeTabId === tabId) return;
		set((s) => ({ activeTabId: s.tabs.some((t) => t.tabId === tabId) ? tabId : s.activeTabId }));
	},

	activeTarget: () => {
		const { tabs, activeTabId } = get();
		return tabs.find((t) => t.tabId === activeTabId)?.target ?? null;
	},

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

	setExplorerMode: (mode) => set({ explorerMode: mode }),

	toggleRail: () => {
		const mode = get().explorerMode;
		set({ explorerMode: mode == null ? "files" : null });
	},

	railWidth: DEFAULT_RAIL_WIDTH,

	setRailWidth: (px) => set({ railWidth: clampRailWidth(px) }),

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
}));
