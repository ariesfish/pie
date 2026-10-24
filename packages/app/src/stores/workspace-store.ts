// Workspace observation store (P2b-1): fs listing/read + git status/diff,
// invalidated by `workspace.fs.changed` events from the fs watcher. The
// connection store forwards those events here (single event source).
import { create } from "zustand";

import type {
	FsEntryInfo,
	FsReadResult,
	GitDiffFile,
	GitStatusEntry,
	GitStatusResult,
} from "@pie/protocol";

import { useConnectionStore } from "./connection-store";

interface FsNode {
	entries: FsEntryInfo[];
	loading: boolean;
	error: string | null;
	fetchedAt: number;
}

interface WorkspaceState {
	/** Active workspace id (the absolute path). */
	workspaceId: string | null;
	watchId: string | null;
	dir: string;
	dirs: Record<string, FsNode>;
	openFile: FsReadResult | null;
	openFilePath: string | null;
	fileLoading: boolean;

	gitStatus: GitStatusResult | null;
	gitLoading: boolean;
	gitError: string | null;
	gitFiles: GitDiffFile[];
	diffPath: string | null;
	diffLoading: boolean;

	setWorkspace: (workspaceId: string | null) => void;
	ensureWatch: () => Promise<void>;
	listDir: (path: string) => Promise<void>;
	openPath: (path: string) => Promise<void>;
	closeFile: () => void;
	refreshStatus: () => Promise<void>;
	loadDiff: (path?: string) => Promise<void>;
	/** Handle one fs watcher event batch. */
	applyFsChanged: (payload: { workspaceId: string; paths: string[] }) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
	workspaceId: null,
	watchId: null,
	dir: "",
	dirs: {},
	openFile: null,
	openFilePath: null,
	fileLoading: false,

	gitStatus: null,
	gitLoading: false,
	gitError: null,
	gitFiles: [],
	diffPath: null,
	diffLoading: false,

	setWorkspace: (workspaceId) => {
		set({
			workspaceId,
			watchId: null,
			dir: "",
			dirs: {},
			openFile: null,
			openFilePath: null,
			gitStatus: null,
			gitFiles: [],
			diffPath: null,
		});
	},

	ensureWatch: async () => {
		const { workspaceId, watchId, conn } = asConn(get);
		if (!workspaceId || watchId) return;
		try {
			const res = await conn.request("fs.watch", { workspaceId });
			set({ watchId: res.watchId });
		} catch (err) {
			if (!errIsNotFoundOrImplemented(err)) {
				set({ gitError: null });
				// watchers are advisory-only; ignore hard failures for now
			}
		}
	},

	listDir: async (path) => {
		const { workspaceId, conn } = asConn(get);
		if (!workspaceId) return;
		set((s) => ({
			dirs: { ...s.dirs, [path]: { entries: s.dirs[path]?.entries ?? [], loading: true, error: null, fetchedAt: 0 } },
		}));
		try {
			const res = await conn.request("fs.list", { workspaceId, path: path || undefined });
			set((s) => ({
				dirs: { ...s.dirs, [path]: { entries: res.entries, loading: false, error: null, fetchedAt: Date.now() } },
			}));
		} catch (err) {
			set((s) => ({
				dirs: {
					...s.dirs,
					[path]: { entries: [], loading: false, error: errText(err), fetchedAt: Date.now() },
				},
			}));
		}
	},

	openPath: async (path) => {
		const { workspaceId, conn } = asConn(get);
		if (!workspaceId) return;
		set({ fileLoading: true, openFilePath: path });
		try {
			const res = await conn.request("fs.read", { workspaceId, path });
			if (get().openFilePath === path) set({ openFile: res, fileLoading: false });
		} catch (err) {
			set({ openFile: null, fileLoading: false });
			set((s) => ({ dirs: s.dirs }));
			useConnectionStore.setState({ error: errText(err) });
		}
	},

	closeFile: () =>
		set({ openFile: null, openFilePath: null, fileLoading: false }),

	refreshStatus: async () => {
		const { workspaceId, conn } = asConn(get);
		if (!workspaceId) return;
		set({ gitLoading: true, gitError: null });
		try {
			const res = await conn.request("git.status", { workspaceId });
			set({ gitStatus: res, gitLoading: false });
		} catch (err) {
			set({ gitError: errText(err), gitLoading: false, gitStatus: null });
		}
	},

	loadDiff: async (path) => {
		const { workspaceId, conn } = asConn(get);
		if (!workspaceId) return;
		set({ diffLoading: true, diffPath: path });
		try {
			const res = await conn.request("git.diff", {
				workspaceId,
				...(path ? { path } : {}),
				includeUntracked: true,
			});
			set({ gitFiles: res.files, diffLoading: false });
		} catch (err) {
			useConnectionStore.setState({ error: errText(err) });
			set({ diffLoading: false });
		}
	},

	applyFsChanged: (payload) => {
		// Batched invalidation: drop cached listings so re-navigation refetches;
		// reload the open file when its own path (or its directory) changed —
		// that is the live-file channeling (viewer refetches stay cheap).
		const s = get();
		if (!s.workspaceId) return;
		const touchesOpenFile =
			s.openFilePath != null &&
			payload.paths.some(
				(p) => p === s.openFilePath || s.openFilePath!.startsWith(`${p}/`),
			);
		set({
			dirs: Object.fromEntries(
				Object.entries(s.dirs).map(([k, v]) => [k, { ...v, fetchedAt: 0 }]),
			),
		});
		if (touchesOpenFile) {
			void get().openPath(s.openFilePath!);
		}
		if (s.gitStatus) {
			void get().refreshStatus();
		}
		if (s.diffPath) {
			void get().loadDiff(s.diffPath);
		}
	},

}));

function asConn(get: () => WorkspaceState): WorkspaceState & {
	conn: NonNullable<ReturnType<typeof useConnectionStore.getState>["conn"]>;
} {
	const conn = useConnectionStore.getState().conn;
	if (!conn) throw new Error("not connected");
	return { ...get(), conn };
}

function errText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function errIsNotFoundOrImplemented(err: unknown): boolean {
	const e = err as { code?: string; message?: string };
	const m = e.message ?? "";
	return m.includes("not implemented") || m.includes("Not implemented");
}

/** Status letter pair -> display kind used by the changes panel. */
export function statusKindOf(entry: GitStatusEntry): GitDiffFile["change"] {
	const c = entry.index === "?" ? entry.worktree : entry.index;
	if (c === "A") return "added";
	if (c === "D") return "deleted";
	if (c === "R") return "renamed";
	if (c === "C") return "copied";
	if (c === "?") return "untracked";
	return "modified";
}
