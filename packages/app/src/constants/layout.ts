// Layout constants (paseo's @/constants/layout pattern, trimmed):
// compact = phones / split view; regular = desktop/tablet three-pane shell.
import { useWindowDimensions } from "react-native";

export const COMPACT_BREAKPOINT = 720;

/** Desktop header content row height. Ported from getpaseo/paseo (Apache-2.0). */
export const HEADER_INNER_HEIGHT = 36;
export const HEADER_INNER_HEIGHT_MOBILE = 56;
export const HEADER_TOP_PADDING_MOBILE = 8;

/** Secondary row under the workspace header (content toolbars). Ported from getpaseo/paseo (Apache-2.0). */
export const WORKSPACE_SECONDARY_HEADER_HEIGHT = 36;

/** Electron runtime detection re-exports. Ported from getpaseo/paseo (Apache-2.0). */
export {
	getIsElectron as getIsElectronRuntime,
	getIsElectronMac as getIsElectronRuntimeMac,
} from "./platform";

/** Compact layouts are the breakpoints below `md`. Ported from getpaseo/paseo (Apache-2.0). */
export function isCompactBreakpoint(breakpoint: string | undefined): boolean {
	return breakpoint === "xs" || breakpoint === "sm";
}

export function useIsCompactFormFactor(): boolean {
	const { width } = useWindowDimensions();
	return width < COMPACT_BREAKPOINT;
}

/** Desktop sidebar width (DESIGN.md §Grid & Container: fixed 232). */
export const SIDEBAR_WIDTH = 232;
