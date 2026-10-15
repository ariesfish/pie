// [pie] W4b: StreamItem row renderer for the ported stream foundation.
// The old MessageRow rendered every block of an entry inside one row; the
// foundation's mechanics (turn grouping, anchor transport, virtualization
// identity) need one row per item, so blocks are already lifted by the
// adapter and each kind renders its own row here.
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ChevronRight, Wrench } from "lucide-react-native";
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

function ThoughtRow({ text, loading }: { text: string; loading: boolean }) {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const [open, setOpen] = useState(false);
	return (
		<View style={styles.thoughtWrap}>
			<Pressable style={styles.thoughtHeader} onPress={() => setOpen((v) => !v)} hitSlop={6}>
				{loading ? (
					<ActivityIndicator size="small" color={theme.colors.foregroundExtraMuted} />
				) : (
					<ChevronRight
						size={12}
						color={theme.colors.foregroundExtraMuted}
						strokeWidth={1.5}
						style={open ? styles.chevronOpen : styles.chevronClosed}
					/>
				)}
				<Text style={styles.thoughtLabel} numberOfLines={1}>
					{loading ? t("chat.thinking") : t("chat.thought")}
				</Text>
			</Pressable>
			{open && !loading ? (
				<Text style={styles.thoughtText} selectable>
					{text}
				</Text>
			) : null}
		</View>
	);
}

function ToolCallRow({ item }: { item: StreamItem & { kind: "tool_call" } }) {
	const { theme } = useUnistyles();
	const [open, setOpen] = useState(false);
	const data = item.payload.data;
	const toolName = data?.toolName ?? data?.name ?? "tool";
	const status = data?.status ?? "running";
	const argText = useMemo(() => {
		try {
			return JSON.stringify(data?.arguments ?? {}, null, 2);
		} catch {
			return String(data?.arguments ?? "");
		}
	}, [data?.arguments]);
	return (
		<View style={styles.toolWrap}>
			<Pressable style={styles.toolHeader} onPress={() => setOpen((v) => !v)} hitSlop={6}>
				<Wrench size={12} color={theme.colors.accentBright} strokeWidth={1.5} />
				<Text style={styles.toolName} numberOfLines={1}>
					{toolName}
				</Text>
				<Text
					style={[
						styles.toolStatus,
						status === "failed" && { color: theme.colors.statusDanger },
						status === "running" && { color: theme.colors.accentBright },
					]}
				>
					{status}
				</Text>
				<ChevronRight
					size={12}
					color={theme.colors.foregroundExtraMuted}
					strokeWidth={1.5}
					style={open ? styles.chevronOpen : styles.chevronClosed}
				/>
			</Pressable>
			{open ? (
				<View style={styles.toolBody}>
					{data?.arguments != null ? <Text style={styles.toolArgs}>{argText}</Text> : null}
					{data?.result != null ? (
						<Text style={styles.toolResult} selectable>
							{typeof data.result === "string"
								? data.result
								: JSON.stringify(data.result, null, 2)}
						</Text>
					) : null}
					{data?.error != null ? (
						<Text style={styles.toolError} selectable>
							{String(data.error)}
						</Text>
					) : null}
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	userRow: {
		alignSelf: "flex-end",
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.xl,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		paddingVertical: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		maxWidth: "84%",
	},
	userText: { color: theme.colors.foreground, fontSize: theme.fontSize.content, lineHeight: 20 },
	assistantWrap: { alignSelf: "stretch", maxWidth: "100%" },
	thoughtWrap: { alignSelf: "stretch", gap: theme.spacing[1] },
	thoughtHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingVertical: 2,
	},
	thoughtLabel: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
	},
	thoughtText: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
		lineHeight: 18,
		paddingLeft: theme.spacing[4],
	},
	noteWrap: { alignSelf: "center", paddingVertical: theme.spacing[1] },
	noteText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	toolWrap: {
		alignSelf: "stretch",
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		overflow: "hidden",
	},
	toolHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1.5],
	},
	toolName: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	toolStatus: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		textTransform: "uppercase",
	},
	toolBody: {
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[2],
		gap: theme.spacing[2],
		borderTopWidth: theme.borderWidth[1],
		borderTopColor: theme.colors.border,
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
	chevronOpen: { transform: [{ rotate: "90deg" }] },
	chevronClosed: { transform: [{ rotate: "0deg" }] },
}));
