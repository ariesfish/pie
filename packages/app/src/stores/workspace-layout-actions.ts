// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/stores/workspace-layout-actions.ts
// (Pie subset: the complete split-tree model minus the Explorer-sidebar pane
// host, the draft→agent parent-tab map, and embedded/browser reconciliation —
// none of those concepts exist in Pie. Function names and semantics match the
// upstream module so future maintenance ports diff cleanly.)
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
	buildDeterministicWorkspaceTabId,
	normalizeWorkspaceTabTarget,
	workspaceTabTargetsEqual,
} from "@/workspace-tabs/identity";
import { panelResourceKey, panelSupportsHost, type PaneHost } from "@/panels/panel-manifest";

/** Smallest share of a split a child panel may occupy. */
export const MIN_SPLIT_SIZE = 0.1;

export interface SplitPane {
	id: string;
	tabIds: string[];
	focusedTabId: string | null;
	hidden?: boolean;
}

export interface SplitGroup {
	id: string;
	direction: "horizontal" | "vertical";
	children: SplitNode[];
	sizes: number[];
}

export type SplitNode = { kind: "pane"; pane: SplitPane } | { kind: "group"; group: SplitGroup };

export interface WorkspaceLayout {
	root: SplitNode;
	focusedPaneId: string | null;
}

interface SplitPaneInternal extends SplitPane {
	tabs: WorkspaceTab[];
}

interface SplitGroupInternal extends Omit<SplitGroup, "children"> {
	children: SplitNodeInternal[];
}

type SplitNodeInternal =
	| { kind: "pane"; pane: SplitPaneInternal }
	| { kind: "group"; group: SplitGroupInternal };

/**
 * Where an open wants its tab, and how hard it wants it there (upstream
 * semantics, verbatim): a user picking a tab from a specific pane's `+` menu
 * expects it to arrive there; a supporting open must never yank a tab out
 * from under the pane the user deliberately moved it to.
 */
export type WorkspaceTabPlacement =
	| { mode: "pane"; paneId: string }
	| { mode: "prefer"; paneId: string }
	| { mode: "focused" };

export const FOCUSED_PANE_PLACEMENT: WorkspaceTabPlacement = { mode: "focused" };

export interface WorkspaceTabInsertionPosition {
	afterTabId: string;
}

export interface OpenTabInLayoutInput {
	insertionPosition?: WorkspaceTabInsertionPosition;
	layout: WorkspaceLayout;
	target: WorkspaceTabTarget;
	now: number;
	placement: WorkspaceTabPlacement;
}

export interface CreateTabInLayoutInput extends OpenTabInLayoutInput {
	createTabId: () => string;
}

export interface OpenTabInLayoutResult {
	layout: WorkspaceLayout;
	tabId: string;
}

interface CloseTabInLayoutInput {
	layout: WorkspaceLayout;
	tabId: string;
}

interface ClosePaneInLayoutInput {
	layout: WorkspaceLayout;
	paneId: string;
}

interface SplitPaneInLayoutInput {
	layout: WorkspaceLayout;
	tabId: string;
	targetPaneId: string;
	position: "left" | "right" | "top" | "bottom";
	createNodeId: (prefix: WorkspaceLayoutNodeIdPrefix) => string;
	maxTreeDepth: number;
}

interface MoveTabToPaneInLayoutInput {
	layout: WorkspaceLayout;
	tabId: string;
	toPaneId: string;
}

interface FocusTabInLayoutInput {
	layout: WorkspaceLayout;
	tabId: string;
}

/** Pie pane ids are generated once per workspace and persisted. */
export const DEFAULT_PANE_ID = "main";
const DEFAULT_LAYOUT_GROUP_ID = "workspace-root";

export type WorkspaceLayoutNodeIdPrefix = "pane" | "group" | "tab";

let nodeIdCounter = 0;
export function createNodeId(prefix: WorkspaceLayoutNodeIdPrefix): string {
	nodeIdCounter += 1;
	return `${prefix}_${Date.now().toString(36)}_${nodeIdCounter.toString(36)}_${Math.random()
		.toString(36)
		.slice(2, 8)}`;
}

/* ---------------------------------------------------------------------------
 * normalization primitives
 * ------------------------------------------------------------------------- */

function trimNonEmpty(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeTabIds(list: unknown): string[] {
	if (!Array.isArray(list)) {
		return [];
	}
	const next: string[] = [];
	const seen = new Set<string>();
	for (const value of list) {
		const tabId = trimNonEmpty(typeof value === "string" ? value : null);
		if (!tabId || seen.has(tabId)) {
			continue;
		}
		seen.add(tabId);
		next.push(tabId);
	}
	return next;
}

function normalizeWorkspaceTab(value: unknown): WorkspaceTab | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const tab = value as WorkspaceTab;
	const target = normalizeWorkspaceTabTarget(tab.target);
	if (!target) {
		return null;
	}
	if (target.kind === "new_tab") {
		// The sticky creator tab has a fixed id — one per pane,ibrator no copies.
		return { tabId: NEW_TAB_PREFIX_PLACEHOLDER, target, createdAt: 0 };
	}
	const tabId = buildDeterministicWorkspaceTabId(target);
	return {
		tabId,
		target,
		createdAt: typeof tab.createdAt === "number" ? tab.createdAt : Date.now(),
	};
}

const NEW_TAB_PREFIX_PLACEHOLDER = "new_tab";

function normalizeWorkspaceTabs(input: unknown): WorkspaceTab[] {
	if (!Array.isArray(input)) {
		return [];
	}
	const next: WorkspaceTab[] = [];
	const seen = new Set<string>();
	let creatorSeen = false;
	for (const value of input) {
		const tab = normalizeWorkspaceTab(value);
		if (!tab) {
			continue;
		}
		if (tab.target.kind === "new_tab") {
			if (creatorSeen) {
				continue;
			}
			creatorSeen = true;
		} else if (seen.has(tab.tabId)) {
			continue;
		}
		seen.add(tab.tabId);
		next.push(tab);
	}
	return next;
}

/** Generates a fresh creator tab with a stable, non-deterministic id (upstream
 * createNewWorkspaceTab). */
export function createNewWorkspaceTab(): WorkspaceTab {
	return { tabId: createNodeId("tab"), target: { kind: "new_tab" }, createdAt: Date.now() };
}

function createPaneNode(input: {
	id: string;
	tabs?: WorkspaceTab[];
	focusedTabId?: string | null;
	hidden?: boolean;
}): SplitNodeInternal {
	const normalizedTabs = normalizeWorkspaceTabs(input.tabs ?? []);
	const tabIds = normalizedTabs.map((tab) => tab.tabId);
	const focusedTabId = tabIds.includes(input.focusedTabId ?? "")
		? (input.focusedTabId ?? null)
		: (tabIds[tabIds.length - 1] ?? null);
	return {
		kind: "pane",
		pane: {
			id: input.id,
			tabs: normalizedTabs,
			tabIds,
			focusedTabId,
			...(input.hidden === true ? { hidden: true } : {}),
		},
	};
}

function ensureRetainedPaneHasTab(pane: SplitPaneInternal): SplitPaneInternal {
	if (pane.tabs.length > 0) {
		return pane;
	}
	const newTab = createNewWorkspaceTab();
	return normalizePaneAfterTabChange({
		...pane,
		tabs: [newTab],
		focusedTabId: newTab.tabId,
	});
}

function isSoleNewTabPane(pane: SplitPaneInternal): boolean {
	return pane.tabs.length === 1 && pane.tabs[0]?.target.kind === "new_tab";
}

function createGroupNode(input: {
	id: string;
	direction: "horizontal" | "vertical";
	children: SplitNodeInternal[];
	sizes?: number[];
}): SplitNodeInternal {
	return {
		kind: "group",
		group: {
			id: input.id,
			direction: input.direction,
			children: input.children,
			sizes: normalizeSizes({
				sizes: input.sizes ?? input.children.map(() => 1 / Math.max(input.children.length, 1)),
				count: input.children.length,
			}),
		},
	};
}

function normalizeSizes(input: { sizes: number[]; count: number }): number[] {
	if (input.count <= 0) {
		return [];
	}
	const raw = input.sizes.slice(0, input.count);
	while (raw.length < input.count) {
		raw.push(1);
	}
	const sanitized = raw.map((value) => (Number.isFinite(value) && value > 0 ? value : 1));
	const total = sanitized.reduce((sum, value) => sum + value, 0);
	if (total <= 0) {
		return Array.from({ length: input.count }, () => 1 / input.count);
	}
	return sanitized.map((value) => value / total);
}

export function clampNormalizedSizes(sizes: number[]): number[] {
	if (sizes.length === 0) {
		return [];
	}
	const normalized = normalizeSizes({ sizes, count: sizes.length });
	if (sizes.length === 1) {
		return [1];
	}
	if (sizes.length * MIN_SPLIT_SIZE > 1) {
		return Array.from({ length: sizes.length }, () => 1 / sizes.length);
	}

	const nextSizes = Array.from({ length: sizes.length }, () => 0);
	const unlocked = new Set(normalized.map((_, index) => index));
	let remainingTotal = 1;

	while (unlocked.size > 0) {
		let unlockedWeight = 0;
		for (const index of unlocked) {
			unlockedWeight += normalized[index] ?? 0;
		}
		if (unlockedWeight <= 0) {
			const evenShare = remainingTotal / unlocked.size;
			for (const index of unlocked) {
				nextSizes[index] = evenShare;
			}
			break;
		}
		const nextLocked: number[] = [];
		for (const index of unlocked) {
			const proposedSize = ((normalized[index] ?? 0) / unlockedWeight) * remainingTotal;
			if (proposedSize < MIN_SPLIT_SIZE) {
				nextLocked.push(index);
			}
		}
		if (nextLocked.length === 0) {
			for (const index of unlocked) {
				nextSizes[index] = ((normalized[index] ?? 0) / unlockedWeight) * remainingTotal;
			}
			break;
		}
		for (const index of nextLocked) {
			nextSizes[index] = MIN_SPLIT_SIZE;
			unlocked.delete(index);
			remainingTotal -= MIN_SPLIT_SIZE;
		}
	}

	return normalizeSizes({ sizes: nextSizes, count: nextSizes.length });
}

/* ---------------------------------------------------------------------------
 * tree traversal & surgery (upstream machinery, verbatim)
 * ------------------------------------------------------------------------- */

function asInternalNode(node: SplitNode): SplitNodeInternal {
	return node as SplitNodeInternal;
}

function asInternalLayout(layout: WorkspaceLayout): {
	root: SplitNodeInternal;
	focusedPaneId: string | null;
} {
	return layout as { root: SplitNodeInternal; focusedPaneId: string | null };
}

function findPanePathById(node: SplitNodeInternal, paneId: string, path: number[] = []): number[] | null {
	if (node.kind === "pane") {
		return node.pane.id === paneId ? path : null;
	}
	for (let index = 0; index < node.group.children.length; index += 1) {
		const childPath = findPanePathById(node.group.children[index], paneId, [...path, index]);
		if (childPath) {
			return childPath;
		}
	}
	return null;
}

function findPanePathContainingTab(
	node: SplitNodeInternal,
	tabId: string,
	path: number[] = [],
): number[] | null {
	if (node.kind === "pane") {
		return node.pane.tabs.some((tab) => tab.tabId === tabId) ? path : null;
	}
	for (let index = 0; index < node.group.children.length; index += 1) {
		const childPath = findPanePathContainingTab(node.group.children[index], tabId, [
			...path,
			index,
		]);
		if (childPath) {
			return childPath;
		}
	}
	return null;
}

function findGroupPathById(
	node: SplitNodeInternal,
	groupId: string,
	path: number[] = [],
): number[] | null {
	if (node.kind === "pane") {
		return null;
	}
	if (node.group.id === groupId) {
		return path;
	}
	for (let index = 0; index < node.group.children.length; index += 1) {
		const childPath = findGroupPathById(node.group.children[index], groupId, [...path, index]);
		if (childPath) {
			return childPath;
		}
	}
	return null;
}

/** The group holding the node at `targetPath`, or null when that node is the
 * whole tree. Ask `targetPath`, never the parent path — see upstream comment
 * about redundant root wrapping. */
function findParentGroup(root: SplitNodeInternal, targetPath: number[]): SplitNodeInternal | null {
	if (targetPath.length === 0) {
		return null;
	}
	return getNodeAtPath(root, targetPath.slice(0, -1));
}

function getNodeAtPath(node: SplitNodeInternal, path: number[]): SplitNodeInternal {
	let current = node;
	for (const index of path) {
		if (current.kind !== "group" || current.group.children[index] === undefined) {
			return current;
		}
		current = current.group.children[index];
	}
	return current;
}

function replaceNodeAtPath(
	node: SplitNodeInternal,
	path: number[],
	updater: (node: SplitNodeInternal) => SplitNodeInternal,
): SplitNodeInternal {
	if (path.length === 0) {
		return updater(node);
	}
	if (node.kind !== "group") {
		return node;
	}
	const [index, ...rest] = path;
	const nextChildren = node.group.children.map((child, childIndex) =>
		childIndex === index ? replaceNodeAtPath(child, rest, updater) : child,
	);
	return createGroupNode({
		id: node.group.id,
		direction: node.group.direction,
		children: nextChildren,
		sizes: node.group.sizes,
	});
}

function insertChildIntoGroup(
	groupNode: SplitNodeInternal,
	input: { index: number; node: SplitNodeInternal; sizes: number[] },
): SplitNodeInternal {
	if (groupNode.kind !== "group") {
		return groupNode;
	}
	const nextChildren = groupNode.group.children.slice();
	nextChildren.splice(input.index, 0, input.node);
	return createGroupNode({
		id: groupNode.group.id,
		direction: groupNode.group.direction,
		children: nextChildren,
		sizes: input.sizes,
	});
}

function listPaneIds(node: SplitNodeInternal): string[] {
	if (node.kind === "pane") {
		return node.pane.hidden === true ? [] : [node.pane.id];
	}
	const next: string[] = [];
	for (const child of node.group.children) {
		next.push(...listPaneIds(child));
	}
	return next;
}

function findNearestSiblingPaneId(root: SplitNodeInternal, paneId: string): string | null {
	const path = findPanePathById(root, paneId);
	if (!path || path.length === 0) {
		return null;
	}
	for (let depth = path.length - 1; depth >= 0; depth -= 1) {
		const parentPath = path.slice(0, depth);
		const childIndex = path[depth];
		const parentNode = getNodeAtPath(root, parentPath);
		if (parentNode.kind !== "group") {
			continue;
		}
		for (let index = childIndex - 1; index >= 0; index -= 1) {
			const paneIds = listPaneIds(parentNode.group.children[index]);
			if (paneIds.length > 0) {
				return paneIds[paneIds.length - 1] ?? null;
			}
		}
		for (let index = childIndex + 1; index < parentNode.group.children.length; index += 1) {
			const paneIds = listPaneIds(parentNode.group.children[index]);
			if (paneIds.length > 0) {
				return paneIds[0] ?? null;
			}
		}
	}
	return null;
}

function normalizePaneAfterTabChange(pane: SplitPaneInternal): SplitPaneInternal {
	const tabs = normalizeWorkspaceTabs(pane.tabs);
	const tabIds = tabs.map((tab) => tab.tabId);
	const focusedTabId = tabIds.includes(pane.focusedTabId ?? "")
		? pane.focusedTabId
		: (tabIds[tabIds.length - 1] ?? null);
	return {
		id: pane.id,
		tabs,
		tabIds,
		focusedTabId,
		...(pane.hidden === true ? { hidden: true } : {}),
	};
}

function normalizePaneNode(rawPane: SplitPaneInternal | undefined): SplitNodeInternal | null {
	const paneId = trimNonEmpty(rawPane?.id);
	if (!paneId) {
		return null;
	}
	const tabs = normalizeWorkspaceTabs(rawPane?.tabs);
	// Orphan tabIds without tab bodies cannot be reconstructed (upstream falls
	// back to draft tabs; pie has no drafts) — drop them.
	return createPaneNode({
		id: paneId,
		tabs,
		focusedTabId: trimNonEmpty(rawPane?.focusedTabId) ?? null,
		hidden: rawPane?.hidden === true,
	});
}

function normalizeGroupNode(rawGroup: SplitGroupInternal | undefined): SplitNodeInternal | null {
	if (!rawGroup) {
		return null;
	}
	const groupId = trimNonEmpty(rawGroup.id);
	const direction = rawGroup.direction;
	if (!groupId || (direction !== "horizontal" && direction !== "vertical")) {
		return null;
	}
	const children = Array.isArray(rawGroup.children)
		? rawGroup.children
				.map((child) => normalizeNode(child))
				.filter((child): child is SplitNodeInternal => child !== null)
		: [];
	if (children.length === 0) {
		return null;
	}
	if (children.length === 1) {
		return children[0] ?? null;
	}
	return createGroupNode({
		id: groupId,
		direction,
		children,
		sizes: Array.isArray(rawGroup.sizes) ? rawGroup.sizes : [],
	});
}

function normalizeNode(node: unknown): SplitNodeInternal | null {
	if (!node || typeof node !== "object") {
		return null;
	}
	if ((node as SplitNode).kind === "pane") {
		return normalizePaneNode((node as { pane?: SplitPaneInternal }).pane);
	}
	if ((node as SplitNode).kind === "group") {
		return normalizeGroupNode((node as { group?: SplitGroupInternal }).group);
	}
	return null;
}

function reorderTabsForPane(input: { pane: SplitPaneInternal; tabIds: string[] }): SplitPaneInternal {
	const nextIds = normalizeTabIds(input.tabIds);
	const byId = new Map(input.pane.tabs.map((tab) => [tab.tabId, tab]));
	const reordered: WorkspaceTab[] = [];
	const seen = new Set<string>();
	for (const tabId of nextIds) {
		const tab = byId.get(tabId);
		if (!tab || seen.has(tabId)) {
			continue;
		}
		seen.add(tabId);
		reordered.push(tab);
	}
	for (const tab of input.pane.tabs) {
		if (seen.has(tab.tabId)) {
			continue;
		}
		seen.add(tab.tabId);
		reordered.push(tab);
	}
	return normalizePaneAfterTabChange({ ...input.pane, tabs: reordered });
}

function removePaneByPath(root: SplitNodeInternal, path: number[]): SplitNodeInternal {
	if (path.length === 0) {
		if (root.kind !== "pane") {
			return root;
		}
		return createPaneNode({ id: root.pane.id, tabs: [createNewWorkspaceTab()] });
	}
	const parentPath = path.slice(0, -1);
	const removeIndex = path[path.length - 1] ?? -1;
	const parentNode = getNodeAtPath(root, parentPath);
	if (parentNode.kind !== "group" || removeIndex < 0) {
		return root;
	}
	const nextParentChildren = parentNode.group.children.filter((_, index) => index !== removeIndex);
	if (nextParentChildren.length === 0) {
		return root;
	}
	const nextParentNode =
		nextParentChildren.length === 1
			? nextParentChildren[0]
			: createGroupNode({
					id: parentNode.group.id,
					direction: parentNode.group.direction,
					children: nextParentChildren,
					sizes: parentNode.group.sizes.filter((_, index) => index !== removeIndex),
				});
	return replaceNodeAtPath(root, parentPath, () => nextParentNode);
}

function detachTabFromTree(
	root: SplitNodeInternal,
	input: { tabId: string; preserveEmptyPaneId?: string | null },
): { root: SplitNodeInternal; tab: WorkspaceTab | null; sourcePaneId: string | null } {
	const panePath = findPanePathContainingTab(root, input.tabId);
	if (!panePath) {
		return { root, tab: null, sourcePaneId: null };
	}
	const paneNode = getNodeAtPath(root, panePath);
	if (paneNode.kind !== "pane") {
		return { root, tab: null, sourcePaneId: null };
	}
	const tab = paneNode.pane.tabs.find((entry) => entry.tabId === input.tabId) ?? null;
	if (!tab) {
		return { root, tab: null, sourcePaneId: paneNode.pane.id };
	}
	const nextPane = normalizePaneAfterTabChange({
		...paneNode.pane,
		tabs: paneNode.pane.tabs.filter((entry) => entry.tabId !== input.tabId),
	});
	const nextRoot = replaceNodeAtPath(root, panePath, () => ({ kind: "pane", pane: nextPane }));
	if (nextPane.tabs.length > 0 || nextPane.id === input.preserveEmptyPaneId) {
		return {
			root:
				nextPane.tabs.length > 0
					? nextRoot
					: replaceNodeAtPath(nextRoot, panePath, () => ({
							kind: "pane",
							pane: ensureRetainedPaneHasTab(nextPane),
						})),
			tab,
			sourcePaneId: paneNode.pane.id,
		};
	}
	return {
		root: removePaneByPath(nextRoot, panePath),
		tab,
		sourcePaneId: paneNode.pane.id,
	};
}

function insertTabIntoPane(
	root: SplitNodeInternal,
	input: {
		insertionPosition?: WorkspaceTabInsertionPosition;
		paneId: string;
		tab: WorkspaceTab;
		focusTabId?: string | null;
	},
): SplitNodeInternal {
	const panePath = findPanePathById(root, input.paneId);
	if (!panePath) {
		return root;
	}
	return replaceNodeAtPath(root, panePath, (node) => {
		if (node.kind !== "pane") {
			return node;
		}
		const existingIndex = node.pane.tabs.findIndex((tab) => tab.tabId === input.tab.tabId);
		let nextTabs: WorkspaceTab[];
		if (input.tab.target.kind !== "new_tab" && isSoleNewTabPane(node.pane)) {
			nextTabs = [input.tab];
		} else if (existingIndex >= 0) {
			nextTabs = node.pane.tabs.map((tab, index) => (index === existingIndex ? input.tab : tab));
		} else {
			nextTabs = [...node.pane.tabs];
			const afterIndex = nextTabs.findIndex(
				(tab) => tab.tabId === input.insertionPosition?.afterTabId,
			);
			nextTabs.splice(afterIndex >= 0 ? afterIndex + 1 : nextTabs.length, 0, input.tab);
		}
		return {
			kind: "pane",
			pane: normalizePaneAfterTabChange({
				...node.pane,
				tabs: nextTabs,
				focusedTabId: input.focusTabId ?? input.tab.tabId,
			}),
		};
	});
}

function focusTabInPane(root: SplitNodeInternal, paneId: string, tabId: string): SplitNodeInternal {
	const panePath = findPanePathById(root, paneId);
	if (!panePath) {
		return root;
	}
	return replaceNodeAtPath(root, panePath, (node) => {
		if (node.kind !== "pane") {
			return node;
		}
		return {
			kind: "pane",
			pane: normalizePaneAfterTabChange({
				...node.pane,
				focusedTabId: tabId,
				hidden: undefined,
			}),
		};
	});
}

function replaceTabInTree(
	root: SplitNodeInternal,
	input: { tabId: string; nextTabId: string; target: WorkspaceTabTarget },
): SplitNodeInternal {
	const panePath = findPanePathContainingTab(root, input.tabId);
	if (!panePath) {
		return root;
	}
	return replaceNodeAtPath(root, panePath, (node) => {
		if (node.kind !== "pane") {
			return node;
		}
		return {
			kind: "pane",
			pane: normalizePaneAfterTabChange({
				...node.pane,
				tabs: node.pane.tabs.map((tab) => {
					if (tab.tabId !== input.tabId) return tab;
					return {
						tabId: input.nextTabId,
						target: input.target,
						createdAt: tab.createdAt,
					};
				}),
				focusedTabId:
					node.pane.focusedTabId === input.tabId ? input.nextTabId : node.pane.focusedTabId,
			}),
		};
	});
}

function updateGroupSizesInTree(
	root: SplitNodeInternal,
	input: { groupId: string; sizes: number[] },
): SplitNodeInternal {
	const groupPath = findGroupPathById(root, input.groupId);
	if (!groupPath) {
		return root;
	}
	return replaceNodeAtPath(root, groupPath, (node) => {
		if (node.kind !== "group" || input.sizes.length !== node.group.children.length) {
			return node;
		}
		return createGroupNode({
			id: node.group.id,
			direction: node.group.direction,
			children: node.group.children,
			sizes: clampNormalizedSizes(input.sizes),
		});
	});
}

function updatePaneInTree(
	root: SplitNodeInternal,
	input: { paneId: string; updater: (pane: SplitPaneInternal) => SplitPaneInternal },
): SplitNodeInternal {
	const panePath = findPanePathById(root, input.paneId);
	if (!panePath) {
		return root;
	}
	return replaceNodeAtPath(root, panePath, (node) => {
		if (node.kind !== "pane") {
			return node;
		}
		return { kind: "pane", pane: normalizePaneAfterTabChange(input.updater(node.pane)) };
	});
}

function insertSplitInternal(input: {
	root: SplitNodeInternal;
	targetPaneId: string;
	tabId: string;
	position: "left" | "right" | "top" | "bottom";
	createNodeId: (prefix: WorkspaceLayoutNodeIdPrefix) => string;
}): { root: SplitNodeInternal; newPaneId: string } {
	const direction =
		input.position === "left" || input.position === "right" ? "horizontal" : "vertical";
	const insertAfter = input.position === "right" || input.position === "bottom";

	const targetPathBeforeDetach = findPanePathById(input.root, input.targetPaneId);
	if (!targetPathBeforeDetach) {
		return { root: input.root, newPaneId: "" };
	}

	const detached = detachTabFromTree(input.root, {
		tabId: input.tabId,
		preserveEmptyPaneId: input.targetPaneId,
	});
	if (!detached.tab) {
		return { root: input.root, newPaneId: "" };
	}

	const targetPath = findPanePathById(detached.root, input.targetPaneId);
	if (!targetPath) {
		return { root: input.root, newPaneId: "" };
	}
	const targetNode = getNodeAtPath(detached.root, targetPath);
	if (targetNode.kind !== "pane") {
		return { root: input.root, newPaneId: "" };
	}

	const newPaneId = input.createNodeId("pane");
	const newPaneNode = createPaneNode({
		id: newPaneId,
		tabs: [detached.tab],
		focusedTabId: detached.tab.tabId,
	});

	const parentPath = targetPath.slice(0, -1);
	const targetIndex = targetPath[targetPath.length - 1] ?? 0;
	const parentNode = findParentGroup(detached.root, targetPath);

	if (parentNode?.kind === "group" && parentNode.group.direction === direction) {
		const targetSize = parentNode.group.sizes[targetIndex] ?? 0;
		const nextSizes = parentNode.group.sizes.slice();
		const insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
		nextSizes.splice(insertIndex, 0, targetSize / 2);
		nextSizes[targetIndex + (insertAfter ? 0 : 1)] = targetSize / 2;
		return {
			root: replaceNodeAtPath(detached.root, parentPath, () =>
				insertChildIntoGroup(parentNode, {
					index: insertIndex,
					node: newPaneNode,
					sizes: nextSizes,
				}),
			),
			newPaneId,
		};
	}

	const newGroup = createGroupNode({
		id: input.createNodeId("group"),
		direction,
		children: insertAfter ? [targetNode, newPaneNode] : [newPaneNode, targetNode],
		sizes: [0.5, 0.5],
	});
	return {
		root: replaceNodeAtPath(detached.root, targetPath, () => newGroup),
		newPaneId,
	};
}

/* ---------------------------------------------------------------------------
 * public layout API
 * ------------------------------------------------------------------------- */

export function normalizeLayout(layout: unknown): WorkspaceLayout {
	if (!layout || typeof layout !== "object") {
		return createDefaultLayout();
	}
	const rawLayout = layout as WorkspaceLayout;
	const root = normalizeNode(rawLayout.root) ?? asInternalNode(createDefaultLayout().root);
	const focusedPaneId =
		rawLayout.focusedPaneId === null ? null : trimNonEmpty(rawLayout.focusedPaneId);
	const resolvedFocusedPaneId =
		focusedPaneId === null
			? null
			: ((focusedPaneId && findPaneById(root, focusedPaneId)?.id) ??
				collectAllPanes(root)[0]?.id ??
				DEFAULT_PANE_ID);
	return { root, focusedPaneId: resolvedFocusedPaneId };
}

export function findPaneById(root: SplitNode, paneId: string | null | undefined): SplitPane | null {
	if (!paneId) {
		return null;
	}
	const internalRoot = asInternalNode(root);
	if (internalRoot.kind === "pane") {
		return internalRoot.pane.id === paneId ? internalRoot.pane : null;
	}
	for (const child of internalRoot.group.children) {
		const pane = findPaneById(child, paneId);
		if (pane) {
			return pane;
		}
	}
	return null;
}

export function findPaneContainingTab(root: SplitNode, tabId: string): SplitPane | null {
	const internalRoot = asInternalNode(root);
	if (internalRoot.kind === "pane") {
		return internalRoot.pane.tabs.some((tab) => tab.tabId === tabId) ? internalRoot.pane : null;
	}
	for (const child of internalRoot.group.children) {
		const pane = findPaneContainingTab(child, tabId);
		if (pane) {
			return pane;
		}
	}
	return null;
}

export function getTreeDepth(node: SplitNode): number {
	const internalNode = asInternalNode(node);
	if (internalNode.kind === "pane") {
		return 1;
	}
	return 1 + Math.max(...internalNode.group.children.map((child) => getTreeDepth(child)));
}

export function collectAllTabs(root: SplitNode): WorkspaceTab[] {
	const internalRoot = asInternalNode(root);
	if (internalRoot.kind === "pane") {
		return internalRoot.pane.tabs.slice();
	}
	return internalRoot.group.children.flatMap((child) => collectAllTabs(child));
}

export function collectAllPanes(root: SplitNode): SplitPane[] {
	const internalRoot = asInternalNode(root);
	if (internalRoot.kind === "pane") {
		return internalRoot.pane.hidden === true ? [] : [internalRoot.pane];
	}
	return internalRoot.group.children.flatMap((child) => collectAllPanes(child));
}

function restoreEmptyPanesInNode(node: SplitNodeInternal): SplitNodeInternal {
	if (node.kind === "pane") {
		return node.pane.tabs.length > 0
			? node
			: createPaneNode({
					id: node.pane.id,
					tabs: [createNewWorkspaceTab()],
					hidden: node.pane.hidden,
				});
	}
	return createGroupNode({
		id: node.group.id,
		direction: node.group.direction,
		children: node.group.children.map((child) => restoreEmptyPanesInNode(child)),
		sizes: node.group.sizes,
	});
}

/** Restores the workspace canvas: every empty pane regains a creator tab. */
export function restoreWorkspaceLayout(layout: WorkspaceLayout): WorkspaceLayout {
	const normalized = normalizeLayout(layout);
	return { ...normalized, root: restoreEmptyPanesInNode(asInternalNode(normalized.root)) };
}

export function createDefaultLayout(): WorkspaceLayout {
	return {
		root: createPaneNode({ id: DEFAULT_PANE_ID, tabs: [createNewWorkspaceTab()] }),
		focusedPaneId: DEFAULT_PANE_ID,
	};
}

export function insertSplit(
	root: SplitNode,
	targetPaneId: string,
	tabId: string,
	position: "left" | "right" | "top" | "bottom",
	createNodeId: (prefix: WorkspaceLayoutNodeIdPrefix) => string = defaultCreateNodeId,
): SplitNode {
	return insertSplitInternal({
		root: asInternalNode(root),
		targetPaneId,
		tabId,
		position,
		createNodeId,
	}).root;
}

const defaultCreateNodeId = createNodeId;

export function removePaneFromTree(root: SplitNode, paneId: string): SplitNode {
	const internalRoot = asInternalNode(root);
	const panePath = findPanePathById(internalRoot, paneId);
	if (!panePath) {
		return root;
	}
	return removePaneByPath(internalRoot, panePath);
}

export function removeTabFromTree(root: SplitNode, tabId: string): SplitNode {
	return detachTabFromTree(asInternalNode(root), {
		tabId,
		preserveEmptyPaneId: DEFAULT_PANE_ID,
	}).root;
}

function resolvePlacementPane(input: {
	layout: { root: SplitNodeInternal; focusedPaneId: string | null };
	target: WorkspaceTabTarget;
	placement: WorkspaceTabPlacement;
}): SplitPaneInternal | null {
	const supportsTarget = (pane: SplitPane) => panelSupportsHost(input.target.kind, "main" as PaneHost);
	const requestedCandidate =
		input.placement.mode === "pane" || input.placement.mode === "prefer"
			? findPaneById(input.layout.root, input.placement.paneId)
			: null;
	const requestedPane =
		requestedCandidate && supportsTarget(requestedCandidate) ? requestedCandidate : null;
	if (requestedPane) {
		return requestedPane as SplitPaneInternal;
	}
	const focusedCandidate = findPaneById(input.layout.root, input.layout.focusedPaneId);
	const focusedPane =
		(focusedCandidate && focusedCandidate.hidden !== true && supportsTarget(focusedCandidate)
			? focusedCandidate
			: null) ?? collectAllPanes(input.layout.root).find(supportsTarget);
	return (focusedPane as SplitPaneInternal) ?? null;
}

function insertNewTabIntoPane(
	input: CreateTabInLayoutInput & { focus: boolean },
): OpenTabInLayoutResult | null {
	const layout = asInternalLayout(input.layout);
	const targetPane = resolvePlacementPane({
		layout,
		target: input.target,
		placement: input.placement,
	});
	if (!targetPane) {
		return null;
	}

	const tabId = input.createTabId();
	const nextTab: WorkspaceTab = {
		tabId,
		target: input.target,
		createdAt: input.now,
	};

	const currentTab = isSoleNewTabPane(targetPane) ? targetPane.tabs[0] : null;
	if (currentTab && input.target.kind !== "new_tab") {
		return {
			tabId,
			layout: {
				root: replaceTabInTree(layout.root, {
					tabId: currentTab.tabId,
					nextTabId: tabId,
					target: input.target,
				}),
				focusedPaneId: input.focus ? targetPane.id : layout.focusedPaneId,
			},
		};
	}

	const preservedFocusTabId = targetPane.focusedTabId ?? tabId;
	return {
		tabId,
		layout: {
			root: insertTabIntoPane(layout.root, {
				paneId: targetPane.id,
				tab: nextTab,
				insertionPosition: input.insertionPosition,
				focusTabId: input.focus ? tabId : preservedFocusTabId,
			}),
			focusedPaneId: input.focus ? targetPane.id : layout.focusedPaneId,
		},
	};
}

function findExistingTabForTarget(root: SplitNodeInternal, target: WorkspaceTabTarget) {
	if (target.kind === "new_tab") {
		return null;
	}
	const targetIdentity = panelResourceKey(target);
	return (
		collectAllTabs(root).find((tab) => panelResourceKey(tab.target) === targetIdentity) ?? null
	);
}

function updateExistingTabTarget(
	layout: WorkspaceLayout,
	tab: WorkspaceTab,
	target: WorkspaceTabTarget,
): WorkspaceLayout {
	if (workspaceTabTargetsEqual(tab.target, target)) {
		return layout;
	}
	return {
		...layout,
		root: replaceTabInTree(asInternalNode(layout.root), {
			tabId: tab.tabId,
			nextTabId: tab.tabId,
			target,
		}),
	};
}

export function openTabInLayoutFocused(input: OpenTabInLayoutInput): OpenTabInLayoutResult | null {
	const layout = asInternalLayout(input.layout);
	const existingTab = findExistingTabForTarget(layout.root, input.target);
	if (existingTab) {
		const nextLayout = updateExistingTabTarget(input.layout, existingTab, input.target);
		return {
			tabId: existingTab.tabId,
			layout: revealExistingTab({
				layout: nextLayout,
				tabId: existingTab.tabId,
				placement: input.placement,
			}),
		};
	}
	return insertNewTabIntoPane({
		...input,
		createTabId: () => buildDeterministicWorkspaceTabId(input.target),
		focus: true,
	});
}

/** Always allocates an independent tab instance. */
export function createTabInLayout(input: CreateTabInLayoutInput): OpenTabInLayoutResult | null {
	return insertNewTabIntoPane({ ...input, focus: true });
}

/** Reveals an equivalent target, or creates it when absent. */
export function revealTargetInLayout(input: CreateTabInLayoutInput): OpenTabInLayoutResult | null {
	const existingTab = findExistingTabForTarget(asInternalLayout(input.layout).root, input.target);
	if (existingTab) {
		return {
			tabId: existingTab.tabId,
			layout: revealExistingTab({
				layout: updateExistingTabTarget(input.layout, existingTab, input.target),
				tabId: existingTab.tabId,
				placement: input.placement,
			}),
		};
	}
	return createTabInLayout({
		...input,
		createTabId: () => buildDeterministicWorkspaceTabId(input.target),
	});
}

/** Brings an already-open tab to the user. Only an explicit pane-local
 * placement relocates it; every other open finds it where the user left it. */
function revealExistingTab(input: {
	layout: WorkspaceLayout;
	tabId: string;
	placement: WorkspaceTabPlacement;
}): WorkspaceLayout {
	if (input.placement.mode === "pane") {
		const currentPane = findPaneContainingTab(asInternalNode(input.layout.root), input.tabId);
		if (currentPane?.id !== input.placement.paneId) {
			const moved = moveTabToPaneInLayout({
				layout: input.layout,
				tabId: input.tabId,
				toPaneId: input.placement.paneId,
			});
			if (moved) {
				return moved;
			}
		}
	}
	return focusTabInLayout({ layout: input.layout, tabId: input.tabId }) ?? input.layout;
}

export function closeTabInLayout(input: CloseTabInLayoutInput): WorkspaceLayout | null {
	const internalLayout = asInternalLayout(input.layout);
	const pane = findPaneContainingTab(internalLayout.root, input.tabId);
	if (!pane) {
		return null;
	}
	const preserveEmptyPaneId =
		pane.id === DEFAULT_PANE_ID || isLastVisiblePane(input.layout, pane.id) ? pane.id : null;

	const closeSuccessorTabId = getCloseSuccessorTabId({ pane, tabId: input.tabId });
	const fallbackPaneId = findNearestSiblingPaneId(internalLayout.root, pane.id);
	const nextRoot = detachTabFromTree(internalLayout.root, {
		tabId: input.tabId,
		preserveEmptyPaneId,
	}).root;
	const nextFocusedPaneId = getFocusedPaneIdAfterTabClose({
		root: nextRoot,
		focusedPaneId: internalLayout.focusedPaneId,
		fallbackPaneId,
	});
	const nextLayout: WorkspaceLayout = { root: nextRoot, focusedPaneId: nextFocusedPaneId };

	if (closeSuccessorTabId && findPaneContainingTab(nextRoot, closeSuccessorTabId)) {
		return focusTabInLayout({ layout: nextLayout, tabId: closeSuccessorTabId }) ?? nextLayout;
	}
	return nextLayout;
}

function isLastVisiblePane(layout: WorkspaceLayout, paneId: string): boolean {
	const panes = collectAllPanes(layout.root);
	return panes.length === 1 && panes[0]?.id === paneId;
}

/** Whether dismissing this pane would do anything. The last visible pane
 * stays — a workspace always has somewhere to look. */
export function canDismissPaneInLayout(layout: WorkspaceLayout, paneId: string): boolean {
	const pane = findPaneById(layout.root, paneId);
	if (!pane || pane.hidden === true) {
		return false;
	}
	return !isLastVisiblePane(layout, paneId);
}

/** Removes a pane outright, tabs and all. The last visible pane never goes. */
export function closePaneInLayout(input: ClosePaneInLayoutInput): WorkspaceLayout | null {
	const layout = asInternalLayout(input.layout);
	const panePath = findPanePathById(layout.root, input.paneId);
	if (!panePath) {
		return null;
	}
	if (isLastVisiblePane(input.layout, input.paneId)) {
		return null;
	}
	const fallbackPaneId = findNearestSiblingPaneId(layout.root, input.paneId);
	const nextRoot = removePaneByPath(layout.root, panePath);
	return {
		root: nextRoot,
		focusedPaneId: getFocusedPaneIdAfterTabClose({
			root: nextRoot,
			focusedPaneId: layout.focusedPaneId,
			fallbackPaneId,
		}),
	};
}

export function focusTabInLayout(input: FocusTabInLayoutInput): WorkspaceLayout | null {
	const layout = asInternalLayout(input.layout);
	const pane = findPaneContainingTab(layout.root, input.tabId);
	if (!pane) {
		return null;
	}
	if (pane.focusedTabId === input.tabId && layout.focusedPaneId === pane.id && pane.hidden !== true) {
		return null;
	}
	return {
		root: focusTabInPane(layout.root, pane.id, input.tabId),
		focusedPaneId: pane.id,
	};
}

/** Selects a tab inside a host without making that host the focused pane. */
export function selectTabInPaneInLayout(input: {
	layout: WorkspaceLayout;
	tabId: string;
	paneId: string;
}): WorkspaceLayout | null {
	const layout = asInternalLayout(input.layout);
	const pane = findPaneById(layout.root, input.paneId);
	if (!pane?.tabIds.includes(input.tabId) || pane.focusedTabId === input.tabId) {
		return null;
	}
	return {
		root: focusTabInPane(layout.root, input.paneId, input.tabId),
		focusedPaneId: layout.focusedPaneId,
	};
}

export function splitPaneInLayout(
	input: SplitPaneInLayoutInput,
): { layout: WorkspaceLayout; paneId: string } | null {
	const layout = asInternalLayout(input.layout);
	if (!findPaneById(layout.root, input.targetPaneId)) {
		return null;
	}
	if (!findPaneContainingTab(layout.root, input.tabId)) {
		return null;
	}
	const result = insertSplitInternal({
		root: layout.root,
		targetPaneId: input.targetPaneId,
		tabId: input.tabId,
		position: input.position,
		createNodeId: input.createNodeId,
	});
	if (!result.newPaneId || getTreeDepth(result.root) > input.maxTreeDepth) {
		return null;
	}
	return {
		paneId: result.newPaneId,
		layout: { root: result.root, focusedPaneId: result.newPaneId },
	};
}

export function moveTabToPaneInLayout(
	input: MoveTabToPaneInLayoutInput,
): WorkspaceLayout | null {
	const layout = asInternalLayout(input.layout);
	const sourcePane = findPaneContainingTab(layout.root, input.tabId);
	const targetPane = findPaneById(layout.root, input.toPaneId);
	if (!sourcePane || !targetPane || targetPane.hidden === true) {
		return null;
	}

	const sourceTab = collectAllTabs(layout.root).find((tab) => tab.tabId === input.tabId);
	const isMovingSoleNewTab =
		sourcePane.id !== input.toPaneId &&
		sourcePane.tabIds.length === 1 &&
		sourceTab?.target.kind === "new_tab";
	if (isMovingSoleNewTab) {
		return closePaneInLayout({ layout, paneId: sourcePane.id });
	}

	const detached = detachTabFromTree(layout.root, {
		tabId: input.tabId,
		preserveEmptyPaneId: sourcePane.id === input.toPaneId ? sourcePane.id : null,
	});
	if (!detached.tab) {
		return null;
	}
	return {
		root: insertTabIntoPane(detached.root, {
			paneId: input.toPaneId,
			tab: detached.tab,
			focusTabId: input.tabId,
		}),
		focusedPaneId: input.toPaneId,
	};
}

export function focusPaneInLayout(input: {
	layout: WorkspaceLayout;
	paneId: string;
}): WorkspaceLayout | null {
	const pane = findPaneById(input.layout.root, input.paneId);
	if (!pane) {
		return null;
	}
	if (input.layout.focusedPaneId === input.paneId && pane.hidden !== true) {
		return null;
	}
	return {
		root:
			pane.hidden === true
				? updatePaneInTree(asInternalNode(input.layout.root), {
						paneId: input.paneId,
						updater: (currentPane) => ({ ...currentPane, hidden: undefined }),
					})
				: input.layout.root,
		focusedPaneId: input.paneId,
	};
}

export function resizeSplitInLayout(input: {
	layout: WorkspaceLayout;
	groupId: string;
	sizes: number[];
}): WorkspaceLayout {
	const layout = asInternalLayout(input.layout);
	return {
		root: updateGroupSizesInTree(layout.root, {
			groupId: input.groupId,
			sizes: input.sizes,
		}),
		focusedPaneId: layout.focusedPaneId,
	};
}

export function reorderPaneTabsInLayout(input: {
	layout: WorkspaceLayout;
	paneId: string;
	tabIds: string[];
}): WorkspaceLayout | null {
	const layout = asInternalLayout(input.layout);
	if (!findPaneById(layout.root, input.paneId)) {
		return null;
	}
	return {
		root: updatePaneInTree(layout.root, {
			paneId: input.paneId,
			updater: (pane) => reorderTabsForPane({ pane, tabIds: input.tabIds }),
		}),
		focusedPaneId: layout.focusedPaneId,
	};
}

function getCloseSuccessorTabId(input: {
	pane: SplitPane;
	tabId: string;
}): string | null {
	if (input.pane.focusedTabId !== input.tabId) {
		return null;
	}
	const tabIndex = input.pane.tabIds.indexOf(input.tabId);
	return (
		input.pane.tabIds[tabIndex + 1] ??
		(tabIndex > 0 ? input.pane.tabIds[tabIndex - 1] : null) ??
		null
	);
}

function getFocusedPaneIdAfterTabClose(input: {
	root: SplitNode;
	focusedPaneId: string | null;
	fallbackPaneId: string | null;
}): string | null {
	if (input.focusedPaneId === null) {
		return null;
	}
	return (
		findPaneById(input.root, input.focusedPaneId)?.id ??
		(input.fallbackPaneId ? findPaneById(input.root, input.fallbackPaneId)?.id : null) ??
		collectAllPanes(input.root)[0]?.id ??
		DEFAULT_PANE_ID
	);
}
