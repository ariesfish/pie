// Tabs model, Wave 1 + wiring fix: a session IS a tab (paseo's core mental
// model); files/changes are shared workspace tabs (paseo's "tab target is
// data" — exactly one files tab and one changes tab, reused on every open,
// because their state lives in the workspace store, not the tab).
import { create } from "zustand";

export type TabKind = "session" | "new" | "files" | "changes";

export interface Tab {
	id: string;
	kind: TabKind;
	/** Session id for session tabs (tab id derives from it). */
	sessionId?: string;
}

/** Right-rail content mode; null = rail hidden (desktop). */
export type ExplorerMode = "files" | "changes" | "resources" | "activity" | null;

const FILES_TAB_ID = "tab-files";
const CHANGES_TAB_ID = "tab-changes";

interface TabsState {
	tabs: Tab[];
	activeTabId: string;
	explorerMode: ExplorerMode;
	/** Expanded directory paths in the file tree (workspace-relative). */
	treeExpanded: Record<string, boolean>;

	openSession: (sessionId: string) => void;
	openNew: () => void;
	/** Open (or activate) the shared files tab and reveal a file in it. */
	openFiles: () => void;
	/** Open (or activate) the shared changes tab. */
	openChanges: () => void;
	closeTab: (id: string) => void;
	setActive: (id: string) => void;
	setExplorerMode: (mode: ExplorerMode) => void;
	toggleRail: () => void;
	rightRailOpen: boolean;
	setRightRailOpen: (open: boolean) => void;
	toggleExpanded: (path: string) => void;
}

const tabIdOf = (sessionId: string) => `tab-s:${sessionId}`;

export const useTabsStore = create<TabsState>((set, get) => ({
	tabs: [{ id: "tab-new", kind: "new" }],
	activeTabId: "tab-new",
	explorerMode: null,
	treeExpanded: {},
	rightRailOpen: false,

	openSession: (sessionId) => {
		const id = tabIdOf(sessionId);
		const { tabs } = get();
		if (!tabs.some((t) => t.id === id)) {
			set({ tabs: [...tabs, { id, kind: "session", sessionId }], activeTabId: id });
		} else {
			set({ activeTabId: id });
		}
	},

	openNew: () => set({ activeTabId: "tab-new" }),

	openFiles: () => {
		const { tabs } = get();
		if (!tabs.some((t) => t.id === FILES_TAB_ID)) {
			set({ tabs: [...tabs, { id: FILES_TAB_ID, kind: "files" }], activeTabId: FILES_TAB_ID });
		} else {
			set({ activeTabId: FILES_TAB_ID });
		}
	},

	openChanges: () => {
		const { tabs } = get();
		if (!tabs.some((t) => t.id === CHANGES_TAB_ID)) {
			set({ tabs: [...tabs, { id: CHANGES_TAB_ID, kind: "changes" }], activeTabId: CHANGES_TAB_ID });
		} else {
			set({ activeTabId: CHANGES_TAB_ID });
		}
	},

	closeTab: (id) => {
		const { tabs, activeTabId } = get();
		if (id === "tab-new") return; // the new-session tab never closes
		const idx = tabs.findIndex((t) => t.id === id);
		if (idx === -1) return;
		const next = tabs.filter((t) => t.id !== id);
		const nextActive =
			activeTabId === id ? (next[Math.min(idx, next.length - 1)]?.id ?? "tab-new") : activeTabId;
		set({ tabs: next, activeTabId: nextActive });
	},

	setActive: (id) => set({ activeTabId: id }),

	setExplorerMode: (mode) => set({ explorerMode: mode }),

	toggleRail: () => {
		const mode = get().explorerMode;
		set({ explorerMode: mode == null ? "files" : null });
	},

	setRightRailOpen: (open) => set({ explorerMode: open ? get().explorerMode ?? "files" : null }),

	toggleExpanded: (path) =>
		set((s) => ({ treeExpanded: { ...s.treeExpanded, [path]: !s.treeExpanded[path] } })),
}));
