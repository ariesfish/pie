// [pie] W4b: StreamItem row renderer for the ported stream foundation.
// The old MessageRow rendered every block of an entry inside one row; the
// foundation's mechanics (turn grouping, anchor transport, virtualization
// identity) need one row per item, so blocks are already lifted by the
// adapter and each kind renders its own row here.
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
	ChevronDown,
	ChevronRight,
	Clock,
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
import { StatusBadge } from "@/components/ui/status-badge";
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
					<Clock size={12} color={theme.colors.foregroundExtraMuted} />
				)}
				<Text style={styles.thoughtLabel} numberOfLines={1}>
					{loading ? t("chat.thinking") : t("chat.thought")}
				</Text>
				{open ? (
					<ChevronDown size={12} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
				) : (
					<ChevronRight size={12} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
				)}
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

/** Tool card (DESIGN.md §Components/Cards): header strip on the code paper
 *  (`surface1` stands in for `surface-code` in this theme) with the tool
 *  name, a mono argument digest and a semantic status chip; the expanded
 *  body is mono on the canvas. Tap the header to expand parameters/result. */
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
	// Status chip vocabulary (DESIGN.md §Components/Cards): semantic soft
	// tint background + the matching status colour as text.
	const chip: { label: string; variant: "success" | "warning" | "error" } = failed
		? { label: t("chat.statusFailed"), variant: "error" }
		: running
			? { label: t("chat.statusRunning"), variant: "warning" }
			: { label: t("chat.statusDone"), variant: "success" };
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
		<View style={styles.toolCard}>
			<Pressable style={styles.toolCardHeader} onPress={() => setOpen((v) => !v)} hitSlop={6}>
				{/* Status-aware glyph: spinner while the call runs, a danger triangle
				 *  when it failed/was canceled, the tool's own icon when done. */}
				{running ? (
					<ActivityIndicator size={12} color={theme.colors.foregroundMuted} />
				) : failed ? (
					<TriangleAlert size={13} color={theme.colors.statusDanger} strokeWidth={1.75} />
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
				) : (
					<View style={styles.toolSnippetSpacer} />
				)}
				<StatusBadge key={chip.variant} label={chip.label} variant={chip.variant} size="xs" />
				{open ? (
					<ChevronDown size={12} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
				) : (
					<ChevronRight size={12} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
				)}
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
		lineHeight: Math.round(theme.fontSize.content * 1.62),
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
	// UI labels inside the transcript sit on the 13px "ui" tier; the type
	// scale's floor (12) is what the theme exposes, so labels ride on the
	// body tier's sibling `base` (14) instead of an uncatalogued 13.
	thoughtLabel: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.base,
	},
	thoughtText: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.base,
		lineHeight: Math.round(theme.fontSize.base * 1.5),
		// Aligns under the header label (rail + chevron + gap ≈ 26px).
		paddingLeft: theme.spacing[4],
	},
	noteWrap: { alignSelf: "center", paddingVertical: theme.spacing[1] },
	noteText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	toolName: {
		flexShrink: 0,
		color: theme.colors.foreground,
		fontSize: theme.fontSize.base,
		fontWeight: theme.fontWeight.medium,
	},
	toolSnippet: {
		flex: 1,
		minWidth: 0,
		color: theme.colors.foregroundExtraMuted,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		textAlign: "right",
	},
	toolSnippetSpacer: { flex: 1, minWidth: 0 },
	// Tool card: header strip on the code paper (surface1 stands in for
	// DESIGN's surface-code in this theme), body mono on the canvas.
	toolCard: {
		alignSelf: "stretch",
		backgroundColor: theme.colors.surface0,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		overflow: "hidden",
		marginBottom: theme.spacing[1],
	},
	toolCardHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1.5],
		minHeight: 28,
		backgroundColor: theme.colors.surface1,
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	toolBody: {
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[2],
		gap: theme.spacing[2],
		backgroundColor: theme.colors.surface0,
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
		fontSize: theme.fontSize.code,
		lineHeight: Math.round(theme.fontSize.code * 1.7),
	},
	toolResult: {
		color: theme.colors.foreground,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: Math.round(theme.fontSize.code * 1.7),
	},
	toolError: {
		color: theme.colors.statusDanger,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: Math.round(theme.fontSize.code * 1.7),
	},
}));
