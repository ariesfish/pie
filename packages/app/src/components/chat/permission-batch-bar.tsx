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
				<Text style={styles.ghostText}>{t("permission.batch.clear")}</Text>
			</Pressable>
			<Pressable
				style={[styles.btn, selected.length === 0 && styles.disabled]}
				accessibilityRole="button"
				accessibilityLabel={t("permission.batch.deny", { count: selected.length })}
				disabled={selected.length === 0}
				onPress={() => void respondPermissions(selected, "deny")}
			>
				<ShieldX
					size={13}
					color={selected.length === 0 ? theme.colors.foregroundExtraMuted : theme.colors.foregroundMuted}
					strokeWidth={1.75}
				/>
				<Text style={[styles.btnText, selected.length === 0 && styles.disabledText]}>
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
				<ShieldCheck
					size={13}
					color={selected.length === 0 ? theme.colors.foregroundExtraMuted : theme.colors.accentForeground}
					strokeWidth={1.75}
				/>
				<Text style={[styles.btnText, styles.allowText, selected.length === 0 && styles.disabledText]}>
					{t("permission.batch.allow", { count: selected.length })}
				</Text>
			</Pressable>
			<Pressable
				style={styles.ghost}
				accessibilityRole="button"
				accessibilityLabel={t("permission.batch.selectAll")}
				onPress={selectAllPermissions}
			>
				<Text style={styles.ghostText}>{t("permission.batch.selectAll")}</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	// The batch bar is chrome above the pending cards: it sits on the sub
	// surface and never takes a shadow, so the permission card stays the
	// floating layer.
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
	// Secondary answers are canvas + hairline-strong + ink; only the allow
	// action carries the accent fill (one per viewport).
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
	allow: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
	// Disabled: ink-3 text on surface1, no opacity fade (DESIGN.md §Buttons).
	disabled: { backgroundColor: theme.colors.surface1, borderColor: theme.colors.border },
	disabledText: { color: theme.colors.foregroundExtraMuted },
	btnText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
	allowText: { color: theme.colors.accentForeground },
}));
