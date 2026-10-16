// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/styles/theme.ts
// Trimmed for P2a: enough structure that A-class ported components compile
// unchanged (Theme slots, semantic builders, status colors, scales, shadows).
// Pie tints replace Paseo's teal with the Pie blue-violet family.

import { darkHighlightColors, lightHighlightColors } from "@getpaseo/highlight";
import { Platform } from "react-native";

export const baseColors = {
	// Base colors
	white: "#ffffff",
	black: "#000000",

	// Zinc scale (primary gray palette)
	zinc: {
		50: "#fafafa",
		100: "#f4f4f5",
		200: "#e4e4e7",
		300: "#d4d4d8",
		400: "#a1a1aa",
		500: "#71717a",
		600: "#52525b",
		700: "#3f3f46",
		800: "#27272a",
		850: "#1a1a1d",
		900: "#18181b",
		950: "#121214",
	},

	// Gray scale
	gray: {
		50: "#f9fafb",
		100: "#f3f4f6",
		200: "#e5e7eb",
		300: "#d1d5db",
		400: "#9ca3af",
		500: "#6b7280",
		600: "#4b5563",
		700: "#374151",
		800: "#1f2937",
		900: "#111827",
	},

	// Slate scale
	slate: {
		200: "#e2e8f0",
	},

	// Blue scale
	blue: {
		50: "#eff6ff",
		100: "#dbeafe",
		200: "#bfdbfe",
		300: "#93c5fd",
		400: "#60a5fa",
		500: "#3b82f6",
		600: "#2563eb",
		700: "#1d4ed8",
		800: "#1e40af",
		900: "#1e3a8a",
		950: "#172554",
	},

	// Green scale
	green: {
		100: "#dcfce7",
		200: "#bbf7d0",
		400: "#4ade80",
		500: "#22c55e",
		600: "#16a34a",
		800: "#166534",
		900: "#14532d",
	},

	// Red scale
	red: {
		100: "#fee2e2",
		200: "#fecaca",
		300: "#fca5a5",
		500: "#ef4444",
		600: "#dc2626",
		800: "#991b1b",
		900: "#7f1d1d",
	},

	// Teal scale
	teal: {
		200: "#99f6e4",
	},

	// Amber scale
	amber: {
		500: "#f59e0b",
		700: "#b45309",
	},

	// Yellow scale
	yellow: {
		400: "#fbbf24",
	},

	// Purple scale
	purple: {
		500: "#a855f7",
		600: "#9333ea",
	},

	// Orange scale
	orange: {
		500: "#f97316",
		600: "#ea580c",
	},
} as const;

// ---------------------------------------------------------------------------
// Status colors (upstream verbatim)
// ---------------------------------------------------------------------------

const lightStatusColors = {
	statusSuccess: "#3e704a",
	statusDanger: "#9d433b",
	statusWarning: "#7b5d39",
	statusMerged: "#7347af",
};

const darkStatusColors = {
	statusSuccess: "#6cb17b",
	statusDanger: "#d8847b",
	statusWarning: "#c09664",
	statusMerged: "#a890d5",
};

function statusTints(colors: typeof lightStatusColors, alphaHex: string) {
	return {
		statusSuccessTint: `${colors.statusSuccess}${alphaHex}`,
		statusDangerTint: `${colors.statusDanger}${alphaHex}`,
		statusWarningTint: `${colors.statusWarning}${alphaHex}`,
	};
}

const lightStatusTints = statusTints(lightStatusColors, "1f");
const darkStatusTints = statusTints(darkStatusColors, "29");

// ---------------------------------------------------------------------------
// Scales (upstream verbatim)
// ---------------------------------------------------------------------------

export const SPACING = {
	0: 0,
	0.5: 2,
	1: 4,
	1.5: 6,
	2: 8,
	3: 12,
	4: 16,
	6: 24,
	8: 32,
	12: 48,
	16: 64,
	20: 80,
	24: 96,
	32: 128,
} as const;

export const FONT_SIZE = {
	code: 12,
	content: 15,
	sm: 12,
	base: 14,
	lg: 16,
	xl: 18,
	"2xl": 20,
	"3xl": 22,
	"4xl": 26,
} as const;

export const LINE_HEIGHT = {
	diff: 22,
} as const;

export const ICON_SIZE = {
	xs: 12,
	sm: 14,
	md: 16,
	lg: 20,
} as const;

export const FONT_WEIGHT = {
	normal: "normal" as const,
	medium: "500" as const,
	semibold: "600" as const,
	bold: "bold" as const,
} as const;

export const BORDER_RADIUS = {
	none: 0,
	sm: 2,
	base: 4,
	md: 6,
	lg: 8,
	xl: 12,
	"2xl": 16,
	full: 9999,
} as const;

export const BORDER_WIDTH = {
	0: 0,
	1: 1,
	2: 2,
} as const;

export const OPACITY = {
	0: 0,
	50: 0.5,
	100: 1,
} as const;

export const ICON_STROKE_WIDTH = 1.5;

export const DEFAULT_UI_FONT_STACK: string = Platform.select({
	ios: "system-ui",
	default: "normal",
	web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
});

export const DEFAULT_MONO_FONT_STACK: string = Platform.select({
	ios: "ui-monospace",
	default: "monospace",
	web: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
});

export const DEFAULT_CONTENT_MAX_WIDTH = 820;

// ---------------------------------------------------------------------------
// Semantic color builders (upstream structure)
// ---------------------------------------------------------------------------

export interface DarkThemeConfig {
	surface0: string;
	surface1: string;
	surface2: string;
	surface3: string;
	surface4: string;
	surfaceSidebar: string;
	foreground?: string;
	foregroundMuted: string;
	foregroundExtraMuted: string;
	border: string;
	borderAccent: string;
	accent: string;
	accentBright: string;
	accentForeground?: string;
	destructive: string;
}

export function buildDarkSemanticColors(tint: DarkThemeConfig) {
	const foreground = tint.foreground ?? "#fafafa";
	return {
		surface0: tint.surface0,
		surface1: tint.surface1,
		surface2: tint.surface2,
		surface3: tint.surface3,
		surface4: tint.surface4,
		surfaceSidebar: tint.surfaceSidebar,
		surfaceSidebarHover: tint.surface1,
		surfaceSidebarSelected: tint.surface2,
		surfaceWorkspace: tint.surface1,
		interactionHighlight: "rgba(255, 255, 255, 0.08)",

		foreground,
		foregroundMuted: tint.foregroundMuted,
		foregroundExtraMuted: tint.foregroundExtraMuted,

		border: tint.border,
		borderAccent: tint.borderAccent,

		accent: tint.accent,
		accentBright: tint.accentBright,
		accentForeground: tint.accentForeground ?? "#ffffff",

		destructive: tint.destructive,
		destructiveForeground: "#ffffff",
		success: tint.accent,
		successForeground: "#ffffff",

		// Legacy aliases (for gradual migration)
		background: tint.surface0,
		popover: tint.surface2,
		popoverForeground: foreground,
		primary: foreground,
		primaryForeground: tint.surface0,
		secondary: tint.surface2,
		secondaryForeground: foreground,
		muted: tint.surface2,
		mutedForeground: tint.foregroundMuted,
		accentBorder: tint.borderAccent,
		input: tint.surface2,
		ring: "#d4d4d8",

		...darkStatusColors,
		...darkStatusTints,
	};
}

export interface LightThemeConfig {
	surface0: string;
	surface1: string;
	surface2: string;
	surface3: string;
	surface4: string;
	surfaceSidebar: string;
	foreground?: string;
	foregroundMuted: string;
	foregroundExtraMuted: string;
	border: string;
	accent: string;
	accentForeground: string;
	accentForegroundStrong?: string;
	destructive: string;
}

export function buildLightSemanticColors(tint: LightThemeConfig) {
	const foreground = tint.foreground ?? "#18181b";
	return {
		surface0: tint.surface0,
		surface1: tint.surface1,
		surface2: tint.surface2,
		surface3: tint.surface3,
		surface4: tint.surface4,
		surfaceSidebar: tint.surfaceSidebar,
		surfaceSidebarHover: tint.surface1,
		surfaceSidebarSelected: "#e4e4e7",
		surfaceWorkspace: "#ffffff",
		interactionHighlight: "rgba(0, 0, 0, 0.05)",

		foreground,
		foregroundMuted: tint.foregroundMuted,
		foregroundExtraMuted: tint.foregroundExtraMuted,

		border: tint.border,
		borderAccent: tint.border,

		accent: tint.accent,
		accentBright: tint.accent,
		accentForeground: tint.accentForeground,
		accentForegroundStrong: tint.accentForegroundStrong ?? tint.accentForeground,

		destructive: tint.destructive,
		destructiveForeground: "#ffffff",
		success: tint.accent,
		successForeground: tint.accentForeground,

		background: tint.surface0,
		popover: "#ffffff",
		popoverForeground: foreground,
		primary: foreground,
		primaryForeground: "#ffffff",
		secondary: tint.surface2,
		secondaryForeground: foreground,
		muted: tint.surface2,
		mutedForeground: tint.foregroundMuted,
		accentBorder: tint.border,
		input: "#ffffff",
		ring: "#a1a1aa",

		...lightStatusColors,
		...lightStatusTints,
	};
}

// ---------------------------------------------------------------------------
// Pie tints
// ---------------------------------------------------------------------------

// Pie dark — blue-violet tint matching the daemon demo page palette
const pieDarkColors = buildDarkSemanticColors({
	surface0: "#101216",
	surface1: "#1D212A",
	surface2: "#242936",
	surface3: "#2B3240",
	surface4: "#4B5262",
	surfaceSidebar: "#0C0E12",
	foregroundMuted: "#8B93A7",
	foregroundExtraMuted: "#5B6272",
	border: "#2B3240",
	borderAccent: "#3E4A66",
	accent: "#2B4C7E",
	accentBright: "#4A7BC8",
	destructive: "#B33A3A",
});

// Pie light
const pieLightColors = buildLightSemanticColors({
	// paseo.png grammar: the transcript column reads pure white; chrome lives
	// one step down in surface1/sidebar greys.
	surface0: "#FFFFFF",
	surface1: "#EDEFF3",
	surface2: "#E4E7ED",
	surface3: "#D5DAE3",
	surface4: "#B9C0CE",
	surfaceSidebar: "#F1F3F6",
	foregroundMuted: "#5B6272",
	foregroundExtraMuted: "#8B93A7",
	border: "#D5DAE3",
	accent: "#2B4C7E",
	accentForeground: "#ffffff",
	destructive: "#B33A3A",
});

// ---------------------------------------------------------------------------
// Theme assembly
// ---------------------------------------------------------------------------

const commonTheme = {
	spacing: SPACING,
	fontSize: FONT_SIZE,
	fontFamily: { ui: DEFAULT_UI_FONT_STACK, mono: DEFAULT_MONO_FONT_STACK },
	lineHeight: LINE_HEIGHT,
	contentMaxWidth: DEFAULT_CONTENT_MAX_WIDTH,
	iconSize: ICON_SIZE,
	fontWeight: FONT_WEIGHT,
	borderRadius: BORDER_RADIUS,
	borderWidth: BORDER_WIDTH,
	opacity: OPACITY,
};

const darkShadow = {
	sm: {
		shadowColor: "rgba(0, 0, 0, 0.25)",
		shadowOffset: { width: 0, height: 2 },
		shadowRadius: 4,
		elevation: 2,
	},
	md: {
		shadowColor: "rgba(0, 0, 0, 0.20)",
		shadowOffset: { width: 0, height: 4 },
		shadowRadius: 8,
		elevation: 8,
	},
	lg: {
		shadowColor: "rgba(0, 0, 0, 0.40)",
		shadowOffset: { width: 0, height: 12 },
		shadowRadius: 24,
		elevation: 8,
	},
} as const;

const lightShadow = {
	sm: {
		shadowColor: "rgba(0, 0, 0, 0.02)",
		shadowOffset: { width: 0, height: 2 },
		shadowRadius: 8,
		elevation: 2,
	},
	md: {
		shadowColor: "rgba(0, 0, 0, 0.04)",
		shadowOffset: { width: 0, height: 4 },
		shadowRadius: 8,
		elevation: 2,
	},
	lg: {
		shadowColor: "rgba(0, 0, 0, 0.08)",
		shadowOffset: { width: 0, height: 12 },
		shadowRadius: 24,
		elevation: 8,
	},
} as const;

export function buildDarkTheme(semanticColors: ReturnType<typeof buildDarkSemanticColors>) {
	return {
		colorScheme: "dark" as const,
		colors: {
			...semanticColors,
			palette: baseColors,
			// [port] syntax group from @getpaseo/highlight (paseo styles/theme.ts)
			syntax: darkHighlightColors,
		},
		shadow: darkShadow,
		...commonTheme,
	} as const;
}

export function buildLightTheme(semanticColors: ReturnType<typeof buildLightSemanticColors>) {
	return {
		colorScheme: "light" as const,
		colors: {
			...semanticColors,
			palette: baseColors,
			// [port] syntax group from @getpaseo/highlight (paseo styles/theme.ts)
			syntax: lightHighlightColors,
		},
		shadow: lightShadow,
		...commonTheme,
	} as const;
}

export type Theme = ReturnType<typeof buildDarkTheme> | ReturnType<typeof buildLightTheme>;

export const darkTheme = buildDarkTheme(pieDarkColors);
export const lightTheme = buildLightTheme(pieLightColors);

export const REGISTERED_THEMES = {
	dark: darkTheme,
	light: lightTheme,
} as const;
