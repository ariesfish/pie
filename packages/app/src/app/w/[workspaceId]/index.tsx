// Ported from getpaseo/paseo (Apache-2.0) — screens/workspace/workspace-screen.tsx
// (Pie W1c: desktop row = resizable explorer rail + main column (header,
// tabs row, panel host). Panels render through the registry inside
// RetainedPanels, so the streaming chat keeps its state while the user works
// in the files/changes tabs. Drag-to-reorder/split panes land with W1c-2.)
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
	Activity,
	FolderOpen,
	GitCompare,
	MessageSquare,
	Package,
	Plus,
	X,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import "@/panels/register-panels";
import { ExplorerPane } from "@/components/layout/explorer-pane";
import { MobileSessionsButton } from "@/components/layout/app-container";
import { RailResizeHandle } from "@/components/layout/rail-resize-handle";
import { RetainedPanel } from "@/components/retained-panel";
import { getPanelRegistration, type PanelProps } from "@/panels/panel-registry";
import { useConnectionStore } from "@/stores/connection-store";
import { useSessionListStore, sessionTitle } from "@/stores/session-list-store";
import { useTabsStore, type ExplorerMode } from "@/stores/tabs-store";
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
	const explorerMode = useTabsStore((s) => s.explorerMode);
	const setExplorerMode = useTabsStore((s) => s.setExplorerMode);
	const railWidth = useTabsStore((s) => s.railWidth);
	const setRailWidth = useTabsStore((s) => s.setRailWidth);
	const error = useConnectionStore((s) => s.error);

	const railVisible = !isCompact && explorerMode != null;

	return (
		<View style={styles.desktopRow}>
			<View style={styles.centerColumn}>
				{/* workspace header (paseo: project row — name + actions) */}
				<WorkspaceHeaderRow
					workspaceName={workspaceName}
					isCompact={isCompact}
					railVisible={railVisible}
				/>

				{/* tabs row — session tabs + shared file/changes tabs + creator */}
				<TabsRow />

				{error ? (
					<View style={styles.errorBar}>
						<Text style={styles.errorText} numberOfLines={1}>
							{error}
						</Text>
					</View>
				) : null}

				{/* panels: every mounted tab keeps its state (RetainedPanel) */}
				<PanelHost />
			</View>

			{/* right explorer rail (desktop): files tree / changes / resources / activity */}
			{railVisible ? (
				<View style={[styles.rail, { width: railWidth }]}>
					<RailResizeHandle width={railWidth} onResize={setRailWidth} />
					<View style={styles.railTabs}>
						<RailMode
							on={explorerMode === "files"}
							onPress={() => setExplorerMode("files")}
						>
							<FolderOpen
								size={14}
								color={modeColor(explorerMode === "files")}
								strokeWidth={1.5}
							/>
						</RailMode>
						<RailMode
							on={explorerMode === "changes"}
							onPress={() => setExplorerMode("changes")}
						>
							<GitCompare
								size={14}
								color={modeColor(explorerMode === "changes")}
								strokeWidth={1.5}
							/>
						</RailMode>
						<RailMode
							on={explorerMode === "resources"}
							onPress={() => setExplorerMode("resources")}
						>
							<Package
								size={14}
								color={modeColor(explorerMode === "resources")}
								strokeWidth={1.5}
							/>
						</RailMode>
						<View style={styles.railTabSpacer} />
						<RailMode onPress={() => setExplorerMode(null)}>
							<X size={14} color={modeColor(false)} strokeWidth={1.5} />
						</RailMode>
					</View>
					<ExplorerPane mode={explorerMode} />
				</View>
			) : null}
		</View>
	);
}

function modeColor(on: boolean): "accent" | "muted" {
	return on ? "accent" : "muted";
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
							railVisible
								? theme.colors.accentForeground
								: theme.colors.foregroundMuted
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
}: {
	children: React.ReactNode;
	onPress: () => void;
	active?: boolean;
	on?: boolean;
}) {
	const { theme } = useUnistyles();
	return (
		<Pressable
			hitSlop={4}
			onPress={onPress}
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

/**
 * Tabs row — one tab per session, the shared files/changes singletons, and
 * the sticky creator tab ("tab target = data" model, W1c).
 */
function TabsRow() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const tabs = useTabsStore((s) => s.tabs);
	const activeTabId = useTabsStore((s) => s.activeTabId);
	const setActive = useTabsStore((s) => s.setActive);
	const closeTab = useTabsStore((s) => s.closeTab);
	const sessions = useSessionListStore((s) => s.sessions);
	const openFilePath = useWorkspaceStore((s) => s.openFilePath);

	function labelFor(tab: (typeof tabs)[number]): {
		title: string;
		icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
		closable: boolean;
	} {
		const registration = getPanelRegistration(tab.target.kind);
		const fallbackIcon = registration?.presentation.icon ?? MessageSquare;
		switch (tab.target.kind) {
			case "new_tab":
				return { title: t("agentList.newSession"), icon: Plus, closable: false };
			case "session": {
				const { sessionId } = tab.target;
				const session = sessions.find((s) => s.sessionId === sessionId);
				return {
					title: session ? sessionTitle(session) : `${sessionId.slice(0, 8)}…`,
					icon: MessageSquare,
					closable: true,
				};
			}
			case "files":
				return {
					title: openFilePath
						? (openFilePath.split("/").pop() ?? t("panels.files"))
						: t("panels.files"),
					icon: fallbackIcon,
					closable: true,
				};
			case "changes":
				return { title: t("panels.changes"), icon: fallbackIcon, closable: true };
		}
	}

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			style={styles.tabsScroll}
			contentContainerStyle={styles.tabsRow}
		>
			{tabs.map((tab) => {
				const on = tab.tabId === activeTabId;
				const label = labelFor(tab);
				const Icon = label.icon;
				return (
					<Pressable
						key={tab.tabId}
						style={[styles.tab, on && styles.tabOn]}
						onPress={() => setActive(tab.tabId)}
					>
						<Icon
							size={11}
							color={on ? theme.colors.foreground : theme.colors.foregroundExtraMuted}
							strokeWidth={1.75}
						/>
						<Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
							{label.title}
						</Text>
						{label.closable ? (
							<Pressable style={styles.tabClose} onPress={() => closeTab(tab.tabId)} hitSlop={4}>
								<X
									size={11}
									color={on ? theme.colors.foreground : theme.colors.foregroundExtraMuted}
									strokeWidth={1.75}
								/>
							</Pressable>
						) : null}
					</Pressable>
				);
			})}
		</ScrollView>
	);
}

/**
 * Panel host: renders every mounted tab's registered component inside a
 * RetainedPanel — only the active tab renders on screen, but all of them
 * stay mounted (streaming continues, scroll positions survive).
 */
function PanelHost() {
	const tabs = useTabsStore((s) => s.tabs);
	const activeTabId = useTabsStore((s) => s.activeTabId);

	// Session-tab switches route through connection-store (snapshot resync).
	const active = tabs.find((t) => t.tabId === activeTabId) ?? tabs[0];
	useEffect(() => {
		if (active?.target.kind === "session") {
			const sessionId = active.target.sessionId;
			const path =
				useSessionListStore.getState().sessions.find((s) => s.sessionId === sessionId)?.path;
			void useConnectionStore.getState().switchSession(sessionId, path || undefined);
		}
	}, [active?.target]);

	return (
		<View style={styles.panelHost}>
			{tabs.map((tab) => {
				const registration = getPanelRegistration(tab.target.kind);
				if (!registration) return null;
				const Panel = registration.component as React.ComponentType<PanelProps>;
				return (
					<RetainedPanel key={tab.tabId} active={tab.tabId === activeTabId}>
						<Panel target={tab.target} />
					</RetainedPanel>
				);
			})}
		</View>
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
		fontSizeAdjust: "none",
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
		borderLeftWidth: theme.borderWidth[1],
		borderLeftColor: theme.colors.border,
		backgroundColor: theme.colors.surfaceSidebar,
	},
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
	tabsScroll: { flexGrow: 0, flexShrink: 0 },
	tabsRow: {
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1],
		gap: theme.spacing[1],
	},
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
	panelHost: { flex: 1, flexDirection: "row" },
}));

export type { ExplorerMode };
