// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/components/retained-panel.tsx (verbatim)
// Keeps expensive panel state mounted without letting an inactive panel render
// on screen — the streaming chat keeps its scroll position and delta state
// while the user works in the files tab.
import React, { createContext, memo, type ReactNode, useContext } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

const RetainedPanelActiveContext = createContext(true);

export function useRetainedPanelActive(): boolean {
	return useContext(RetainedPanelActiveContext);
}

interface RetainedPanelProps {
	active: boolean;
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
	testID?: string;
}

interface RetainedPanelActivityProps {
	active: boolean;
	children: ReactNode;
}

export function RetainedPanelActivity({ active, children }: RetainedPanelActivityProps) {
	const parentActive = useRetainedPanelActive();
	return (
		<RetainedPanelActiveContext value={parentActive && active}>
			{children}
		</RetainedPanelActiveContext>
	);
}

/**
 * Keeps expensive panel state mounted without letting an inactive panel render
 * on screen. The stable, non-collapsible native root is intentional: retained
 * panels must not detach or reparent their native descendants when visibility
 * changes.
 *
 * Hidden strategy: taken out of flow (absolute) + transparent instead of
 * display:none — RN-web skips layout-measure for subtrees mounted under
 * display:none, and inputs (TextInput) come back at 0x0 (caught by the
 * walkthrough: a session created after the files tab had been opened rendered
 * a zero-sized composer). Position-based hiding keeps measuring live.
 */
export const RetainedPanel = memo(function RetainedPanel({
	active,
	children,
	style,
	testID,
}: RetainedPanelProps) {
	const visibleStyle = StyleSheet.flatten([styles.root, style]);
	const panelStyle = active ? visibleStyle : StyleSheet.flatten([visibleStyle, styles.hidden]);

	return (
		<RetainedPanelActivity active={active}>
			<View
				collapsable={false}
				pointerEvents={active ? "auto" : "none"}
				style={panelStyle}
				testID={testID}
			>
				{children}
			</View>
		</RetainedPanelActivity>
	);
});

const styles = StyleSheet.create({
	root: {
		flex: 1,
	},
	hidden: {
		position: "absolute" as const,
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		opacity: 0,
	},
});
