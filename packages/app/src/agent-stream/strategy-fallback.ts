// [pie] W4b: the native platform viewport is the real one (ported
// strategy-native.tsx — inverted FlatList + bottom-anchor transport +
// history-start pagination). The forward-stream web viewport (paseo
// strategy-web.tsx) is a later batch; its fallback keeps the exact
// configuration shape with a null renderer.
import type { StreamStrategy } from "./strategy";
import { createStreamStrategy } from "./strategy";
import { createNativeStreamStrategy } from "./strategy-native";

const DEFAULT_MAINTAIN_VISIBLE_CONTENT_POSITION = Object.freeze({
  minIndexForVisible: 0,
  autoscrollToTopThreshold: 0,
});

export function createNativeStreamStrategyFallback(): StreamStrategy {
  return createNativeStreamStrategy();
}

/** The forward-stream configuration (paseo web viewport) — renderer null until W4b-2. */
export function createWebStreamStrategyFallback(): StreamStrategy {
  return createStreamStrategy({
    render: () => null,
    orderTailReverse: false,
    orderHeadReverse: false,
    assistantTurnTraversalStep: -1,
    edgeSlot: "footer",
    historyLiveBoundaryEdge: "last",
    liveHeadHistoryBoundaryEdge: "first",
    frameChildOrder: "content-then-footer",
    flatListInverted: false,
    overlayScrollbarInverted: false,
    maintainVisibleContentPosition: undefined,
    bottomAnchorTransportBehavior: {
      verificationDelayFrames: 0,
      verificationRetryMode: "rescroll",
    },
    disableParentScrollOnInlineDetailsExpansion: false,
    anchorBottomOnContentSizeChange: true,
    animateManualScrollToBottom: false,
    useVirtualizedList: false,
    isNearBottom: (inputMetrics) => {
      const distanceFromBottom = Math.max(
        0,
        inputMetrics.contentHeight - (inputMetrics.offsetY + inputMetrics.viewportHeight),
      );
      return distanceFromBottom <= inputMetrics.threshold;
    },
    getBottomOffset: (metrics) => Math.max(0, metrics.contentHeight - metrics.viewportHeight),
  });
}
