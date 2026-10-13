// Native code viewer (P2b-2): tokenized lines via @getpaseo/highlight's
// highlightCode, rendered as monospace Text rows with a sticky gutter.
// Performance profile: files up to ~4k lines render fine on native; larger
// falls back to plain text (see presentation rules in files-panel).
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { highlightCode, type HighlightToken } from "@getpaseo/highlight";

import { paletteFor } from "./syntax-palette";

export interface CodeViewerProps {
	content: string;
	filename: string;
	editable?: boolean;
	value?: string;
	onChangeText?: (text: string) => void;
}

export function CodeViewer({ content, filename }: CodeViewerProps) {
	const { theme } = useUnistyles();
	const palette = paletteFor(theme.colorScheme === "light" ? "light" : "dark");

	const lines = useMemo(
		() => (content.length < 512 * 1024 ? highlightCode(content, filename) : null),
		[content, filename],
	);

	return (
		<ScrollView style={styles.wrap} nestedScrollEnabled>
			{lines ? (
				lines.map((tokens, i) => <Line key={i} n={i + 1} tokens={tokens} palette={palette} />)
			) : (
				<Text style={styles.plain}>{content}</Text>
			)}
		</ScrollView>
	);
}

function Line({ n, tokens, palette }: { n: number; tokens: HighlightToken[]; palette: Record<string, string> }) {
	return (
		<View style={styles.lineRow}>
			<Text style={styles.gutter}>{n}</Text>
			<Text style={styles.line}>
				{tokens.length === 0 ? " " : null}
				{tokens.map((t, i) =>
					t.style ? (
						<Text key={i} style={{ color: palette[t.style] ?? "#e6e9ef" }}>
							{t.text}
						</Text>
					) : (
						<Text key={i} style={{ color: "#e6e9ef" }}>
							{t.text}
						</Text>
					),
				)}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	wrap: { flex: 1, backgroundColor: theme.colors.surface0 },
	lineRow: { flexDirection: "row", alignItems: "flex-start", minHeight: 18 },
	gutter: {
		width: 48,
		textAlign: "right",
		paddingRight: 12,
		color: theme.colors.foregroundExtraMuted,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: 18,
	},
	line: {
		flex: 1,
		color: theme.colors.foreground,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: 18,
	},
	plain: {
		color: theme.colors.foreground,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		padding: 12,
	},
}));
