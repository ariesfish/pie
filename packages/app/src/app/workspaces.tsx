// Workspaces screen: the project picker. Lists daemon-known workspaces
// (workspace.list — every workspace the daemon ever opened in this process)
// merged with the locally-registered ones; adding a workspace validates the
// directory through workspace.open (daemon stats it) before navigating.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { ArrowLeft, Check, FolderPlus, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { useConnectionStore } from "@/stores/connection-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRegistryStore } from "@/stores/workspace-registry-store";

export default function WorkspacesScreen() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const router = useRouter();
	const pathname = usePathname();

	const [known, setKnown] = useState<string[]>([]);
	const [adding, setAdding] = useState(false);
	const [pathInput, setPathInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const conn = useConnectionStore((s) => s.conn);
	const current = useWorkspaceStore((s) => s.workspaceId);
	const registry = useWorkspaceRegistryStore((s) => s.workspaces);
	const register = useWorkspaceRegistryStore((s) => s.register);
	const remove = useWorkspaceRegistryStore((s) => s.remove);

	const refreshList = async () => {
		if (!conn) return;
		try {
			const res = await conn.request("workspace.list", {});
			const ids = (res.workspaces as Array<{ workspaceId: string }>).map((w) => w.workspaceId);
			// Register daemon-known workspaces locally so the sidebar lists them
			// even before they are visited in this client.
			for (const id of ids) register(id);
			setKnown(ids);
		} catch {
			setKnown([]);
		}
	};

	useEffect(() => {
		void refreshList();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [conn]);

	// uid for display ("no duplicate workspace rows")
	const all = [...new Set([...known, ...registry.map((w) => w.id)])].sort((a, b) => a.localeCompare(b));

	const addWorkspace = async () => {
		const path = pathInput.trim().replace(/\/+$/, "");
		if (!conn || !path || busy) return;
		setBusy(true);
		setError(null);
		try {
			const res = await conn.request("workspace.open", { path });
			register(res.workspaceId as string);
			setAdding(false);
			setPathInput("");
			router.push({
				pathname: "/w/[workspaceId]",
				params: { workspaceId: res.workspaceId as string },
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Pressable onPress={() => router.back()} hitSlop={6} style={styles.headerBack}>
					<ArrowLeft size={18} color={theme.colors.foregroundMuted} strokeWidth={1.75} />
				</Pressable>
				<Text style={styles.headerTitle}>{t("workspaces.title")}</Text>
				<Pressable hitSlop={6} onPress={() => setAdding((v) => !v)} style={styles.headerAdd}>
					{adding ? (
						<X size={16} color={theme.colors.foregroundMuted} strokeWidth={1.75} />
					) : (
						<FolderPlus size={16} color={theme.colors.foregroundMuted} strokeWidth={1.75} />
					)}
				</Pressable>
			</View>

			{adding ? (
				<View style={styles.addForm}>
					<Text style={styles.fieldLabel}>{t("workspaces.pathLabel")}</Text>
					<TextInput
						style={styles.input}
						placeholder={t("workspaces.pathPlaceholder")}
						placeholderTextColor={theme.colors.border}
						value={pathInput}
						onChangeText={setPathInput}
						onSubmitEditing={() => void addWorkspace()}
						autoCapitalize="none"
						autoCorrect={false}
					/>
					{error ? <Text style={styles.errorText}>{error}</Text> : null}
					<Pressable
						style={({ pressed }) => [styles.addBtn, busy && styles.addBtnBusy, pressed && { opacity: 0.8 }]}
						disabled={busy || !pathInput.trim()}
						onPress={() => void addWorkspace()}
					>
						<Check size={14} color={theme.colors.accentForeground} strokeWidth={1.75} />
						<Text style={styles.addBtnText}>
							{busy ? t("common.connecting") : t("workspaces.open")}
						</Text>
					</Pressable>
				</View>
			) : null}

			<ScrollView contentContainerStyle={styles.listContent}>
				{all.length === 0 ? (
					<Text style={styles.emptyText}>{t("workspaces.empty")}</Text>
				) : (
					all.map((id) => {
						const active = current === id || pathname.includes(encodeURIComponent(id));
						const name = id.split("/").filter(Boolean).pop() ?? id;
						const fromDaemon = known.includes(id);
						return (
							<View key={id} style={styles.rowWrap}>
								<Pressable
									style={({ pressed }) => [styles.row, active && styles.rowOn, pressed && styles.rowPressed]}
									onPress={() =>
										router.push({ pathname: "/w/[workspaceId]", params: { workspaceId: id } })
									}
								>
									<View style={styles.rowMain}>
										<Text style={[styles.rowTitle, active && styles.rowTitleOn]} numberOfLines={1}>
											{name}
										</Text>
										<Text style={styles.rowPath} numberOfLines={1}>
											{id}
										</Text>
									</View>
									{fromDaemon ? <Text style={styles.rowTag}>daemon</Text> : null}
								</Pressable>
								{fromDaemon ? null : (
									<Pressable
										hitSlop={6}
										onPress={() => remove(id)}
										style={styles.rowRemove}
										accessibilityLabel={t("workspaces.remove")}
									>
										<X size={13} color={theme.colors.foregroundExtraMuted} strokeWidth={1.5} />
									</Pressable>
								)}
							</View>
						);
					})
				)}
			</ScrollView>
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
	headerTitle: {
		flex: 1,
		color: theme.colors.foreground,
		fontSize: theme.fontSize.lg,
		fontWeight: theme.fontWeight.semibold,
	},
	headerAdd: {
		width: 28,
		height: 28,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: theme.borderRadius.md,
	},
	addForm: {
		padding: theme.spacing[3],
		gap: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	fieldLabel: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	input: {
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		padding: theme.spacing[3],
		color: theme.colors.foreground,
	},
	errorText: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
	addBtn: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: theme.spacing[2],
		backgroundColor: theme.colors.accent,
		borderRadius: theme.borderRadius.lg,
		paddingVertical: theme.spacing[2],
	},
	addBtnBusy: { opacity: 0.6 },
	addBtnText: { color: theme.colors.accentForeground, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
	listContent: { paddingBottom: theme.spacing[4] },
	rowWrap: { flexDirection: "row", alignItems: "center" },
	row: {
		flex: 1,
		borderRadius: theme.borderRadius.md,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		gap: 2,
	},
	rowOn: { backgroundColor: theme.colors.surface2 },
	rowPressed: { opacity: 0.7 },
	rowMain: { flex: 1 },
	rowTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	rowTitleOn: { color: theme.colors.foreground, fontWeight: theme.fontWeight.semibold },
	rowPath: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	rowTag: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	rowRemove: { padding: theme.spacing[2] },
	emptyText: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.base,
		textAlign: "center",
		padding: theme.spacing[6],
	},
}));
