// Chat message row (P2c-2): block-level rendering of agent messages —
// assistant text runs through MdViewer (markdown in chat), tool_use /
// tool_result blocks render as tool cards, thinking blocks collapse.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	ActivityIndicator, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ChevronRight, Terminal, Wrench } from "lucide-react-native";

import { MdViewer } from "@/components/files/md-viewer";
import { isMessageEntry, type SessionEntry } from "@pie/protocol";

import { useConnectionStore, type ToolCallRecord } from "@/stores/connection-store";

type Block = { type?: string; [k: string]: unknown };

export function MessageRow({ entry }: { entry: SessionEntry }) {
	if (!isMessageEntry(entry)) return null;
	const msg = entry.message;
	if (typeof msg !== "object" || msg === null || !("role" in msg)) return null;
	const m = msg as { role: string; content: string | Block[] };
	const blocks: Block[] =
		typeof m.content === "string"
			? [{ type: "text", text: m.content }]
			: Array.isArray(m.content)
				? (m.content as Block[])
				: [];

	if (blocks.length === 0) return null;
	const isUser = m.role === "user";

	// user messages render raw (they are the user's own words); summaries
	// are not re-marked-down.
	if (isUser) {
		const text = blocks
			.map((b) => (typeof b.text === "string" ? b.text : ""))
			.join("");
		if (!text) return null;
		return (
			<View style={styles.userRow}>
				{blocks.map((b, i) =>
					b.type === "tool_result" ? (
						<ToolResultBlock key={i} block={b} />
					) : (
						b.text ? <Text key={i} style={styles.userText}>{String(b.text)}</Text> : null
					),
				)}
			</View>
		);
	}

	// assistant: markdown text + tool cards + collapsible thinking
	const rendered = blocks.map((b, i) => {
		switch (b.type) {
			case "text":
				return <View key={i} style={styles.assistantTextWrap}>{String(b.text ?? "") === "" ? null : <MdViewer inline source={String(b.text)} />}</View>;
			case "thinking":
				return <ThinkingBlock key={i} text={String(b.thinking ?? b.text ?? "")} />;
			case "tool_use":
				return <ToolUseBlock key={i} block={b} />;
			default:
				return null;
		}
	});
	if (rendered.every((r) => r === null)) return null;
	return <View style={styles.assistantRow}>{rendered}</View>;
}

/** Assistant tool_use: name + compact argument summary (expandable).
 *  Live status/duration and the nested-call subtree come from the
 *  toolCalls store (block.id === toolCallId in pi-ai semantics). */
function ToolUseBlock({ block }: { block: Block }) {
	const { theme } = useUnistyles();
	const [open, setOpen] = useState(false);
	const name = String(block.name ?? "tool");
	const id = String(block.id ?? "");
	const record = useConnectionStore(
		useMemo(() => (st: { toolCalls: Record<string, ToolCallRecord> }) => st.toolCalls[id], [id]),
	);
	const children = useConnectionStore(
		useMemo(
			() => (st: { toolCalls: Record<string, ToolCallRecord> }) =>
				Object.values(st.toolCalls).filter((c) => c.parentToolCallId === id),
			[id],
		),
	);
	const input = useMemo(() => summarizeInput(block.input), [block.input]);
	const json = useMemo(
		() => JSON.stringify(block.input ?? {}, null, 2),
		[block.input],
	);
	const statusColor =
		record?.status === "error"
			? theme.colors.statusDanger
			: record?.status === "ok"
				? theme.colors.statusSuccess
				: record?.status === "running"
					? theme.colors.accentBright
					: theme.colors.foregroundExtraMuted;
	return (
		<View style={styles.toolCard}>
			<Pressable style={styles.toolHead} onPress={() => setOpen((v) => !v)}>
				<Wrench size={13} color={statusColor} strokeWidth={1.5} />
				<Text style={styles.toolName} numberOfLines={1}>
					{name}
				</Text>
				<Text style={styles.toolSummary} numberOfLines={1}>
					{input}
				</Text>
				{record?.status === "running" ? (
					<ActivityIndicator size="small" />
				) : record?.durationMs != null ? (
					<Text style={[styles.toolStatus, { color: statusColor }]}>{formatMs(record.durationMs)}</Text>
				) : null}
				{children.length > 0 && (
					<View style={styles.childBadge}>
						<Text style={styles.childBadgeText}>{children.length}</Text>
					</View>
				)}
				<ChevronRight
					size={13}
					color={theme.colors.foregroundExtraMuted}
					strokeWidth={1.5}
					style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
				/>
			</Pressable>
			{open && (
				<View style={styles.toolBody}>
					<Text style={styles.toolJson}>{json === "{}" ? "(no arguments)" : json}</Text>
					{children.length > 0 && (
						<NestedCallTree calls={children} depth={0} />
					)}
				</View>
			)}
		</View>
	);
}

/** Nested calls (parentToolCallId chain) — the "subagent" surface for pi. */
function NestedCallTree({ calls, depth }: { calls: ToolCallRecord[]; depth: number }) {
	return (
		<View style={[styles.nestWrap, { marginLeft: depth > 0 ? 10 : 0 }]} key={`d${depth}`}>
			{calls.map((call) => (
				<NestedCallRow key={call.toolCallId} call={call} depth={depth} />
			))}
		</View>
	);
}

function NestedCallRow({ call, depth }: { call: ToolCallRecord; depth: number }) {
	const { theme } = useUnistyles();
	const [open, setOpen] = useState(false);
	const children = useConnectionStore(
		useMemo(
			() => (st: { toolCalls: Record<string, ToolCallRecord> }) =>
				Object.values(st.toolCalls).filter((c) => c.parentToolCallId === call.toolCallId),
			[call.toolCallId],
		),
	);
	const statusColor =
		call.status === "error"
			? theme.colors.statusDanger
			: call.status === "ok"
				? theme.colors.statusSuccess
				: theme.colors.accentBright;
	return (
		<View>
			<Pressable style={styles.toolHead} onPress={() => setOpen((v) => !v)}>
				<View style={styles.nestIndent}>
					<ChevronRight
						size={12}
						color={statusColor}
						strokeWidth={1.5}
						style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
					/>
					<Text style={styles.toolName}>{call.toolName}</Text>
				</View>
				<Text style={styles.toolSummary} numberOfLines={1}>
					{summarizeInput(call.args)}
				</Text>
				{call.status === "running" ? <ActivityIndicator size="small" /> : null}
				{call.durationMs != null && (
					<Text style={[styles.toolStatus, { color: statusColor }]}>{formatMs(call.durationMs)}</Text>
				)}
			</Pressable>
			{open && (
				<View style={styles.toolBody}>
					{call.result != null && (
						<Text style={styles.toolJson}>{summarizeResult(call.result, 2000)}</Text>
					)}
					{children.length > 0 && <NestedCallTree calls={children} depth={depth + 1} />}
				</View>
			)}
		</View>
	);
}

function formatMs(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	return `${Math.round(ms / 60_000)}m`;
}

function summarizeResult(result: unknown, cap: number): string {
	const text = typeof result === "string" ? result : JSON.stringify(result, null, 2) ?? "";
	return text.length > cap ? `${text.slice(0, cap)}…` : text;
}

/** user-role tool_result: success/error status + preview, expandable. */
function ToolResultBlock({ block }: { block: Block }) {
	const { theme } = useUnistyles();
	const [open, setOpen] = useState(false);
	const isError = block.isError === true;
	const preview = useMemo(() => summarizeContent(block.content), [block.content]);
	const full = useMemo(() => contentToText(block.content), [block.content]);
	if (!preview && !full) return null;
	return (
		<View style={[styles.toolCard, isError && styles.errorCard]}>
			<Pressable style={styles.toolHead} onPress={() => setOpen((v) => !v)}>
				<Terminal
					size={13}
					color={isError ? theme.colors.statusDanger : theme.colors.foregroundExtraMuted}
					strokeWidth={1.5}
				/>
				<Text style={[styles.toolSummary, { flex: 1 }]} numberOfLines={1}>
					{isError ? "✗ " : ""}
					{preview || "result"}
				</Text>
				<ChevronRight
					size={13}
					color={theme.colors.foregroundExtraMuted}
					strokeWidth={1.5}
					style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
				/>
			</Pressable>
			{open && <Text style={styles.toolJson}>{full || "(empty)"}</Text>}
		</View>
	);
}

function ThinkingBlock({ text }: { text: string }) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	if (!text) return null;
	return (
		<View style={styles.thinkWrap}>
			<Pressable onPress={() => setOpen((v) => !v)} hitSlop={4}>
				<Text style={styles.thinkLabel}>⌘ {t("chat.thinking")} {open ? "⌃" : "⌄"}</Text>
			</Pressable>
			{open && <Text style={styles.thinkText}>{text}</Text>}
		</View>
	);
}

// --- helpers -----------------------------------------------------------------

function summarizeInput(input: unknown): string {
	if (input == null) return "";
	if (typeof input === "object") {
		const entries = Object.entries(input as Record<string, unknown>);
		if (entries.length === 0) return "";
		const [k, v] = entries[0]!;
		const val = typeof v === "string" ? v : JSON.stringify(v);
		return `${k}: ${val.length > 60 ? `${val.slice(0, 60)}…` : val}`;
	}
	return String(input);
}

function summarizeContent(content: unknown): string {
	const text = contentToText(content);
	return text.length > 80 ? `${text.slice(0, 80).replace(/\n/g, " ")}…` : text.replace(/\n/g, " ");
}

function contentToText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((c) => {
				if (typeof c === "string") return c;
				if (c && typeof c === "object" && "text" in c) return String((c as { text: unknown }).text ?? "");
				return "";
			})
			.join("\n");
	}
	return "";
}



const styles = StyleSheet.create((theme) => ({
	userRow: {
		alignSelf: "flex-end",
		backgroundColor: theme.colors.accent,
		borderRadius: theme.borderRadius.xl,
		paddingVertical: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		maxWidth: "84%",
		gap: 4,
	},
	userText: { color: '#ffffff', fontSize: theme.fontSize.content, lineHeight: 20 },
	assistantRow: {
		alignSelf: "flex-start",
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.xl,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		paddingVertical: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		maxWidth: "92%",
		gap: theme.spacing[2],
	},
	assistantTextWrap: {},
	toolCard: {
		backgroundColor: theme.colors.surface2,
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		overflow: "hidden",
		alignSelf: "stretch",
	},
	errorCard: { borderColor: theme.colors.statusDanger },
	toolHead: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1.5],
	},
	toolName: { color: theme.colors.accentBright, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	toolSummary: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
		flexShrink: 1,
	},
	toolJson: {
		paddingHorizontal: theme.spacing[2],
		paddingBottom: theme.spacing[2],
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		color: theme.colors.foregroundMuted,
		lineHeight: 16,
	},
	toolBody: { borderTopWidth: theme.borderWidth[1], borderTopColor: theme.colors.border, paddingVertical: theme.spacing[1.5], gap: theme.spacing[1.5] },
	toolStatus: { fontSize: theme.fontSize.sm, color: theme.colors.foregroundExtraMuted },
	childBadge: {
		backgroundColor: theme.colors.surface3,
		borderRadius: theme.borderRadius.full,
		paddingHorizontal: 5,
		paddingVertical: 0,
	},
	childBadgeText: { color: theme.colors.foregroundMuted, fontSize: 10 },
	nestWrap: { gap: 2, alignSelf: "stretch" },
	nestIndent: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
	thinkWrap: { gap: 2, alignSelf: "stretch" },
	thinkLabel: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	thinkText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, fontStyle: "italic", lineHeight: 18 },
}));
