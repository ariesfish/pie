// Usage rail (W3d): session token usage for the active session — pie-native
// surface living on the explorer rail's fourth mode. Presentation vocabulary
// follows paseo's usage surfaces (meter + count rows), but the data model is
// pie's own: the daemon's `session.stats` pull (message counts + the token
// quartet) plus the `session.contextUsage.changed` stream the connection
// store already taps (live window occupancy).
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { Svg, Circle } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useMemo } from "react";

import { useConnectionStore } from "@/stores/connection-store";
import type { Theme } from "@/styles/theme";
import type { ContextUsage } from "@pie/protocol";

interface StatsSnapshot {
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolResults: number;
	totalMessages: number;
	tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

const RING_RADIUS = 30;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function UsageRail() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const sessionId = useConnectionStore((s) => s.sessionId);
	const usage = useConnectionStore((s) => s.usage);

	const [stats, setStats] = useState<StatsSnapshot | null>(null);
	const [loading, setLoading] = useState(false);

	const refreshStats = useCallback(async () => {
		const conn = useConnectionStore.getState().conn;
		if (!conn || !sessionId) return;
		setLoading(true);
		try {
			const res = await conn.request("session.stats", { sessionId });
			setStats({
				userMessages: res.userMessages,
				assistantMessages: res.assistantMessages,
				toolCalls: res.toolCalls,
				toolResults: res.toolResults,
				totalMessages: res.totalMessages,
				tokens: res.tokens,
			});
		} catch {
			// Pull is best-effort; the live context occupancy still renders.
		} finally {
			setLoading(false);
		}
	}, [sessionId]);

	useEffect(() => {
		setStats(null);
		void refreshStats();
	}, [refreshStats]);

	return (
		<ScrollView style={styles.root} contentContainerStyle={styles.list}>
			<View style={styles.header}>
				<Text style={styles.title}>{t("usage.title")}</Text>
				<Pressable hitSlop={8} onPress={() => void refreshStats()} disabled={loading}>
					<RefreshCw
						size={13}
						color={loading ? theme.colors.accent : theme.colors.foregroundMuted}
						strokeWidth={1.75}
					/>
				</Pressable>
			</View>

			<ContextRing usage={usage} />

			{stats ? (
				<>
					<Text style={styles.section}>{t("usage.tokens")}</Text>
					<View style={styles.grid}>
						<TokenCell label={t("usage.tokensInput")} value={stats.tokens.input} />
						<TokenCell label={t("usage.tokensOutput")} value={stats.tokens.output} />
						<TokenCell label={t("usage.tokensCacheRead")} value={stats.tokens.cacheRead} />
						<TokenCell label={t("usage.tokensCacheWrite")} value={stats.tokens.cacheWrite} />
					</View>

					<Text style={styles.section}>{t("usage.messages")}</Text>
					<View style={styles.rows}>
						<CountRow label={t("usage.messagesUser")} value={stats.userMessages} />
						<CountRow label={t("usage.messagesAssistant")} value={stats.assistantMessages} />
						<CountRow label={t("usage.messagesToolCalls")} value={stats.toolCalls} />
						<CountRow label={t("usage.messagesToolResults")} value={stats.toolResults} />
						<CountRow label={t("usage.messagesTotal")} value={stats.totalMessages} />
					</View>
				</>
			) : (
				<Text style={styles.empty}>{loading ? t("common.connecting") : t("usage.noStats")}</Text>
			)}
		</ScrollView>
	);
}

function contextTone(percent: number | null, theme: { colors: Theme["colors"] }): string {
	if (percent == null) return theme.colors.border;
	if (percent >= 0.9) return theme.colors.statusDanger;
	if (percent >= 0.7) return theme.colors.statusWarning;
	return theme.colors.accentBright;
}

function ContextRing({ usage }: { usage: ContextUsage | null }) {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const percent = usage?.percent ?? null;
	const ringColor = useMemo(() => contextTone(percent, theme), [percent, theme]);
	const dash = percent != null ? RING_CIRCUMFERENCE * Math.min(1, Math.max(0, percent)) : 0;

	return (
		<View style={styles.ringWrap}>
			<Svg width={92} height={92}>
				<Circle
					cx={46}
					cy={46}
					r={RING_RADIUS}
					stroke={theme.colors.border}
					strokeWidth={6}
					fill="none"
				/>
				{percent != null && (
					<Circle
						cx={46}
						cy={46}
						r={RING_RADIUS}
						stroke={ringColor}
						strokeWidth={6}
						fill="none"
						strokeDasharray={`${dash} ${RING_CIRCUMFERENCE}`}
						strokeLinecap="round"
						rotation={-90}
						originX={46}
						originY={46}
					/>
				)}
			</Svg>
			<View style={styles.ringCenter}>
				<Text style={styles.ringPercentBig}>
					{percent != null ? `${Math.round(percent * 100)}%` : "—"}
				</Text>
				<Text style={styles.ringLabel}>{t("usage.contextWindow")}</Text>
			</View>
			<Text style={styles.ringSub}>
				{usage?.tokens != null
					? `${formatTokens(usage.tokens)} / ${formatTokens(usage.contextWindow)}`
					: t("usage.noContextData")}
			</Text>
		</View>
	);
}

function TokenCell({ label, value }: { label: string; value: number }) {
	return (
		<View style={styles.cell}>
			<Text style={styles.cellValue}>{formatTokens(value)}</Text>
			<Text style={styles.cellLabel} numberOfLines={1}>
				{label}
			</Text>
		</View>
	);
}

function CountRow({ label, value }: { label: string; value: number }) {
	return (
		<View style={styles.countRow}>
			<Text style={styles.countLabel} numberOfLines={1}>
				{label}
			</Text>
			<Text style={styles.countValue}>{value}</Text>
		</View>
	);
}

function formatTokens(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
	return String(value);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, backgroundColor: "transparent" },
	list: { padding: theme.spacing[3], gap: theme.spacing[2] },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingBottom: theme.spacing[0.5],
	},
	title: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.semibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	section: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.semibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
		paddingTop: theme.spacing[2],
	},
	ringWrap: { alignItems: "center", gap: theme.spacing[1.5], paddingVertical: theme.spacing[2] },
	ringCenter: { position: "absolute", top: theme.spacing[6], alignItems: "center" },
	ringPercentBig: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize["2xl"],
		fontWeight: theme.fontWeight.semibold,
		letterSpacing: -0.5,
	},
	ringLabel: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	ringSub: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: theme.spacing[2],
	},
	cell: {
		flexBasis: "47%",
		flexGrow: 1,
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.md,
		padding: theme.spacing[2],
		gap: theme.spacing[0.5],
	},
	cellValue: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.content,
		fontWeight: theme.fontWeight.semibold,
	},
	cellLabel: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	rows: { gap: theme.spacing[0.5] },
	countRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: theme.spacing[1],
		borderBottomWidth: 1,
		borderBottomColor: theme.colors.border,
	},
	countLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	countValue: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.semibold,
	},
	empty: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		padding: theme.spacing[3],
	},
}));
