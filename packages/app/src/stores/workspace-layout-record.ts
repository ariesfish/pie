// Layout record (W1c-2) — the pure half of the tabs-store's persistence
// layer. No React Native imports live here so the sanitization boundary is
// unit-testable in node and reusable by the future split-layout store.
import {
	buildDeterministicWorkspaceTabId,
	normalizeWorkspaceTabTarget,
} from "@/workspace-tabs/identity";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import type { ExplorerMode } from "./tabs-store";

export const MIN_RAIL_WIDTH = 200;
export const MAX_RAIL_WIDTH = 520;
export const DEFAULT_RAIL_WIDTH = 264;

export const clampRailWidth = (px: number): number =>
	Math.max(MIN_RAIL_WIDTH, Math.min(MAX_RAIL_WIDTH, Math.round(px)));

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
	tabs: WorkspaceTab[];
	activeTabId: string;
	explorerMode: ExplorerMode;
	railWidth: number;
}

/** Sanitize a persisted layout: every target re-normalizes (dropping
 * invalid/unknown entries), the sticky creator tab is ensured, and the active
 * tab always points at a live tab. Deterministic tab ids make the record
 * stable across restarts — that is the point of the identity module. */
export function sanitizeLayoutRecord(input: unknown): WorkspaceLayoutRecord {
	const record =
		typeof input === "object" && input !== null
			? (input as Partial<WorkspaceLayoutRecord>)
			: {};
	const seen = new Set<string>();
	const tabs: WorkspaceTab[] = [];
	for (const tab of Array.isArray(record.tabs) ? record.tabs : []) {
		if (!tab || typeof tab !== "object") continue;
		const target = normalizeWorkspaceTabTarget(tab.target);
		if (!target || target.kind === "new_tab") continue;
		const tabId = buildDeterministicWorkspaceTabId(target);
		if (seen.has(tabId)) continue;
		seen.add(tabId);
		tabs.push({
			tabId,
			target,
			createdAt: typeof tab.createdAt === "number" ? tab.createdAt : 0,
		});
	}
	tabs.push({ tabId: NEW_TAB_ID, target: { kind: "new_tab" }, createdAt: 0 });
	const activeTabId = tabs.some((t) => t.tabId === record.activeTabId)
		? (record.activeTabId as string)
		: NEW_TAB_ID;
	const explorerMode: ExplorerMode =
		record.explorerMode === "files" ||
		record.explorerMode === "changes" ||
		record.explorerMode === "resources" ||
		record.explorerMode === "activity"
			? record.explorerMode
			: null;
	const railWidth =
		typeof record.railWidth === "number" ? clampRailWidth(record.railWidth) : DEFAULT_RAIL_WIDTH;
	return { tabs, activeTabId, explorerMode, railWidth };
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

export function writeLayoutRecord(workspaceKey: string, record: WorkspaceLayoutRecord): void {
	try {
		layoutStorage.set(layoutKeyOf(workspaceKey), JSON.stringify(record));
	} catch {
		// Best effort — layout persistence never breaks the session flow.
	}
}
