// Markdown viewer (P2b-2): markdown-it token tree -> React Native
// component tree, fully unistyles-themed — deliberately richer than paseo's
// preview at this stage: heading scale, quoted blocks, fenced code blocks
// with a language chip header + syntax-highlighted rows (via
// @getpaseo/highlight), tidy lists, tables with header emphasis, and
// pressable links. Used both for .md file preview and (P2c) chat messages.
import { useMemo, type ReactNode } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import MarkdownIt from "markdown-it";
import { highlightCode } from "@getpaseo/highlight";

import { paletteFor } from "./syntax-palette";

/** Structural slice of the unistyles theme (colors read by dotted key). */
interface ThemeLike {
	colors: { [k: string]: unknown };
	colorScheme: string;
}

function color(theme: ThemeLike, key: string): string {
	const v = theme.colors[key];
	return typeof v === "string" ? v : "#e6e9ef";
}

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
type Token = ReturnType<typeof md.parse>[number];

export function MdViewer({ source, inline }: { source: string; inline?: boolean }) {
	const { theme } = useUnistyles();
	const tokens = useMemo(() => md.parse(source, {}), [source]);
	const view = useMemo<ThemeLike>(
		() => ({ colors: flattenColors(theme), colorScheme: theme.colorScheme }),
		[theme],
	);
	return (
		<View style={[styles.root, inline === true && styles.rootInline]}>
			{renderBlocks(tokens, 0, tokens.length, view)}
		</View>
	);
}

/** Unwrap the unistyles proxies into plain string-only color records. */
function flattenColors(theme: unknown): { [k: string]: unknown } {
	const out: { [k: string]: unknown } = {};
	const colors = (theme as { colors: Record<string, unknown> }).colors;
	for (const [k, v] of Object.entries(colors)) {
		if (typeof v === "string") out[k] = v;
	}
	return out;
}

/** Render a [from, to) slice of block-level tokens. */
function renderBlocks(tokens: Token[], from: number, to: number, theme: ThemeLike): ReactNode[] {
	const out: ReactNode[] = [];
	let i = from;
	let key = 0;
	while (i < to) {
		const t = tokens[i]!;
		const k = `b${key++}`;
		switch (t.type) {
			case "heading_open": {
				const level = Number(t.tag.slice(1));
				const inline = tokens[i + 1];
				out.push(
					<Text key={k} style={headingStyle(level)}>
						{inline ? renderInline(inline.children ?? [], theme) : null}
					</Text>,
				);
				i += 3; // open, inline, close
				continue;
			}
			case "paragraph_open": {
				const inline = tokens[i + 1];
				out.push(
					<View key={k} style={styles.p}>
						<Text style={styles.pText}>{inline ? renderInline(inline.children ?? [], theme) : null}</Text>
					</View>,
				);
				i += 3;
				continue;
			}
			case "fence":
			case "code_block": {
				out.push(<Fence key={k} code={t.content} lang={t.info || ""} theme={theme} />);
				i += 1;
				continue;
			}
			case "blockquote_open": {
				const close = matchingClose(tokens, i, "blockquote_close");
				out.push(
					<View key={k} style={styles.quote}>
						{renderBlocks(tokens, i + 1, close, theme)}
					</View>,
				);
				i = close + 1;
				continue;
			}
			case "bullet_list_open": {
				const close = matchingClose(tokens, i, "bullet_list_close");
				out.push(
					<View key={k} style={styles.list}>
						{renderItems(tokens, i + 1, close, "bullet", theme)}
					</View>,
				);
				i = close + 1;
				continue;
			}
			case "ordered_list_open": {
				const close = matchingClose(tokens, i, "ordered_list_close");
				out.push(
					<View key={k} style={styles.list}>
						{renderItems(tokens, i + 1, close, "ordered", theme)}
					</View>,
				);
				i = close + 1;
				continue;
			}
			case "hr":
				out.push(<View key={k} style={styles.hr} />);
				i += 1;
				continue;
			case "table_open": {
				const close = matchingClose(tokens, i, "table_close");
				out.push(<Table key={k} tokens={tokens} from={i + 1} to={close} theme={theme} />);
				i = close + 1;
				continue;
			}
			case "html_block":
			case "front_matter$1":
				i += 1;
				continue;
			default:
				// unknown open/close pairs: skip a token at a time
				i += 1;
				continue;
		}
	}
	return out;
}

function renderItems(tokens: Token[], from: number, to: number, kind: "bullet" | "ordered", theme: ThemeLike): ReactNode[] {
	const out: ReactNode[] = [];
	let i = from;
	let n = 1;
	let key = 0;
	while (i < to) {
		const t = tokens[i]!;
		if (t.type === "list_item_open") {
			const close = matchingClose(tokens, i, "list_item_close");
			const inline = tokens.slice(i + 1, close).find((x) => x.type === "inline");
			const marker = kind === "bullet" ? "•" : `${n}.`;
			out.push(
				<View key={`li${key++}`} style={styles.item}>
					<Text style={styles.marker}>{marker}</Text>
					<Text style={styles.pText}>
						{inline ? renderInline(inline.children ?? [], theme) : null}
					</Text>
				</View>,
			);
			n += 1;
			i = close + 1;
			continue;
		}
		i += 1;
	}
	return out;
}

function Table({ tokens, from, to, theme }: { tokens: Token[]; from: number; to: number; theme: ThemeLike }) {
	// markdown-it emits thead_open/tbody_open/tr_open/th_open/inline…
	const rows: { cells: ReactNode[]; header: boolean }[] = [];
	let i = from;
	let inHeader = false;
	while (i < to) {
		const t = tokens[i]!;
		if (t.type === "thead_open") inHeader = true;
		else if (t.type === "thead_close") inHeader = false;
		else if (t.type === "tr_open") {
			const close = matchingClose(tokens, i, "tr_close");
			const cells: ReactNode[] = [];
			let j = i + 1;
			while (j < close) {
				const ct = tokens[j]!;
				if (ct.type === "th_open" || ct.type === "td_open") {
					const inline = tokens[j + 1];
					cells.push(
						<View key={cells.length} style={styles.cell}>
							<Text style={inHeader ? styles.thText : styles.tdText}>
								{inline ? renderInline(inline.children ?? [], theme) : ""}
							</Text>
						</View>,
					);
					j += 3;
					continue;
				}
				j += 1;
			}
			rows.push({ cells, header: inHeader });
			i = close + 1;
			continue;
		}
		i += 1;
	}
	return (
		<View style={styles.table}>
			{rows.map((r, idx) => (
				<View key={idx} style={[styles.row, r.header && styles.rowHead]}>
					{r.cells}
				</View>
			))}
		</View>
	);
}

function Fence({ code, lang, theme }: { code: string; lang: string; theme: ThemeLike }) {
	const lines = useMemo(
		() => highlightCode(code.replace(/\n$/, ""), lang ? `x.${lang}` : "x.txt"),
		[code, lang],
	);
	const pal = paletteFor(theme.colorScheme === "light" ? "light" : "dark");
	return (
		<View style={styles.codeWrap}>
			<View style={styles.codeHead}>
				<Text style={styles.codeLang}>{lang || "text"}</Text>
				{lines.length > 1 ? <Text style={styles.codeCount}>{lines.length} lines</Text> : null}
			</View>
			<ScrollViewHorizontal>
				<View style={styles.codeBody}>
					{lines.map((tokens, i) => (
						<Text key={i} style={styles.codeLine}>
							{tokens.length === 0 ? " " : null}
							{tokens.map((tok, j) => (
								<Text
									key={j}
									style={{ color: tok.style ? pal[tok.style] : color(theme, "foreground") } as { color: string }}
								>
									{tok.text}
								</Text>
							))}
						</Text>
					))}
				</View>
			</ScrollViewHorizontal>
		</View>
	);
}

function ScrollViewHorizontal({ children }: { children: ReactNode }) {
	// RN ScrollView with horizontal enables sideways code scrolling only.
	const { ScrollView } = require("react-native") as typeof import("react-native");
	return <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>{children}</ScrollView>;
}

/** Render markdown-it inline tokens to styled RN <Text> children. */
function renderInline(children: Token[], theme: ThemeLike): ReactNode[] {
	const out: ReactNode[] = [];
	let key = 0;
	let bold = 0;
	let italic = 0;
	let link: string | null = null;
	let i = 0;
	const push = (node: ReactNode) => out.push(node);

	while (i < children.length) {
		const t = children[i]!;
		switch (t.type) {
			case "text":
				push(
					<Text
						key={`t${key++}`}
						style={[bold > 0 && styles.bold, italic > 0 && styles.italic, link && styles.link]}
						onPress={link ? () => void Linking.openURL(link!) : undefined}
					>
						{t.content}
					</Text>,
				);
				break;
			case "code_inline":
				push(
					<Text key={`t${key++}`} style={styles.inlineCode}>
						{t.content}
					</Text>,
				);
				break;
			case "strong_open": bold += 1; break;
			case "strong_close": bold -= 1; break;
			case "em_open": italic += 1; break;
			case "em_close": italic -= 1; break;
			case "link_open": {
				const href = t.attrGet("href");
				link = typeof href === "string" ? href : "#";
				break;
			}
			case "link_close": link = null; break;
			case "image":
				{
					const src = t.attrGet("src");
					const url = typeof src === "string" ? src : null;
					push(
						<Pressable
							key={`t${key++}`}
							onPress={url ? () => void Linking.openURL(url) : undefined}
						>
							<Text style={styles.imageChip}>🖼 {t.content || url || "image"}</Text>
						</Pressable>,
					);
				}
				break;
				break;
			case "softbreak":
				push(<Text key={`t${key++}`}>{"\n"}</Text>);
				break;
			case "hardbreak":
				push(<Text key={`t${key++}`}>{"\n"}</Text>);
				break;
			case "html_inline":
				break;
			default:
				push(
					<Text key={`t${key++}`} style={styles.pText}>
						{t.content}
					</Text>,
				);
		}
		i += 1;
	}
	return out;
}

function matchingClose(tokens: Token[], from: number, closeType: string): number {
	let depth = 0;
	for (let j = from; j < tokens.length; j++) {
		const tt = tokens[j]!.type;
		if (tt === tokens[from]!.type) depth += 1;
		if (tt === closeType) {
			depth -= 1;
			if (depth === 0) return j;
		}
	}
	return tokens.length - 1;
}

function headingStyle(level: number) {
	const map = [styles.h1, styles.h1, styles.h2, styles.h3, styles.h4, styles.h4];
	return map[Math.min(level, 6) - 1];
}

const styles = StyleSheet.create((theme) => ({
	root: { gap: theme.spacing[3], padding: theme.spacing[3] },
	rootInline: { gap: theme.spacing[2], padding: 0 },
	p: { paddingVertical: theme.spacing[0.5] },
	pText: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.content,
		lineHeight: 22,
	},
	h1: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize["2xl"],
		fontWeight: "700",
		lineHeight: 30,
		paddingTop: theme.spacing[2],
	},
	h2: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.xl,
		fontWeight: "600",
		lineHeight: 26,
		paddingTop: theme.spacing[2],
	},
	h3: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.lg,
		fontWeight: "600",
		lineHeight: 24,
		marginTop: theme.spacing[1],
	},
	h4: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.content,
		fontWeight: "600",
		lineHeight: 22,
		marginTop: theme.spacing[1],
	},
	quote: {
		borderLeftWidth: 3,
		borderLeftColor: theme.colors.borderAccent,
		paddingLeft: theme.spacing[3],
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.md,
		paddingVertical: theme.spacing[2],
	},
	list: { gap: theme.spacing[2], paddingLeft: theme.spacing[1] },
	item: { flexDirection: "row", gap: theme.spacing[2] },
	marker: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.content,
		lineHeight: 22,
		minWidth: 18,
	},
	hr: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing[2] },
	bold: { fontWeight: "700" },
	italic: { fontStyle: "italic" },
	link: { color: theme.colors.accentBright, textDecorationLine: "underline" },
	inlineCode: {
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		color: theme.colors.accentBright,
		backgroundColor: theme.colors.surface2,
		borderRadius: 4,
		paddingHorizontal: 4,
		overflow: "hidden",
	},
	imageChip: {
		color: theme.colors.accentBright,
		fontSize: theme.fontSize.sm,
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.full,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1],
		overflow: "hidden",
	},
	table: {
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		borderRadius: theme.borderRadius.lg,
		overflow: "hidden",
	},
	row: { flexDirection: "row" },
	rowHead: { backgroundColor: theme.colors.surface1 },
	cell: { flex: 1, padding: theme.spacing[2] },
	thText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm, fontWeight: "600" },
	tdText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	codeWrap: {
		backgroundColor: theme.colors.surfaceSidebar,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		overflow: "hidden",
	},
	codeHead: {
		flexDirection: "row",
		justifyContent: "space-between",
		backgroundColor: theme.colors.surface1,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[1.5],
	},
	codeLang: {
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.sm,
		color: theme.colors.accentBright,
	},
	codeCount: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	codeBody: {
		padding: theme.spacing[3],
		gap: 0,
	},
	codeLine: {
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: 18,
		color: theme.colors.foreground,
	},
}));
