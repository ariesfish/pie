// Ported from getpaseo/paseo (Apache-2.0) — screens/workspace/workspace-screen.tsx
// (Pie subset: desktop row = center column (workspace header, session tabs
// row, panel content) + right explorer rail (files / changes / resources /
// activity). Files & changes open as shared workspace tabs in the center so
// the explorer rail stays a browser, not a viewer.)
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Activity, FileText, FolderOpen, GitCompare, Plus, Package, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { ExplorerPane } from "@/components/layout/explorer-pane";
import { ChatList } from "@/components/chat/chat-list";
import { Composer } from "@/components/chat/composer";
import { NewSessionPanel } from "@/components/layout/new-session-panel";
import { FilesPanel } from "@/components/panels/files-panel";
import { ChangesPanel } from "@/components/panels/changes-panel";
import { MobileSessionsButton } from "@/components/layout/app-container";
import { useConnectionStore } from "@/stores/connection-store";
import { useSessionListStore, sessionTitle } from "@/stores/session-list-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useIsCompactFormFactor } from "@/constants/layout";

export default function WorkspaceScreen() {
	const params = useLocalSearchParams<{ workspaceId?: string }>();
	const routeWorkspaceId =
		typeof params.workspaceId === "string" ? decodeURIComponent(params.workspaceId) : null;
	const isCompact = useIsCompactFormFactor();

	// The route is the source of truth for the active workspace (Paseo binds
	// the workspace to the route, so history/back navigates workspaces).
	useEffect(() => {
		const store = useWorkspaceStore.getState();
		if (routeWorkspaceId && routeWorkspaceId !== store.workspaceId) {
			store.setWorkspace(routeWorkspaceId);
			void store.ensureWatch();
			void store.listDir("");
			void useSessionListStore.getState().refresh();
		}
	}, [routeWorkspaceId]);

	const workspaceName = (routeWorkspaceId ?? "Pie").split("/").filter(Boolean).pop() ?? "Pie";
	const { theme } = useUnistyles();
	const { t } = useTranslation();

	const tabs = useTabsStore((s) => s.tabs);
	const activeTabId = useTabsStore((s) => s.activeTabId);
	const explorerMode = useTabsStore((s) => s.explorerMode);
	const setExplorerMode = useTabsStore((s) => s.setExplorerMode);
	const toggleRail = useTabsStore((s) => s.toggleRail);
	const error = useConnectionStore((s) => s.error);

	const active = tabs.find((x) => x.id === activeTabId) ?? tabs[0];

	/** Tab switches route through connection-store (snapshot resync). */
	useEffect(() => {
		if (active?.kind === "session" && active.sessionId) {
			const path =
				useSessionListStore.getState().sessions.find((s) => s.sessionId === active.sessionId)?.path;
			void useConnectionStore.getState().switchSession(active.sessionId, path || undefined);
		}
	}, [active?.kind, active?.sessionId]);

	const railVisible = !isCompact && explorerMode != null;

	return (
		<View style={styles.desktopRow}>
			<View style={styles.centerColumn}>
				{/* workspace header (paseo: project row — name + branch slot) */}
				<View style={styles.headerRow}>
					<Text style={styles.workspace} numberOfLines={1}>
						{workspaceName}
					</Text>
					<View style={styles.headerActions}>
						{/* compact: open files/changes tabs (no room for a rail) */}
						{isCompact ? (
							<>
									<MobileSessionsButton />
								<HeaderIcon
									label={t("panels.files")}
									onPress={() => useTabsStore.getState().openFiles()}
								>
									<FolderOpen size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
								</HeaderIcon>
								<HeaderIcon
									label={t("panels.changes")}
									onPress={() => useTabsStore.getState().openChanges()}
								>
									<GitCompare size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
								</HeaderIcon>
							</>
						) : null}
						<HeaderIcon
							label={t("panels.explorer")}
							onPress={() => {
								if (isCompact) useTabsStore.getState().toggleMobileExplorer();
								else toggleRail();
							}}
							active={railVisible}
						>
							<Activity
								size={14}
								color={railVisible ? theme.colors.accentForeground : theme.colors.foregroundMuted}
								strokeWidth={1.5}
							/>
						</HeaderIcon>
					</View>
				</View>

				{/* session tabs row — sessions + shared files/changes tabs */}
				<SessionTabsRow />

				{error ? (
					<View style={styles.errorBar}>
						<Text style={styles.errorText} numberOfLines={1}>
							{error}
						</Text>
					</View>
				) : null}

				{/* center content: chat | new-session | files | changes */}
				<View style={styles.centerContent}>
					{active?.kind === "new" ? (
						<NewSessionPanel />
					) : active?.kind === "session" ? (
						<>
							<ChatList />
							<Composer />
						</>
					) : active?.kind === "files" ? (
						<FilesPanel />
					) : active?.kind === "changes" ? (
						<ChangesPanel />
					) : null}
				</View>
			</View>

			{/* right explorer rail (desktop): files tree / changes / resources / activity */}
			{railVisible ? (
				<View style={styles.rail}>
					<View style={styles.railTabs}>
						<RailTab
							onPress={() => setExplorerMode("files")}
							active={explorerMode === "files"}
						>
							<FolderOpen
								size={14}
								color={explorerMode === "files" ? theme.colors.accentForeground : theme.colors.foregroundMuted}
								strokeWidth={1.5}
							/>
						</RailTab>
						<RailTab
							onPress={() => setExplorerMode("changes")}
							active={explorerMode === "changes"}
						>
							<GitCompare
								size={14}
								color={explorerMode === "changes" ? theme.colors.accentForeground : theme.colors.foregroundMuted}
								strokeWidth={1.5}
							/>
						</RailTab>
						<RailTab
							onPress={() => setExplorerMode("resources")}
							active={explorerMode === "resources"}
						>
							<Package
								size={14}
								color={explorerMode === "resources" ? theme.colors.accentForeground : theme.colors.foregroundMuted}
								strokeWidth={1.5}
							/>
						</RailTab>
						<View style={styles.railTabSpacer} />
						<RailTab onPress={() => setExplorerMode(null)} active={false}>
							<X size={14} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
						</RailTab>
					</View>
					<ExplorerPane mode={explorerMode} />
				</View>
			) : null}
		</View>
	);
}

function HeaderIcon({
	children,
	onPress,
	active,
	label,
}: {
	children: React.ReactNode;
	onPress: () => void;
	active?: boolean;
	label: string;
}) {
	const { theme } = useUnistyles();
	return (
		<Pressable
			accessibilityLabel={label}
			hitSlop={6}
			onPress={onPress}
			style={({ pressed }) => [
				styles.headerIcon,
				active && styles.headerIconOn,
				pressed && { opacity: 0.7 },
			]}
		>
			{children}
		</Pressable>
	);
}

function RailTab({
	children,
	onPress,
	active,
}: {
	children: React.ReactNode;
	onPress: () => void;
	active?: boolean;
}) {
	const { theme } = useUnistyles();
	return (
		<Pressable
			hitSlop={4}
			onPress={onPress}
			style={({ pressed }) => [
				styles.railTab,
				active && { backgroundColor: theme.colors.surface2 },
				active && { borderBottomColor: theme.colors.accent },
				pressed && { opacity: 0.7 },
			]}
		>
			{children}
		</Pressable>
	);
}

/**
 * Session tabs row — one tab per session, the shared files/changes tabs, and
 * the sticky new-session tab at the end ("a tab IS a session"; files and
 * changes are workspace-global singletons).
 */
function SessionTabsRow() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const tabs = useTabsStore((s) => s.tabs);
	const activeTabId = useTabsStore((s) => s.activeTabId);
	const setActive = useTabsStore((s) => s.setActive);
	const closeTab = useTabsStore((s) => s.closeTab);

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			style={styles.tabsScroll}
			contentContainerStyle={styles.tabsRow}
		>
			{tabs.map((tab) => {
				const on = tab.id === activeTabId;
				const session =
					tab.kind === "session"
						? useSessionListStore
								.getState()
								.sessions.find((s) => s.sessionId === tab.sessionId)
						: undefined;
				const openFile = useWorkspaceStore.getState().openFilePath;
				const title =
					tab.kind === "new"
						? t("agentList.newSession")
						: tab.kind === "files"
							? openFile
								? (openFile.split("/").pop() ?? t("panels.files"))
								: t("panels.files")
							: tab.kind === "changes"
								? t("panels.changes")
								: sessionTitle(session ?? ({ firstMessage: tab.sessionId ?? "" } as never));
				return (
					<Pressable key={tab.id} style={[styles.tab, on && styles.tabOn]} onPress={() => setActive(tab.id)}>
						{tab.kind === "files" ? (
							<FileText size={11} color={on ? theme.colors.foreground : theme.colors.foregroundMuted} strokeWidth={1.75} />
						) : null}
						<Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
							{title}
						</Text>
						{tab.kind !== "new" ? (
							<Pressable style={styles.tabClose} onPress={() => closeTab(tab.id)} hitSlop={4}>
								<X size={11} color={on ? theme.colors.foreground : theme.colors.foregroundExtraMuted} strokeWidth={1.75} />
							</Pressable>
						) : (
							<Plus size={11} color={on ? theme.colors.foreground : theme.colors.foregroundExtraMuted} strokeWidth={1.75} />
						)}
					</Pressable>
				);
			})}
		</ScrollView>
	);
}

const styles = StyleSheet.create((theme) => ({
	desktopRow: { flex: 1, flexDirection: "row", backgroundColor: theme.colors.surface0 },
	centerColumn: { flex: 1, minWidth: 0 },
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	workspace: { color: theme.colors.foreground, fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.semibold },
	headerActions: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
	headerIcon: {
		width: 28,
		height: 28,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
	},
	headerIconOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
	rail: {
		width: 256,
		borderLeftWidth: theme.borderWidth[1],
		borderLeftColor: theme.colors.border,
		backgroundColor: theme.colors.surfaceSidebar,
	},
	railTabs: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		paddingHorizontal: theme.spacing[1],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	railTab: {
		flex: 1,
		alignItems: "center",
		paddingVertical: theme.spacing[2],
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
		borderRadius: theme.borderRadius.md,
	},
	railTabSpacer: { width: theme.spacing[1] },
	tabsScroll: { flexGrow: 0, flexShrink: 0 },
	tabsRow: { paddingHorizontal: theme.spacing[2], paddingVertical: theme.spacing[1], gap: theme.spacing[1] },
	tab: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 5,
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: "transparent",
		maxWidth: 200,
	},
	tabOn: { backgroundColor: theme.colors.surface2, borderColor: theme.colors.border },
	tabText: { color: theme.colors.foregroundMuted, fontSize: 11, maxWidth: 150 },
	tabTextOn: { color: theme.colors.foreground },
	tabClose: { padding: 1 },
	errorBar: {
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[1],
		backgroundColor: theme.colors.surface1,
	},
	errorText: { color: theme.colors.statusDanger, fontSize: 10 },
	centerContent: { flex: 1 },
}));
