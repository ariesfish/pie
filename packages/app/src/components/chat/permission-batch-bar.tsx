// [pie] T-015: batch approval bar — shown only while more than one permission
// card is pending. Settles every selected card with one decision via
// respondPermissions (permission.respondMany on the wire).
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ShieldCheck, ShieldX, X } from "lucide-react-native";

import { useConnectionStore, type PermissionCard } from "@/stores/connection-store";

/** Ids that are both selected and still pending (settled cards drop out). */
export function filterSelectedPermissions(
	permissions: PermissionCard[],
	selection: string[],
): string[] {
	return selection.filter((id) => permissions.some((c) => c.requestId === id));
}

export function PermissionBatchBar() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const permissions = useConnectionStore((s) => s.permissions);
	const selection = useConnectionStore((s) => s.permissionSelection);
	const respondPermissions = useConnectionStore((s) => s.respondPermissions);
	const selectAllPermissions = useConnectionStore((s) => s.selectAllPermissions);
	const clearPermissionSelection = useConnectionStore((s) => s.clearPermissionSelection);
	if (permissions.length <= 1) return null;

	const selected = filterSelectedPermissions(permissions, selection);

	return (
		<View style={styles.bar} testID="permission-batch-bar">
			<Text style={styles.count}>
				{t("permission.batch.count", { total: permissions.length, selected: selected.length })}
			</Text>
			<Pressable
				style={styles.ghost}
				accessibilityRole="button"
				accessibilityLabel={t("permission.batch.clear")}
				onPress={clearPermissionSelection}
			>
				<X size={13} color={theme.colors.foregroundMuted} strokeWidth={1.75} />
				<Text style={[styles.ghostText]}>{t("permission.batch.clear")}</Text>
			</Pressable>
			<Pressable
				style={[styles.btn, styles.deny, selected.length === 0 && styles.disabled]}
				accessibilityRole="button"
				accessibilityLabel={t("permission.batch.deny", { count: selected.length })}
				disabled={selected.length === 0}
				onPress={() => void respondPermissions(selected, "deny")}
			>
				<ShieldX size={13} color={theme.colors.statusDanger} strokeWidth={1.75} />
				<Text style={[styles.btnText, { color: theme.colors.statusDanger }]}>
					{t("permission.batch.deny", { count: selected.length })}
				</Text>
			</Pressable>
			<Pressable
				style={[styles.btn, styles.allow, selected.length === 0 && styles.disabled]}
				accessibilityRole="button"
				accessibilityLabel={t("permission.batch.allow", { count: selected.length })}
				disabled={selected.length === 0}
				onPress={() => void respondPermissions(selected, "allow")}
			>
				<ShieldCheck size={13} color={theme.colors.accentForeground} strokeWidth={1.75} />
				<Text style={[styles.btnText, { color: theme.colors.accentForeground }]}>
					{t("permission.batch.allow", { count: selected.length })}
				</Text>
			</Pressable>
			<Pressable
				style={styles.ghost}
				accessibilityRole="button"
				accessibilityLabel={t("permission.batch.selectAll")}
				onPress={selectAllPermissions}
			>
				<Text style={[styles.ghostText]}>{t("permission.batch.selectAll")}</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	bar: {
		alignSelf: "stretch",
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: theme.spacing[2],
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		padding: theme.spacing[2],
	},
	count: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
	},
	ghost: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1],
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1],
	},
	ghostText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
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
	disabled: { opacity: 0.5 },
	btnText: { fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
}));
