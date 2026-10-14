// Ported from getpaseo/paseo (Apache-2.0) — screens/workspace/workspace-screen.tsx
// (Pie W1c-3: desktop = resizable explorer rail + split-tree container;
// compact = single focused pane. Panels render through the registry inside
// RetainedPanels, so streaming chats keep their state across splits.)
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Activity, FolderOpen, Gauge, GitCompare, Package, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ToastProvider } from "@/contexts/toast-context";
import { DiffDocumentWorkspaceCacheProvider } from "@/git/diff-document/workspace-cache";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import "@/panels/register-panels";
import { ExplorerPane } from "@/components/layout/explorer-pane";
import { MobileSessionsButton } from "@/components/layout/app-container";
import { RailResizeHandle } from "@/components/layout/rail-resize-handle";
import { SplitContainer, SingleFocusedPane } from "@/components/layout/split-container";
import { useConnectionStore } from "@/stores/connection-store";
import { useSessionListStore } from "@/stores/session-list-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useIsCompactFormFactor } from "@/constants/layout";

export default function WorkspaceScreen() {
	const { t } = useTranslation();
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
			// Restore the workspace's split layout / rail (deterministic tab ids
			// make the record stable across restarts).
			useTabsStore.getState().hydrate(routeWorkspaceId);
			void store.ensureWatch();
			void store.listDir("");
			void useSessionListStore.getState().refresh();
		}
	}, [routeWorkspaceId]);

	const workspaceName = (routeWorkspaceId ?? "Pie").split("/").filter(Boolean).pop() ?? "Pie";
	const { theme } = useUnistyles();
	const explorerMode = useTabsStore((s) => s.explorerMode);
	const setExplorerMode = useTabsStore((s) => s.setExplorerMode);
	const railWidth = useTabsStore((s) => s.railWidth);
	const setRailWidth = useTabsStore((s) => s.setRailWidth);
	const error = useConnectionStore((s) => s.error);

	// Session-tab switches route through connection-store (snapshot resync) —
	// the active tab is whatever the focused pane is focused on, tree or not.
	const activeTabId = useTabsStore((s) => s.activeTabId);
	const tabs = useTabsStore((s) => s.tabs);
	useEffect(() => {
		const active = tabs.find((t) => t.tabId === activeTabId);
		if (active?.target.kind === "session") {
			const sessionId = active.target.sessionId;
			const path =
				useSessionListStore.getState().sessions.find((s) => s.sessionId === sessionId)?.path;
			void useConnectionStore.getState().switchSession(sessionId, path || undefined);
		}
	}, [activeTabId, tabs]);

	const railVisible = !isCompact && explorerMode != null;

	return (
		<ToastProvider>
		<DiffDocumentWorkspaceCacheProvider>
		<View style={styles.desktopRow}>
			<View style={styles.centerColumn}>
				{/* workspace header (paseo: project row — name + actions) */}
				<WorkspaceHeaderRow
					workspaceName={workspaceName}
					isCompact={isCompact}
					railVisible={railVisible}
				/>

				{error ? (
					<View style={styles.errorBar}>
						<Text style={styles.errorText} numberOfLines={1}>
							{error}
						</Text>
					</View>
				) : null}

				{/* split tree (desktop) / focused pane (compact) */}
				{isCompact ? <SingleFocusedPane /> : <SplitContainer />}
			</View>

			{/* right explorer rail (desktop): files tree / changes / resources / activity */}
			{railVisible ? (
				<View style={[styles.rail, { width: railWidth }]}>
					<RailResizeHandle width={railWidth} onResize={setRailWidth} />
					<View style={styles.railInner}>
					<View style={styles.railTabs}>
						<RailMode
						on={explorerMode === "files"}
						onPress={() => setExplorerMode("files")}
						label={t("workspace.rail.files")}
					>
							<FolderOpen
								size={14}
								color={explorerMode === "files" ? theme.colors.accentForeground : theme.colors.foregroundMuted}
								strokeWidth={1.5}
							/>
						</RailMode>
						<RailMode
						on={explorerMode === "changes"}
						onPress={() => setExplorerMode("changes")}
						label={t("workspace.rail.changes")}
					>
							<GitCompare
								size={14}
								color={explorerMode === "changes" ? theme.colors.accentForeground : theme.colors.foregroundMuted}
								strokeWidth={1.5}
							/>
						</RailMode>
						<RailMode
							on={explorerMode === "resources"}
							onPress={() => setExplorerMode("resources")}
							label={t("workspace.rail.resources")}
						>
							<Package
								size={14}
								color={explorerMode === "resources" ? theme.colors.accentForeground : theme.colors.foregroundMuted}
								strokeWidth={1.5}
							/>
						</RailMode>
						<RailMode
							on={explorerMode === "usage"}
							onPress={() => setExplorerMode("usage")}
							label={t("workspace.rail.usage")}
						>
							<Gauge
								size={14}
								color={explorerMode === "usage" ? theme.colors.accentForeground : theme.colors.foregroundMuted}
								strokeWidth={1.5}
							/>
							<Package
								size={14}
								color={explorerMode === "resources" ? theme.colors.accentForeground : theme.colors.foregroundMuted}
								strokeWidth={1.5}
							/>
						</RailMode>
						<View style={styles.railTabSpacer} />
						<RailMode onPress={() => setExplorerMode(null)} label={t("workspace.rail.close")}>
							<X size={14} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
						</RailMode>
					</View>
					<ExplorerPane mode={explorerMode} />
					</View>
				</View>
			) : null}
		</View>
		</DiffDocumentWorkspaceCacheProvider>
		</ToastProvider>
	);
}



function WorkspaceHeaderRow({
	workspaceName,
	isCompact,
	railVisible,
}: {
	workspaceName: string;
	isCompact: boolean;
	railVisible: boolean;
}) {
	const { theme } = useUnistyles();
	const { t } = useTranslation();
	const toggleRail = useTabsStore((s) => s.toggleRail);

	return (
		<View style={styles.headerRow}>
			<Text style={styles.workspace} numberOfLines={1}>
				{workspaceName}
			</Text>
			<View style={styles.headerActions}>
				{isCompact ? <MobileSessionsButton /> : null}
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
						color={
							railVisible ? theme.colors.accentForeground : theme.colors.foregroundMuted
						}
						strokeWidth={1.5}
					/>
				</HeaderIcon>
			</View>
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

function RailMode({
	children,
	onPress,
	on,
	label,
}: {
	children: React.ReactNode;
	onPress: () => void;
	on?: boolean;
	label: string;
}) {
	const { theme } = useUnistyles();
	return (
		<Pressable
			hitSlop={4}
			onPress={onPress}
			accessibilityLabel={label}
			accessibilityRole="tab"
			style={({ pressed }) => [
				styles.railTab,
				on && { backgroundColor: theme.colors.surface2 },
				on && { borderBottomColor: theme.colors.accent },
				pressed && { opacity: 0.7 },
			]}
		>
			{children}
		</Pressable>
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
	workspace: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.base,
		fontWeight: theme.fontWeight.semibold,
	},
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
		flexDirection: "row",
		borderLeftWidth: theme.borderWidth[1],
		borderLeftColor: theme.colors.border,
		backgroundColor: theme.colors.surfaceSidebar,
	},
	railInner: { flex: 1 },
	railTabs: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
		paddingHorizontal: theme.spacing[1],
		paddingLeft: theme.spacing[3],
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
	errorBar: {
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[1],
		backgroundColor: theme.colors.surface1,
	},
	errorText: { color: theme.colors.statusDanger, fontSize: 10 },
}));
