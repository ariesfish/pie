// [pie] bridges pie's unistyles theme into the ported file-pane's
// EditorVisualTheme (paseo builds this from its own theme store).
import type { Theme } from "@/styles/theme";
import type { EditorVisualTheme } from "./editor/extensions.web";

export function editorVisualTheme(theme: Theme): EditorVisualTheme {
	return {
		colorScheme: theme.colorScheme === "light" ? "light" : "dark",
		background: theme.colors.surface0,
		foreground: theme.colors.foreground,
		cursor: theme.colors.accent,
		foregroundMuted: theme.colors.foregroundMuted,
		border: theme.colors.border,
		selection: theme.colors.surface3,
		monoFont: theme.fontFamily.mono,
		codeFontSize: theme.fontSize.code,
		syntax: theme.colors.syntax,
	};
}
