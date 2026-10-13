// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/components/layout/app-container.tsx
// (Pie subset: desktop row = left sidebar | routed content. Window chrome, focus
// mode, compact gestures and command center are not ported yet.)
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { LeftSidebar } from "@/components/layout/left-sidebar";

const rowStyle = { flex: 1, flexDirection: "row" } as const;
const flexStyle = { flex: 1 } as const;

const SIDEBAR_DESKTOP_WIDTH = 260;

export function AppContainer({
	children,
	chromeEnabled,
	isCompactLayout,
}: {
	children: ReactNode;
	chromeEnabled: boolean;
	isCompactLayout: boolean;
}) {
	// Paseo keeps the sidebar mounted (latched) once chrome has been enabled and
	// only toggles visibility, so navigating in and out of workspaces never
	// remounts the session list mid-scroll.
	return (
		<View style={styles.surfaceFill}>
			<View style={rowStyle}>
				{!isCompactLayout ? (
					<View style={[styles.sidebarColumn, chromeEnabled ? null : styles.hidden]}>
						{chromeEnabled ? <LeftSidebar /> : null}
					</View>
				) : null}
				<View style={flexStyle}>{children}</View>
			</View>
			{isCompactLayout && chromeEnabled ? <LeftSidebar /> : null}
		</View>
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
}));
