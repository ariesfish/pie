// Workspace registry (paseo agent-list projects analog): the user's known
// workspace directories, persisted locally. Projects group workspaces; the
// active workspace is the route, not stored state.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface WorkspaceEntry {
	id: string; // absolute dir path — also the route workspaceId
	name: string; // display name (dir basename)
	project?: string; // grouping project label (paseo: project rows)
}

interface WorkspaceRegistryState {
	workspaces: WorkspaceEntry[];
	register: (id: string) => void;
	remove: (id: string) => void;
}

const storage = {
	getItem: (name: string) =>
		typeof localStorage === "undefined" ? null : (localStorage.getItem(name) ?? null),
	setItem: (name: string, value: string) => {
		if (typeof localStorage !== "undefined") localStorage.setItem(name, value);
	},
	removeItem: (name: string) => {
		if (typeof localStorage !== "undefined") localStorage.removeItem(name);
	},
};

export const useWorkspaceRegistryStore = create<WorkspaceRegistryState>()(
	persist(
		(set, get) => ({
			workspaces: [],
			register: (id) => {
				const clean = id.trim();
				if (!clean) return;
				if (get().workspaces.some((w) => w.id === clean)) return;
				const name = clean.split("/").filter(Boolean).pop() ?? clean;
				set({ workspaces: [...get().workspaces, { id: clean, name }] });
			},
			remove: (id) => set({ workspaces: get().workspaces.filter((w) => w.id !== id) }),
		}),
		{ name: "pie-workspace-registry", storage: createJSONStorage(() => storage) },
	),
);

/** Group entries by project label, Default first (paseo: project group rows). */
export function groupByProject(
	workspaces: WorkspaceEntry[],
): Array<{ project: string; items: WorkspaceEntry[] }> {
	const groups = new Map<string, WorkspaceEntry[]>();
	for (const w of workspaces) {
		const key = w.project ?? "";
		const list = groups.get(key);
		if (list) list.push(w);
		else groups.set(key, [w]);
	}
	return Array.from(groups.entries())
		.sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
		.map(([project, items]) => ({ project, items }));
}
