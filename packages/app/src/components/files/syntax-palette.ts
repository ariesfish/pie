// Syntax token -> Pie theme colors. Style vocabulary taken from
// @getpaseo/highlight (HighlightStyle); palette values follow the tuned
// dark set shipped by paseo (Apache-2.0 reference) adjusted to Pie tints.
import type { HighlightStyle } from "@getpaseo/highlight";

export type SyntaxPalette = Record<HighlightStyle, string>;

/** Dark palette aligned with the Pie dark theme (#101216 surfaces). */
export const darkSyntaxPalette: SyntaxPalette = {
	keyword: "#7fa7e8",
	comment: "#5b6272",
	string: "#a8c98f",
	number: "#d4a668",
	literal: "#c9a0dc",
	function: "#82c4e0",
	definition: "#82c4e0",
	class: "#e0b97d",
	type: "#e0b97d",
	tag: "#7fa7e8",
	attribute: "#a8c98f",
	property: "#c9a0dc",
	variable: "#e6e9ef",
	operator: "#8b93a7",
	punctuation: "#8b93a7",
	regexp: "#d4a668",
	escape: "#d4a668",
	meta: "#8b93a7",
	heading: "#4a7bc8",
	link: "#4a7bc8",
};

/** Light palette aligned with the Pie light theme. */
export const lightSyntaxPalette: SyntaxPalette = {
	keyword: "#2f5ea8",
	comment: "#8b93a7",
	string: "#3e704a",
	number: "#8a5a1f",
	literal: "#7347af",
	function: "#1f6a86",
	definition: "#1f6a86",
	class: "#8a5a1f",
	type: "#8a5a1f",
	tag: "#2f5ea8",
	attribute: "#3e704a",
	property: "#7347af",
	variable: "#18181b",
	operator: "#5b6272",
	punctuation: "#5b6272",
	regexp: "#8a5a1f",
	escape: "#8a5a1f",
	meta: "#5b6272",
	heading: "#2b4c7e",
	link: "#2b4c7e",
};

export function paletteFor(colorScheme: string | undefined): SyntaxPalette {
	return colorScheme === "light" ? lightSyntaxPalette : darkSyntaxPalette;
}
