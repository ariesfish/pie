// Layout record (W1c-3) — the pure half of the tabs-store's persistence
// layer. No React Native imports live here so the sanitization boundary is
// unit-testable in node. Record v2 carries the split tree (root +
// focusedPaneId); records written by W1c-2 (flat tabs + activeTabId) migrate
// into a single-pane tree on read.
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import { normalizeWorkspaceTabTarget } from "@/workspace-tabs/identity";
import {
	type WorkspaceLayout,
	DEFAULT_PANE_ID,
	normalizeLayout,
} from "./workspace-layout-actions";
import type { ExplorerMode } from "./tabs-store";
import {
	DEFAULT_RAIL_WIDTH,
	clampRailWidth,
} from "@/constants/layout";

export const NEW_TAB_ID = "new_tab";

const layoutStorage = {
	get(key: string): string | null {
		if (typeof localStorage === "undefined") return null;
		return localStorage.getItem(key);
	},
	set(key: string, value: string): void {
		if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
	},
};

export const layoutKeyOf = (workspaceKey: string) => `pie-workspace-layout:${workspaceKey}`;

export interface WorkspaceLayoutRecord {
	layout: WorkspaceLayout;
	explorerMode: ExplorerMode;
	railWidth: number;
	/** Left sidebar visibility (records written before it existed stay true). */
	sidebarVisible?: boolean;
}

function sanitizeTab(value: unknown): WorkspaceTab | null {
	if (!value || typeof value !== "object") return null;
	const target = normalizeWorkspaceTabTarget(
		(value as { target?: WorkspaceTabTarget | null }).target ?? null,
	);
	if (!target) return null;
	if (target.kind === "new_tab") {
		return { tabId: `tab_migrated_${Date.now().toString(36)}`, target, createdAt: 0 };
	}
	// Deterministic ids re-derive on read — stale ids from older records heal.
	const tabId = (value as { tabId?: unknown }).tabId;
	const deterministicId =
		typeof tabId === "string" && tabId.trim()
			? tabId.trim()
			: `${target.kind === "session" ? `session_${target.sessionId}` : target.kind}`;
	return {
		tabId: deterministicId,
		target,
		createdAt: typeof (value as { createdAt?: unknown }).createdAt === "number" ? 0 : 0,
	};
}

/** v1 (W1c-2) flat records → single-pane layout tree. */
function migrateFlatRecord(raw: {
	tabs?: unknown;
	activeTabId?: unknown;
}): WorkspaceLayout | null {
	if (!Array.isArray(raw.tabs)) return null;
	const tabs: WorkspaceTab[] = [];
	const seen = new Set<string>();
	for (const value of raw.tabs) {
		const tab = sanitizeTab(value);
		if (!tab || tab.target.kind === "new_tab") continue;
		if (seen.has(tab.tabId)) continue;
		seen.add(tab.tabId);
		tabs.push(tab);
	}
	const activeTabId =
		typeof raw.activeTabId === "string" && seen.has(raw.activeTabId) ? raw.activeTabId : null;
	const pane = {
		kind: "pane" as const,
		pane: {
			id: DEFAULT_PANE_ID,
			tabIds: tabs.map((t) => t.tabId),
			focusedTabId: activeTabId ?? (tabs[tabs.length - 1]?.tabId ?? null),
			tabs,
		},
	};
	return normalizeLayout({ root: pane, focusedPaneId: DEFAULT_PANE_ID });
}

/** Sanitize a persisted record: drop to defaults for garbage input, migrate
 * v1 flat records, normalize the split tree (normalizeLayout), sanitize the
 * rail fields. Tabs' runtime bodies live inside the tree (normalized by the
 * layout module). */
export function sanitizeLayoutRecord(input: unknown): WorkspaceLayoutRecord {
	const record = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
	const layout =
		record.layout !== undefined
			? normalizeLayout(record.layout as WorkspaceLayout)
			: (migrateFlatRecord(record as { tabs?: unknown; activeTabId?: unknown }) ??
				normalizeLayout(null));
	const explorerMode: ExplorerMode =
		record.explorerMode === "files" ||
		record.explorerMode === "changes" ||
		record.explorerMode === "resources" ||
		record.explorerMode === "activity"
			? (record.explorerMode as ExplorerMode)
			: null;
	const railWidth =
		typeof record.railWidth === "number" ? clampRailWidth(record.railWidth) : DEFAULT_RAIL_WIDTH;
	return { layout, explorerMode, railWidth };
}

export function readLayoutRecord(workspaceKey: string): WorkspaceLayoutRecord {
	let raw: string | null = null;
	try {
		raw = layoutStorage.get(layoutKeyOf(workspaceKey));
	} catch {
		raw = null;
	}
	if (!raw) return sanitizeLayoutRecord(null);
	try {
		return sanitizeLayoutRecord(JSON.parse(raw));
	} catch {
		return sanitizeLayoutRecord(null);
	}
}

export function writeLayoutRecord(
	workspaceKey: string,
	record: { layout: WorkspaceLayout; explorerMode: ExplorerMode; railWidth: number; sidebarVisible?: boolean },
): void {
	try {
		layoutStorage.set(layoutKeyOf(workspaceKey), JSON.stringify(record));
	} catch {
		// Best effort — layout persistence never breaks the session flow.
	}
}
