// Rail resize handle (W1c-lite): drags the explorer rail's left edge.
// Paseo's full ResizeHandle (components/resize-handle.tsx, pointer-event
// multi-touch protocol wired to the split-group resize model) lands with the
// W1c-2 nested-split port; this is the single-rail subset of its mechanics.
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";

export const MIN_RAIL_WIDTH = 200;
export const MAX_RAIL_WIDTH = 520;
export const DEFAULT_RAIL_WIDTH = 264;

export const clampRailWidth = (px: number): number =>
	Math.max(MIN_RAIL_WIDTH, Math.min(MAX_RAIL_WIDTH, Math.round(px)));

export function RailResizeHandle({
	width,
	onResize,
}: {
	/** Current rail width in px (the handle sits on the rail's left edge). */
	width: number;
	onResize: (px: number) => void;
}) {
	const { theme } = useUnistyles();
	const [dragging, setDragging] = useState(false);
	const startWidthRef = useRef(width);

	const pan = Gesture.Pan()
		.minDistance(2)
		.onBegin(() => {
			startWidthRef.current = width;
			setDragging(true);
		})
		.onUpdate((event) => {
			// Rail is anchored right; dragging left (negative translationX) widens.
			onResize(clampRailWidth(startWidthRef.current - event.translationX));
		})
		.onEnd(() => setDragging(false))
		.onFinalize(() => setDragging(false));

	return (
		<GestureDetector gesture={pan}>
			<View
				accessibilityRole="adjustable"
				accessibilityLabel="resize explorer rail"
				style={[
					styles.handle,
					isWeb && (styles.cursor as never),
					dragging && { backgroundColor: theme.colors.accent },
				]}
			/>
		</GestureDetector>
	);
}

const styles = StyleSheet.create((theme) => ({
	handle: {
		width: 7,
		alignSelf: "stretch",
		marginLeft: -3,
		zIndex: 3,
		backgroundColor: "transparent",
	},
	cursor: { cursor: "col-resize" } as never,
}));
