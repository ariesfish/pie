// Ported from getpaseo/paseo (Apache-2.0)
import type { Theme } from "@/styles/theme";
import type { DiffCell, DiffPalette } from "./types";

/**
 * The diff lives on the code paper (`surface-code`, DESIGN.md §Surface) and the
 * row tints are the fixed `diff-add` / `diff-del` tokens. Both are opaque
 * design values: an alpha over the canvas would change meaning if the paper
 * token moved.
 */
export function createDiffPalette(theme: Theme): DiffPalette {
  return {
    surface: theme.colors.surfaceCode,
    headerSurface: theme.colors.surfaceCode,
    border: theme.colors.border,
    foreground: theme.colors.foreground,
    // Line numbers are the quietest text in the diff: ink-3 (DESIGN.md
    // §Components/Cards: "行号 ink-3"). This field names the gutter tone, so it
    // carries ink-3; last line/header text uses `foreground`/`foregroundMuted`.
    foregroundMuted: theme.colors.foregroundExtraMuted,
    addition: theme.colors.statusSuccess,
    deletion: theme.colors.statusDanger,
    additionBackground: theme.colors.diffAdd,
    deletionBackground: theme.colors.diffDel,
    emptyBackground: theme.colors.surfaceCode,
    // [pie] paseo reads xterm-blue from its ANSI terminal palette; pie's
    // theme carries no terminal group (W4 terminal ADR). With the monochrome
    // ink accent, a neutral strong line is the selection fill.
    selection: theme.colors.borderAccent,
    headerActiveSurface: theme.colors.surface1,
    headerBorder: theme.colors.borderAccent,
    statusSuccess: theme.colors.statusSuccess,
    statusDanger: theme.colors.statusDanger,
    statusWarning: theme.colors.statusWarning,
    syntax: theme.colors.syntax,
  };
}

export function retainDiffPalette(previous: DiffPalette, next: DiffPalette): DiffPalette {
  if (
    previous.surface !== next.surface ||
    previous.headerSurface !== next.headerSurface ||
    previous.border !== next.border ||
    previous.foreground !== next.foreground ||
    previous.foregroundMuted !== next.foregroundMuted ||
    previous.addition !== next.addition ||
    previous.deletion !== next.deletion ||
    previous.additionBackground !== next.additionBackground ||
    previous.deletionBackground !== next.deletionBackground ||
    previous.emptyBackground !== next.emptyBackground ||
    previous.selection !== next.selection ||
    previous.headerActiveSurface !== next.headerActiveSurface ||
    previous.headerBorder !== next.headerBorder ||
    previous.statusSuccess !== next.statusSuccess ||
    previous.statusDanger !== next.statusDanger ||
    previous.statusWarning !== next.statusWarning ||
    !sameColorMap(previous.syntax, next.syntax)
  ) {
    return next;
  }
  return previous;
}

function sameColorMap(left: Record<string, string>, right: Record<string, string>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

export function codeTextColor(cell: DiffCell, palette: DiffPalette): string {
  return cell.type === "header" ? palette.foregroundMuted : palette.foreground;
}

export function codeLineNumberTone(cell: DiffCell): "addition" | "deletion" | "foregroundMuted" {
  "worklet";
  // Every gutter uses the quiet text tone: the row tint already carries the
  // semantics, and a coloured gutter would spend the limited chroma budget on
  // decoration (DESIGN.md §Components/Cards: "行号 ink-3").
  void cell;
  return "foregroundMuted";
}
