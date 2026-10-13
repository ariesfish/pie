// Workspace tab bar (P2b-1). Panel-registration model follows paseo's
// panel-registry shape (definePanel: presentation + lazy component) scaled
// down to three built-in panels; plugin panels join in P2d.
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { FolderGit2, FolderOpen, MessageSquare, type LucideIcon } from "lucide-react-native";

export type PanelKind = "chat" | "files" | "changes";

interface PanelDef {
	kind: PanelKind;
	icon: LucideIcon;
	titleKey: string;
}

const PANELS: PanelDef[] = [
	{ kind: "chat", icon: MessageSquare, titleKey: "panels.chat" },
	{ kind: "files", icon: FolderOpen, titleKey: "panels.files" },
	{ kind: "changes", icon: FolderGit2, titleKey: "panels.changes" },
];

export function TabBar({
	active,
	onChange,
}: {
	active: PanelKind;
	onChange: (kind: PanelKind) => void;
}) {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const items = useMemo(() => PANELS, []);
	return (
		<View style={styles.bar}>
			{items.map(({ kind, icon: Icon, titleKey }) => {
				const isActive = kind === active;
				return (
					<Pressable
						key={kind}
						style={[styles.tab, isActive && styles.tabActive]}
						onPress={() => onChange(kind)}
					>
						<Icon
							size={16}
							color={isActive ? theme.colors.foreground : theme.colors.foregroundMuted}
							strokeWidth={1.5}
						/>
						<Text style={[styles.label, isActive && styles.labelActive]}>{t(titleKey)}</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	bar: {
		flexDirection: "row",
		gap: theme.spacing[1],
		paddingHorizontal: theme.spacing[2],
		paddingTop: theme.spacing[2],
	},
	tab: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[1.5],
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: "transparent",
	},
	tabActive: {
		backgroundColor: theme.colors.surface2,
		borderColor: theme.colors.border,
	},
	label: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	labelActive: { color: theme.colors.foreground },
}));
