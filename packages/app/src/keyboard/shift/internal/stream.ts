// Ported from getpaseo/paseo (Apache-2.0) — keyboard/shift/internal/stream.ts.
// [pie] W4b stub: paseo's settled keyboard-shift store (the full
// keyboard/shift family, ~390 lines) is not ported yet; without it the
// resolved inset is zeroed on both platforms and the inverted list ages
// its scroll range on its own mechanics.
import { useMemo } from "react";

/** Preserve the translated inverted list's far-end scroll range (pie: zeroed until the shift family lands). */
export function useKeyboardStreamInset() {
  return useMemo(
    () => ({
      contentContainerPaddingBottom: 0,
      contentInset: undefined,
    }),
    [],
  );
}
