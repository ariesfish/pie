// [pie] W4c → T-015: pending-permission card — the agent asking to run a gated
// tool surfaces in the chat's live auxiliary area with the protocol's
// three-way answer (allow once / allow for session / deny). With more than one
// pending card each card gains a "join batch" checkbox (and long-press on
// mobile); the batch bar itself lives in chat-list (single card → no bar).
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Check, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react-native";

import { StatusBadge } from "@/components/ui/status-badge";
import type { PermissionCard as PermissionCardData } from "@/stores/connection-store";
import { useConnectionStore } from "@/stores/connection-store";

export function PermissionCard({ card }: { card: PermissionCardData }) {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const permissive = useConnectionStore((s) => s.permissions.length > 1);
	const selected = useConnectionStore((s) => s.permissionSelection.includes(card.requestId));
	const respondPermission = useConnectionStore((s) => s.respondPermission);
	const togglePermissionSelection = useConnectionStore((s) => s.togglePermissionSelection);

	const argEntries = Object.entries(card.argsPreview ?? {}).slice(0, 6);

	return (
		<Pressable
			style={[styles.card, selected && styles.selectedCard]}
			testID="permission-card"
			onLongPress={permissive ? () => togglePermissionSelection(card.requestId) : undefined}
		>
			<View style={styles.header}>
				<ShieldAlert size={15} color={theme.colors.statusWarning} strokeWidth={1.75} />
				<Text style={styles.title} numberOfLines={1}>
					{t("permission.title", { tool: card.toolName })}
				</Text>
				<StatusBadge label={t("permission.pending")} variant="warning" size="xs" />
			</View>
			{card.reason ? <Text style={styles.reason}>{card.reason}</Text> : null}
			{argEntries.length > 0 ? (
				<View style={styles.args}>
					{argEntries.map(([key, value]) => (
						<View key={key} style={styles.argRow}>
							<Text style={styles.argKey} numberOfLines={1}>
								{key}
							</Text>
							<Text style={styles.argValue} numberOfLines={2}>
								{previewArg(value)}
							</Text>
						</View>
					))}
				</View>
			) : null}
			{permissive ? (
				<Pressable
					style={styles.selectRow}
					accessibilityLabel={t("permission.selectForBatch")}
					onPress={() => togglePermissionSelection(card.requestId)}
					testID={`permission-select-${card.requestId}`}
				>
					<View style={[styles.checkbox, selected && styles.checkboxOn]}>
						{selected ? <Check size={12} color={theme.colors.onStrong} strokeWidth={2.5} /> : null}
					</View>
					<Text style={styles.selectText}>{t("permission.selectForBatch")}</Text>
				</Pressable>
			) : null}
			<View style={styles.actions}>
				{/* Exactly one accent-filled action (allow once). Deny is the ghost
				 *  low-priority action; allow-for-session is secondary (canvas + hairline). */}
				<Pressable
					style={styles.ghost}
					accessibilityLabel={t("permission.deny")}
					onPress={() => void respondPermission(card.requestId, "deny")}
				>
					<ShieldX size={13} color={theme.colors.foregroundMuted} strokeWidth={1.75} />
					<Text style={styles.ghostText}>{t("permission.deny")}</Text>
				</Pressable>
				<View style={styles.actionSpacer} />
				<Pressable
					style={styles.btn}
					accessibilityLabel={t("permission.allowSession")}
					onPress={() => void respondPermission(card.requestId, "allowSession")}
				>
					<ShieldCheck size={13} color={theme.colors.foregroundMuted} strokeWidth={1.75} />
					<Text style={styles.btnText}>{t("permission.allowSession")}</Text>
				</Pressable>
				<Pressable
					style={[styles.btn, styles.allow]}
					accessibilityLabel={t("permission.allow")}
					onPress={() => void respondPermission(card.requestId, "allow")}
				>
					<ShieldCheck size={13} color={theme.colors.accentForeground} strokeWidth={1.75} />
					<Text style={[styles.btnText, styles.allowText]}>{t("permission.allow")}</Text>
				</Pressable>
			</View>
		</Pressable>
	);
}

function previewArg(value: unknown): string {
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

const styles = StyleSheet.create((theme) => ({
	// Raised layer (DESIGN.md §Elevation: permission cards are one of the few
	// surfaces allowed a shadow). It has to read as the loudest thing in the
	// column without introducing a new colour: canvas bg, hairline-strong
	// border, one shadow, and a warning chip in the header.
	card: {
		alignSelf: "stretch",
		backgroundColor: theme.colors.surface0,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		padding: theme.spacing[3],
		gap: theme.spacing[2],
		...theme.shadow.md,
	},
	selectedCard: {
		// Selection is the same neutral raise the rest of the product uses, so
		// the accent budget stays free for the primary action.
		backgroundColor: theme.colors.surface2,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
	},
	title: {
		flex: 1,
		color: theme.colors.foreground,
		fontSize: theme.fontSize.base,
		fontWeight: theme.fontWeight.semibold,
	},
	reason: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.base,
		lineHeight: Math.round(theme.fontSize.base * 1.5),
	},
	args: {
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.md,
		padding: theme.spacing[2],
		gap: theme.spacing[1],
	},
	argRow: {
		flexDirection: "row",
		gap: theme.spacing[2],
		alignItems: "flex-start",
	},
	argKey: {
		flexBasis: 96,
		flexShrink: 0,
		color: theme.colors.foregroundExtraMuted,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
	},
	argValue: {
		flex: 1,
		color: theme.colors.foreground,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
	},
	selectRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
	},
	checkbox: {
		width: 16,
		height: 16,
		borderRadius: theme.borderRadius.sm,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxOn: {
		backgroundColor: theme.colors.foreground,
		borderColor: theme.colors.foreground,
	},
	selectText: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
	},
	actions: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		flexWrap: "wrap",
	},
	actionSpacer: { flex: 1, minWidth: theme.spacing[2] },
	// Secondary: canvas + hairline-strong + ink text.
	btn: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1],
		height: 28,
		paddingHorizontal: theme.spacing[3],
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		backgroundColor: theme.colors.surface0,
	},
	// Primary: the card's single accent fill.
	allow: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
	// Ghost: the low-priority answer (deny).
	ghost: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1],
		height: 28,
		paddingHorizontal: theme.spacing[1.5],
	},
	btnText: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.medium,
	},
	ghostText: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.medium,
	},
	allowText: { color: theme.colors.accentForeground },
}));
