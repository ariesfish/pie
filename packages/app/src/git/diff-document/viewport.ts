// Ported from getpaseo/paseo (Apache-2.0)
export interface DiffViewport {
  width: number;
  height: number;
}

export function retainDiffViewport(current: DiffViewport, next: DiffViewport): DiffViewport {
  if (next.width <= 0 || next.height <= 0) return current;
  if (current.width === next.width && current.height === next.height) return current;
  return next;
}
