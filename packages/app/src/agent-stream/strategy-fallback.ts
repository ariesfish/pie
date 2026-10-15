// [pie] W4b-2: both platform viewports are real now (strategy-native +
// strategy-web). The web viewport's chat-find bridge is stubbed (see
// chat-find-bridge.web.ts).
import type { StreamStrategy } from "./strategy";
import { createStreamStrategy } from "./strategy";
import { createNativeStreamStrategy } from "./strategy-native";
import { createWebStreamStrategy } from "./strategy-web";
export function createNativeStreamStrategyFallback(): StreamStrategy {
  return createNativeStreamStrategy();
}

export function createWebStreamStrategyFallback(): StreamStrategy {
  return createWebStreamStrategy({ isMobileBreakpoint: false });
}
