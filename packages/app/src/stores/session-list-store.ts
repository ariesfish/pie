// Session list store (P2-desktop Wave 1): the sidebar's real content —
// session.list per workspace, bucketed by relative activity date the way
// paseo's agent-list does (Today / Yesterday / This week / This month / Older).
import { create } from "zustand";

import type { SessionListItem } from "@pie/protocol";
import i18n from "@/i18n/i18next";

import { useConnectionStore } from "./connection-store";
import { useWorkspaceStore } from "./workspace-store";

export type DateBucket = "today" | "yesterday" | "week" | "month" | "older";

const BUCKET_LABEL_KEY: Record<DateBucket, string> = {
	today: "agentList.today",
	yesterday: "agentList.yesterday",
	week: "agentList.thisWeek",
	month: "agentList.thisMonth",
	older: "agentList.older",
};
export { BUCKET_LABEL_KEY };

/** A git sub-repo directly under the open workspace (workspace.projects). */
export interface WorkspaceProject {
	path: string;
	name: string;
}

interface SessionListState {
	sessions: SessionListItem[];
	projects: WorkspaceProject[];
	loading: boolean;
	error: string | null;
	fetchedAt: number;
	search: string;
	/** Last failed rename (wire error or no connection); row data unchanged. */
	renameError: { sessionId: string; message: string } | null;

	refresh: () => Promise<void>;
	refreshProjects: () => Promise<void>;
	setSearch: (q: string) => void;
	upsert: (item: SessionListItem) => void;
	/** Rename or clear (whitespace-only input = explicit clear, sends ""). */
	renameSession: (sessionId: string, input: string) => Promise<void>;
	/** Event-driven sync: session.renamed broadcast updates the row in place. */
	applyRenamed: (sessionId: string, name?: string) => void;
	clearRenameError: () => void;
	/** Grouped + searched view model for the sidebar: sessions bucket by the
	 *  project cwd they belong to (recursive workspace listing). */
	select: () => Array<{ project: string; items: SessionListItem[] }>;
}

export const useSessionListStore = create<SessionListState>((set, get) => ({
	sessions: [],
	projects: [],
	loading: false,
	error: null,
	fetchedAt: 0,
	search: "",
	renameError: null,

	refresh: async () => {
		const workspaceId = useWorkspaceStore.getState().workspaceId;
		const conn = useConnectionStore.getState().conn;
		if (!workspaceId || !conn) return;
		set({ loading: true });
		try {
			// Recursive: a workspace is a container; its sessions are bucketed
			// by the project cwd each session carries (session.create may run
			// in a project sub-repo, whose sessions still belong here).
			const res = await conn.request("session.list", { workspaceId, recursive: true });
			set({ sessions: res.sessions, loading: false, error: null, fetchedAt: Date.now() });
		} catch (err) {
			set({ loading: false, error: err instanceof Error ? err.message : String(err) });
		}
	},

	refreshProjects: async () => {
		const workspaceId = useWorkspaceStore.getState().workspaceId;
		const conn = useConnectionStore.getState().conn;
		if (!workspaceId || !conn) return;
		try {
			const res = await conn.request("workspace.projects", { workspaceId });
			set({ projects: res.projects });
		} catch {
			// Non-fatal: the creator falls back to the workspace root.
		}
	},

	setSearch: (q) => set({ search: q }),

	/** Upsert an unsolicited row (session.summary.updated). Keep list order
	 *  stable: replace in place, or prepend an unseen row. */
	upsert: (item) => {
		set((st) => {
			const idx = st.sessions.findIndex((s) => s.sessionId === item.sessionId);
			if (idx === -1) return { sessions: [item, ...st.sessions] };
			const next = st.sessions.slice();
			next[idx] = item;
			return { sessions: next };
		});
	},

	/** Rename or clear a session's name. Whitespace-only input = explicit
	 *  clear (sends empty string, matching the daemon's session_info clear
	 *  semantics). On success the row is updated locally (closed sessions get
	 *  no broadcast); open sessions also receive session.renamed/
	 *  summary.updated events, which are idempotent with this update. */
	renameSession: async (sessionId, input) => {
		const conn = useConnectionStore.getState().conn;
		const trimmed = input.trim();
		if (!conn) {
			set({ renameError: { sessionId, message: i18n.t("agentList.renameErrorNotConnected") } });
			return;
		}
		try {
			await conn.request("session.rename", { sessionId, name: trimmed });
			set((st) => {
				const idx = st.sessions.findIndex((s) => s.sessionId === sessionId);
				if (idx === -1) return { renameError: null };
				const next = st.sessions.slice();
				next[idx] = { ...next[idx], name: trimmed.length > 0 ? trimmed : undefined };
				return { sessions: next, renameError: null };
			});
		} catch (err) {
			set({ renameError: { sessionId, message: err instanceof Error ? err.message : String(err) } });
		}
	},

	/** session.renamed broadcast: sync the row name in place; ignore rows we
	 *  don't hold (a later refresh picks them up). */
	applyRenamed: (sessionId, name) => {
		set((st) => {
			const idx = st.sessions.findIndex((s) => s.sessionId === sessionId);
			if (idx === -1) return {};
			const next = st.sessions.slice();
			next[idx] = { ...next[idx], name: name && name.trim().length > 0 ? name : undefined };
			return { sessions: next };
		});
	},

	clearRenameError: () => set({ renameError: null }),

	select: () => {
		const { sessions, search, projects } = get();
		const q = search.trim().toLowerCase();
		const filtered = q
			? sessions.filter(
					(s) =>
						(s.name ?? "").toLowerCase().includes(q) ||
						s.firstMessage.toLowerCase().includes(q) ||
						s.sessionId.toLowerCase().includes(q),
				)
			: sessions;
		// Group by project: the session's own cwd (workspaceId). Project label
		// prefers the discovered sub-repo name; the workspace root itself (""
		// never — the cwd is always a real path) shows its basename.
		const workspaceId = useWorkspaceStore.getState().workspaceId ?? "";
		const projectName = (cwd: string): string => {
			const known = projects.find((p) => p.path === cwd);
			if (known) return known.name;
			// The workspace container itself can collide with a same-named
			// sub-repo (…/pie vs …/pie/pie); label the root explicitly.
			if (cwd === workspaceId) return i18n.t("agentList.workspaceRoot");
			return cwd.split("/").filter(Boolean).pop() ?? cwd;
		};
		const byProject = new Map<string, SessionListItem[]>();
		for (const s of filtered) {
			const key = s.workspaceId || workspaceId;
			const list = byProject.get(key) ?? [];
			list.push(s);
			byProject.set(key, list);
		}
		for (const list of byProject.values()) {
			list.sort((a, b) => (a.modified < b.modified ? 1 : -1));
		}
		// Order: projects with the newest activity first.
		return Array.from(byProject.entries())
			.sort(([, a], [, b]) => (a[0]?.modified < b[0]?.modified ? 1 : -1))
			.map(([key, items]) => ({ project: projectName(key), items }));
	},
}));

/** paseo-style relative buckets off the modified timestamp. */
export function bucketOf(iso: string): DateBucket {
	const modified = new Date(iso).getTime();
	if (!Number.isFinite(modified)) return "older";
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	if (modified >= startOfToday) return "today";
	if (modified >= startOfToday - 86_400_000) return "yesterday";
	if (modified >= startOfToday - 6 * 86_400_000) return "week";
	if (modified >= startOfToday - 29 * 86_400_000) return "month";
	return "older";
}

/**
 * Row title: session name, else first message snippet (paseo fallbackTitle).
 * Returns "" when neither exists — the caller resolves display text via i18n
 * (`agentList.untitled`); this layer must not invent copy.
 */
export function sessionTitle(s: SessionListItem): string {
	if (s.name && s.name.trim().length > 0) return s.name;
	const fm = s.firstMessage.trim();
	return fm.length > 0 ? (fm.length > 72 ? `${fm.slice(0, 72)}…` : fm) : "";
}

/** "3m ago" style relative time. */
export function relativeTime(iso: string): string {
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t)) return "";
	const diff = Date.now() - t;
	if (diff < 60_000) return "now";
	if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
	const d = Math.floor(diff / 86_400_000);
	return d < 30 ? `${d}d` : `${Math.floor(d / 30)}mo`;
}
