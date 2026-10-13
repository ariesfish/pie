// Diff view (P2b-3): structured model (buildDiffModel) rendered with dual
// old/new line numbers, word-level changed-segment emphasis, collapsible
// context gaps and horizontal scroll. Replaces the plain colored patch text.
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { buildDiffModel, type DiffRow } from "./diff-model";

export function DiffView({ patch, binary }: { patch: string; binary: boolean }) {
	const { theme } = useUnistyles();
	const [expandedGaps, setExpandedGaps] = useState<Record<number, boolean>>({});
	const model = useMemo(() => buildDiffModel(patch), [patch]);
	const hidden = useMemo(
		() =>
			new Set(
				model.collapseRanges.flatMap((r, idx) =>
					expandedGaps[idx] ? [] : range(r.start, r.end),
				),
			),
		[model.collapseRanges, expandedGaps],
	);

	if (binary) {
		return (
			<Text style={[styles.code, { color: theme.colors.foregroundMuted, fontStyle: "italic", padding: 8 }]}>
				binary file
			</Text>
		);
	}

	const gapStarts = new Map(
		model.collapseRanges.map((r, idx) => [r.start, { idx, r }]),
	);

	return (
		<ScrollView horizontal nestedScrollEnabled>
			<View style={styles.block}>
				{model.rows.map((row, i) => {
					const gap = gapStarts.get(i);
					if (gap) {
						const { idx, r } = gap;
						const open = !!expandedGaps[idx];
						const rangeNodes = open ? null : range(r.start, r.end);
						const skipped = open ? 0 : (rangeNodes?.length ?? 0);
						return (
							<Pressable
								key={i}
								style={styles.foldRow}
								onPress={() => setExpandedGaps((s) => ({ ...s, [idx]: !s[idx] }))}
							>
								<Text style={styles.foldText}>
									{open
										? "⌃ 收起未变区块"
										: `⋯ ${r.hidden} unchanged lines · 展开`}
								</Text>
								{skipped > 0 ? <View style={styles.foldPad} /> : null}
							</Pressable>
						);
					}
					if (hidden.has(i)) return null;
					return <DiffLineRow key={i} row={row} />;
				})}
			</View>
		</ScrollView>
	);
}

function DiffLineRow({ row }: { row: DiffRow }) {
	switch (row.type) {
		case "hunk":
			return (
				<View style={[styles.line, styles.hunkRow]}>
					<Text style={styles.gutterA} />
					<Text style={styles.gutterB} />
					<Text style={styles.hunk}>{row.header}</Text>
				</View>
			);
		case "context":
			return (
				<View style={styles.line}>
					<Text style={styles.gutterA}>{row.oldN}</Text>
					<Text style={styles.gutterB}>{row.newN}</Text>
					<Text style={styles.ctx}>{row.text === "" ? " " : row.text}</Text>
				</View>
			);
		case "del":
			return (
				<View style={styles.line}>
					<Text style={styles.gutterA}>{row.oldN}</Text>
					<Text style={styles.gutterB} />
					<Text style={styles.del}>
						{row.segs.map((s, i) => (
							<Text
								key={i}
								style={s.changed ? styles.segDelOn : undefined}
							>
								{s.text === "" ? " " : s.text}
							</Text>
						))}
					</Text>
				</View>
			);
		case "add":
			return (
				<View style={styles.line}>
					<Text style={styles.gutterA} />
					<Text style={styles.gutterB}>{row.newN}</Text>
					<Text style={styles.add}>
						{row.segs.map((s, i) => (
							<Text
								key={i}
								style={s.changed ? styles.segAddOn : undefined}
							>
								{s.text === "" ? " " : s.text}
							</Text>
						))}
					</Text>
				</View>
			);
	}
}

function range(start: number, end: number): number[] {
	const out: number[] = [];
	for (let i = start; i < end; i++) out.push(i);
	return out;
}

const styles = StyleSheet.create((theme) => ({
	block: { paddingVertical: theme.spacing[1], minWidth: "100%" },
	line: { flexDirection: "row", alignItems: "flex-start", minHeight: 18 },
	gutterA: {
		width: 44,
		textAlign: "right",
		paddingRight: 8,
		color: theme.colors.foregroundExtraMuted,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: 18,
	},
	gutterB: {
		width: 44,
		textAlign: "right",
		paddingRight: 10,
		color: theme.colors.foregroundExtraMuted,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: 18,
		borderRightWidth: theme.borderWidth[1],
		borderRightColor: theme.colors.border,
		marginRight: 8,
	},
	code: {
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		color: theme.colors.foreground,
	},
	hunkRow: { backgroundColor: theme.colors.interactionHighlight },
	hunk: {
		color: theme.colors.accentBright,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: 18,
	},
	ctx: {
		color: theme.colors.foregroundMuted,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: 18,
	},
	del: {
		color: theme.colors.statusDanger,
		backgroundColor: theme.colors.statusDangerTint,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: 18,
		flexShrink: 1,
	},
	segDelOn: { fontWeight: "700", textDecorationLine: "underline" },
	add: {
		color: theme.colors.statusSuccess,
		backgroundColor: theme.colors.statusSuccessTint,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: 18,
		flexShrink: 1,
	},
	segAddOn: { fontWeight: "700", textDecorationLine: "underline" },
	foldRow: {
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.md,
		marginVertical: 2,
		marginLeft: 96,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 2,
		alignSelf: "flex-start",
	},
	foldText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	foldPad: { height: 0 },
}));
