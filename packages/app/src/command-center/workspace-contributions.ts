// Ported from getpaseo/paseo (Apache-2.0) — command-center/workspace-contributions.ts.
// [pie] broad trim: paseo's git write actions, label catalogs, pinning,
// browser/PR tabs, agent/terminal copy actions and keyboard-dispatcher
// targets have no pie equivalent. What remains maps pie's real surfaces:
// sessions, tabs (files/changes), rail modes (files/changes/usage),
// pane splits and the open-file path. Actions are pie's own union —
// paseo routes through its keyboard-action dispatcher, which W4 ports.
import type { CommandCenterContribution, CommandCenterIcon } from "./contributions";

/** Pie workspace commands (dispatched by workspace-registration). */
export type WorkspaceCommandAction =
	| { id: "workspace.session.new" }
	| { id: "workspace.tab.open"; target: "files" | "changes" }
	| { id: "workspace.rail.mode"; mode: "files" | "changes" | "usage" }
	| { id: "workspace.rail.toggle" }
	| { id: "workspace.sidebar.toggle" }
	| { id: "workspace.tab.prev" }
	| { id: "workspace.tab.next" }
	| { id: "workspace.tab.close-current" }
	| { id: "workspace.tab.close-others" }
	| { id: "workspace.tab.close-left" }
	| { id: "workspace.tab.close-right" }
	| { id: "workspace.pane.split"; position: "right" | "bottom" }
	| { id: "workspace.pane.close" }
	| { id: "workspace.file.copy-path" };

export interface WorkspaceCommandCenterLabels {
	section: string;
	newSession: string;
	openFiles: string;
	openChanges: string;
	usage: string;
	toggleRail: string;
	toggleSidebar: string;
	previousTab: string;
	nextTab: string;
	closeCurrentTab: string;
	closeOthers: string;
	closeLeft: string;
	closeRight: string;
	splitRight: string;
	splitDown: string;
	closePane: string;
	copyFilePath: string;
	openPanelInRail(panel: string): string;
}

export interface WorkspaceCommandCenterIcons {
	newSession?: CommandCenterIcon;
	files?: CommandCenterIcon;
	changes?: CommandCenterIcon;
	usage?: CommandCenterIcon;
	previousTab?: CommandCenterIcon;
	nextTab?: CommandCenterIcon;
	close?: CommandCenterIcon;
	split?: CommandCenterIcon;
	closePane?: CommandCenterIcon;
	copy?: CommandCenterIcon;
	rail?: CommandCenterIcon;
}

export interface WorkspaceCommandCenterSource {
	labels: WorkspaceCommandCenterLabels;
	icons: WorkspaceCommandCenterIcons;
	/** Tab the active pane shows (may be null on an empty pane). */
	activeTabKind: string | null;
	activeTabIndex: number;
	activeTabCount: number;
	/** Path of the file open in the files panel, for the copy-path action. */
	openFilePath: string | null;
	/** More than one pane exists (split view is live). */
	routerCanSplit: boolean;
	dispatch(action: WorkspaceCommandAction): void;
}

function alwaysAction(input: {
	source: WorkspaceCommandCenterSource;
	id: string;
	rank: number;
	title: string;
	keywords: readonly string[];
	icon?: CommandCenterIcon;
	action: WorkspaceCommandAction;
}): CommandCenterContribution {
	return {
		...queryActionBase(input),
		visibility: "always",
	};
}

function queryActionBase(input: {
	source: WorkspaceCommandCenterSource;
	id: string;
	rank: number;
	title: string;
	keywords: readonly string[];
	icon?: CommandCenterIcon;
	action: WorkspaceCommandAction;
}): CommandCenterContribution {
	return {
		id: input.id,
		group: "workspace",
		groupRank: -1,
		rank: input.rank,
		keywords: input.keywords,
		visibility: "always",
		run: () => input.source.dispatch(input.action),
		presentation: {
			kind: "action",
			title: input.title,
			sectionTitle: input.source.labels.section,
			icon: input.icon,
		},
	};
}

function queryAction(input: {
	source: WorkspaceCommandCenterSource;
	id: string;
	rank: number;
	title: string;
	keywords: readonly string[];
	icon?: CommandCenterIcon;
	action: WorkspaceCommandAction;
}): CommandCenterContribution {
	return { ...queryActionBase(input), visibility: "query" };
}

export function buildWorkspaceCommandCenterContributions(
	source: WorkspaceCommandCenterSource,
): CommandCenterContribution[] {
	const contributions: CommandCenterContribution[] = [];
	const { icons, labels } = source;

	contributions.push(
		alwaysAction({
			source,
			id: "session:new",
			rank: 1,
			title: labels.newSession,
			keywords: ["new", "session", "chat"],
			icon: icons.newSession,
			action: { id: "workspace.session.new" },
		}),
	);

	// Panel/rail surfaces.
	contributions.push(
		alwaysAction({
			source,
			id: "tab:open:files",
			rank: 2,
			title: labels.openPanelInRail(labels.openFiles),
			keywords: ["open", "files", "explorer", "tab", "rail"],
			icon: icons.files,
			action: { id: "workspace.tab.open", target: "files" },
		}),
		alwaysAction({
			source,
			id: "tab:open:changes",
			rank: 3,
			title: labels.openPanelInRail(labels.openChanges),
			keywords: ["open", "changes", "git", "diff", "tab", "rail"],
			icon: icons.changes,
			action: { id: "workspace.tab.open", target: "changes" },
		}),
		alwaysAction({
			source,
			id: "rail:mode:usage",
			rank: 4,
			title: labels.openPanelInRail(labels.usage),
			keywords: ["open", "usage", "tokens", "stats", "rail"],
			icon: icons.usage,
			action: { id: "workspace.rail.mode", mode: "usage" },
		}),
		queryAction({
			source,
			id: "view:toggle-rail",
			rank: 5,
			title: labels.toggleRail,
			keywords: ["rail", "explorer", "collapse"],
			icon: icons.rail,
			action: { id: "workspace.rail.toggle" },
		}),
		queryAction({
			source,
			id: "view:toggle-sidebar",
			rank: 5,
			title: labels.toggleSidebar,
			keywords: ["toggle", "sidebar", "sessions", "workspaces", "collapse"],
			icon: icons.rail,
			action: { id: "workspace.sidebar.toggle" },
		}),
	);

	// Tab cycling/closing (only with tabs to act on).
	if (source.activeTabCount > 0) {
		contributions.push(
			queryAction({
				source,
				id: "tab:previous",
				rank: 6,
				title: labels.previousTab,
				keywords: ["previous", "tab", "left"],
				icon: icons.previousTab,
				action: { id: "workspace.tab.prev" },
			}),
			queryAction({
				source,
				id: "tab:next",
				rank: 7,
				title: labels.nextTab,
				keywords: ["next", "tab", "right"],
				icon: icons.nextTab,
				action: { id: "workspace.tab.next" },
			}),
			queryAction({
				source,
				id: "tab:close-current",
				rank: 8,
				title: labels.closeCurrentTab,
				keywords: ["close", "tab", "current"],
				icon: icons.close,
				action: { id: "workspace.tab.close-current" },
			}),
		);
	}
	if (source.activeTabCount > 1) {
		contributions.push(
			queryAction({
				source,
				id: "tab:close-others",
				rank: 9,
				title: labels.closeOthers,
				keywords: ["close", "tabs", "others"],
				icon: icons.close,
				action: { id: "workspace.tab.close-others" },
			}),
			queryAction({
				source,
				id: "tab:close-left",
				rank: 10,
				title: labels.closeLeft,
				keywords: ["close", "tabs", "left"],
				icon: icons.close,
				action: { id: "workspace.tab.close-left" },
			}),
			queryAction({
				source,
				id: "tab:close-right",
				rank: 11,
				title: labels.closeRight,
				keywords: ["close", "tabs", "right"],
				icon: icons.close,
				action: { id: "workspace.tab.close-right" },
			}),
		);
	}

	// Pane operations.
	if (source.activeTabCount > 0) {
		contributions.push(
			queryAction({
				source,
				id: "pane:split-right",
				rank: 12,
				title: labels.splitRight,
				keywords: ["split", "pane", "right", "column"],
				icon: icons.split,
				action: { id: "workspace.pane.split", position: "right" },
			}),
			queryAction({
				source,
				id: "pane:split-down",
				rank: 13,
				title: labels.splitDown,
				keywords: ["split", "pane", "down", "row"],
				icon: icons.split,
				action: { id: "workspace.pane.split", position: "bottom" },
			}),
		);
	}
	if (source.routerCanSplit) {
		contributions.push(
			queryAction({
				source,
				id: "pane:close",
				rank: 14,
				title: labels.closePane,
				keywords: ["close", "pane", "split"],
				icon: icons.closePane,
				action: { id: "workspace.pane.close" },
			}),
		);
	}

	// Open file affordances.
	if (source.openFilePath) {
		contributions.push(
			queryAction({
				source,
				id: "file:copy-path",
				rank: 15,
				title: labels.copyFilePath,
				keywords: ["copy", "path", "file"],
				icon: icons.copy,
				action: { id: "workspace.file.copy-path" },
			}),
		);
	}

	return contributions;
}
