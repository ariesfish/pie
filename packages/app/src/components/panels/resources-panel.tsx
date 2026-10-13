// Resources panel (P2c): packages (install/remove/update, user vs project
// scope) and the skills browser (list + full markdown body view).
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	TextInput,
	Text,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ArrowLeft, DownloadCloud, Trash2 } from "lucide-react-native";

import { Button } from "@/components/ui/button";
import { MdViewer } from "@/components/files/md-viewer";
import { useConnectionStore } from "@/stores/connection-store";
import { useResourcesStore } from "@/stores/resources-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function ResourcesPanel() {
	const { t } = useTranslation();
	const sessionId = useConnectionStore((s) => s.sessionId);
	const workspaceId = useWorkspaceStore((s) => s.workspaceId);
	const skillBodyPath = useResourcesStore((s) => s.skillBodyPath);
	const refreshPackages = useResourcesStore((s) => s.refreshPackages);
	const refreshSkills = useResourcesStore((s) => s.refreshSkills);

	useEffect(() => {
		if (workspaceId) void refreshPackages();
		if (sessionId) void refreshSkills(sessionId);
	}, [workspaceId, sessionId, refreshPackages, refreshSkills]);

	if (skillBodyPath) return <SkillBody />;

	return (
		<ScrollView style={styles.root} contentContainerStyle={styles.list}>
			<PackagesSection />
			<SkillsSection />
		</ScrollView>
	);
}

function PackagesSection() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const packages = useResourcesStore((s) => s.packages);
	const loading = useResourcesStore((s) => s.packagesLoading);
	const installing = useResourcesStore((s) => s.installing);
	const installSource = useResourcesStore((s) => s.installSource);
	const installProject = useResourcesStore((s) => s.installProject);
	const install = useResourcesStore((s) => s.install);
	const remove_ = useResourcesStore((s) => s.removePackage);
	const updateAll = useResourcesStore((s) => s.updateAll);
	const setInstallSource = useResourcesStore((s) => s.setInstallSource);
	const setInstallProject = useResourcesStore((s) => s.setInstallProject);

	return (
		<View style={styles.section}>
			<View style={styles.sectionHead}>
				<Text style={styles.sectionTitle}>{t("resources.packages")}</Text>
				{packages.length > 0 && (
					<Pressable style={styles.miniBtn} onPress={() => void updateAll()} disabled={installing}>
						<DownloadCloud size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
					</Pressable>
				)}
			</View>

			<View style={styles.installRow}>
				<TextInput
					style={styles.installInput}
					placeholder={`npm:<pkg>@x | git://… | /local/path`}
					placeholderTextColor="#4b5262"
					value={installSource}
					onChangeText={setInstallSource}
					autoCapitalize="none"
					autoCorrect={false}
				/>
				<Pressable
					style={[styles.scopeBtn, installProject && styles.scopeBtnOn]}
					onPress={() => setInstallProject(!installProject)}
					hitSlop={4}
				>
					<Text style={[styles.scopeText, installProject && styles.scopeTextOn]}>
						{t("resources.project")}
					</Text>
				</Pressable>
				<Button variant="default" onPress={() => void install()} disabled={installing}>
					{installing ? "…" : t("resources.install")}
				</Button>
			</View>

			{loading && packages.length === 0 && (
				<View style={styles.center}>
					<ActivityIndicator />
				</View>
			)}
			{!loading && packages.length === 0 && (
				<Text style={styles.empty}>{t("resources.noPackages")}</Text>
			)}
			{packages.map((p) => (
				<View key={`${p.scope}:${p.source}`} style={styles.pkgRow}>
					<View style={styles.pkgMeta}>
						<Text style={styles.pkgSource} numberOfLines={1}>
							{p.source}
						</Text>
						<Text style={styles.pkgScope}>
							{p.scope}
							{p.filtered ? ` · ${t("resources.filtered")}` : ""}
							{p.installedPath ? "" : ` · ${t("resources.missing")}`}
						</Text>
					</View>
					<Pressable
						style={styles.miniBtn}
						onPress={() => void remove_(p.source, p.scope === "project")}
						hitSlop={4}
					>
						<Trash2 size={14} color={theme.colors.statusDanger} strokeWidth={1.5} />
					</Pressable>
				</View>
			))}
		</View>
	);
}

function SkillsSection() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const sessionId = useConnectionStore((s) => s.sessionId);
	const skills = useResourcesStore((s) => s.skills);
	const loading = useResourcesStore((s) => s.skillsLoading);
	const openSkill = useResourcesStore((s) => s.openSkill);

	const [q, setQ] = useState("");
	const filtered = skills.filter(
		(s) => !q || s.name.toLowerCase().includes(q.toLowerCase()),
	);

	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>{t("resources.skills")}</Text>
			<TextInput
				style={styles.installInput}
				placeholder={t("resources.search")}
				placeholderTextColor="#4b5262"
				value={q}
				onChangeText={setQ}
				autoCapitalize="none"
				autoCorrect={false}
			/>
			{loading && skills.length === 0 && (
				<View style={styles.center}>
					<ActivityIndicator />
				</View>
			)}
			{skills.length === 0 && !loading && (
				<Text style={styles.empty}>{t("resources.noSkills")}</Text>
			)}
			{filtered.map((s) => (
				<Pressable
					key={s.filePath}
					style={styles.skillRow}
					onPress={() => sessionId && void openSkill(sessionId, s.filePath)}
				>
					<Text style={styles.skillName}>{s.name}</Text>
					{s.description ? (
						<Text style={styles.skillDesc} numberOfLines={2}>
							{s.description}
						</Text>
					) : null}
					<Text style={styles.skillOrigin} numberOfLines={1}>
						{s.origin}
						{s.disableModelInvocation ? " · manual-only" : ""}
					</Text>
				</Pressable>
			))}
			{filtered.length === 0 && skills.length > 0 && (
				<Text style={styles.empty}>{t("resources.noSkills")}</Text>
			)}
		</View>
	);
}

function SkillBody() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const skillBody = useResourcesStore((s) => s.skillBody);
	const skillBodyPath = useResourcesStore((s) => s.skillBodyPath);
	const closeSkill = useResourcesStore((s) => s.closeSkill);

	return (
		<View style={styles.root}>
			<View style={styles.headerRow}>
				<Pressable style={styles.miniBtn} onPress={closeSkill} hitSlop={8}>
					<ArrowLeft size={16} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
				</Pressable>
				<Text style={styles.pathText} numberOfLines={1}>
					{skillBodyPath}
				</Text>
			</View>
			<ScrollView>
				{skillBody == null ? (
					<View style={styles.center}>
						<ActivityIndicator />
					</View>
				) : (
					<MdViewer source={skillBody} />
				)}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, backgroundColor: theme.colors.surface0 },
	list: { padding: theme.spacing[3], gap: theme.spacing[6] },
	section: { gap: theme.spacing[2] },
	sectionHead: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
	sectionTitle: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.lg,
		fontWeight: "600",
		flex: 1,
	},
	installRow: { flexDirection: "row", gap: theme.spacing[2], alignItems: "center" },
	installInput: {
		flex: 1,
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		color: theme.colors.foreground,
		fontSize: theme.fontSize.sm,
	},
	scopeBtn: {
		paddingHorizontal: 10,
		paddingVertical: theme.spacing[1.5],
		borderRadius: theme.borderRadius.full,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
	},
	scopeBtnOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
	scopeText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	scopeTextOn: { color: theme.colors.accentForeground },
	pkgRow: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		gap: theme.spacing[2],
	},
	pkgMeta: { flex: 1, gap: 2 },
	pkgSource: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	pkgScope: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	skillRow: {
		gap: 2,
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		padding: theme.spacing[3],
	},
	skillName: { color: theme.colors.foreground, fontSize: theme.fontSize.content, fontWeight: "600" },
	skillDesc: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	skillOrigin: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	miniBtn: {
		padding: theme.spacing[1.5] ?? theme.spacing[1],
		borderRadius: theme.borderRadius.md,
		backgroundColor: theme.colors.surface2,
	},
	center: { padding: theme.spacing[4], alignSelf: "center" },
	empty: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, padding: theme.spacing[2] },
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	pathText: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
}));
