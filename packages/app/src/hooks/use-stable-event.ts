// Ported from getpaseo/paseo (Apache-2.0)
import { useCallback, useRef } from "react";

export function useStableEvent<TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  return useCallback((...args: TArgs) => handlerRef.current(...args), []);
}
