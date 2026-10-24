// Ported from getpaseo/paseo (Apache-2.0)
import { forwardRef } from "react";
import { Pressable } from "react-native";
import type { PressHighlightProps } from "./press-highlight.types";
import type { ViewInstance } from "react-native";

export const PressHighlight = forwardRef<ViewInstance, PressHighlightProps>(function PressHighlight(
  { highlightStyle: _highlightStyle, ...props },
  ref,
) {
  return <Pressable ref={ref} {...props} />;
});
