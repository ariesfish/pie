export { useKeyboardStreamInset } from "./internal/stream";

// [pie] W4b stub of the keyboard-shift store family (provider/translate
// machinery unported). Consumers see a stationary zero shift via real
// animated shared values, so useAnimatedReaction wiring stays live and
// keyboard-driven dismissal stays inert until the real store lands.
import { useSharedValue } from "react-native-reanimated";

export function useKeyboardShift(): {
  shift: { value: number };
  layoutShift: { value: number };
  isMoving: { value: boolean };
  bottomInset: { value: number };
} {
  const shift = useSharedValue(0);
  const layoutShift = useSharedValue(0);
  const isMoving = useSharedValue(false);
  const bottomInset = useSharedValue(0);
  return { shift, layoutShift, isMoving, bottomInset };
}

/** [pie] stub alias for the settled-shift selector. */
export function useSettledKeyboardShift(): number {
  return 0;
}
