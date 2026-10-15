// Ported from getpaseo/paseo (Apache-2.0) — agent-stream/strategy-resolver.ts.
// [pie] W4b: the forward-stream web viewport (paseo strategy-web.tsx,
// ~1.4k lines of DOM overflow-anchor + virtualization) lands in a later
// batch; until then the web platform resolves to the forward *config*
// through the fallback pair so the ported test matrix stays honest.
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
