// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/screens/sessions-screen.tsx
// (Pie subset: menu header + search row + agent list. Host filter, import
// session and load-more pagination are not ported.)
import { useEffect } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, Search, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useUnistyles, StyleSheet } from "react-native-unistyles";

import { Plus } from "lucide-react-native";
import {
	relativeTime,
	sessionTitle,
	useSessionListStore,
} from "@/stores/session-list-store";
import { useConnectionStore } from "@/stores/connection-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function SessionsScreen() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const router = useRouter();

	const workspaceId = useWorkspaceStore((s) => s.workspaceId);
	const search = useSessionListStore((s) => s.search);
	const setSearch = useSessionListStore((s) => s.setSearch);
	const refresh = useSessionListStore((s) => s.refresh);
	const select = useSessionListStore((s) => s.select);
	const loading = useSessionListStore((s) => s.loading);

	// Derive per render: identity-keyed memo pinned stale on web (see
	// left-sidebar NOTE / NOTICE W5 metro probe).
	const groups = select();

	useEffect(() => {
		if (workspaceId) void refresh();
	}, [workspaceId, refresh]);

	const startSession = (ws: string) => {
		void useConnectionStore.getState().startSession(ws).then(() => {
			router.replace({ pathname: "/w/[workspaceId]", params: { workspaceId: ws } });
		});
	};

	return (
		<View style={styles.container}>
			{/* MenuHeader analog: title + leading action. */}
			<View style={styles.header}>
				<Pressable onPress={() => router.back()} hitSlop={6} style={styles.headerBack}>
					<ChevronLeft size={18} color={theme.colors.foregroundMuted} strokeWidth={1.75} />
				</Pressable>
				<Text style={styles.headerTitle}>{t("sessions.title")}</Text>
				<View style={styles.headerTrailing} />
			</View>

			{/* Filter row: search field. */}
			<View style={styles.filterRow}>
				<SearchField
					value={search}
					onChangeText={setSearch}
					placeholder={t("sessions.searchPlaceholder")}
				/>
				{search.length > 0 ? (
					<Pressable onPress={() => setSearch("")} hitSlop={6}>
						<X size={14} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
					</Pressable>
				) : null}
			</View>

			<ScrollView contentContainerStyle={styles.listContent}>
				{groups.length === 0 ? (
					<View style={styles.emptyContainer}>
						<Text style={styles.emptyText}>
							{loading
								? t("common.connecting")
								: search.length > 0
									? t("sessions.noMatches")
									: t("agentList.empty")}
						</Text>
						{search.length > 0 ? null : workspaceId ? (
							<Pressable style={styles.emptyAction} onPress={() => startSession(workspaceId)}>
								<Plus size={14} color={theme.colors.accentForeground} strokeWidth={1.75} />
								<Text style={styles.emptyActionText}>{t("agentList.start")}</Text>
							</Pressable>
						) : null}
					</View>
				) : null}
				{groups.map(({ project, items }) => (
					<View key={project}>
						<Text style={styles.bucketLabel}>{project}</Text>
						{items.map((session) => (
							<Pressable
								key={session.sessionId}
								style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
								onPress={() => {
								const ws = workspaceId;
								if (!ws) return;
								void useConnectionStore.getState().switchSession(session.sessionId, session.path || undefined).then(() => {
									useTabsStore.getState().openSession(session.sessionId);
									router.replace({ pathname: "/w/[workspaceId]", params: { workspaceId: ws } });
								});
							}}
							>
								<Text style={styles.rowTitle} numberOfLines={1}>
									{sessionTitle(session)}
								</Text>
								<View style={styles.rowMeta}>
									<Text style={styles.rowTime}>{relativeTime(session.modified)}</Text>
									{session.messageCount > 0 ? (
										<Text style={styles.rowCount}>{session.messageCount}</Text>
									) : null}
								</View>
							</Pressable>
						))}
					</View>
				))}
			</ScrollView>
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
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	container: { flex: 1, backgroundColor: theme.colors.surface0 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	headerBack: {
		width: 28,
		height: 28,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.borderRadius.md,
	},
	headerTitle: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold },
	headerTrailing: { width: 28 },
	filterRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		paddingTop: theme.spacing[3],
	},
	searchInput: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.sm, padding: 0 },
	searchRow: {
		flex: 1,
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
	listContent: { paddingBottom: theme.spacing[4] },
	bucketLabel: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: 10,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.5,
		paddingHorizontal: theme.spacing[3],
		paddingTop: theme.spacing[3],
		paddingBottom: 4,
	},
	row: {
		borderRadius: theme.borderRadius.md,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: 8,
		gap: 2,
	},
	rowPressed: { opacity: 0.7 },
	rowTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	rowMeta: { flexDirection: "row", gap: theme.spacing[2], alignItems: "center" },
	rowTime: { color: theme.colors.foregroundExtraMuted, fontSize: 10 },
	rowCount: { color: theme.colors.border, fontSize: 10 },
	emptyContainer: {
		flexGrow: 1,
		justifyContent: "center",
		alignItems: "center",
		gap: theme.spacing[4],
		padding: theme.spacing[6],
	},
	emptyText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
	emptyAction: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[1.5],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[1.5],
		borderRadius: theme.borderRadius.md,
		backgroundColor: theme.colors.accent,
	},
	emptyActionText: { color: theme.colors.accentForeground, fontSize: theme.fontSize.sm },
}));
