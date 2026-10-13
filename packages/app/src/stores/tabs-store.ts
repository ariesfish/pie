// Tabs model, Wave 1: a tab IS a session (paseo's core mental model).
// Files/changes/resources panels live in the explorer sidebar, not the tab row.
import { create } from "zustand";

export type TabKind = "session" | "new";

export interface Tab {
	id: string;
	kind: TabKind;
	/** Session id for session tabs (tab id derives from it). */
	sessionId?: string;
}

export type ExplorerMode = "files" | "changes" | "resources" | null;

interface TabsState {
	tabs: Tab[];
	activeTabId: string;
	explorerMode: ExplorerMode;
	/** Expanded directory paths in the file tree (workspace-relative). */
	treeExpanded: Record<string, boolean>;

	openSession: (sessionId: string) => void;
	openNew: () => void;
	closeTab: (id: string) => void;
	setActive: (id: string) => void;
	setExplorerMode: (mode: ExplorerMode) => void;
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

	setRightRailOpen: (open) => set({ rightRailOpen: open }),

	toggleExpanded: (path) =>
		set((s) => ({ treeExpanded: { ...s.treeExpanded, [path]: !s.treeExpanded[path] } })),
}));
