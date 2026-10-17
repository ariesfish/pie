// [pie] W4b: StreamItem row renderer for the ported stream foundation.
// The old MessageRow rendered every block of an entry inside one row; the
// foundation's mechanics (turn grouping, anchor transport, virtualization
// identity) need one row per item, so blocks are already lifted by the
// adapter and each kind renders its own row here.
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from "react-native";
import {
	ChevronRight,
	FileText,
	MessageCircleQuestion,
	Search as SearchIcon,
	SquareTerminal,
	TriangleAlert,
	Wrench,
} from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { MarkdownRenderer } from "@/components/markdown/renderer";
import type { StreamItem } from "@/types/stream";

export function StreamItemRow({ item }: { item: StreamItem }) {
	switch (item.kind) {
		case "user_message":
			return <UserRow key={item.id} text={item.text} />;
		case "assistant_message":
			return (
				<View key={item.id} style={styles.assistantWrap}>
					{item.text ? <MarkdownRenderer compact text={item.text} /> : null}
				</View>
			);
		case "thought":
			return <ThoughtRow key={item.id} text={item.text} loading={item.status === "loading"} />;
		case "tool_call":
			return <ToolCallRow key={item.id} item={item} />;
		case "notification":
			return (
				<View key={item.id} style={styles.noteWrap}>
					<Text style={styles.noteText}>{item.message}</Text>
				</View>
			);
		case "compaction":
			return (
				<View key={item.id} style={styles.noteWrap}>
					<Text style={styles.noteText}>{item.status === "loading" ? "…" : "✓"}</Text>
				</View>
			);
		case "todo_list":
		case "plugin":
			return null;
	}
}

function UserRow({ text }: { text: string }) {
	return (
		<View style={styles.userRow}>
			<Text style={styles.userText}>{text}</Text>
		</View>
	);
}

/** Small chevron that eases between closed (→) and open (↓) — one smooth
 *  rotation instead of the hard 90° snap. */
function AnimatedChevron({ open, color }: { open: boolean; color: string }) {
	const spin = useRef(new Animated.Value(open ? 1 : 0)).current;
	useEffect(() => {
		Animated.timing(spin, {
			toValue: open ? 1 : 0,
			duration: 150,
			easing: Easing.out(Easing.quad),
			useNativeDriver: true,
		}).start();
	}, [open, spin]);
	return (
		<Animated.View
			style={{
				transform: [
					{
						rotate: spin.interpolate({
							inputRange: [0, 1],
							outputRange: ["0deg", "90deg"],
						}),
					},
				],
			}}
		>
			<ChevronRight size={12} color={color} strokeWidth={1.5} />
		</Animated.View>
	);
}

function ThoughtRow({ text, loading }: { text: string; loading: boolean }) {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const [open, setOpen] = useState(false);
	return (
		<View style={styles.processWrap}>
			<Pressable style={styles.processHeader} onPress={() => setOpen((v) => !v)} hitSlop={6}>
				{loading ? (
					<ActivityIndicator size={12} color={theme.colors.foregroundExtraMuted} />
				) : (
					<AnimatedChevron open={open} color={theme.colors.foregroundExtraMuted} />
				)}
				<Text style={styles.thoughtLabel} numberOfLines={1}>
					{loading ? t("chat.thinking") : t("chat.thought")}
				</Text>
			</Pressable>
			{/* While streaming, expanding shows the partial thought live. */}
			{open && text ? (
				<Text style={styles.thoughtText} selectable>
					{text}
				</Text>
			) : null}
		</View>
	);
}

/** paseo.png tool rows: borderless single line (type icon + tool name +
 *  argument snippet), orange warning glyph when the call failed. Tap to
 *  expand parameters/result (pie keeps that affordance). */
function toolIcon(name: string): typeof Wrench {
	const n = name.toLowerCase();
	if (n.startsWith("bash") || n.startsWith("shell") || n.includes("exec"))
		return SquareTerminal;
	if (n.startsWith("read") || n.startsWith("write") || n.startsWith("edit") || n.includes("file"))
		return FileText;
	if (n.startsWith("grep") || n.startsWith("glob") || n.startsWith("search") || n.startsWith("find"))
		return SearchIcon;
	if (n.includes("ask") || n.includes("question")) return MessageCircleQuestion;
	return Wrench;
}

/** One-line argument digest: pick the printable value, not raw JSON. */
function toolArgSnippet(args: unknown): string {
	if (!args || typeof args !== "object") return "";
	const a = args as Record<string, unknown>;
	const value = a.command ?? a.path ?? a.file_path ?? a.pattern ?? a.query ?? a.cmd;
	if (typeof value === "string") return value;
	const first = Object.values(a).find((v) => typeof v === "string");
	return typeof first === "string" ? first : "";
}

function ToolCallRow({ item }: { item: StreamItem & { kind: "tool_call" } }) {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const [open, setOpen] = useState(false);
	const data = item.payload.data;
	const toolName = String(data?.toolName ?? data?.name ?? "tool");
	const status = data?.status ?? "running";
	const running = status === "running" || status === "executing";
	const failed = status === "failed" || status === "canceled";
	const Icon = toolIcon(toolName);
	const snippet = toolArgSnippet(data?.arguments);
	const argText = useMemo(() => {
		try {
			return JSON.stringify(data?.arguments ?? {}, null, 2);
		} catch {
			return String(data?.arguments ?? "");
		}
	}, [data?.arguments]);
	const resultText =
		data?.result != null
			? typeof data.result === "string"
				? data.result
				: JSON.stringify(data.result, null, 2)
			: null;
	return (
		<View style={styles.processWrap}>
			<Pressable style={styles.processHeader} onPress={() => setOpen((v) => !v)} hitSlop={6}>
				{/* Status-aware glyph: spinner while the call runs, orange warning
				 *  when it failed/was canceled, the tool's own icon when done. */}
				{running ? (
					<ActivityIndicator size={12} color={theme.colors.foregroundMuted} />
				) : failed ? (
					<TriangleAlert size={13} color={theme.colors.statusWarning} strokeWidth={1.75} />
				) : (
					<Icon size={12} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
				)}
				<Text style={styles.toolName} numberOfLines={1}>
					{toolName}
				</Text>
				{snippet ? (
					<Text style={styles.toolSnippet} numberOfLines={1}>
						{snippet}
					</Text>
				) : null}
				<AnimatedChevron open={open} color={theme.colors.foregroundExtraMuted} />
			</Pressable>
			{open ? (
				<View style={styles.toolBody}>
					{data?.arguments != null ? (
						<View style={styles.toolSection}>
							<Text style={styles.toolSectionLabel}>{t("chat.toolArguments")}</Text>
							<Text style={styles.toolArgs} selectable>
								{argText}
							</Text>
						</View>
					) : null}
					{resultText ? (
						<View style={styles.toolSection}>
							<Text style={styles.toolSectionLabel}>{t("chat.toolResult")}</Text>
							<Text style={styles.toolResult} selectable>
								{resultText}
							</Text>
						</View>
					) : null}
					{data?.error != null ? (
						<View style={styles.toolErrorSection}>
							<Text style={styles.toolSectionLabel}>{t("chat.toolError")}</Text>
							<Text style={styles.toolError} selectable>
								{String(data.error)}
							</Text>
						</View>
					) : null}
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	userRow: {
		alignSelf: "flex-end",
		// paseo userMessageStylesheet: quiet grey bubble, no border, snipped
		// top-right corner (paseo.png first-flight spec measured #E9E9E6).
		backgroundColor: theme.colors.surface2,
		borderRadius: theme.borderRadius.xl,
		borderTopRightRadius: theme.borderRadius.sm,
		paddingVertical: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		maxWidth: "84%",
	},
	userText: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.content,
		lineHeight: 20,
	},
	assistantWrap: { alignSelf: "stretch", maxWidth: "100%" },
	// Quiet rail shared by thought + tool rows: process chrome reads as one
	// indented, left-railed block family — distinct from prose and user
	// bubbles without any card chrome (paseo.png grammar kept, rail added).
	processWrap: {
		alignSelf: "stretch",
		gap: theme.spacing[1],
		borderLeftWidth: 2,
		borderLeftColor: theme.colors.border,
		paddingLeft: theme.spacing[2],
		paddingVertical: theme.spacing[0.5],
	},
	processHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		paddingVertical: 2,
		minHeight: 24,
	},
	thoughtLabel: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
	},
	thoughtText: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
		lineHeight: 18,
		// Aligns under the header label (rail + chevron + gap ≈ 26px).
		paddingLeft: theme.spacing[4],
	},
	noteWrap: { alignSelf: "center", paddingVertical: theme.spacing[1] },
	noteText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	toolName: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	toolSnippet: {
		flex: 1,
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
	},
	toolBody: {
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[2],
		gap: theme.spacing[2],
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		marginBottom: theme.spacing[1],
	},
	toolSection: { gap: theme.spacing[0.5] },
	toolSectionLabel: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.medium,
	},
	toolErrorSection: {
		gap: theme.spacing[0.5],
		backgroundColor: theme.colors.statusDangerTint,
		borderRadius: theme.borderRadius.sm,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1.5],
	},
	toolArgs: {
		color: theme.colors.foregroundMuted,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.sm,
	},
	toolResult: {
		color: theme.colors.foreground,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.sm,
	},
	toolError: {
		color: theme.colors.statusDanger,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.sm,
	},
}));
