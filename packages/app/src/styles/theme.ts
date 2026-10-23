// Pie design tokens — the single source of truth for colour, type, spacing,
// radius and elevation. Contract: /DESIGN.md (v1, quiet-saas).
//
// Rules (docs/CONSTRAINTS.md C5): components read these tokens; they never
// introduce their own hex/rgba. Adding or changing a value is a DESIGN.md
// decision first, code second.
//
// Structure is inherited from getpaseo/paseo (Apache-2.0); the values are Pie's
// own (ADR-0007: Paseo supplies structure, Pie owns the skin).

import { lightHighlightColors } from "@getpaseo/highlight";
import { Platform } from "react-native";

// ---------------------------------------------------------------------------
// Raw palette (scales only — never referenced directly by components)
// ---------------------------------------------------------------------------

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
// Scales
// ---------------------------------------------------------------------------

/** Spacing scale. Layout rhythm is 4-based (DESIGN.md §Layout). */
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

/** Type scale. 12px is the floor; body is 15 (DESIGN.md §Typography). */
export const FONT_SIZE = {
	code: 12.5,
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

/** Radius by role: chips 4, controls 6, cards 10, overlays 14, sheets 16. */
export const BORDER_RADIUS = {
	sm: 4,
	md: 6,
	lg: 10,
	xl: 14,
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

/** Conversation column max width (DESIGN.md §Layout). */
export const DEFAULT_CONTENT_MAX_WIDTH = 720;

// ---------------------------------------------------------------------------
// Semantic colours
// ---------------------------------------------------------------------------

export interface ThemeTint {
	surface0: string;
	surface1: string;
	surface2: string;
	surface3: string;
	surfaceSidebar: string;
	foreground?: string;
	foregroundMuted: string;
	foregroundExtraMuted: string;
	border: string;
	borderAccent: string;
	accent: string;
	accentBright: string;
	accentForeground: string;
	destructive: string;
}

const statusColors = {
	statusSuccess: "#1f7a4d",
	statusDanger: "#b42318",
	statusWarning: "#9a6700",
	statusMerged: "#6b4ba1",
};

/** Status tints carry a 12% alpha suffix so chips read as states, not fills. */
function statusTints(colors: typeof statusColors, alphaHex: string) {
	return {
		statusSuccessTint: `${colors.statusSuccess}${alphaHex}`,
		statusDangerTint: `${colors.statusDanger}${alphaHex}`,
		statusWarningTint: `${colors.statusWarning}${alphaHex}`,
	};
}

export function buildSemanticColors(tint: ThemeTint) {
	const foreground = tint.foreground ?? "#14161a";
	return {
		// Surfaces: canvas → sub → raise → strong step (DESIGN.md §Surface).
		surface0: tint.surface0,
		surface1: tint.surface1,
		surface2: tint.surface2,
		surface3: tint.surface3,
		surfaceSidebar: tint.surfaceSidebar,
		surfaceSidebarHover: tint.surface2,
		surfaceSidebarSelected: tint.surface2,
		interactionHighlight: "rgba(20, 22, 26, 0.05)",

		// Text contrast on the canvas: 18.1:1 / 7.75:1 / 5.77:1. Tertiary still
		// clears AA on every surface it can land on — sub 5.39:1, raise 5.06:1,
		// strong step 4.57:1 — so timestamps never fall below the floor.
		foreground,
		foregroundMuted: tint.foregroundMuted,
		foregroundExtraMuted: tint.foregroundExtraMuted,

		border: tint.border,
		borderAccent: tint.borderAccent,

		// One accent hue, reserved for primary actions, running state and focus.
		accent: tint.accent,
		accentBright: tint.accentBright,
		accentForeground: tint.accentForeground,

		destructive: tint.destructive,
		destructiveForeground: "#ffffff",
		/** Text and icons sitting on an ink/accent/destructive fill. */
		onStrong: "#ffffff",
		/** Modal and drawer backdrop over the canvas. */
		scrim: "rgba(20, 22, 26, 0.45)",

		// Legacy alias names kept so older components keep compiling; both
		// resolve to the canvas and are the same white.
		background: tint.surface0,
		popover: tint.surface0,
		popoverForeground: foreground,
		primary: foreground,

		...statusColors,
		...statusTints(statusColors, "1f"),
	};
}

const pieLightColors = buildSemanticColors({
	surface0: "#ffffff",
	surface1: "#f6f7f9",
	surface2: "#eef0f4",
	surface3: "#e1e5eb",
	surfaceSidebar: "#f6f7f9",
	foregroundMuted: "#4b5361",
	foregroundExtraMuted: "#5d6678",
	border: "#e4e7ec",
	borderAccent: "#d0d5dd",
	accent: "#3b5bdb",
	accentBright: "#2f4bc0",
	accentForeground: "#ffffff",
	destructive: "#b42318",
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

/**
 * One elevation tier, for genuinely floating layers only (composer, menus,
 * permission cards, sheets, toasts). Static cards use a hairline instead.
 */
const shadow = {
	md: {
		shadowColor: "rgba(16, 24, 40, 0.08)",
		shadowOffset: { width: 0, height: 8 },
		shadowRadius: 24,
		elevation: 8,
	},
} as const;

export function buildLightTheme(semanticColors: ReturnType<typeof buildSemanticColors>) {
	return {
		colorScheme: "light" as const,
		colors: {
			...semanticColors,
			palette: baseColors,
			// Syntax groups come from @getpaseo/highlight (light set).
			syntax: lightHighlightColors,
		},
		shadow,
		...commonTheme,
	} as const;
}

export type Theme = ReturnType<typeof buildLightTheme>;

export const lightTheme = buildLightTheme(pieLightColors);

/**
 * v1 ships one theme (DESIGN.md §Elevation & Depth). A dark theme is a separate
 * decision: register it only together with a real settings toggle and a
 * contrast re-check of every token.
 */
export const REGISTERED_THEMES = {
	light: lightTheme,
} as const;
