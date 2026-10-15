// Ported from getpaseo/paseo (Apache-2.0) — command-center/workspace-registration.tsx.
// [pie] rewritten against pie stores: paseo assembles git actions, label
// catalogs, keyboard-dispatcher targets and host capabilities; pie maps its
// own command union onto tabs-store and the files panel path. Registration
// rides useCommandCenterActions so the palette (W3e-3) sees live rows.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
	ChevronsLeftRight,
	Columns2,
	Files,
	Gauge,
	PanelsTopLeft,
	Plus,
	Rows2,
	X,
} from "lucide-react-native";

import { getCommandCenterIcon } from "./icon";
import { useCommandCenterActions } from "./provider";
import {
	buildWorkspaceCommandCenterContributions,
	type WorkspaceCommandAction,
	type WorkspaceCommandCenterSource,
} from "./workspace-contributions";
import { useTabsStore } from "@/stores/tabs-store";
import type { SplitNode } from "@/stores/workspace-layout-actions";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { copyToClipboard } from "@/utils/copy-to-clipboard";

function dispatchCommandAction(action: WorkspaceCommandAction): void {
	const store = useTabsStore.getState();
	switch (action.id) {
		case "workspace.session.new":
			store.openNew();
			return;
		case "workspace.tab.open":
			if (action.target === "files") store.openFiles();
			else store.openChanges();
			return;
		case "workspace.rail.mode":
			store.setExplorerMode(action.mode);
			return;
		case "workspace.rail.toggle":
			store.toggleRail();
			return;
		case "workspace.tab.prev":
			store.focusTabRelative(-1);
			return;
		case "workspace.tab.next":
			store.focusTabRelative(1);
			return;
		case "workspace.tab.close-current": {
			const active = store.activeTabId;
			if (active) store.closeTab(active);
			return;
		}
		case "workspace.tab.close-others":
			store.closeSiblingTabs("others");
			return;
		case "workspace.tab.close-left":
			store.closeSiblingTabs("left");
			return;
		case "workspace.tab.close-right":
			store.closeSiblingTabs("right");
			return;
		case "workspace.pane.split": {
			const active = store.activeTabId;
			if (active) store.splitPaneWithTab(active, action.position);
			return;
		}
		case "workspace.pane.close": {
			const id = store.layout.focusedPaneId;
			if (id && store.canClosePane(id)) store.closePane(id);
			return;
		}
		case "workspace.file.copy-path": {
			const path = useWorkspaceStore.getState().openFilePath;
			if (path != null && path.length > 0) void copyToClipboard(path);
			return;
		}
	}
}

export interface UseWorkspaceCommandCenterRegistrationInput {
	workspaceId: string | null;
}

export function useWorkspaceCommandCenterRegistration(
	input: UseWorkspaceCommandCenterRegistrationInput,
) {
	const { t } = useTranslation();

	const tabs = useTabsStore((s) => s.tabs);
	const activeTabId = useTabsStore((s) => s.activeTabId);
	const layout = useTabsStore((s) => s.layout);
	const openFilePath = useWorkspaceStore((s) => s.openFilePath);

	const source = useMemo<WorkspaceCommandCenterSource>(() => {
		const paneTabs = findTabIds(layout.root, layout.focusedPaneId) ?? [];
		const activeTab = tabs.find((tab) => tab.tabId === activeTabId) ?? null;
		return {
			labels: {
				section: t("commandCenter.section"),
				newSession: t("commandCenter.newSession"),
				openFiles: t("panels.files"),
				openChanges: t("panels.changes"),
				usage: t("workspace.rail.usage"),
				toggleRail: t("commandCenter.toggleRail"),
				previousTab: t("commandCenter.previousTab"),
				nextTab: t("commandCenter.nextTab"),
				closeCurrentTab: t("commandCenter.closeCurrentTab"),
				closeOthers: t("commandCenter.closeOthers"),
				closeLeft: t("commandCenter.closeLeft"),
				closeRight: t("commandCenter.closeRight"),
				splitRight: t("commandCenter.splitRight"),
				splitDown: t("commandCenter.splitDown"),
				closePane: t("commandCenter.closePane"),
				copyFilePath: t("commandCenter.copyFilePath"),
				openPanelInRail: (panel: string) =>
					t("commandCenter.openPanel", { panel }) ?? panel,
			},
			icons: {
				newSession: getCommandCenterIcon(Plus),
				files: getCommandCenterIcon(Files),
				changes: getCommandCenterIcon(PanelsTopLeft),
				usage: getCommandCenterIcon(Gauge),
				previousTab: getCommandCenterIcon(ChevronsLeftRight),
				nextTab: getCommandCenterIcon(ChevronsLeftRight),
				close: getCommandCenterIcon(X),
				split: getCommandCenterIcon(Columns2),
				closePane: getCommandCenterIcon(Columns2),
				copy: getCommandCenterIcon(Rows2),
				rail: getCommandCenterIcon(PanelsTopLeft),
			},
			activeTabKind: activeTab ? activeTab.target.kind : null,
			activeTabIndex: activeTab ? paneTabs.indexOf(activeTab.tabId) : -1,
			activeTabCount: paneTabs.length,
			openFilePath,
			routerCanSplit: countPanes(layout.root) > 1,
			dispatch: dispatchCommandAction,
		};
	}, [activeTabId, layout, openFilePath, t, tabs]);

	const actions = useMemo(
		() => buildWorkspaceCommandCenterContributions(source),
		[source],
	);

	useCommandCenterActions({
		sourceId: `workspace:${input.workspaceId ?? "none"}`,
		enabled: input.workspaceId != null,
		actions,
	});
}

function findTabIds(node: SplitNode, paneId: string | null): string[] | null {
	if (paneId == null) return null;
	if (node.kind === "pane") {
		return node.pane.id === paneId ? node.pane.tabIds : null;
	}
	for (const child of node.group.children) {
		const found = findTabIds(child, paneId);
		if (found) return found;
	}
	return null;
}

export function countPanes(node: SplitNode): number {
	if (node.kind === "pane") return 1;
	return node.group.children.reduce((sum, child) => sum + countPanes(child), 0);
}
