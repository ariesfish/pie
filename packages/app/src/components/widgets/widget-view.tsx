// Ext-widget surface (P2c typed widgets): shape-detection over the v1 line
// set — progress rows render as a styled bar, checkbox rows as check lines,
// everything else normalizes to markdown and rides MarkdownRenderer (compact
// §6.5 heuristic layer until Pi grows a typed setWidget protocol.
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { X } from "lucide-react-native";

import { MarkdownRenderer } from "@/components/markdown/renderer";

export interface WidgetSurface {
	sessionId: string;
	key: string;
	lines: string[];
	placement?: string;
}

/** One widget card; renders above the composer in the chat surface. */
export function WidgetView({ widget }: { widget: WidgetSurface }) {
	const { theme } = useUnistyles();
	const { chunks, progress } = useMemo(
		() => decompose(widget.lines),
		[widget.lines],
	);
	return (
		<View style={styles.card}>
			<Text style={styles.key}>{widget.key}</Text>
			{progress != null && (
				<View style={styles.barWrap}>
					<View style={[styles.barFill, { width: `${Math.min(100, Math.round(progress * 100))}%` }]} />
					<Text style={styles.barLabel}>{Math.round(progress * 100)}%</Text>
				</View>
			)}
			{progress != null && null}
			{chunks.map((chunk, i) =>
				chunk.kind === "plan" ? (
					<View key={i} style={styles.planWrap}>
						{chunk.rows.map((row, j) => (
							<Pressable key={j} style={styles.planRow} onPress={row.onPress}>
								<Text style={[styles.planBox, row.done && styles.planBoxOn]}>{row.done ? "☑" : "☐"}</Text>
								<Text style={[styles.planText, row.done && styles.planTextOn]}>{row.text}</Text>
							</Pressable>
						))}
					</View>
				) : (
					<MarkdownRenderer key={i} compact text={chunk.text} />
				),
			)}
			{/* clear affordance mirrors clear:true semantics (best-effort UX) */}
			<Text style={styles.placement}>{widget.placement ?? ""}</Text>
		</View>
	);
}

type Chunk =
	| { kind: "md"; text: string }
	| { kind: "plan"; rows: Array<{ text: string; done: boolean; onPress?: () => void }> };

interface Decomposed {
	chunks: Chunk[];
	progress: number | null;
}

const PROGRESS_RE = /^(?:\[?)(\d{1,3})\s*%(\]?)\s*:?\s*(.*)$/;
const CHECKBOX_RE = /^\s*[-*]?\s*\[([ xX✓])\]\s*(.+)$/;

function decompose(lines: string[]): Decomposed {
	const chunks: Chunk[] = [];
	let md: string[] = [];
	let progress: number | null = null;

	const flushMd = () => {
		if (md.length > 0 && md.join("").trim().length > 0) {
			chunks.push({ kind: "md", text: md.join("\n") });
		}
		md = [];
	};

	let i = 0;
	while (i < lines.length) {
		const line = lines[i]!;
		// a consecutive run of checkbox rows becomes one plan block
		if (CHECKBOX_RE.test(line)) {
			flushMd();
			const rows: Array<{ text: string; done: boolean }> = [];
			while (i < lines.length && CHECKBOX_RE.test(lines[i]!)) {
				const m = CHECKBOX_RE.exec(lines[i]!)!;
				rows.push({ text: m[2]!, done: m[1] !== " " });
				i += 1;
			}
			chunks.push({ kind: "plan", rows });
			continue;
		}
		const pm = PROGRESS_RE.exec(line.trim());
		if (pm && Number.parseInt(pm[1]!, 10) <= 100) {
			// pure progress line (possibly with a following label)
			const label = pm[3];
			if (label) md.push(label);
			progress = Number.parseInt(pm[1]!, 10) / 100;
			i += 1;
			continue;
		}
		md.push(line);
		i += 1;
	}
	flushMd();
	return { chunks, progress };
}

const styles = StyleSheet.create((theme) => ({
	card: {
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		padding: theme.spacing[3],
		gap: theme.spacing[2],
	},
	key: {
		color: theme.colors.accentBright,
		fontSize: theme.fontSize.sm,
		fontFamily: theme.fontFamily.mono,
	},
	barWrap: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		height: 14,
	},
	barFill: {
		height: 8,
		borderRadius: theme.borderRadius.full,
		backgroundColor: theme.colors.accent,
	},
	barLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	planWrap: { gap: 2, alignSelf: "stretch" },
	planRow: { flexDirection: "row", gap: theme.spacing[2], alignItems: "center" },
	planBox: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.content },
	planBoxOn: { color: theme.colors.statusSuccess },
	planText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.content, flex: 1 },
	planTextOn: { color: theme.colors.foregroundExtraMuted, textDecorationLine: "line-through" },
	placement: { color: theme.colors.foregroundExtraMuted, fontSize: 10, alignSelf: "flex-end" },
}));
