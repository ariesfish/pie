// Changes panel (P2b-1): git.status listing + on-demand per-file diff via
// git.diff (includeUntracked). Refresh invalidates come from
// workspace.fs.changed (workspace store).
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	RefreshControl,
	ScrollView,
	Text,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react-native";

import { DiffView } from "@/components/panels/diff-view";
import { statusKindOf, useWorkspaceStore } from "@/stores/workspace-store";
import type { GitStatusEntry } from "@pie/protocol";

const KIND_COLORS: Record<string, string> = {
	added: "statusSuccess",
	deleted: "statusDanger",
	renamed: "statusMerged",
	copied: "statusMerged",
	untracked: "statusWarning",
	modified: "accentBright",
};

export function ChangesPanel() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const status = useWorkspaceStore((s) => s.gitStatus);
	const loading = useWorkspaceStore((s) => s.gitLoading);
	const error = useWorkspaceStore((s) => s.gitError);
	const refresh = useWorkspaceStore((s) => s.refreshStatus);
	const diffPath = useWorkspaceStore((s) => s.diffPath);
	const diffLoading = useWorkspaceStore((s) => s.diffLoading);
	const gitFiles = useWorkspaceStore((s) => s.gitFiles);
	const loadDiff = useWorkspaceStore((s) => s.loadDiff);

	const [expanded, setExpanded] = useState<string | null>(null);

	useEffect(() => {
		if (!status && !loading) void refresh();
	}, [status, loading, refresh]);

	const openDiff = gitFiles.find((f) => f.path === expanded && expanded === diffPath);

	return (
		<ScrollView
			style={styles.root}
			contentContainerStyle={styles.list}
			refreshControl={
				<RefreshControl
					tintColor={theme.colors.foregroundMuted}
					refreshing={loading}
					onRefresh={() => void refresh()}
				/>
			}
		>
			{error ? (
				<Text style={styles.errorText}>{error}</Text>
			) : status == null ? (
				<View style={styles.center}>
					<ActivityIndicator />
				</View>
			) : (
				<>
					<View style={styles.branchRow}>
						<Text style={styles.branchText}>
							{status.branch ? `⑂ ${status.branch}` : t("changes.noBranch")}
							{status.upstream ? ` ↑${status.upstream.ahead} ↓${status.upstream.behind}` : ""}
						</Text>
						<Text style={styles.countText}>
							{t("changes.fileCount", { count: status.entries.length })}
						</Text>
					</View>
					{status.entries.map((entry: GitStatusEntry) => {
						const kind = statusKindOf(entry);
						const isOpen = expanded === entry.path;
						return (
							<View key={entry.path} style={styles.entryCard}>
								<Pressable
									style={styles.entryRow}
									onPress={() => {
										if (isOpen) {
											setExpanded(null);
										} else {
											setExpanded(entry.path);
											void loadDiff(entry.path).then(() => setExpanded(entry.path));
										}
									}}
								>
									{isOpen ? (
										<ChevronDown size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
									) : (
										<ChevronRight size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
									)}
									<Text style={styles.pathText} numberOfLines={1}>
										{entry.origPath ? `${entry.origPath} → ${entry.path}` : entry.path}
									</Text>
									<View style={[styles.kindBadge, { backgroundColor: theme.colors[KIND_COLORS[kind] as keyof typeof theme.colors] as string, opacity: 0.25 }]} />
									<Text style={[styles.kindText, { color: theme.colors[KIND_COLORS[kind] as keyof typeof theme.colors] as string }]}>
										{kind}
									</Text>
								</Pressable>
								{isOpen && (
									<View style={styles.diffWrap}>
										{diffLoading && !openDiff ? (
											<ActivityIndicator style={styles.center} />
										) : openDiff ? (
											<DiffView patch={openDiff.patch} binary={openDiff.binary} />
										) : (
											<Text style={styles.emptyDiff}>{t("changes.noDiff")}</Text>
										)}
									</View>
								)}
							</View>
						);
					})}
					{status.entries.length === 0 && (
						<Text style={styles.cleanText}>{t("changes.clean")}</Text>
					)}
				</>
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, backgroundColor: theme.colors.surface0 },
	list: { padding: theme.spacing[2], gap: theme.spacing[1.5] },
	center: { padding: theme.spacing[4], alignSelf: "center" },
	branchRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: theme.spacing[2],
		paddingBottom: theme.spacing[1],
	},
	branchText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm, fontWeight: "600" },
	countText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	entryCard: {
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		overflow: "hidden",
	},
	entryRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[2] + 2,
		paddingVertical: theme.spacing[2],
	},
	pathText: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	kindBadge: { width: 8, height: 8, borderRadius: theme.borderRadius.full },
	kindText: { fontSize: theme.fontSize.sm, textTransform: "capitalize" },
	diffWrap: { borderTopWidth: theme.borderWidth[1], borderTopColor: theme.colors.border },
	emptyDiff: { padding: theme.spacing[3], color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	errorText: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm, padding: theme.spacing[3] },
	cleanText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, alignSelf: "center", padding: theme.spacing[4] },
}));
