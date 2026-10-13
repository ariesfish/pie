// Chat list with a thin port of paseo's bottom-anchor behavior
// (agent-stream/bottom-anchor-controller.ts + strategy.ts nearBottom
// semantics, Apache-2.0): while the user is near the bottom, streaming
// growth keeps the list pinned to the newest content; scrolling up hands
// control back to the user. The full controller (virtualized history,
// maintainVisibleContentPosition bookkeeping) lands in P2b together with
// list virtualization.
import { useCallback, useEffect, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import type {
	LayoutChangeEvent,
	NativeScrollEvent,
	NativeSyntheticEvent,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { deriveTimeline, useConnectionStore } from "@/stores/connection-store";
import { MessageRow } from "@/components/chat/message-row";
import { WidgetView } from "@/components/widgets/widget-view";

const NEAR_BOTTOM_RATIO = 0.12;

export function ChatList() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const revision = useConnectionStore((s) => s.revision);
	const streaming = useConnectionStore((s) => s.streaming);
	const deltaText = useConnectionStore((s) => s.deltaText);
	const deltaKind = useConnectionStore((s) => s.deltaKind);
	const queue = useConnectionStore((s) => s.queue);
	const widgets = useConnectionStore((s) => s.widgets);

	const nearBottomRef = useRef(true);
	const scrollRef = useRef<ScrollView>(null);
	const contentHeightRef = useRef(0);
	const heightRef = useRef(0);
	const pinnedRef = useRef(true);

	const entries = deriveTimeline(revision);
	const sessionIdNow = useConnectionStore.getState().sessionId;
	const liveWidgets = Object.values(widgets).filter(
		(w) => w.sessionId === sessionIdNow,
	);

	const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
		const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
		const distance =
			contentSize.height - layoutMeasurement.height - contentOffset.y;
		nearBottomRef.current = distance <= layoutMeasurement.height * NEAR_BOTTOM_RATIO;
		if (nearBottomRef.current) pinnedRef.current = true;
	}, []);

	const onContentSizeChange = useCallback((w: number, h: number) => {
		const grew = h > contentHeightRef.current;
		contentHeightRef.current = h;
		if (grew && pinnedRef.current && nearBottomRef.current) {
			scrollRef.current?.scrollToEnd({ animated: false });
		}
	}, []);

	const onLayout = useCallback((event: LayoutChangeEvent) => {
		heightRef.current = event.nativeEvent.layout.height;
	}, []);

	useEffect(() => {
		// On session switch / first entries, snap to bottom unconditionally.
		if (entries.length <= 2) {
			scrollRef.current?.scrollToEnd({ animated: false });
			pinnedRef.current = true;
		}
	}, [entries.length]);

	const queued = queue.steering.length + queue.followUp.length;

	return (
		<ScrollView
			ref={scrollRef}
			style={styles.root}
			contentContainerStyle={styles.content}
			onScroll={onScroll}
			onContentSizeChange={onContentSizeChange}
			onLayout={onLayout}
			scrollEventThrottle={64}
		>
			{entries.map((entry) => (
				<MessageRow key={entry.id} entry={entry} />
			))}
			{deltaText.length > 0 && (
				<View style={styles.deltaRow}>
					<Text
						style={
							deltaKind === "thinking"
								? [styles.deltaText, { color: theme.colors.foregroundExtraMuted }]
								: styles.deltaText
						}
					>
						{deltaKind === "thinking" ? `${t("chat.thinking")} · ${deltaText}` : deltaText}
					</Text>
				</View>
			)}
			{queued > 0 && !streaming && (
				<View style={styles.queueBadge}>
					<Text style={styles.queueText}>
						{t("chat.queue")}: {queued}
					</Text>
				</View>
			)}
			{liveWidgets.map((w) => (
				<WidgetView key={`${w.sessionId}:${w.key}`} widget={w} />
			))}
		</ScrollView>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1 },
	content: { gap: theme.spacing[2], paddingHorizontal: theme.spacing[3], paddingBottom: theme.spacing[3] },
	deltaRow: {
		alignSelf: "flex-start",
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.xl,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		paddingVertical: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		maxWidth: "84%",
	},
	deltaText: { color: theme.colors.foreground, fontSize: theme.fontSize.content, lineHeight: 20 },
	queueBadge: {
		alignSelf: "center",
		backgroundColor: theme.colors.surface2,
		borderRadius: theme.borderRadius.full,
		paddingVertical: theme.spacing[1],
		paddingHorizontal: theme.spacing[3],
	},
	queueText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
}));
