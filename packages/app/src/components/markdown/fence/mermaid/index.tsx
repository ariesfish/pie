// Mermaid fences via beautiful-mermaid (github.com/lukilabs/beautiful-mermaid,
// MIT) — pie's replacement for the mermaid runtime paseo carries (excluded
// from the W2a port: a fullscreen viewer + iframe runtime + zoomable-viewport
// family). beautiful-mermaid is synchronous and DOM-free, so the same parse
// powers both surfaces:
//   - web, settled fences → the SVG output (injected into a View ref so
//     react-native-web hands us the DOM node)
//   - native + streaming fences → the ASCII box-drawing output in a mono
//     surface (stable, cheap, no flash while the fence is still open)
//
// Product call (2026-10-14): keep ASCII rendering on native. The elkjs layout
// engine costs ~4.5MB in the iOS bundle; native diagrams are worth it.
import { useLayoutEffect, useMemo, useRef } from "react";
import { ScrollView, Text, View, type TextStyle } from "react-native";
import { renderMermaidASCII, renderMermaidSVG } from "beautiful-mermaid";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { isWeb } from "@/constants/platform";
import type { MarkdownFenceRendererProps } from "../types";

export function MermaidFence({ code, phase }: MarkdownFenceRendererProps) {
	const { theme } = useUnistyles();

	const source = useMemo(() => code.trim(), [code]);
	const svg = useMemo(() => {
		if (!isWeb || phase !== "complete") return null;
		try {
			return renderMermaidSVG(source, {
				// The container paints the surface; the SVG itself stays
				// transparent and derives every tint from the fg color.
				bg: theme.colors.surface1,
				fg: theme.colors.foreground,
				transparent: true,
			});
		} catch {
			return null;
		}
	}, [source, phase, theme]);

	const ascii = useMemo(() => {
		try {
			return renderMermaidASCII(source);
		} catch {
			return null;
		}
	}, [source]);

	if (svg) {
		return (
			<View style={styles.svgWrap}>
				{/* Tall diagrams cap at a fixed height and scroll instead of
				 *  pushing the rest of the transcript away. */}
				<ScrollView
					style={styles.svgScroll}
					contentContainerStyle={styles.svgScrollContent}
					showsVerticalScrollIndicator={false}
				>
					<MermaidSvg svg={svg} />
				</ScrollView>
			</View>
		);
	}

	const body = ascii ?? source;
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.asciiContent}
			style={styles.asciiWrap}
		>
			<Text selectable style={styles.ascii}>
				{body}
			</Text>
		</ScrollView>
		);
}

function MermaidSvg({ svg }: { svg: string }) {
	const ref = useRef<View>(null);
	useLayoutEffect(() => {
		const node = ref.current as unknown as HTMLDivElement | null;
		if (!node) return;
		node.innerHTML = svg;
		const diagram = node.firstElementChild as SVGSVGElement | null;
		// ELK sizes the SVG from the laid-out graph; let it fill the pane
		// width and keep its aspect ratio instead of pinning px units.
		if (diagram) {
			diagram.removeAttribute("width");
			diagram.removeAttribute("height");
			diagram.style.width = "100%";
			diagram.style.height = "auto";
		}
	}, [svg]);
	return <View collapsable={false} ref={ref} />;
}

const styles = StyleSheet.create((theme) => ({
	svgWrap: {
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		overflow: "hidden" as const,
		marginTop: theme.spacing[2],
		marginBottom: theme.spacing[3],
	},
	svgScroll: {
		// Cap the diagram's footprint in the transcript; anything taller
		// scrolls inside the card. Small diagrams stay uncropped.
		maxHeight: 480,
	},
	svgScrollContent: {
		padding: theme.spacing[3],
	},
	asciiWrap: {
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		marginTop: theme.spacing[2],
		marginBottom: theme.spacing[3],
	},
	asciiContent: {
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
	},
	ascii: {
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: (theme.fontSize.code as number) * 1.5,
		color: theme.colors.foreground,
	} satisfies TextStyle,
}));
