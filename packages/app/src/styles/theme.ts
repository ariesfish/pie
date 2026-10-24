// Pie design tokens — the single source of truth for colour, type, spacing,
// radius and elevation. Contract: /DESIGN.md (v1.4, quiet-saas ink).
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
// Scales
// ---------------------------------------------------------------------------

/** Spacing scale. Layout rhythm is 4-based; 2/6 are control-internals half steps. */
export const SPACING = {
	0.5: 2,
	1: 4,
	1.5: 6,
	2: 8,
	3: 12,
	4: 16,
	6: 24,
	8: 32,
	12: 48,
} as const;

/** Type scale. 12px is the floor; body is 15 (DESIGN.md §Typography). */
export const FONT_SIZE = {
	ui: 13,
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
} as const;

/** Radius by role: chips 4, controls 6, cards 10, overlays 14, sheets 16. */
export const BORDER_RADIUS = {
	sm: 4,
	md: 6,
	lg: 10,
	xl: 14,
	"2xl": 16,
	full: 999,
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

// React Native fontFamily takes a real platform font name, not a CSS stack.
// iOS special-cases "System"; Android uses its sans-serif/monospace families.
export const DEFAULT_UI_FONT_STACK: string = Platform.select({
	ios: "System",
	android: "sans-serif",
	web: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
	default: "System",
});

export const DEFAULT_MONO_FONT_STACK: string = Platform.select({
	ios: "Menlo",
	android: "monospace",
	web: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
	default: "monospace",
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
	/** Monochrome emphasis: ink itself, not a second hue. */
	accent: string;
	accentForeground: string;
	destructive: string;
}

const statusColors = {
	statusSuccess: "#1f7a4d",
	statusDanger: "#b42318",
	statusWarning: "#9a6700",
};

/**
 * Fixed soft tints from DESIGN.md §Colors. They are opaque values, not a
 * low-alpha status hue: the chip must render the same colour on every surface,
 * and the measured contrast has to hold for the documented value.
 */
const statusSofts = {
	statusSuccessSoft: "#e7f4ec",
	statusWarningSoft: "#f3ede0",
	statusDangerSoft: "#fdecea",
};

export function buildSemanticColors(tint: ThemeTint) {
	const foreground = tint.foreground ?? "#14161a";
	return {
		// Surfaces: canvas → sub → raise → strong step (DESIGN.md §Surface).
		surface0: tint.surface0,
		surface1: tint.surface1,
		surface2: tint.surface2,
		surface3: tint.surface3,
		/** Code and diff paper (DESIGN.md §Surface: neutral, never the sidebar tint). */
		surfaceCode: "#f8f9fb",
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

		// Monochrome emphasis: ink is the accent, reserved for primary
		// actions, running state and focus. Semantic status colours are the
		// only remaining hues in the product UI.
		accent: tint.accent,
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
		...statusSofts,
		/**
		 * Diff row tints from DESIGN.md §Colors. Fixed values, not alpha over the
		 * canvas: the diff paper is `surfaceCode`, so a derived tint would change
		 * with that surface.
		 */
		diffAdd: "#eaf6ee",
		diffDel: "#fbeae8",
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
	accent: "#14161a",
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
