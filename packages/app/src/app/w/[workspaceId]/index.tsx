// Ported from getpaseo/paseo (Apache-2.0) — screens/workspace/workspace-screen.tsx
// (Pie subset: three-pane desktop row = explorer column + center column
// (workspace header, session tabs row, panel content). Split panes, floating
// panels and focus mode are not ported.)
import { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Activity, Plus, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { ExplorerPane } from "@/components/layout/explorer-pane";
import { ChatList } from "@/components/chat/chat-list";
import { Composer } from "@/components/chat/composer";
import { NewSessionPanel } from "@/components/layout/new-session-panel";
import { useConnectionStore } from "@/stores/connection-store";
import { useSessionListStore, sessionTitle } from "@/stores/session-list-store";
import { useTabsStore } from "@/stores/tabs-store";
import { RightRail } from "@/components/workspace/right-rail";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function WorkspaceScreen() {
	const params = useLocalSearchParams<{ workspaceId?: string }>();
	const routeWorkspaceId =
		typeof params.workspaceId === "string" ? decodeURIComponent(params.workspaceId) : null;

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

	const tabs = useTabsStore((s) => s.tabs);
	const activeTabId = useTabsStore((s) => s.activeTabId);
	const rightRailOpen = useTabsStore((s) => s.rightRailOpen);
	const setRightRailOpen = useTabsStore((s) => s.setRightRailOpen);
	const error = useConnectionStore((s) => s.error);

	const active = tabs.find((x) => x.id === activeTabId) ?? tabs[0];

	/** Tab switches route through connection-store (snapshot resync). */
	useEffect(() => {
		if (active?.kind === "session" && active.sessionId) {
			void useConnectionStore.getState().switchSession(active.sessionId);
		}
	}, [active?.kind, active?.sessionId]);

	return (
		<View style={styles.threePaneRow}>
			<ExplorerPane />
			{/* rail below */}
			<View style={styles.centerColumn}>
				{/* workspace header (paseo: project row — name + branch slot) */}
				<View style={styles.headerRow}>
					<Text style={styles.workspace} numberOfLines={1}>
						{workspaceName}
					</Text>
					<Pressable
						hitSlop={6}
						onPress={() => setRightRailOpen(!rightRailOpen)}
						accessibilityLabel="toggle timeline"
						style={({ pressed }) => [styles.railToggle, rightRailOpen && styles.railToggleOn, pressed && { opacity: 0.7 }]}
					>
						<Activity
							size={14}
							color={rightRailOpen ? theme.colors.accentForeground : theme.colors.foregroundMuted}
							strokeWidth={1.5}
						/>
					</Pressable>
				</View>

				{/* session tabs row (paseo: WorkspaceDesktopTabsRow) */}
				<SessionTabsRow />

				{error ? (
					<View style={styles.errorBar}>
						<Text style={styles.errorText} numberOfLines={1}>
							{error}
						</Text>
					</View>
				) : null}

				{/* panel content: exactly one of session chat / new-session */}
				<View style={styles.panelWithRail}>
					<View style={styles.centerContent}>
						{active?.kind === "new" ? (
							<NewSessionPanel />
						) : active?.kind === "session" ? (
							<>
								<ChatList />
								<Composer />
							</>
						) : null}
					</View>
					{rightRailOpen ? <RightRail /> : null}
				</View>
			</View>
		</View>
	);
}

/** Session tabs row — one tab per session, a sticky new-session tab at the end. */
function SessionTabsRow() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const tabs = useTabsStore((s) => s.tabs);
	const activeTabId = useTabsStore((s) => s.activeTabId);
	const rightRailOpen = useTabsStore((s) => s.rightRailOpen);
	const setRightRailOpen = useTabsStore((s) => s.setRightRailOpen);
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
				const title = tab.kind === "new" ? t("agentList.newSession") : sessionTitle(session ?? ({ firstMessage: tab.sessionId ?? "" } as never));
				return (
					<Pressable key={tab.id} style={[styles.tab, on && styles.tabOn]} onPress={() => setActive(tab.id)}>
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
	threePaneRow: { flex: 1, flexDirection: "row", backgroundColor: theme.colors.surface0 },
	centerColumn: { flex: 1 },
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
	headerHint: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
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
	panelWithRail: { flex: 1, flexDirection: "row" },
	railToggle: {
		width: 28,
		height: 28,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
	},
	railToggleOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
}));
