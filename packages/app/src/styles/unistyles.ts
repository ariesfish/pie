// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/styles/unistyles.ts
import { StyleSheet } from "react-native-unistyles";
import { REGISTERED_THEMES } from "./theme";

StyleSheet.configure({
	themes: REGISTERED_THEMES,
	breakpoints: {
		xs: 0,
		sm: 576,
		md: 720,
		lg: 992,
		xl: 1200,
	},
	settings: {
		// v1 ships one theme (DESIGN.md §Elevation & Depth). A dark theme needs
		// its own tokens, a real toggle and a contrast re-check before it is
		// registered here.
		initialTheme: "light",
	},
});

// Type augmentation for TypeScript
type AppThemes = typeof REGISTERED_THEMES;

interface AppBreakpoints {
	xs: number;
	sm: number;
	md: number;
	lg: number;
	xl: number;
}

declare module "react-native-unistyles" {
	export interface UnistylesThemes extends AppThemes {}
	export interface UnistylesBreakpoints extends AppBreakpoints {}
}
