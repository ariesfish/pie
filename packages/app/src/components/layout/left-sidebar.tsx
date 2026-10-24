// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/components/left-sidebar.tsx
// + sidebar-workspace-list.tsx + agent-list.tsx (visual grammar only).
// Pie layout (paseo.png spec): header (brand + search) → new-workspace row →
// Workspaces section → per-workspace collapsible row with its sessions nested
// as indented rows (bubble icon + title + relative-time badge) → footer with
// new-session and settings. Paseo's date buckets/multi-host columns are not
// ported; sessions nest under their workspace instead (user IA decision).
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
	ChevronDown,
	ChevronRight,
	Cog,
	FolderPlus,
	MessageCircle,
	Plus,
	Search,
	X,
} from "lucide-react-native";
import { useTabsStore } from "@/stores/tabs-store";

import { useUnistyles, StyleSheet } from "react-native-unistyles";
import {
	sessionTitle,
	useSessionListStore,
} from "@/stores/session-list-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRegistryStore } from "@/stores/workspace-registry-store";
import { useRouter } from "expo-router";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { RenameSessionSheet } from "./rename-session-sheet";
import { relativeTimeLabel } from "@/lib/relative-time";

/** session rows render under the workspace whose path prefixes their cwd. */
function sessionUnderWorkspace(sessionCwd: string, workspaceId: string): boolean {
	return sessionCwd === workspaceId || sessionCwd.startsWith(`${workspaceId}/`);
}

/**
 * Desktop left sidebar. Workspaces list with sessions nested under each
 * workspace row (paseo.png layout); the sidebar stays mounted whenever chrome
 * is on so workspace navigation never remounts the tree mid-scroll.
 */
export function LeftSidebar() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();

	const workspaceId = useWorkspaceStore((s) => s.workspaceId);
	const router = useRouter();
	const registry = useWorkspaceRegistryStore((s) => s.workspaces);
	const register = useWorkspaceRegistryStore((s) => s.register);
	const search = useSessionListStore((s) => s.search);
	const setSearch = useSessionListStore((s) => s.setSearch);
	const refresh = useSessionListStore((s) => s.refresh);
	const sessions = useSessionListStore((s) => s.sessions);
	const loading = useSessionListStore((s) => s.loading);
	const activeSessionId = useConnectionStore((s) => s.sessionId);
	const renameError = useSessionListStore((s) => s.renameError);
	const clearRenameError = useSessionListStore((s) => s.clearRenameError);
	// Rename panel target (null = closed).
	const [renameTarget, setRenameTarget] = useState<Parameters<typeof sessionTitle>[0] | null>(null);

	// One inline error surface for both entry points (panel submit and the
	// menu's clear action): show the last rename failure, auto-dismiss.
	// The sidebar renders outside the route's ToastProvider (AppContainer
	// chrome), so the error banner lives here instead of a toast.
	useEffect(() => {
		if (!renameError) return;
		const timer = setTimeout(() => clearRenameError(), 6000);
		return () => clearTimeout(timer);
	}, [renameError, clearRenameError]);

	// Collapsed workspaces (session subtrees hidden). Session-scope: persisted
	// collapse state lands with the workspace-layout record (NOTICE W5).
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	// Derive on every render (identity-keyed memos pinned stale under the web
	// bundle; see NOTICE W5 metro probe).
	const q = search.trim().toLowerCase();
	const sessionMatches = (s: { name?: string; firstMessage: string; sessionId: string }) =>
		!q ||
		(s.name ?? "").toLowerCase().includes(q) ||
		s.firstMessage.toLowerCase().includes(q) ||
		s.sessionId.toLowerCase().includes(q);

	useEffect(() => {
		if (workspaceId) {
			register(workspaceId);
			void refresh();
		}
	}, [workspaceId, refresh, register]);

	const toggleCollapsed = (id: string) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<View style={styles.sidebar}>
			<View style={styles.headerGroup}>
				<Text style={styles.brand}>Pie</Text>
				<SearchField
					value={search}
					onChangeText={setSearch}
					placeholder={t("agentList.searchPlaceholder")}
				/>
			</View>

			{/* paseo.png: the "+ new workspace" affordance sits at the very top. */}
			<Pressable
				style={({ pressed }) => [styles.newWorkspaceRow, pressed && styles.rowPressed]}
				onPress={() => router.push("/workspaces")}
			>
				<Plus size={14} color={theme.colors.foregroundMuted} strokeWidth={1.75} />
				<Text style={styles.newWorkspaceText}>{t("workspaces.new")}</Text>
			</Pressable>

			<ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
				<View style={styles.sectionHeader}>
					<Text style={styles.sectionTitle}>{t("workspaces.title")}</Text>
				</View>
				{registry.map((w) => {
					const active =
						workspaceId === w.id || (workspaceId?.startsWith(`${w.id}/`) ?? false);
					const isCollapsed = collapsed.has(w.id);
					const wsSessions = sessions
						.filter((s) => sessionUnderWorkspace(s.workspaceId, w.id) && sessionMatches(s))
						.slice()
						.sort((a, b) => (a.modified < b.modified ? 1 : -1));
					return (
						<View key={w.id}>
							<View style={[styles.workspaceRow, active && styles.workspaceRowActive]}>
								<Pressable
									hitSlop={8}
									onPress={() => toggleCollapsed(w.id)}
									accessibilityLabel={
										isCollapsed ? t("workspaces.expand") : t("workspaces.collapse")
									}
									style={styles.chevronCell}
								>
									{isCollapsed ? (
										<ChevronRight
											size={13}
											color={theme.colors.foregroundMuted}
											strokeWidth={1.75}
										/>
									) : (
										<ChevronDown
											size={13}
											color={theme.colors.foregroundMuted}
											strokeWidth={1.75}
										/>
									)}
								</Pressable>
								<Pressable
									style={styles.workspaceMain}
									onPress={() => {
										router.push({ pathname: "/w/[workspaceId]", params: { workspaceId: w.id } });
										useTabsStore.getState().showMobileHome();
									}}
								>
									<View style={styles.workspaceLogo}>
										<Text style={styles.workspaceLogoText}>
											{(w.name[0] ?? "?").toUpperCase()}
										</Text>
									</View>
									<Text
										style={[styles.workspaceName, active && styles.workspaceNameActive]}
										numberOfLines={1}
									>
										{w.name}
									</Text>
								</Pressable>
							</View>
							{!isCollapsed ? (
								wsSessions.length === 0 ? (
									loading ? null : (
										<Text style={styles.emptySessions} numberOfLines={1}>
											{t("agentList.emptyIn")}
										</Text>
									)
								) : (
									wsSessions.map((s) => (
										<SessionRow
											key={s.sessionId}
											session={s}
											selected={s.sessionId === activeSessionId}
											onPress={() => {
												void useConnectionStore
													.getState()
													.switchSession(s.sessionId, s.path || undefined)
													.then(() => {
														useTabsStore.getState().openSession(s.sessionId);
														useTabsStore.getState().showMobileHome();
													});
											}}
											onRename={() => setRenameTarget(s)}
											onClear={() =>
												void useSessionListStore.getState().renameSession(s.sessionId, "")
											}
										/>
									))
								)
							) : null}
						</View>
					);
				})}
				{registry.length === 0 ? (
					<Pressable
						style={({ pressed }) => [styles.newWorkspaceRow, pressed && styles.rowPressed]}
						onPress={() => router.push("/workspaces")}
					>
						<FolderPlus size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
						<Text style={styles.newWorkspaceTextMuted}>{t("workspaces.add")}</Text>
					</Pressable>
				) : null}
			</ScrollView>

			<RenameSessionSheet
				session={renameTarget}
				visible={Boolean(renameTarget)}
				onClose={() => setRenameTarget(null)}
			/>

			{renameError ? (
				<View style={styles.renameErrorBanner}>
					<Text style={styles.renameErrorText} numberOfLines={2}>
						{renameError.message}
					</Text>
					<Pressable
						hitSlop={6}
						onPress={clearRenameError}
						accessibilityLabel={t("common.close")}
					>
						<X size={12} color={theme.colors.destructiveForeground} strokeWidth={1.75} />
					</Pressable>
				</View>
			) : null}

			{/* Footer: settings. Creating a session has one entry — the tab-strip
			    "+" (DESIGN.md §Components/Navigation); a second button here was
			    a duplicate path to the same action. */}
			<View style={styles.footer}>
				<Pressable
					hitSlop={6}
					onPress={() => router.push("/settings")}
					accessibilityLabel={t("common.settings")}
					style={styles.footerButton}
				>
					<Cog size={16} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
				</Pressable>
			</View>
		</View>
	);
}

function SessionRow({
	session,
	selected,
	onPress,
	onRename,
	onClear,
}: {
	session: Parameters<typeof sessionTitle>[0];
	selected: boolean;
	onPress: () => void;
	onRename: () => void;
	onClear: () => void;
}) {
	const { theme } = useUnistyles();
	const { t } = useTranslation();
	const title = sessionTitle(session) || t("agentList.untitled");
	return (
		<ContextMenu>
			<ContextMenuTrigger
				style={({ pressed }) => [
					styles.sessionRow,
					selected && styles.sessionRowSelected,
					pressed && styles.rowPressed,
				]}
				onPress={onPress}
				accessibilityLabel={title}
			>
				<MessageCircle
					size={13}
					color={selected ? theme.colors.accent : theme.colors.foregroundMuted}
					strokeWidth={1.75}
				/>
				<Text
					style={[styles.sessionTitle, selected && styles.sessionTitleSelected]}
					numberOfLines={1}
				>
					{title}
				</Text>
				<Text style={styles.sessionTime}>{relativeTimeLabel(t, session.modified)}</Text>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onRename} testID="session-row-rename">
					{t("agentList.rename")}
				</ContextMenuItem>
				<ContextMenuItem onSelect={onClear} testID="session-row-clear-name">
					{t("agentList.clearName")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}

function SearchField({
	value,
	onChangeText,
	placeholder,
}: {
	value: string;
	onChangeText: (v: string) => void;
	placeholder: string;
}) {
	const { theme } = useUnistyles();
	const { t } = useTranslation();
	return (
		<View style={styles.searchRow}>
			<Search size={13} color={theme.colors.foregroundExtraMuted} strokeWidth={1.75} />
			<TextInput
				value={value}
				onChangeText={onChangeText}
				placeholder={placeholder}
				placeholderTextColor={theme.colors.foregroundExtraMuted}
				style={styles.searchInput}
			/>
			{value.length > 0 ? (
				<Pressable hitSlop={8} onPress={() => onChangeText("")} accessibilityLabel={t("common.clear")} style={styles.clearButton}>
					<X size={12} color={theme.colors.foregroundExtraMuted} strokeWidth={1.75} />
				</Pressable>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	sidebar: {
		flex: 1,
		backgroundColor: theme.colors.surfaceSidebar,
		borderRightWidth: theme.borderWidth[1],
		borderRightColor: theme.colors.border,
	},
	headerGroup: {
		paddingHorizontal: theme.spacing[2],
		paddingTop: theme.spacing[2],
		paddingBottom: theme.spacing[1],
		gap: theme.spacing[2],
	},
	brand: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.lg,
		fontWeight: theme.fontWeight.semibold,
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
	newWorkspaceRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		marginHorizontal: theme.spacing[2],
		marginBottom: theme.spacing[1],
		paddingVertical: 6,
		paddingHorizontal: theme.spacing[1.5],
		borderRadius: theme.borderRadius.md,
	},
	newWorkspaceText: {
		color: theme.colors.accent,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.medium,
	},
	newWorkspaceTextMuted: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
	},
	list: { flex: 1 },
	listContent: { paddingBottom: theme.spacing[3] },
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: theme.spacing[2],
		paddingTop: theme.spacing[2],
		paddingBottom: 4,
	},
	sectionTitle: {
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.semibold,
	},
	workspaceRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingRight: theme.spacing[1],
		minHeight: { xs: 44, md: 34 },
	},
	workspaceRowActive: {
		backgroundColor: theme.colors.surfaceSidebarSelected,
	},
	chevronCell: {
		width: { xs: 28, md: 22 },
		alignItems: "center",
		justifyContent: "center",
		alignSelf: "stretch",
	},
	workspaceMain: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		flex: 1,
		paddingVertical: 6,
	},
	workspaceLogo: {
		width: 20,
		height: 20,
		borderRadius: theme.borderRadius.md,
		backgroundColor: theme.colors.accent,
		alignItems: "center",
		justifyContent: "center",
	},
	workspaceLogoText: {
		color: theme.colors.accentForeground,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.semibold,
	},
	workspaceName: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.base,
		flexShrink: 1,
	},
	workspaceNameActive: {
		fontWeight: theme.fontWeight.semibold,
	},
	emptySessions: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		paddingLeft: 38,
		paddingVertical: 4,
	},
	sessionRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		paddingLeft: 38,
		paddingRight: theme.spacing[2],
		paddingVertical: 6,
		minHeight: { xs: 44, md: 32 },
	},
	clearButton: {
		width: 28,
		height: 28,
		alignItems: "center",
		justifyContent: "center",
	},
	sessionRowSelected: {
		backgroundColor: theme.colors.surfaceSidebarSelected,
	},
	sessionTitle: {
		flex: 1,
		color: theme.colors.foregroundMuted,
		fontSize: theme.fontSize.ui,
	},
	sessionTitleSelected: {
		color: theme.colors.foreground,
		fontWeight: theme.fontWeight.medium,
	},
	sessionTime: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
	},
	rowPressed: { opacity: 0.7 },
	renameErrorBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		marginHorizontal: theme.spacing[2],
		marginBottom: theme.spacing[1],
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 6,
		borderRadius: theme.borderRadius.md,
		backgroundColor: theme.colors.surface1,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.destructive,
	},
	renameErrorText: {
		flex: 1,
		color: theme.colors.destructiveForeground,
		fontSize: theme.fontSize.sm,
	},
	footer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "flex-end",
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1],
		borderTopWidth: theme.borderWidth[1],
		borderTopColor: theme.colors.border,
	},
	footerButton: {
		width: { xs: 44, md: 28 },
		height: { xs: 44, md: 28 },
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.borderRadius.md,
	},
}));
