// Ported from getpaseo/paseo (Apache-2.0)
export function isImeComposingKeyboardEvent(event: {
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  return Boolean(event.isComposing) || event.keyCode === 229;
}
