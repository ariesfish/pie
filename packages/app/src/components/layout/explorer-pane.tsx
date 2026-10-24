// Explorer rail (P2b-3 + wiring fix, desktop right column): lazy file tree
// (one fs.list per expanded directory) or a compact changes list. Pressing a
// file opens the shared files tab (viewer in the center); pressing a change
// opens the shared changes tab with that diff expanded.
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react-native";

import { statusKindOf, useWorkspaceStore } from "@/stores/workspace-store";
import {
	EXPLORER_ROOT_PATH,
	type ExplorerDirectory,
} from "@/file-explorer/types";
import { flattenExplorerTree } from "@/file-explorer/tree";
import { useResourcesStore } from "@/stores/resources-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useSessionListStore } from "@/stores/session-list-store";
import { RightRail } from "@/components/workspace/right-rail";
import { UsageRail } from "@/components/workspace/usage-rail";
import type { FsEntryInfo, GitStatusEntry, SkillInfo } from "@pie/protocol";

/** Timeline rail mode — the ported RightRail event stream (paseo's right
 * rail hosts the agent timeline; pie logs the protocol event stream). */
function ActivityRail() {
	return <RightRail />;
}

export function ExplorerPane({
	mode,
}: {
	/** Which rail content to show; the parent owns the mode (rail tabs). */
	mode: "files" | "changes" | "resources" | "usage" | "activity" | null;
}) {
	if (mode === "changes") return <ChangesList />;
	if (mode === "resources") return <ResourcesList />;
	if (mode === "usage") return <UsageRail />;
	if (mode === "activity") return <ActivityRail />;
	// files is the default mode
	return <FileTree />;
}

function ResourcesList() {
	const { theme } = useUnistyles();
	const packages = useResourcesStore((s) => s.packages);
	const skills = useResourcesStore((s) => s.skills);
	const sessionId = useConnectionStore((s) => s.sessionId);

	useEffect(() => {
		const ws = useWorkspaceStore.getState().workspaceId;
		if (ws) void useResourcesStore.getState().refreshPackages();
		if (sessionId) void useResourcesStore.getState().refreshSkills(sessionId);
		void useSessionListStore.getState().refresh();
	}, [sessionId]);

	return (
		<ScrollView style={styles.root} contentContainerStyle={styles.list}>
			<Text style={styles.head}>{tShim("resources.packages")}</Text>
			{packages.length === 0 ? (
				<Text style={styles.dim}>—</Text>
			) : (
				packages.map((p) => (
					<Text key={`${p.scope}:${p.source}`} style={styles.row} numberOfLines={1}>
						{p.scope === "project" ? "◆ " : "◇ "}
						{p.source}
					</Text>
				))
			)}
			<Text style={styles.head}>{tShim("resources.skills")}</Text>
			{skills.map((s: SkillInfo) => (
				<Text key={s.filePath} style={styles.row} numberOfLines={1}>
					{s.name}
				</Text>
			))}
			{skills.length === 0 && <Text style={styles.dim}>—</Text>}
		</ScrollView>
	);
}

function tShim(k: string): string {
	const m = k.split(".");
	return m[m.length - 1] ?? k;
}

function FileTree() {
	const { theme } = useUnistyles();
	const treeExpanded = useTabsStore((s) => s.treeExpanded);
	const toggleExpanded = useTabsStore((s) => s.toggleExpanded);
	const dirs = useWorkspaceStore((s) => s.dirs);
	const listDir = useWorkspaceStore((s) => s.listDir);
	const openPath = useWorkspaceStore((s) => s.openPath);

	// Lazy load the root on mount.
	useEffect(() => {
		const node = dirs[""];
		if (!node || (node.fetchedAt === 0 && !node.loading)) void listDir("");
	}, [dirs, listDir]);

	// [W3a] the ported explorer tree engine: pagination-free flatten of the
	// expanded dirs (depth-capped, no call-stack consumption), name-sorted,
	// dot-files hidden. Rewrites renderLevel's recursion wholesale.
	const directories = new Map<string, ExplorerDirectory>();
	for (const [path, node] of Object.entries(dirs)) {
		if (node) directories.set(path || EXPLORER_ROOT_PATH, { path: path || EXPLORER_ROOT_PATH, entries: node.entries });
	}
	const rows = flattenExplorerTree({
		directories,
		expandedPaths: new Set(
			Object.entries(treeExpanded)
				.filter(([, expanded]) => expanded)
				.map(([path]) => path),
		),
		sortOption: "name",
		showHiddenFiles: false,
	});

	return (
		<ScrollView style={styles.root} contentContainerStyle={styles.list}>
			{rows.map((row) => (
				<TreeRow
					key={row.entry.path}
					entry={row.entry}
					depth={row.depth}
					expanded={!!treeExpanded[row.entry.path]}
					children_={null}
					onPress={() => {
						if (row.entry.kind === "dir") {
							toggleExpanded(row.entry.path);
							const child = dirs[row.entry.path];
							if (!child || (child.fetchedAt === 0 && !child.loading)) void listDir(row.entry.path);
						} else {
							// Open the shared files tab; the viewer renders from
							// the workspace store's openFile (tab = data).
							useTabsStore.getState().openFiles();
							void openPath(row.entry.path);
						}
					}}
					accent={theme.colors.accentBright}
					fgMuted={theme.colors.foregroundExtraMuted}
				/>
			))}
		</ScrollView>
	);
}

function TreeRow({
	entry,
	depth,
	expanded,
	children_,
	onPress,
	accent,
	fgMuted,
}: {
	entry: FsEntryInfo;
	depth: number;
	expanded: boolean;
	children_: React.ReactNode;
	onPress: () => void;
	accent: string;
	fgMuted: string;
}) {
	return (
		<View>
			<Pressable
				style={[styles.row, { paddingLeft: 8 + depth * 12 }]}
				onPress={onPress}
			>
				{entry.kind === "dir" ? (
					expanded ? (
						<ChevronDown size={13} color={fgMuted} strokeWidth={1.5} />
					) : (
						<ChevronRight size={13} color={fgMuted} strokeWidth={1.5} />
					)
				) : (
					<Text style={styles.rowSpacer}> </Text>
				)}
				{entry.kind === "dir" ? (
					<Folder size={14} color={accent} strokeWidth={1.5} />
				) : (
					<FileText size={14} color={fgMuted} strokeWidth={1.5} />
				)}
				<Text style={styles.rowText} numberOfLines={1}>
					{entry.name}
				</Text>
			</Pressable>
			{children_}
		</View>
	);
}

function ChangesList() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const status = useWorkspaceStore((s) => s.gitStatus);
	const loading = useWorkspaceStore((s) => s.gitLoading);
	const refresh = useWorkspaceStore((s) => s.refreshStatus);
	const diffPath = useWorkspaceStore((s) => s.diffPath);

	useEffect(() => {
		if (!status && !loading) void refresh();
	}, [status, loading, refresh]);

	// Auto-expand the diff the explorer was asked to show (diffPath is set by
	// callers; ChangesPanel follows it — see its effect).
	const activePath = diffPath;

	const changeColor = (entry: GitStatusEntry): string => {
		const kind = statusKindOf(entry);
		if (kind === "added") return theme.colors.statusSuccess;
		if (kind === "deleted") return theme.colors.statusDanger;
		if (kind === "renamed" || kind === "copied") return theme.colors.statusMerged;
		if (kind === "untracked") return theme.colors.statusWarning;
		return theme.colors.accentBright;
	};

	return (
		<ScrollView style={styles.root} contentContainerStyle={styles.list}>
			{!status ? (
				<Text style={styles.empty}>{loading ? t("common.connecting") : t("changes.clean")}</Text>
			) : (
				status.entries.map((entry) => {
					const on = entry.path === activePath;
					return (
						<Pressable
							key={entry.path}
							style={({ pressed }) => [styles.row, on && styles.rowOn, pressed && styles.rowPressed]}
							onPress={() => {
								useTabsStore.getState().openChanges();
								void useWorkspaceStore.getState().loadDiff(entry.path);
							}}
						>
							<View style={[styles.dot, { backgroundColor: changeColor(entry) }]} />
							<Text style={styles.rowText} numberOfLines={1}>
								{entry.origPath ? `${entry.origPath} → ${entry.path}` : entry.path}
							</Text>
						</Pressable>
					);
				})
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, backgroundColor: "transparent" },
	list: { paddingVertical: theme.spacing[2], gap: 0 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		paddingVertical: theme.spacing[1],
		paddingRight: theme.spacing[2],
		borderRadius: theme.borderRadius.sm,
	},
	rowOn: { backgroundColor: theme.colors.surface2 },
	rowPressed: { opacity: 0.7 },
	rowSpacer: { width: 13 },
	rowText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm, flexShrink: 1 },
	rowMeta: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	dot: { width: 7, height: 7, borderRadius: theme.borderRadius.sm, marginLeft: 13 + 8 },
	empty: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, padding: theme.spacing[3] },
	head: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.semibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
		paddingHorizontal: theme.spacing[2],
		paddingTop: theme.spacing[2],
		paddingBottom: theme.spacing[0.5],
	},
	dim: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		paddingHorizontal: theme.spacing[2],
	},
}));
