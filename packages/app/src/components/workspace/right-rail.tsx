// Paseo-style right rail (timeline subset): a fixed column beside the center
// content listing session events as they stream in. Ported shape only —
// Paseo's right rail hosts timeline/tool-call transcripts; Pie logs the event
// stream recorded by connection-store (applyStoreEvent taps).
import { Pressable, ScrollView, Text, View } from "react-native";
import { Activity, Hammer, MessageSquare, ShieldCheck, Trash2 } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { relativeTimeLabel } from "@/lib/relative-time";
import {
	type ActivityItem,
	useConnectionStore,
} from "@/stores/connection-store";

const KIND_ICON = {
	run: MessageSquare,
	tool: Hammer,
	toolDone: Hammer,
	queue: Activity,
	permission: ShieldCheck,
} as const;

function activityLabel(
	t: (key: string, options?: Record<string, unknown>) => string,
	item: ActivityItem,
): string {
	switch (item.kind) {
		case "run":
			return t("timeline.runStarted");
		case "queue":
			return t("timeline.queue", { count: item.count ?? 0 });
		case "permission":
			return t("timeline.permission", { name: item.name ?? "…" });
		case "tool":
			return t("timeline.tool", { name: item.name ?? "…" });
		case "toolDone":
			return t("timeline.toolDone", { name: item.name ?? "…" });
	}
}

export function RightRail() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const timeline = useConnectionStore((s) => s.timeline);

	return (
		<View style={styles.root}>
			<View style={styles.header}>
				<Text style={styles.title}>{t("timeline.title")}</Text>
				{timeline.length > 0 ? (
					<Pressable hitSlop={6} onPress={() => useConnectionStore.setState({ timeline: [] })}>
						<Trash2 size={13} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
					</Pressable>
				) : null}
			</View>
			<ScrollView contentContainerStyle={styles.list}>
				{timeline.length === 0 ? (
					<Text style={styles.empty}>{t("timeline.empty")}</Text>
				) : (
					timeline
						.slice()
						.reverse()
						.map((item, i) => {
							const Icon = KIND_ICON[item.kind];
							return (
								<View key={`${item.ts}-${i}`} style={styles.row}>
									<Icon size={12} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
									<Text style={styles.text} numberOfLines={1}>
										{activityLabel(t, item)}
									</Text>
									<Text style={styles.time}>
										{relativeTimeLabel(t, new Date(item.ts).toISOString())}
									</Text>
								</View>
							);
						})
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: {
		flex: 1,
		borderLeftWidth: theme.borderWidth[1],
		borderLeftColor: theme.colors.border,
		backgroundColor: theme.colors.surfaceSidebar,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	title: { color: theme.colors.foreground, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
	list: { padding: theme.spacing[2], gap: theme.spacing[0.5] },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		paddingVertical: theme.spacing[1],
		paddingHorizontal: theme.spacing[1],
		borderRadius: theme.borderRadius.md,
	},
	text: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	time: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	empty: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, padding: theme.spacing[3] },
}));
