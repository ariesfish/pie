// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/components/layout/app-container.tsx
// (Pie adaptation: desktop row = left sidebar | routed content; compact row =
// the ported mobile-panels shell — sessions drawer (left), explorer drawer
// (right), home surface in the middle with edge-swipe open gestures.)
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { FolderOpen, GitCompare, Menu } from "lucide-react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";

import { LeftSidebar } from "@/components/layout/left-sidebar";
import { ExplorerPane } from "@/components/layout/explorer-pane";
import { useTabsStore, type ExplorerMode } from "@/stores/tabs-store";
import {
	MobilePanelOverlay,
} from "@/mobile-panels/presentation";
import { MobilePanelsProvider } from "@/mobile-panels/provider";
import { useCloseExplorerGesture, useCloseSessionsGesture, useOpenExplorerGesture, useOpenSessionsGesture } from "@/mobile-panels/gestures";

const rowStyle = { flex: 1, flexDirection: "row" } as const;
const flexStyle = { flex: 1 } as const;
const fillStyle = { flex: 1 } as const;

// paseo.png measured: left sidebar occupies x0–231 (≈232px device px).
const SIDEBAR_DESKTOP_WIDTH = 232;

export function AppContainer({
	children,
	chromeEnabled,
	isCompactLayout,
}: {
	children: ReactNode;
	chromeEnabled: boolean;
	isCompactLayout: boolean;
}) {
	if (isCompactLayout) {
		// Compact shell: the mobile-panels gesture system (W1) — sessions on the
		// left, explorer on the right, routed content in the middle. Gesture
		// surfaces only exist once the chrome (connection) is up.
		return chromeEnabled ? <MobileShell>{children}</MobileShell> : <View style={fillStyle}>{children}</View>;
	}

	// Paseo keeps the sidebar mounted (latched) once chrome has been enabled and
	// only toggles visibility, so navigating in and out of workspaces never
	// remounts the session list mid-scroll.
	// The "toggle sidebar" header action flips this flag (tabs-store; persisted
	// per workspace). Left sidebar stays fixed-width by design (paseo.png).
	const sidebarVisible = useTabsStore((s) => s.sidebarVisible);

	return (
		<View style={styles.surfaceFill}>
			<View style={rowStyle}>
				<View
					style={[styles.sidebarColumn, chromeEnabled && sidebarVisible ? null : styles.hidden]}
				>
					{chromeEnabled && sidebarVisible ? <LeftSidebar /> : null}
				</View>
				<View style={flexStyle}>{children}</View>
			</View>
		</View>
	);
}

function MobileShell({ children }: { children: ReactNode }) {
	return (
		<MobilePanelsProvider>
			<MobileShellSurface>{children}</MobileShellSurface>
		</MobilePanelsProvider>
	);
}

function MobileShellSurface({ children }: { children: ReactNode }) {
	const closeSessions = useCloseSessionsGesture();
	const closeExplorer = useCloseExplorerGesture();

	return (
		<View style={fillStyle}>
			<MobilePanelOverlay panel="sessions" closeGesture={closeSessions.gesture}>
				<LeftSidebar />
			</MobilePanelOverlay>
			<MobilePanelOverlay panel="explorer" closeGesture={closeExplorer.gesture}>
				<MobileExplorerRail />
			</MobilePanelOverlay>
			<MobileHomeSurface>{children}</MobileHomeSurface>
		</View>
	);
}

/** Center surface: both open-gestures (edge swipes) are active simultaneously. */
function MobileHomeSurface({ children }: { children: ReactNode }) {
	const openSessions = useOpenSessionsGesture(true);
	const openExplorer = useOpenExplorerGesture({
		enabled: true,
		onOpen: () => useTabsStore.getState().showMobileExplorer(),
	});

	return (
		<GestureDetector gesture={Gesture.Simultaneous(openSessions, openExplorer)}>
			{/* GestureDetector needs a native child to attach handlers on web —
			 * without the View wrap the gesture silently never attaches. */}
			<View style={fillStyle} collapsable={false}>
				{children}
			</View>
		</GestureDetector>
	);
}

/** Compact explorer drawer: mode strip + the shared ExplorerPane content. */
function MobileExplorerRail() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const explorerMode = useTabsStore((s) => s.explorerMode);
	const setExplorerMode = useTabsStore((s) => s.setExplorerMode);
	const mode: Exclude<ExplorerMode, null> = explorerMode ?? "files";

	return (
		<View style={styles.explorerRail}>
			<View style={styles.explorerTabs}>
				<RailMode
					icon={<FolderOpen size={14} color={mode === "files" ? theme.colors.accentForeground : theme.colors.foregroundMuted} strokeWidth={1.5} />}
					on={mode === "files"}
					onPress={() => setExplorerMode("files")}
					label={t("workspace.rail.files")}
				/>
				<RailMode
					icon={<GitCompare size={14} color={mode === "changes" ? theme.colors.accentForeground : theme.colors.foregroundMuted} strokeWidth={1.5} />}
					on={mode === "changes"}
					onPress={() => setExplorerMode("changes")}
					label={t("workspace.rail.changes")}
				/>
			</View>
			<ExplorerPane mode={mode} />
		</View>
	);
}

function RailMode({
	icon,
	on,
	onPress,
	label,
}: {
	icon: ReactNode;
	on: boolean;
	onPress: () => void;
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
				styles.railMode,
				on && { backgroundColor: theme.colors.surface2, borderBottomColor: theme.colors.accent },
				pressed && { opacity: 0.7 },
			]}
		>
			{icon}
		</Pressable>
	);
}

/** Compact header affordance: open the sessions drawer. */
export function MobileSessionsButton() {
	const { theme } = useUnistyles();
	const showMobileSessions = useTabsStore((s) => s.showMobileSessions);
	return (
		<Pressable hitSlop={6} onPress={showMobileSessions} style={styles.headerIcon}>
			<Menu size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	surfaceFill: {
		flex: 1,
		backgroundColor: theme.colors.surface0,
	},
	sidebarColumn: {
		width: SIDEBAR_DESKTOP_WIDTH,
		borderRightWidth: theme.borderWidth[1],
		borderRightColor: theme.colors.border,
		backgroundColor: theme.colors.surfaceSidebar,
	},
	hidden: {
		display: "none",
	},
	explorerRail: {
		flex: 1,
		backgroundColor: theme.colors.surfaceSidebar,
	},
	explorerTabs: {
		flexDirection: "row",
		gap: 2,
		paddingHorizontal: theme.spacing[1],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	railMode: {
		flex: 1,
		alignItems: "center",
		paddingVertical: theme.spacing[2],
		borderRadius: theme.borderRadius.md,
		borderBottomWidth: 2,
		borderBottomColor: "transparent",
	},
	headerIcon: {
		width: 28,
		height: 28,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
	},
}));
