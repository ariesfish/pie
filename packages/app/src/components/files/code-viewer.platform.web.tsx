// Web/desktop code viewer (P2b-2): CodeMirror 6 via @getpaseo/highlight's
// language mapping. Presentation choices that (deliberately) improve on the
// paseo viewer: padded reading measure, active-line + gutter highlight,
// dynamic theme reconfiguration on Pie theme switch, live-content swaps that
// keep the scroll position, and edit mode on the same instance.
import { useEffect, useMemo, useRef } from "react";
import { Text, View } from "react-native";
import { Compartment, EditorState } from "@codemirror/state";
import {
	EditorView,
	keymap,
	lineNumbers,
	highlightActiveLine,
	highlightActiveLineGutter,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { indentUnit, syntaxHighlighting } from "@codemirror/language";
import { getLanguageForFile, createCodeMirrorHighlightStyle } from "@getpaseo/highlight";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { paletteFor, type SyntaxPalette } from "./syntax-palette";

export interface CodeViewerProps {
	content: string;
	filename: string;
	editable?: boolean;
	value?: string;
	onChangeText?: (text: string) => void;
}

export function CodeViewer({
	content,
	filename,
	editable = false,
	onChangeText,
}: CodeViewerProps) {
	const { theme } = useUnistyles();
	const hostRef = useRef<HTMLDivElement | null>(null);
	const viewRef = useRef<EditorView | null>(null);
	const onTextRef = useRef(onChangeText);
	onTextRef.current = onChangeText;

	const compartments = useMemo(
		() => ({
			config: new Compartment(),
		}),
		[],
	);

	const colorScheme = theme.colorScheme === "light" ? "light" : "dark";

	useEffect(() => {
		if (!hostRef.current || viewRef.current) return;
		const view = new EditorView({
			parent: hostRef.current,
			state: EditorState.create({
				doc: content,
				extensions: [
					lineNumbers(),
					highlightActiveLineGutter(),
					highlightActiveLine(),
					EditorView.lineWrapping,
					compartments.config.of(configExtensions(filename, colorScheme, editable, onTextRef)),
					indentUnit.of("  "),
				],
			}),
		});
		viewRef.current = view;
		return () => {
			view.destroy();
			viewRef.current = null;
		};
		// remount only on file identity change
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filename]);

	// Live-content swap: replace the doc when the server file changed and
	// the editor text matches the old content (i.e. the editor is pristine).
	const lastRemote = useRef(content);
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		const docNow = view.state.doc.toString();
		const pristine = docNow === lastRemote.current;
		if (content !== lastRemote.current && (pristine || !editable)) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: content },
				// keep the viewport honest: same-length top changes shouldn't jump
				scrollIntoView: false,
			});
		}
		lastRemote.current = content;
	}, [content, editable]);

	// Theme / edit-mode reconfiguration without remount.
	useEffect(() => {
		const view = viewRef.current;
		if (!view) return;
		view.dispatch({
			effects: compartments.config.reconfigure(
				configExtensions(filename, colorScheme, editable, onTextRef),
			),
		});
	}, [colorScheme, editable, filename, compartments]);

	return (
		<View style={styles.wrap}>
			<View
				ref={hostRef as never}
				style={styles.editor}
				pointerEvents={editable ? "auto" : "none"}
			/>
			<Text style={styles.hint}>⌘F 由浏览器 · 长行已自动换行</Text>
		</View>
	);
}

function configExtensions(
	filename: string,
	colorScheme: "dark" | "light",
	editable: boolean,
	onTextRef: React.RefObject<((text: string) => void) | undefined>,
) {
	const pal: SyntaxPalette = paletteFor(colorScheme);
	const isLight = colorScheme === "light";
	return [
		getLanguageForFile(filename)?.extension ?? [],
		syntaxHighlighting(createCodeMirrorHighlightStyle(pal), { fallback: true }),
		EditorView.theme(
			{
				"&": {
					color: isLight ? "#18181b" : "#e6e9ef",
					backgroundColor: isLight ? "#F7F8FA" : "#101216",
					height: "100%",
				},
				".cm-scroller": {
					fontFamily: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
					fontSize: "12.5px",
					lineHeight: "1.6",
					padding: "10px 4px 36px 4px",
				},
				".cm-gutters": {
					backgroundColor: isLight ? "#F7F8FA" : "#101216",
					color: isLight ? "#8B93A7" : "#3d4453",
					border: "none",
					paddingRight: "8px",
				},
				".cm-activeLine": { backgroundColor: isLight ? "rgba(0,0,0,0.045)" : "rgba(255,255,255,0.045)" },
				".cm-activeLineGutter": {
					backgroundColor: isLight ? "rgba(0,0,0,0.045)" : "rgba(255,255,255,0.045)",
					color: isLight ? "#18181b" : "#e6e9ef",
				},
				"&.cm-focused": { outline: "none" },
				".cm-content": { caretColor: isLight ? "#2B4C7E" : "#4A7BC8" },
				".cm-selectionBackground, ::selection": {
					backgroundColor: isLight ? "rgba(43,76,126,0.18)" : "rgba(74,123,200,0.28)",
				},
			},
			{ dark: !isLight },
		),
		EditorState.readOnly.of(!editable),
		editable ? history() : [],
		editable ? keymap.of([...defaultKeymap, ...historyKeymap]) : [],
		EditorView.updateListener.of((update) => {
			if (update.docChanged) onTextRef.current?.(update.state.doc.toString());
		}),
	];
}

const styles = StyleSheet.create((theme) => ({
	wrap: { flex: 1, backgroundColor: theme.colors.surface0 },
	editor: { flex: 1, minHeight: 220 },
	hint: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		paddingVertical: 2,
		textAlign: "right",
		opacity: 0.7,
	},
}));
