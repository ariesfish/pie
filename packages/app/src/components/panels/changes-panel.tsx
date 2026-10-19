// Changes panel (W3c-4): git.status + the ported diff-document engine as one
// pane-filling surface (the surface owns its scrolling; no outer ScrollView —
// flex:1 under a RN content-flow ScrollView cannot resolve a height, which
// stranded the canvas at viewport 0).
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Columns2, RefreshCw, WrapText } from "lucide-react-native";

import { useWorkspaceStore } from "@/stores/workspace-store";
import { useChangesPreferences, resolveDiffLayout } from "@/stores/changes-preferences-store";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { parseGitDiffFile } from "@/git/parsed-diff";
import { DiffDocument } from "@/git/diff-document";

export function ChangesPanel() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const status = useWorkspaceStore((s) => s.gitStatus);
	const loading = useWorkspaceStore((s) => s.gitLoading);
	const error = useWorkspaceStore((s) => s.gitError);
	const refresh = useWorkspaceStore((s) => s.refreshStatus);
	const diffPath = useWorkspaceStore((s) => s.diffPath);
	const gitFiles = useWorkspaceStore((s) => s.gitFiles);
	const loadDiff = useWorkspaceStore((s) => s.loadDiff);

	const [collapsedPaths, setCollapsedPaths] = useState<string[]>([]);
	const [focusRequestId, setFocusRequestId] = useState(0);

	// T-017: persisted display preferences + paseo's degradation rule
	// (split needs room: web, non-compact — else unified).
	const preferences = useChangesPreferences((s) => s.preferences);
	const setLayout = useChangesPreferences((s) => s.setLayout);
	const setWrapLines = useChangesPreferences((s) => s.setWrapLines);
	const isCompact = useIsCompactFormFactor();
	const canUseSplitLayout = isWeb && !isCompact;
	const effectiveLayout = resolveDiffLayout(preferences.layout, canUseSplitLayout);

	useEffect(() => {
		if (!status && !loading) void refresh();
	}, [status, loading, refresh]);

	// The explorer rail (and this panel's shared tab) request a specific diff
	// by setting diffPath — focus the document on it (expands + scrolls).
	useEffect(() => {
		if (diffPath) setFocusRequestId((n) => n + 1);
	}, [diffPath]);

	useEffect(() => {
		if (status && gitFiles.length === 0 && status.entries.length > 0) void loadDiff();
	}, [gitFiles.length, loadDiff, status]);

	const files = useMemo(() => gitFiles.map(parseGitDiffFile), [gitFiles]);

	if (error) {
		return (
			<View style={styles.root}>
				<Text style={styles.errorText}>{error}</Text>
			</View>
		);
	}

	if (status == null) {
		return (
			<View style={styles.center}>
				<ActivityIndicator />
			</View>
		);
	}

	return (
		<View style={styles.root}>
			<View style={styles.branchRow}>
				<Text style={styles.branchText} numberOfLines={1}>
					{status.branch ? `⑂ ${status.branch}` : t("changes.noBranch")}
					{status.upstream ? ` ↑${status.upstream.ahead} ↓${status.upstream.behind}` : ""}
					{status.entries.length > 0
						? ` · ${t("changes.fileCount", { count: status.entries.length })}`
						: ""}
				</Text>
				<Pressable hitSlop={8} onPress={() => void refresh()} style={styles.refreshBtn}>
					<RefreshCw
						size={13}
						color={loading ? theme.colors.accent : theme.colors.foregroundMuted}
						strokeWidth={1.75}
					/>
				</Pressable>
				{canUseSplitLayout ? (
					<Pressable
						hitSlop={8}
						onPress={() => setLayout(effectiveLayout === "unified" ? "split" : "unified")}
						style={styles.toggleBtn}
						accessibilityLabel={
							effectiveLayout === "unified" ? t("changes.layoutSplit") : t("changes.layoutUnified")
						}
						testID="changes-layout-toggle"
					>
						<Columns2
							size={13}
							color={effectiveLayout === "split" ? theme.colors.accent : theme.colors.foregroundMuted}
							strokeWidth={1.75}
						/>
						<Text
							style={[
								styles.toggleText,
								effectiveLayout === "split" && { color: theme.colors.accent },
							]}
						>
							{effectiveLayout === "unified" ? t("changes.layoutSplit") : t("changes.layoutUnified")}
						</Text>
					</Pressable>
				) : null}
				<Pressable
					hitSlop={8}
					onPress={() => setWrapLines(!preferences.wrapLines)}
					style={styles.toggleBtn}
					accessibilityLabel={t("changes.wrapToggle")}
					testID="changes-wrap-toggle"
				>
					<WrapText
						size={13}
						color={preferences.wrapLines ? theme.colors.accent : theme.colors.foregroundMuted}
						strokeWidth={1.75}
					/>
					<Text style={[styles.toggleText, preferences.wrapLines && { color: theme.colors.accent }]}>
						{t("changes.wrapToggle")}
				</Text>
				</Pressable>
			</View>
			{status.entries.length === 0 && (
				<View style={styles.center}>
					<Text style={styles.cleanText}>{t("changes.clean")}</Text>
				</View>
			)}
			{files.length > 0 && (
				<DiffDocument
					files={files}
					displayPreferences={{
						layout: effectiveLayout,
						wrapLines: preferences.wrapLines,
						codeFontSize: theme.fontSize.code,
						monoFontFamily: theme.fontFamily.mono,
					}}
					mode={{
						kind: "working",
						focusPath: diffPath ?? undefined,
						focusRequestId,
					}}
					collapseState={{
						paths: collapsedPaths,
						onChange: setCollapsedPaths,
					}}
				/>
			)}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, backgroundColor: theme.colors.surface0 },
	center: { flex: 1, alignItems: "center", justifyContent: "center" },
	branchRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	branchText: {
		flex: 1,
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
	},
	refreshBtn: { padding: 4 },
	toggleBtn: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1],
		paddingHorizontal: theme.spacing[1.5],
		paddingVertical: 4,
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface0,
	},
	toggleText: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
	},
	errorText: {
		color: theme.colors.statusDanger,
		fontSize: theme.fontSize.sm,
		padding: theme.spacing[3],
	},
	cleanText: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
	},
}));
