// Ported from getpaseo/paseo (Apache-2.0)
export function reviewGapTop(rowY: number, rowHeight: number, reviewHeight: number): number {
  "worklet";
  return rowY + rowHeight - reviewHeight;
}

export function reviewDividerHeight(rowHeight: number): number {
  "worklet";
  return rowHeight;
}

export function reviewBackgroundPaint<Paint>(surface: Paint): Paint {
  "worklet";
  return surface;
}
