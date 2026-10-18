// Rail resize handle (W1c-lite): drags the explorer rail's left edge.
// Paseo's full ResizeHandle (components/resize-handle.tsx, pointer-event
// multi-touch protocol wired to the split-group resize model) lands with the
// W1c-2 nested-split port; this is the single-rail subset of its mechanics.
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import {
	MIN_RAIL_WIDTH,
	MAX_RAIL_WIDTH,
	DEFAULT_RAIL_WIDTH,
	clampRailWidth,
} from "@/stores/workspace-layout-record";

export {
	MIN_RAIL_WIDTH,
	MAX_RAIL_WIDTH,
	DEFAULT_RAIL_WIDTH,
	clampRailWidth,
} from "@/stores/workspace-layout-record";

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
	const viewRef = useRef<View>(null);

	// Web-only: a live DOM text selection that covers the handle makes Chromium
	// start a native text drag on press-drag (trusted dragstart + pointercancel),
	// which kills the RNGH pan before it moves. Refusing the native drag keeps
	// the pointer stream on the pan gesture. (walkthrough 08 headless repro:
	// dragstart hijack left the rail width unchanged, x 1174 → 1174.)
	useEffect(() => {
		if (!isWeb) return;
		const node = viewRef.current as unknown as HTMLElement | null;
		if (!node) return;
		const refuseNativeDrag = (event: Event) => event.preventDefault();
		node.addEventListener("dragstart", refuseNativeDrag);
		return () => node.removeEventListener("dragstart", refuseNativeDrag);
	}, []);

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
				ref={viewRef}
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
