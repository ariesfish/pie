// Visual language ported from getpaseo/paseo (Apache-2.0) —
// packages/app/src/components/context-window-meter.tsx (ring meter shape).
// Pie adaptation: driven directly by the pie protocol's
// `session.contextUsage.changed` payload; no host-usage indirection.
import { useMemo } from "react";
import Svg, { Circle } from "react-native-svg";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { ContextUsage } from "@pie/protocol";

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface Props {
	usage: ContextUsage | null;
	expanded: boolean;
	onToggle: () => void;
}

export function ContextMeter({ usage, expanded, onToggle }: Props) {
	const { theme } = useUnistyles();

	const percent = usage?.percent ?? null;
	const tokens = usage?.tokens ?? null;

	const ringColor = useMemo(() => {
		if (percent == null) return theme.colors.border;
		if (percent >= 0.9) return theme.colors.statusDanger;
		if (percent >= 0.7) return theme.colors.statusWarning;
		return theme.colors.accentBright;
	}, [percent, theme]);

	if (percent == null && tokens == null) return null;

	return (
		<Pressable onPress={onToggle} hitSlop={8} style={styles.root}>
			<View style={styles.row}>
				<Svg width={24} height={24}>
					<Circle
						cx={12}
						cy={12}
						r={RING_RADIUS}
						stroke={theme.colors.border}
						strokeWidth={2.5}
						fill="none"
					/>
					{percent != null && (
						<Circle
							cx={12}
							cy={12}
							r={RING_RADIUS}
							stroke={ringColor}
							strokeWidth={2.5}
							fill="none"
							strokeDasharray={`${RING_CIRCUMFERENCE * Math.min(percent, 1)} ${RING_CIRCUMFERENCE}`}
							strokeLinecap="round"
							transform="rotate(-90 12 12)"
						/>
					)}
				</Svg>
				<Text style={styles.label}>{Math.round((percent ?? 0) * 100)}%</Text>
			</View>
			{expanded && (
				<Text style={styles.detail}>
					{tokens != null ? `${formatK(tokens)} / ${formatK(usage?.contextWindow ?? 0)} tokens` : "tokens: —"}
				</Text>
			)}
		</Pressable>
	);
}

function formatK(value: number): string {
	if (value >= 1_000_000) return `${Math.round(value / 1_000_000)}m`;
	if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
	return Math.round(value).toString();
}

const styles = StyleSheet.create((theme) => ({
	root: { alignItems: "flex-end", gap: 2 },
	row: { flexDirection: "row", alignItems: "center", gap: 6 },
	label: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	detail: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
}));
