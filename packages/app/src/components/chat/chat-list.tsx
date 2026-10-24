// Chat list (W4b): rewritten on the ported agent-stream foundation —
// the SessionEntry timeline + live delta project onto StreamItems
// (adapter), buildAgentStreamRenderModel splits history/mounted/live-head
// segments, and the platform strategy renders the inverted FlatList with
// the bottom-anchor transport (maintainVisibleContentPosition).
// Paseo's view.tsx (fork/outline/tool-details) is a later W4 batch; the
// weave here is the same skeleton at pie's vocabulary.
import { useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { useConnectionStore, useSessionTimeline } from "@/stores/connection-store";
import { StreamItemRow } from "@/components/chat/stream-row";
import { PermissionCard } from "@/components/chat/permission-card";
import { PermissionBatchBar } from "@/components/chat/permission-batch-bar";
import { WidgetView } from "@/components/widgets/widget-view";
import { buildStreamItems } from "@/agent-stream/adapter";
import { buildAgentStreamRenderModel } from "@/agent-stream/model";
import { isWeb } from "@/constants/platform";
import { resolveStreamRenderStrategy } from "@/agent-stream/strategy-resolver";
import type { StreamViewportHandle } from "@/agent-stream/strategy";
import { DEFAULT_CONTENT_MAX_WIDTH } from "@/styles/theme";

export function ChatList() {
	const { t } = useTranslation();
	const timeline = useSessionTimeline();
	const olderHistory = useConnectionStore((s) => s.olderHistory);
	const loadOlderEntries = useConnectionStore((s) => s.loadOlderEntries);
	const streaming = useConnectionStore((s) => s.streaming);
	const deltaText = useConnectionStore((s) => s.deltaText);
	const deltaKind = useConnectionStore((s) => s.deltaKind);
	const queue = useConnectionStore((s) => s.queue);
	const widgets = useConnectionStore((s) => s.widgets);
	const toolCalls = useConnectionStore((s) => s.toolCalls);
	const hasPermission = useConnectionStore((s) => s.permissions.length > 0);
	const permissions = useConnectionStore((s) => s.permissions);
	const viewportRef = useRef<StreamViewportHandle | null>(null);

	const sessionIdNow = useConnectionStore.getState().sessionId;
	const liveWidgets = Object.values(widgets).filter(
		(w) => w.sessionId === sessionIdNow,
	);

	const stream = useMemo(
		() =>
			buildStreamItems({
				entries: timeline,
				deltaText,
				deltaKind,
				toolCalls,
			}),
		[timeline, deltaText, deltaKind, toolCalls],
	);

	const model = useMemo(
		() =>
			buildAgentStreamRenderModel({
				isTurnActive: streaming,
				activeTurnStartedAt: null,
				tail: stream.history,
				head: stream.liveHead,
				platform: isWeb ? "web" : "native",
				isMobileBreakpoint: false,
			}),
		[stream, streaming],
	);

	// Both platforms use their real viewport strategy: web renders the
	// forward DOM viewport, native the inverted FlatList.
	const strategy = useMemo(
		() =>
			resolveStreamRenderStrategy({
				platform: isWeb ? "web" : "native",
				isMobileBreakpoint: false,
			}),
		[],
	);

	const renderItem = (item: Parameters<typeof StreamItemRow>[0]["item"]) => (
		<StreamItemRow item={item} />
	);

	const queued = queue.steering.length + queue.followUp.length;

	const renderRows = (item: Parameters<typeof StreamItemRow>[0]["item"]) =>
		renderItem(item);

	// Empty stream (no history, no live head, not streaming): a centered
	// empty state reads better than a sticky header line at the top edge.
	const streamEmpty =
		stream.history.length === 0 &&
		stream.liveHead.length === 0 &&
		liveWidgets.length === 0 &&
		!hasPermission;

	if (streamEmpty) {
		return (
			<View style={styles.emptyCenter} testID="chat-empty-state">
				<Text style={styles.emptyText}>{t("chat.empty")}</Text>
			</View>
		);
	}

	return (
		<View style={styles.root}>
			{strategy.render({
				agentId: sessionIdNow ?? "session",
				segments: model.segments,
				boundary: model.boundary,
				renderers: {
					renderHistoryVirtualizedRow: renderRows,
					renderHistoryMountedRow: renderRows,
					renderLiveHeadRow: renderRows,
					renderLiveAuxiliary: () =>
						liveWidgets.length === 0 &&
						!(queued > 0 && !streaming) &&
						!hasPermission ? null : (
							<View style={styles.aux}>
								<PermissionBatchBar />
								{permissions.map((card) => (
									<PermissionCard key={card.requestId} card={card} />
								))}
								{queued > 0 && !streaming ? (
									<View style={styles.queueBadge}>
										<Text style={styles.queueText}>
											{t("chat.queue")}: {queued}
										</Text>
									</View>
								) : null}
								{liveWidgets.map((w) => (
									<WidgetView key={`${w.sessionId}:${w.key}`} widget={w} />
								))}
							</View>
						),
				},
				listEmptyComponent: (
					<View style={styles.empty}>
						<Text style={styles.emptyText}>{t("chat.empty")}</Text>
					</View>
				),
				viewportRef,
				routeBottomAnchorRequest: null,
				isAuthoritativeHistoryReady: true,
				onNearBottomChange: () => {},
				onNearHistoryStart: loadOlderEntries,
				isLoadingOlderHistory: olderHistory.loading,
				hasOlderHistory: olderHistory.hasMore,
				olderHistoryProgressKey: olderHistory.cursor,
				scrollEnabled: true,
				listStyle: styles.list,
				baseListContentContainerStyle: styles.content,
				forwardListContentContainerStyle: styles.content,
				contentMaxWidth: DEFAULT_CONTENT_MAX_WIDTH,
			})}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1 },
	list: { flex: 1 },
	content: { gap: theme.spacing[2], paddingHorizontal: theme.spacing[3], paddingBottom: theme.spacing[3] },
	// Pending-permission cards are the one floating layer in the transcript
	// (DESIGN.md §Elevation), so the auxiliary block keeps its own rhythm and a
	// small breathing gap above the first card.
	aux: { gap: theme.spacing[2], paddingTop: theme.spacing[3] },
	queueBadge: {
		alignSelf: "center",
		backgroundColor: theme.colors.surface2,
		borderRadius: theme.borderRadius.full,
		paddingVertical: theme.spacing[1],
		paddingHorizontal: theme.spacing[3],
	},
	queueText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	empty: { padding: theme.spacing[6], alignItems: "center" },
	emptyCenter: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.content },
}));
