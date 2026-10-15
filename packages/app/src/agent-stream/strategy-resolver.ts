// Ported from getpaseo/paseo (Apache-2.0) — agent-stream/strategy-resolver.ts.
// [pie] W4a stub: the platform strategies (strategy-web.tsx /
// strategy-native.tsx, ~2k lines each with their own test rigs) land in
// W4b together with the chat-list rewiring. Until then the resolver
// falls back to the native strategy, whose shape (FlatList inverted +
// maintainVisibleContentPosition) the Web RN implementation of FlatList
// also honors — the walkthrough runs the same assertions either way.
import type { ResolveStreamRenderStrategyInput, StreamStrategy } from "./strategy";
import {
  createNativeStreamStrategyFallback,
  createWebStreamStrategyFallback,
} from "./strategy-fallback";

export function resolveStreamRenderStrategy(
  input: ResolveStreamRenderStrategyInput,
): StreamStrategy {
  if (input.platform === "web") {
    return createWebStreamStrategyFallback();
  }
  return createNativeStreamStrategyFallback();
}
