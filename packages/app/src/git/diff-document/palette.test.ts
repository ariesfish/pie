// Ported from getpaseo/paseo (Apache-2.0)
import { describe, expect, it } from "vitest";
import { lightTheme } from "@/styles/theme";
import { codeLineNumberTone, codeTextColor, createDiffPalette, retainDiffPalette } from "./palette";
import type { DiffCell, DiffPalette } from "./types";

describe("diff text color", () => {
  it.each(["add", "remove", "context"] as const)(
    "uses normal code foreground for an untokenized %s line",
    (type) => {
      expect(codeTextColor(cell(type), palette)).toBe("foreground");
    },
  );

  // DESIGN.md §Components/Cards: diff line numbers are `ink-3`, i.e. the quiet
  // foreground tone, on every row type; the row tint carries the semantics.
  it.each(["add", "remove", "context"] as const)(
    "keeps the %s line number on the quiet gutter tone",
    (type) => {
      expect(codeLineNumberTone(cell(type))).toBe("foregroundMuted");
    },
  );

  it("paints the gutter with the ink-3 token (DESIGN.md §Components/Cards)", () => {
    expect(createDiffPalette(lightTheme).foregroundMuted).toBe(lightTheme.colors.foregroundExtraMuted);
  });
});

describe("diff palette retention", () => {
  it("retains the previous value when a theme wrapper recreates equal colors", () => {
    const recreated = { ...palette, syntax: { keyword: "purple" } };
    const previous = { ...recreated, syntax: { keyword: "purple" } };

    expect(retainDiffPalette(previous, recreated)).toBe(previous);
  });

  it("accepts a real color change", () => {
    const changed = { ...palette, foreground: "new-foreground" };

    expect(retainDiffPalette(palette, changed)).toBe(changed);
  });
});

describe("semantic diff colors", () => {
  const theme = lightTheme;
  it("uses the fixed DESIGN diff tints on the code paper", () => {
    const created = createDiffPalette(theme);

    expect(created.surface).toBe(theme.colors.surfaceCode);
    expect(created.headerSurface).toBe(theme.colors.surfaceCode);
    expect(created.emptyBackground).toBe(theme.colors.surfaceCode);
    expect(created.addition).toBe(theme.colors.statusSuccess);
    expect(created.deletion).toBe(theme.colors.statusDanger);
    expect(created.additionBackground).toBe(theme.colors.diffAdd);
    expect(created.deletionBackground).toBe(theme.colors.diffDel);
  });
});

const palette: DiffPalette = {
  surface: "surface",
  headerSurface: "header",
  border: "border",
  foreground: "foreground",
  foregroundMuted: "muted",
  addition: "green",
  deletion: "red",
  additionBackground: "green-bg",
  deletionBackground: "red-bg",
  emptyBackground: "empty",
  selection: "selection",
  headerActiveSurface: "active-header",
  headerBorder: "header-border",
  statusSuccess: "success",
  statusDanger: "danger",
  statusWarning: "warning",
  syntax: {},
};

function cell(type: DiffCell["type"]): DiffCell {
  return {
    type,
    content: "code",
    lineNumber: 1,
    tokens: [],
    fragments: [],
    reviewTarget: null,
    sourceIdentity: { hunkIndex: 0, lineIndex: 1, side: "new" },
  };
}
