// [pie] W4c: pending-permission card — the agent asking to run a gated
// tool surfaces in the chat's live auxiliary area with the protocol's
// three-way answer (allow once / allow for session / deny).
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react-native";

import { useConnectionStore } from "@/stores/connection-store";

export function PermissionCard() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const permission = useConnectionStore((s) => s.permissions[0] ?? null);
	const respondPermission = useConnectionStore((s) => s.respondPermission);
	if (!permission) return null;

	const argEntries = Object.entries(permission.argsPreview ?? {}).slice(0, 6);

	return (
		<View style={styles.card} testID="permission-card">
			<View style={styles.header}>
				<ShieldAlert size={15} color={theme.colors.statusWarning} strokeWidth={1.75} />
				<Text style={styles.title} numberOfLines={1}>
					{t("permission.title", { tool: permission.toolName })}
				</Text>
			</View>
			{permission.reason ? (
				<Text style={styles.reason}>{permission.reason}</Text>
			) : null}
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
			<View style={styles.actions}>
				<Pressable
					style={[styles.btn, styles.deny]}
					accessibilityLabel={t("permission.deny")}
					onPress={() => void respondPermission(permission.requestId, "deny")}
				>
					<ShieldX size={13} color={theme.colors.statusDanger} strokeWidth={1.75} />
					<Text style={[styles.btnText, { color: theme.colors.statusDanger }]}>
						{t("permission.deny")}
					</Text>
				</Pressable>
				<Pressable
					style={styles.btn}
					accessibilityLabel={t("permission.allowSession")}
					onPress={() => void respondPermission(permission.requestId, "allowSession")}
				>
					<ShieldCheck size={13} color={theme.colors.accentBright} strokeWidth={1.75} />
					<Text style={[styles.btnText, { color: theme.colors.accentBright }]}>
						{t("permission.allowSession")}
					</Text>
				</Pressable>
				<Pressable
					style={[styles.btn, styles.allow]}
					accessibilityLabel={t("permission.allow")}
					onPress={() => void respondPermission(permission.requestId, "allow")}
				>
					<ShieldCheck size={13} color={theme.colors.accentForeground} strokeWidth={1.75} />
					<Text style={[styles.btnText, { color: theme.colors.accentForeground }]}>
						{t("permission.allow")}
					</Text>
				</Pressable>
			</View>
		</View>
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
	card: {
		alignSelf: "stretch",
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.statusWarning,
		padding: theme.spacing[3],
		gap: theme.spacing[2],
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
		fontSize: theme.fontSize.sm,
		lineHeight: 18,
	},
	args: {
		backgroundColor: theme.colors.surface0,
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
		fontSize: theme.fontSize.sm,
	},
	argValue: {
		flex: 1,
		color: theme.colors.foreground,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.sm,
	},
	actions: {
		flexDirection: "row",
		gap: theme.spacing[2],
		justifyContent: "flex-end",
		flexWrap: "wrap",
	},
	btn: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[1.5],
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		backgroundColor: theme.colors.surface0,
	},
	allow: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
	deny: { borderColor: theme.colors.border },
	btnText: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
}));
