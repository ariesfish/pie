// Ported from getpaseo/paseo (Apache-2.0) — agent-stream/strategy-resolver.ts.
// [pie] W4b-2: both platform strategies are the real ones. The web
// viewport's chat-find bridge is stubbed until the find cone lands.
import type { ResolveStreamRenderStrategyInput, StreamStrategy } from "./strategy";
import { createNativeStreamStrategy } from "./strategy-native";
import { createWebStreamStrategy } from "./strategy-web";

export function resolveStreamRenderStrategy(
  input: ResolveStreamRenderStrategyInput,
): StreamStrategy {
  if (input.platform === "web") {
    return createWebStreamStrategy({ isMobileBreakpoint: false });
  }
  return createNativeStreamStrategy();
}
