// Session list store (P2-desktop Wave 1): the sidebar's real content —
// session.list per workspace, bucketed by relative activity date the way
// paseo's agent-list does (Today / Yesterday / This week / This month / Older).
import { create } from "zustand";

import type { SessionListItem } from "@pie/protocol";

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

interface SessionListState {
	sessions: SessionListItem[];
	loading: boolean;
	error: string | null;
	fetchedAt: number;
	search: string;

	refresh: () => Promise<void>;
	setSearch: (q: string) => void;
	/** Grouped + searched view model for the sidebar. */
	select: () => Array<{ bucket: DateBucket; items: SessionListItem[] }>;
}

export const useSessionListStore = create<SessionListState>((set, get) => ({
	sessions: [],
	loading: false,
	error: null,
	fetchedAt: 0,
	search: "",

	refresh: async () => {
		const workspaceId = useWorkspaceStore.getState().workspaceId;
		const conn = useConnectionStore.getState().conn;
		if (!workspaceId || !conn) return;
		set({ loading: true });
		try {
			const res = await conn.request("session.list", { workspaceId });
			set({ sessions: res.sessions, loading: false, error: null, fetchedAt: Date.now() });
		} catch (err) {
			set({ loading: false, error: err instanceof Error ? err.message : String(err) });
		}
	},

	setSearch: (q) => set({ search: q }),

	select: () => {
		const { sessions, search } = get();
		const q = search.trim().toLowerCase();
		const filtered = q
			? sessions.filter(
					(s) =>
						(s.name ?? "").toLowerCase().includes(q) ||
						s.firstMessage.toLowerCase().includes(q) ||
						s.sessionId.toLowerCase().includes(q),
				)
			: sessions;
		const byBucket = new Map<DateBucket, SessionListItem[]>();
		for (const s of filtered) {
			const bucket = bucketOf(s.modified);
			const list = byBucket.get(bucket) ?? [];
			list.push(s);
			byBucket.set(bucket, list);
		}
		for (const list of byBucket.values()) {
			list.sort((a, b) => (a.modified < b.modified ? 1 : -1));
		}
		const order: DateBucket[] = ["today", "yesterday", "week", "month", "older"];
		return order
			.filter((b) => (byBucket.get(b)?.length ?? 0) > 0)
			.map((bucket) => ({ bucket, items: byBucket.get(bucket)! }));
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

/** Row title: session name, else first message snippet (paseo fallbackTitle). */
export function sessionTitle(s: SessionListItem): string {
	if (s.name && s.name.trim().length > 0) return s.name;
	const fm = s.firstMessage.trim();
	return fm.length > 0 ? (fm.length > 72 ? `${fm.slice(0, 72)}…` : fm) : "(untitled session)";
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
