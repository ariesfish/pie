// Ported from getpaseo/paseo (Apache-2.0)
export function getMenuSheetBottomPadding(input: {
  safeAreaBottom: number;
  breathingRoom: number;
}): number {
  return input.safeAreaBottom + input.breathingRoom;
}
