// Layout constants (paseo's @/constants/layout pattern, trimmed):
// compact = phones / split view; regular = desktop/tablet three-pane shell.
import { useWindowDimensions } from "react-native";

export const COMPACT_BREAKPOINT = 720;

/** Compact layouts are the breakpoints below `md`. Ported from getpaseo/paseo (Apache-2.0). */
export function isCompactBreakpoint(breakpoint: string | undefined): boolean {
	return breakpoint === "xs" || breakpoint === "sm";
}

export function useIsCompactFormFactor(): boolean {
	const { width } = useWindowDimensions();
	return width < COMPACT_BREAKPOINT;
}

export const EXPLORER_WIDTH = 240;
export const SIDEBAR_WIDTH = 200;
