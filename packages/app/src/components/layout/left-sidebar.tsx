// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/components/left-sidebar.tsx
// (Pie subset: DesktopSidebar structure — drag-area header group (brand +
// search), the workspace's session list in date buckets, and a footer with
// New session. Host picker / usage / plugin rows are not ported.)
import { useEffect, useMemo } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react-native";
import { Plus, SquareTerminal } from "lucide-react-native";
import { useTabsStore } from "@/stores/tabs-store";

import type { LucideIcon } from "lucide-react-native";
import { useUnistyles, StyleSheet } from "react-native-unistyles";
import {
	relativeTime,
	sessionTitle,
	useSessionListStore,
} from "@/stores/session-list-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import {
	groupByProject,
	useWorkspaceRegistryStore,
} from "@/stores/workspace-registry-store";
import { FolderPlus } from "lucide-react-native";
import { useRouter, usePathname } from "expo-router";

/**
 * Desktop left sidebar. One session list per active workspace; sessions are
 * Paseo's agent-list rows. The sidebar stays mounted whenever chrome is on
 * (latch), so workspace navigation never remounts the list mid-scroll.
 */
export function LeftSidebar() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();

	const workspaceId = useWorkspaceStore((s) => s.workspaceId);
	const router = useRouter();
	const pathname = usePathname();
	const registry = useWorkspaceRegistryStore((s) => s.workspaces);
	const register = useWorkspaceRegistryStore((s) => s.register);
	const search = useSessionListStore((s) => s.search);
	const setSearch = useSessionListStore((s) => s.setSearch);
	const refresh = useSessionListStore((s) => s.refresh);
	const select = useSessionListStore((s) => s.select);
	const loading = useSessionListStore((s) => s.loading);
	const activeSessionId = useConnectionStore((s) => s.sessionId);

	const groups = useMemo(() => select(), [select]);

	useEffect(() => {
		if (workspaceId) {
			register(workspaceId);
			void refresh();
		}
	}, [workspaceId, refresh, register]);

	return (
		<View style={styles.sidebar}>
			{/* Paseo's sidebarDragArea: titlebar drag region + nav rows. */}
			<View style={styles.headerGroup}>
				<Text style={styles.brand}>πie</Text>
				<SearchField value={search} onChangeText={setSearch} placeholder={t("agentList.searchPlaceholder")} />
			</View>

			{/* Paseo's SidebarWorkspaceList: workspaces grouped by project. */}
			<View style={styles.sectionHeader}>
				<Text style={styles.sectionTitle}>{t("workspaces.title")}</Text>
				<Pressable
					hitSlop={6}
					onPress={() => {
						const ws = workspaceId ?? registry[0]?.id;
						if (ws) router.push({ pathname: "/w/[workspaceId]", params: { workspaceId: ws } });
						useConnectionStore.getState().setPendingModel(null);
						if (workspaceId) useTabsStore.getState().openNew();
					}}
				>
					<FolderPlus size={13} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
				</Pressable>
			</View>
			{groupByProject(registry).map(({ project, items }) => (
				<View key={project || "default"} style={styles.projectGroup}>
					{project ? <Text style={styles.projectLabel}>{project}</Text> : null}
					{items.map((w) => {
						const active = pathname.includes(encodeURIComponent(w.id)) || pathname === w.id;
						return (
							<Pressable
								key={w.id}
								style={({ pressed }) => [
									styles.row,
									active && styles.rowSelected,
									pressed && styles.rowPressed,
								]}
								onPress={() =>
									router.push({ pathname: "/w/[workspaceId]", params: { workspaceId: w.id } })
								}
							>
								<Text style={[styles.rowTitle, active && styles.rowTitleOn]} numberOfLines={1}>
									{w.name}
								</Text>
							</Pressable>
						);
					})}
				</View>
			))}

			{/* Paseo's session list (agent list) — the workspace's sessions. */}
			<ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
				<View style={styles.sectionHeader}>
					<Text style={styles.sectionTitle}>{t("sessions.title")}</Text>
				</View>
				{loading && groups.length === 0 ? (
					<View style={styles.emptyWrap}>
						<Text style={styles.emptyText}>{t("common.connecting")}</Text>
					</View>
				) : null}
				{!loading && groups.length === 0 ? (
					<View style={styles.emptyWrap}>
						<Text style={styles.emptyText}>
							{search.length > 0 ? t("sessions.noMatches") : t("agentList.empty")}
						</Text>
						{search.length === 0 && workspaceId ? (
							<Text style={styles.emptyHint} numberOfLines={2}>
								{t("agentList.emptyIn")}: {workspaceId}
							</Text>
						) : null}
					</View>
				) : null}
				{groups.map(({ bucket, items }) => (
					<View key={bucket}>
						<Text style={styles.bucketLabel}>{t(`agentList.buckets.${bucket}`)}</Text>
						{items.map((session) => {
							const on = activeSessionId === session.sessionId;
							return (
								<Pressable
									key={session.sessionId}
									style={({ pressed }) => [
										styles.row,
										on && styles.rowSelected,
										pressed && styles.rowPressed,
									]}
									onPress={() => useConnectionStore.getState().switchSession(session.sessionId)}
								>
									<Text style={[styles.rowTitle, on && styles.rowTitleOn]} numberOfLines={1}>
										{sessionTitle(session)}
									</Text>
									<View style={styles.rowMeta}>
										<Text style={styles.rowTime}>{relativeTime(session.modified)}</Text>
										{session.messageCount > 0 ? (
											<Text style={styles.rowCount}>{session.messageCount}</Text>
										) : null}
									</View>
								</Pressable>
							);
						})}
					</View>
				))}
			</ScrollView>

			{/* Paseo's SidebarFooter: primary actions pinned at the bottom. */}
			<View style={styles.footer}>
				<FooterButton
					icon={Plus}
					label={t("agentList.newSession")}
					onPress={() => {
						const ws = useWorkspaceStore.getState().workspaceId;
						if (ws) void useConnectionStore.getState().startSession(ws);
					}}
					primary
				/>
				{workspaceId ? (
					<View style={styles.workspaceRow}>
						<SquareTerminal size={13} color={theme.colors.border} strokeWidth={1.5} />
						<Text style={styles.workspaceText} numberOfLines={1} ellipsizeMode="middle">
							{workspaceId}
						</Text>
					</View>
				) : null}
			</View>
		</View>
	);
}

function SearchField({
	value,
	onChangeText,
	placeholder,
}: {
	value: string;
	onChangeText: (next: string) => void;
	placeholder: string;
}) {
	const { theme } = useUnistyles();
	return (
		<View style={styles.searchRow}>
			<Search size={13} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
			<TextInput
				style={styles.searchInput}
				placeholder={placeholder}
				placeholderTextColor={theme.colors.border}
				value={value}
				onChangeText={onChangeText}
				autoCapitalize="none"
				autoCorrect={false}
			/>
			{value.length > 0 ? (
				<Pressable onPress={() => onChangeText("")} hitSlop={6}>
					<X size={13} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
				</Pressable>
			) : null}
		</View>
	);
}

function FooterButton({
	icon: Icon,
	label,
	onPress,
	primary,
	ellipsize,
}: {
	icon: LucideIcon;
	label: string;
	onPress: () => void;
	primary?: boolean;
	ellipsize?: boolean;
}) {
	const { theme } = useUnistyles();
	return (
		<Pressable
			style={({ pressed }) => [styles.footerButton, primary && styles.footerButtonPrimary, pressed && styles.footerButtonPressed]}
			onPress={onPress}
		>
			<Icon
				size={14}
				color={primary ? theme.colors.accentForeground : theme.colors.foregroundMuted}
				strokeWidth={1.5}
			/>
			<Text
				style={[styles.footerButtonText, primary && styles.footerButtonTextPrimary]}
				numberOfLines={ellipsize ? 1 : undefined}
				ellipsizeMode={ellipsize ? "middle" : undefined}
			>
				{label}
			</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create((theme) => ({
	sidebar: {
		flex: 1,
		backgroundColor: theme.colors.surfaceSidebar,
	},
	headerGroup: {
		paddingTop: theme.spacing[4],
		paddingHorizontal: theme.spacing[2],
		paddingBottom: theme.spacing[2],
		gap: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	brand: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.lg,
		fontWeight: theme.fontWeight.bold,
	},
	searchRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 5,
	},
	searchInput: {
		flex: 1,
		color: theme.colors.foreground,
		fontSize: theme.fontSize.sm,
		padding: 0,
	},
	list: { flex: 1 },
	listContent: { gap: 2, paddingBottom: theme.spacing[3] },
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: theme.spacing[2],
		paddingTop: theme.spacing[2],
		paddingBottom: 4,
	},
	projectGroup: { gap: 2, paddingVertical: 2 },
	projectLabel: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: 10,
		fontWeight: "600",
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 2,
	},
	sectionTitle: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
	},
	bucketLabel: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: 10,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.5,
		paddingHorizontal: theme.spacing[2],
		paddingTop: theme.spacing[2],
		paddingBottom: 4,
	},
	row: {
		borderRadius: theme.borderRadius.md,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 6,
		gap: 2,
	},
	rowSelected: { backgroundColor: theme.colors.surface2 },
	rowPressed: { opacity: 0.7 },
	rowTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	rowTitleOn: { color: theme.colors.foreground },
	rowMeta: { flexDirection: "row", gap: theme.spacing[2], alignItems: "center" },
	rowTime: { color: theme.colors.foregroundExtraMuted, fontSize: 10 },
	rowCount: { color: theme.colors.border, fontSize: 10 },
	emptyWrap: { padding: theme.spacing[3], gap: 4 },
	emptyText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	emptyHint: { color: theme.colors.border, fontSize: 10 },
	footer: {
		padding: theme.spacing[2],
		gap: theme.spacing[1],
		borderTopWidth: theme.borderWidth[1],
		borderTopColor: theme.colors.border,
	},
	footerButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		paddingVertical: theme.spacing[1.5],
		paddingHorizontal: theme.spacing[2],
		borderRadius: theme.borderRadius.md,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
	},
	footerButtonPrimary: {
		backgroundColor: theme.colors.accent,
		borderColor: theme.colors.accent,
	},
	footerButtonPressed: { opacity: 0.8 },
	workspaceRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 2,
	},
	workspaceText: { color: theme.colors.foregroundExtraMuted, fontSize: 10, flexShrink: 1 },
	footerButtonText: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
		flexShrink: 1,
	},
	footerButtonTextPrimary: { color: theme.colors.accentForeground },
}));
