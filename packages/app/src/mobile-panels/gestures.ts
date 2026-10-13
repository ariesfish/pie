// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/mobile-panels/gestures.ts
// (Pie adaptation: panel-store → tabs-store actions; view names agent→home,
// agent-list→sessions, file-explorer→explorer. Gesture logic unchanged.)
import { useCallback, useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { isWeb } from "@/constants/platform";
import { useHorizontalScrollOptional } from "@/contexts/horizontal-scroll-context";
import { useTabsStore } from "@/stores/tabs-store";
import { canBeginMobilePanelGesture, isMobilePanelGestureCurrent } from "./model";
import { useMobilePanelsRuntime } from "./provider";
import { resolveMobilePanelGestureIntent } from "./gesture-intent";

const MOBILE_WEB_EDGE_SWIPE_WIDTH = 32;

function isCurrentSelection(startedRevision: number): boolean {
  return useTabsStore.getState().mobilePanel.revision === startedRevision;
}

function useGestureState() {
  return {
    startedRevision: useSharedValue(-1),
    touchStartX: useSharedValue(0),
    touchStartY: useSharedValue(0),
  };
}

function useRevisionCommit(action: () => void) {
  return useCallback(
    (revision: number) => {
      if (isCurrentSelection(revision)) {
        action();
      }
    },
    [action],
  );
}

/** Left-edge swipe opens the sessions drawer (compact layouts only). */
export function useOpenSessionsGesture(enabled: boolean) {
  const {
    beginGesture,
    finishGesture,
    leftOpenGestureRef,
    motionState,
    openGesturesBlocked,
    position,
    updateGesture,
    windowWidth,
  } = useMobilePanelsRuntime();
  const horizontalScroll = useHorizontalScrollOptional();
  const { startedRevision, touchStartX, touchStartY } = useGestureState();
  const showMobileSessions = useTabsStore((state) => state.showMobileSessions);
  const commit = useRevisionCommit(showMobileSessions);

  return useMemo(
    () =>
      Gesture.Pan()
        .withRef(leftOpenGestureRef)
        .enabled(enabled)
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.changedTouches[0];
          if (touch) {
            touchStartX.value = touch.absoluteX;
            touchStartY.value = touch.absoluteY;
          }
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || event.numberOfTouches !== 1) {
            stateManager.fail();
            return;
          }
          const deltaX = touch.absoluteX - touchStartX.value;
          const deltaY = touch.absoluteY - touchStartY.value;
          if (isMobilePanelGestureCurrent(motionState.value, startedRevision.value)) {
            return;
          }

          const panIntent = resolveMobilePanelGestureIntent({
            deltaX,
            deltaY,
            direction: 1,
            openGesturesBlocked: openGesturesBlocked.value,
          });
          if (
            !canBeginMobilePanelGesture(motionState.value, "home", position.value) ||
            horizontalScroll?.isAnyScrolledRight.value ||
            (isWeb && touchStartX.value > MOBILE_WEB_EDGE_SWIPE_WIDTH) ||
            panIntent === "fail"
          ) {
            stateManager.fail();
            return;
          }
          if (panIntent === "activate") {
            stateManager.activate();
          }
        })
        .onStart(() => {
          startedRevision.value = beginGesture({ origin: "home" });
        })
        .onUpdate((event) => {
          updateGesture(startedRevision.value, -event.translationX / windowWidth);
        })
        .onEnd((event, success) => {
          const shouldOpen = event.translationX > windowWidth / 3 || event.velocityX > 500;
          const result = finishGesture({
            startedRevision: startedRevision.value,
            target: shouldOpen ? "sessions" : "home",
            success,
          });
          if (result) {
            scheduleOnRN(commit, result.startedRevision);
          }
        }),
    [
      commit,
      enabled,
      beginGesture,
      finishGesture,
      horizontalScroll?.isAnyScrolledRight,
      leftOpenGestureRef,
      motionState,
      openGesturesBlocked,
      position,
      startedRevision,
      touchStartX,
      touchStartY,
      updateGesture,
      windowWidth,
    ],
  );
}

/** Left-drawer content drag closes it back to home. */
export function useCloseSessionsGesture() {
  const {
    beginGesture,
    finishGesture,
    leftCloseGestureRef,
    motionState,
    position,
    updateGesture,
    windowWidth,
  } = useMobilePanelsRuntime();
  const { startedRevision, touchStartX, touchStartY } = useGestureState();
  const showMobileHome = useTabsStore((state) => state.showMobileHome);
  const commit = useRevisionCommit(showMobileHome);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withRef(leftCloseGestureRef)
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.changedTouches[0];
          if (touch) {
            touchStartX.value = touch.absoluteX;
            touchStartY.value = touch.absoluteY;
          }
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || event.numberOfTouches !== 1) {
            stateManager.fail();
            return;
          }
          const deltaX = touch.absoluteX - touchStartX.value;
          const deltaY = touch.absoluteY - touchStartY.value;
          if (isMobilePanelGestureCurrent(motionState.value, startedRevision.value)) {
            return;
          }

          const panIntent = resolveMobilePanelGestureIntent({
            deltaX,
            deltaY,
            direction: -1,
            openGesturesBlocked: false,
          });
          if (
            !canBeginMobilePanelGesture(motionState.value, "sessions", position.value) ||
            panIntent === "fail"
          ) {
            stateManager.fail();
            return;
          }
          if (panIntent === "activate") {
            stateManager.activate();
          }
        })
        .onStart(() => {
          startedRevision.value = beginGesture({
            origin: "sessions",
          });
        })
        .onUpdate((event) => {
          updateGesture(startedRevision.value, -1 - event.translationX / windowWidth);
        })
        .onEnd((event, success) => {
          const shouldClose = event.translationX < -windowWidth / 3 || event.velocityX < -500;
          const result = finishGesture({
            startedRevision: startedRevision.value,
            target: shouldClose ? "home" : "sessions",
            success,
          });
          if (result) {
            scheduleOnRN(commit, result.startedRevision);
          }
        }),
    [
      beginGesture,
      commit,
      finishGesture,
      leftCloseGestureRef,
      motionState,
      position,
      startedRevision,
      touchStartX,
      touchStartY,
      updateGesture,
      windowWidth,
    ],
  );

  return { gesture, gestureRef: leftCloseGestureRef };
}

/**
 * Right-edge swipe opens the explorer drawer (compact layouts only). `onOpen`
 * runs on commit — callers may pin the explorer mode they intend to show.
 */
export function useOpenExplorerGesture({ enabled, onOpen }: { enabled: boolean; onOpen: () => void }) {
  const {
    beginGesture,
    finishGesture,
    leftOpenGestureRef,
    motionState,
    openGesturesBlocked,
    position,
    rightOpenGestureRef,
    updateGesture,
    windowWidth,
  } = useMobilePanelsRuntime();
  const { startedRevision, touchStartX, touchStartY } = useGestureState();
  const commit = useRevisionCommit(onOpen);

  return useMemo(
    () =>
      Gesture.Pan()
        .withRef(rightOpenGestureRef)
        .simultaneousWithExternalGesture(leftOpenGestureRef)
        .enabled(enabled)
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.changedTouches[0];
          if (touch) {
            touchStartX.value = touch.absoluteX;
            touchStartY.value = touch.absoluteY;
          }
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || event.numberOfTouches !== 1) {
            stateManager.fail();
            return;
          }
          const deltaX = touch.absoluteX - touchStartX.value;
          const deltaY = touch.absoluteY - touchStartY.value;
          if (isMobilePanelGestureCurrent(motionState.value, startedRevision.value)) {
            return;
          }

          const panIntent = resolveMobilePanelGestureIntent({
            deltaX,
            deltaY,
            direction: -1,
            openGesturesBlocked: openGesturesBlocked.value,
          });
          if (
            !canBeginMobilePanelGesture(motionState.value, "home", position.value) ||
            (isWeb && touchStartX.value < windowWidth - MOBILE_WEB_EDGE_SWIPE_WIDTH) ||
            panIntent === "fail"
          ) {
            stateManager.fail();
            return;
          }
          if (panIntent === "activate") {
            stateManager.activate();
          }
        })
        .onStart(() => {
          startedRevision.value = beginGesture({
            origin: "home",
          });
        })
        .onUpdate((event) => {
          updateGesture(startedRevision.value, -event.translationX / windowWidth);
        })
        .onEnd((event, success) => {
          const shouldOpen = event.translationX < -windowWidth / 3 || event.velocityX < -500;
          const result = finishGesture({
            startedRevision: startedRevision.value,
            target: shouldOpen ? "explorer" : "home",
            success,
          });
          if (result) {
            scheduleOnRN(commit, result.startedRevision);
          }
        }),
    [
      beginGesture,
      commit,
      enabled,
      finishGesture,
      leftOpenGestureRef,
      motionState,
      openGesturesBlocked,
      position,
      rightOpenGestureRef,
      startedRevision,
      touchStartX,
      touchStartY,
      updateGesture,
      windowWidth,
    ],
  );
}

/** Right-drawer content drag closes it back to home. */
export function useCloseExplorerGesture() {
  const {
    beginGesture,
    finishGesture,
    motionState,
    position,
    rightCloseGestureRef,
    updateGesture,
    windowWidth,
  } = useMobilePanelsRuntime();
  const { startedRevision, touchStartX, touchStartY } = useGestureState();
  const horizontalScroll = useHorizontalScrollOptional();
  const showMobileHome = useTabsStore((state) => state.showMobileHome);
  const commit = useRevisionCommit(showMobileHome);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .withRef(rightCloseGestureRef)
        .manualActivation(true)
        .onTouchesDown((event) => {
          const touch = event.changedTouches[0];
          if (touch) {
            touchStartX.value = touch.absoluteX;
            touchStartY.value = touch.absoluteY;
          }
        })
        .onTouchesMove((event, stateManager) => {
          const touch = event.changedTouches[0];
          if (!touch || event.numberOfTouches !== 1) {
            stateManager.fail();
            return;
          }
          const deltaX = touch.absoluteX - touchStartX.value;
          const deltaY = touch.absoluteY - touchStartY.value;
          if (isMobilePanelGestureCurrent(motionState.value, startedRevision.value)) {
            return;
          }

          const panIntent = resolveMobilePanelGestureIntent({
            deltaX,
            deltaY,
            direction: 1,
            openGesturesBlocked: false,
          });
          if (
            !canBeginMobilePanelGesture(motionState.value, "explorer", position.value) ||
            horizontalScroll?.activeGestureStartedScrolled.value ||
            panIntent === "fail"
          ) {
            stateManager.fail();
            return;
          }
          if (panIntent === "activate") {
            stateManager.activate();
          }
        })
        .onStart(() => {
          startedRevision.value = beginGesture({
            origin: "explorer",
          });
        })
        .onUpdate((event) => {
          updateGesture(startedRevision.value, 1 - event.translationX / windowWidth);
        })
        .onEnd((event, success) => {
          const shouldClose = event.translationX > windowWidth / 3 || event.velocityX > 500;
          const result = finishGesture({
            startedRevision: startedRevision.value,
            target: shouldClose ? "home" : "explorer",
            success,
          });
          if (result) {
            scheduleOnRN(commit, result.startedRevision);
          }
        }),
    [
      beginGesture,
      commit,
      finishGesture,
      horizontalScroll?.activeGestureStartedScrolled,
      motionState,
      position,
      rightCloseGestureRef,
      startedRevision,
      touchStartX,
      touchStartY,
      updateGesture,
      windowWidth,
    ],
  );

  return { gesture, gestureRef: rightCloseGestureRef };
}

export function useExplorerCloseGestureRef() {
  return useMobilePanelsRuntime().rightCloseGestureRef;
}
