// Settings: Pi config and extensions through the daemon (ADR-0008).
// General/Models write settings.json/models.json with a revision CAS;
// Extensions drive Pi's package manager. MCP is intentionally not a core tab.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ArrowLeft, Package, RotateCw, Trash2 } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { ConfigFile, ModelCatalogItem, PackageInfo } from "@pie/protocol";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useConnectionStore } from "@/stores/connection-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

type SettingsTab = "general" | "models" | "extensions";

interface ConfigOverview {
	agentDir: string;
	files: Record<ConfigFile, { path: string; exists: boolean; revision: string }>;
	authProviders: string[];
	settings: {
		defaultProvider?: string;
		defaultModel?: string;
		defaultThinkingLevel?: string;
		theme?: string;
		defaultProjectTrust?: string;
	};
	models: {
		providers: string[];
		details: Array<{
			id: string;
			name?: string;
			baseUrl?: string;
			api?: string;
			modelCount: number;
			hasApiKey: boolean;
		}>;
	};
	errors?: Partial<Record<ConfigFile, string>>;
}

interface LoadedResources {
	extensions: Array<{ name: string; builtin: boolean; path: string }>;
	commands: Array<{ name: string }>;
	skills: Array<{ name: string; description?: string }>;
	promptTemplates: Array<{ name: string }>;
}

const TABS: SettingsTab[] = ["general", "models", "extensions"];
const FILE_FOR_TAB: Record<Exclude<SettingsTab, "extensions">, ConfigFile> = {
	general: "settings",
	models: "models",
};

export default function SettingsScreen() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const router = useRouter();
	const conn = useConnectionStore((s) => s.conn);
	const sessionId = useConnectionStore((s) => s.sessionId);
	const workspaceId = useWorkspaceStore((s) => s.workspaceId);

	const [tab, setTab] = useState<SettingsTab>("general");
	const [overview, setOverview] = useState<ConfigOverview | null>(null);
	const [content, setContent] = useState("");
	const [revision, setRevision] = useState("");
	const [dirty, setDirty] = useState(false);
	const [busy, setBusy] = useState<"load" | "save" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	const [packages, setPackages] = useState<PackageInfo[]>([]);
	const [packagesLoading, setPackagesLoading] = useState(false);
	const [packageBusy, setPackageBusy] = useState<string | null>(null);
	const [packageSource, setPackageSource] = useState("");
	const [packageScope, setPackageScope] = useState<"user" | "project">("user");
	const [resources, setResources] = useState<LoadedResources | null>(null);
	const [catalog, setCatalog] = useState<ModelCatalogItem[]>([]);
	const [catalogLoaded, setCatalogLoaded] = useState(false);

	const file = tab === "extensions" ? null : FILE_FOR_TAB[tab];

	const loadOverview = useCallback(async () => {
		if (!conn) return;
		try {
			const next = await conn.request("config.overview", {});
			setOverview(next as ConfigOverview);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [conn]);

	const loadFile = useCallback(
		async (target: ConfigFile) => {
			if (!conn) return;
			setBusy("load");
			setError(null);
			try {
				const read = await conn.request("config.read", { file: target });
				setContent(read.exists ? read.content : "{\n}\n");
				setRevision(read.revision);
				setDirty(false);
				setSaved(false);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setBusy(null);
			}
		},
		[conn],
	);

	const loadPackages = useCallback(async () => {
		if (!conn || !workspaceId) return;
		setPackagesLoading(true);
		try {
			const res = await conn.request("packages.list", { workspaceId });
			setPackages(res.packages);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setPackagesLoading(false);
		}
	}, [conn, workspaceId]);

	const loadResources = useCallback(async () => {
		if (!conn || !sessionId) return;
		try {
			const res = await conn.request("resources.overview", { workspaceId });
			setResources(res as LoadedResources);
		} catch {
			setResources(null);
		}
	}, [conn, sessionId, workspaceId]);

	const loadCatalog = useCallback(async () => {
		if (!conn || !workspaceId) return;
		try {
			const res = await conn.request("models.list", { workspaceId });
			setCatalog(res.models);
		} catch {
			setCatalog([]);
		} finally {
			setCatalogLoaded(true);
		}
	}, [conn, workspaceId]);

	useEffect(() => {
		if (!conn) return;
		void loadOverview();
	}, [conn, loadOverview]);

	useEffect(() => {
		if (!conn) return;
		if (tab === "extensions") {
			void loadPackages();
			void loadResources();
		} else {
			void loadFile(FILE_FOR_TAB[tab]);
			if (tab === "models") void loadCatalog();
		}
	}, [conn, loadCatalog, loadPackages, loadResources, loadFile, tab]);

	const save = async () => {
		if (!conn || !file || !dirty) return;
		try {
			JSON.parse(content);
		} catch (err) {
			setError(
				t("settings.invalidJson", {
					message: err instanceof Error ? err.message : String(err),
				}),
			);
			return;
		}
		setBusy("save");
		setError(null);
		try {
			const result = await conn.request("config.write", {
				file,
				content,
				expectedRevision: revision,
			});
			setRevision(result.revision);
			setDirty(false);
			setSaved(true);
			void loadOverview();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(/conflict|changed on disk/i.test(message) ? t("settings.conflict") : message);
		} finally {
			setBusy(null);
		}
	};

	const installPackage = async () => {
		if (!conn || !workspaceId || !packageSource.trim()) return;
		setPackageBusy("install");
		setError(null);
		try {
			await conn.request("packages.install", {
				workspaceId,
				source: packageSource.trim(),
				project: packageScope === "project",
			});
			setPackageSource("");
			await loadPackages();
			await loadResources();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setPackageBusy(null);
		}
	};

	const removePackage = async (pkg: PackageInfo) => {
		if (!conn || !workspaceId) return;
		setPackageBusy(pkg.source);
		setError(null);
		try {
			await conn.request("packages.remove", {
				workspaceId,
				source: pkg.source,
				project: pkg.scope === "project",
			});
			await loadPackages();
			await loadResources();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setPackageBusy(null);
		}
	};

	const updatePackages = async () => {
		if (!conn || !workspaceId) return;
		setPackageBusy("update");
		setError(null);
		try {
			await conn.request("packages.update", { workspaceId });
			await loadPackages();
			await loadResources();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setPackageBusy(null);
		}
	};

	const options = TABS.map((value) => ({
		value,
		label: t(`settings.tab.${value}`),
		disabled: dirty && value !== tab ? true : undefined,
	}));

	const modelLabel = useMemo(() => {
		if (!overview?.settings.defaultModel) return "—";
		const provider = overview.settings.defaultProvider;
		return provider ? `${provider}/${overview.settings.defaultModel}` : overview.settings.defaultModel;
	}, [overview]);

	return (
		<View style={styles.root}>
			<View style={styles.header}>
				<Pressable
					accessibilityLabel={t("common.back")}
					hitSlop={8}
					onPress={() => router.back()}
					style={styles.back}
				>
					<ArrowLeft size={16} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
				</Pressable>
				<Text style={styles.title}>{t("settings.title")}</Text>
				{tab === "extensions" ? (
					<Pressable
						accessibilityLabel={t("settings.updateAll")}
						disabled={!workspaceId || packageBusy !== null}
						onPress={() => void updatePackages()}
						style={[styles.save, (!workspaceId || packageBusy !== null) && styles.saveDisabled]}
					>
						<Text style={styles.saveText}>
							{packageBusy === "update" ? t("settings.updating") : t("settings.updateAll")}
						</Text>
					</Pressable>
				) : (
					<Pressable
						accessibilityLabel={t("settings.save")}
						disabled={!dirty || busy !== null}
						onPress={() => void save()}
						style={[styles.save, (!dirty || busy !== null) && styles.saveDisabled]}
					>
						<Text style={styles.saveText}>
							{busy === "save" ? t("settings.saving") : t("settings.save")}
						</Text>
					</Pressable>
				)}
			</View>
			<ScrollView contentContainerStyle={styles.content}>
				{!conn ? <Text style={styles.error}>{t("settings.noConnection")}</Text> : null}
				<SegmentedControl
					options={options}
					value={tab}
					onValueChange={(next) => setTab(next as SettingsTab)}
				/>

				{tab === "extensions" ? (
					<ExtensionsPanel
						t={t}
						packages={packages}
						loading={packagesLoading}
						busy={packageBusy}
						source={packageSource}
						scope={packageScope}
						workspaceId={workspaceId}
						resources={resources}
						onSource={setPackageSource}
						onScope={setPackageScope}
						onInstall={() => void installPackage()}
						onRemove={(pkg) => void removePackage(pkg)}
						onOpenSession={() => router.push("/sessions")}
					/>
				) : (
					<>
						{overview ? (
							<View style={styles.summary}>
								<Text style={styles.summaryTitle}>{t("settings.agentDir")}</Text>
								<Text style={styles.mono} selectable>
									{overview.agentDir}
								</Text>
								<View style={styles.summaryGrid}>
									<Stat label={t("settings.defaultModel")} value={modelLabel} />
									<Stat
										label={t("settings.auth")}
										value={overview.authProviders.join(", ") || "—"}
									/>
									<Stat
										label={t("settings.models")}
										value={String(overview.models.providers.length)}
									/>
								</View>
								{overview.errors
									? Object.entries(overview.errors).map(([name, message]) => (
											<Text key={name} style={styles.error}>
												{t("settings.parseError", { file: name, message })}
											</Text>
										))
									: null}
							</View>
						) : null}

						{tab === "models" ? (
							<View style={styles.models}>
								<Text style={styles.sectionTitle}>{t("settings.customProviders")}</Text>
								{overview?.models.details.length ? (
									overview.models.details.map((provider) => (
										<View key={provider.id} style={styles.provider}>
											<View style={styles.providerHead}>
												<Text style={styles.providerName}>{provider.name ?? provider.id}</Text>
												<Text style={styles.providerMeta}>
													{provider.api ?? "api"} · {provider.modelCount} models ·{" "}
													{provider.hasApiKey ? t("settings.keySet") : t("settings.keyMissing")}
												</Text>
											</View>
											{provider.baseUrl ? (
												<Text style={styles.providerUrl} numberOfLines={1}>
													{provider.baseUrl}
												</Text>
											) : null}
										</View>
									))
								) : (
									<Text style={styles.hint}>{t("settings.noCustomProviders")}</Text>
								)}
								<Text style={styles.sectionTitle}>{t("settings.catalog")}</Text>
								{catalog.length ? (
									<Text style={styles.catalog} numberOfLines={6}>
										{catalog
											.slice(0, 40)
											.map((model) => `${model.provider}/${model.id}`)
											.join("  ·  ")}
									</Text>
								) : (
									<Text style={styles.hint}>
										{workspaceId && catalogLoaded
											? t("settings.noModels")
											: t("settings.noCatalog")}
									</Text>
								)}
							</View>
						) : null}

						<View style={styles.editorHeader}>
							<Text style={styles.path} numberOfLines={1}>
								{overview?.files[file ?? "settings"]?.path ?? file}
							</Text>
							<Pressable
								accessibilityLabel={t("settings.reload")}
								hitSlop={6}
								onPress={() => file && void loadFile(file)}
								style={styles.reload}
							>
								<RotateCw size={13} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
							</Pressable>
						</View>
						<TextInput
							value={content}
							onChangeText={(next) => {
								setContent(next);
								setDirty(true);
								setSaved(false);
							}}
							multiline
							autoCapitalize="none"
							autoCorrect={false}
							spellCheck={false}
							style={styles.editor}
						/>
						<View style={styles.footer}>
							<Text style={styles.hint}>
								{dirty
									? t("settings.dirtyHint")
									: saved
										? t("settings.saved")
										: t("settings.revision", { revision: revision || "—" })}
							</Text>
							{dirty ? (
								<Pressable onPress={() => file && void loadFile(file)} hitSlop={6}>
									<Text style={styles.reloadText}>{t("settings.discard")}</Text>
								</Pressable>
							) : null}
						</View>
					</>
				)}
				{error ? <Text style={styles.error}>{error}</Text> : null}
			</ScrollView>
		</View>
	);
}

function ExtensionsPanel({
	t,
	packages,
	loading,
	busy,
	source,
	scope,
	workspaceId,
	resources,
	onSource,
	onScope,
	onInstall,
	onRemove,
	onOpenSession,
}: {
	t: (key: string, options?: Record<string, unknown>) => string;
	packages: PackageInfo[];
	loading: boolean;
	busy: string | null;
	source: string;
	scope: "user" | "project";
	workspaceId: string | null;
	resources: LoadedResources | null;
	onSource: (value: string) => void;
	onScope: (value: "user" | "project") => void;
	onInstall: () => void;
	onRemove: (pkg: PackageInfo) => void;
	onOpenSession: () => void;
}) {
	const { theme } = useUnistyles();
	return (
		<View style={styles.extensions}>
			<View style={styles.sectionHead}>
				<Text style={styles.sectionTitle}>{t("settings.packages")}</Text>
				<Pressable onPress={onOpenSession} hitSlop={6}>
					<Text style={styles.link}>{t("settings.loaded")}</Text>
				</Pressable>
			</View>
			{!workspaceId ? <Text style={styles.hint}>{t("settings.workspaceRequired")}</Text> : null}
			{loading ? <Text style={styles.hint}>{t("settings.loading")}</Text> : null}
			{packages.length === 0 && !loading ? (
				<Text style={styles.hint}>{t("settings.noPackages")}</Text>
			) : (
				packages.map((pkg) => (
					<View key={`${pkg.scope}:${pkg.source}`} style={styles.packageRow}>
						<Package size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
						<View style={styles.packageMain}>
							<Text style={styles.packageSource} numberOfLines={1}>
								{pkg.source}
							</Text>
							<Text style={styles.packageMeta}>
								{pkg.scope === "project" ? t("settings.scope.project") : t("settings.scope.user")}
								{pkg.filtered ? ` · ${t("settings.filtered")}` : ""}
								{pkg.installedPath ? "" : ` · ${t("settings.notInstalled")}`}
							</Text>
						</View>
						<Pressable
							accessibilityLabel={t("settings.remove")}
							disabled={busy !== null}
							onPress={() => onRemove(pkg)}
							style={styles.iconButton}
						>
							<Trash2 size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
						</Pressable>
					</View>
				))
			)}

			<View style={styles.installRow}>
				<TextInput
					value={source}
					onChangeText={onSource}
					placeholder={t("settings.installPlaceholder")}
					autoCapitalize="none"
					autoCorrect={false}
					style={styles.installInput}
				/>
				<Pressable
					disabled={!workspaceId || !source.trim() || busy !== null}
					onPress={onInstall}
					style={[
						styles.installButton,
						(!workspaceId || !source.trim() || busy !== null) && styles.saveDisabled,
					]}
				>
					<Text style={styles.saveText}>
						{busy === "install" ? t("settings.installing") : t("settings.install")}
					</Text>
				</Pressable>
			</View>
			<SegmentedControl
				options={[
					{ value: "user", label: t("settings.scope.user") },
					{ value: "project", label: t("settings.scope.project") },
				]}
				value={scope}
				onValueChange={(next) => onScope(next as "user" | "project")}
			/>

			<Text style={styles.sectionTitle}>{t("settings.loadedTitle")}</Text>
			{resources ? (
				<View style={styles.loadedBox}>
					<Text style={styles.loadedLine}>
						{t("settings.extensionsCount", { count: resources.extensions.length })}
					</Text>
					{resources.extensions.map((extension) => (
						<Text key={extension.path} style={styles.loadedItem} numberOfLines={1}>
							{extension.name}
							{extension.builtin ? ` · ${t("settings.builtin")}` : ""}
						</Text>
					))}
					<Text style={styles.loadedLine}>
						{t("settings.skillsCount", { count: resources.skills.length })} ·{" "}
						{t("settings.promptsCount", { count: resources.promptTemplates.length })}
					</Text>
				</View>
			) : (
				<Text style={styles.hint}>{t("settings.loadedHint")}</Text>
			)}
		</View>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.stat}>
			<Text style={styles.statLabel}>{label}</Text>
			<Text style={styles.statValue} numberOfLines={2}>
				{value}
			</Text>
		</View>
	);
}


const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, backgroundColor: theme.colors.surface0 },
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	back: { padding: theme.spacing[1] },
	title: {
		flex: 1,
		color: theme.colors.foreground,
		fontSize: theme.fontSize.lg,
		fontWeight: theme.fontWeight.semibold,
	},
	save: {
		backgroundColor: theme.colors.accent,
		borderRadius: theme.borderRadius.md,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[1],
	},
	saveDisabled: { opacity: theme.opacity[50] },
	saveText: { color: theme.colors.accentForeground, fontSize: theme.fontSize.sm },
	content: { padding: theme.spacing[3], gap: theme.spacing[3], paddingBottom: theme.spacing[6] },
	summary: {
		gap: theme.spacing[2],
		padding: theme.spacing[3],
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		borderRadius: theme.borderRadius.lg,
		backgroundColor: theme.colors.surface1,
	},
	summaryTitle: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.semibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
	stat: { minWidth: 120, flexGrow: 1 },
	statLabel: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	statValue: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	mono: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	models: {
		gap: theme.spacing[2],
		padding: theme.spacing[3],
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		borderRadius: theme.borderRadius.lg,
	},
	sectionTitle: {
		color: theme.colors.foregroundExtraMuted,
		fontSize: theme.fontSize.sm,
		fontWeight: theme.fontWeight.semibold,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	provider: {
		gap: theme.spacing[0.5],
		paddingVertical: theme.spacing[1],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	providerHead: { flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] },
	providerName: { color: theme.colors.foreground, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
	providerMeta: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	providerUrl: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	catalog: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	editorHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
	path: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	reload: { padding: theme.spacing[1] },
	editor: {
		minHeight: 360,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		borderRadius: theme.borderRadius.md,
		backgroundColor: theme.colors.surfaceCode,
		color: theme.colors.foreground,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: Math.round(theme.fontSize.code * 1.6),
		padding: theme.spacing[3],
		textAlignVertical: "top",
	},
	footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	hint: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	reloadText: { color: theme.colors.accent, fontSize: theme.fontSize.sm },
	error: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
	extensions: { gap: theme.spacing[2] },
	sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	link: { color: theme.colors.accent, fontSize: theme.fontSize.sm },
	packageRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingVertical: theme.spacing[1],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	packageMain: { flex: 1 },
	packageSource: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	packageMeta: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	iconButton: { padding: theme.spacing[1] },
	installRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
	installInput: {
		flex: 1,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		borderRadius: theme.borderRadius.md,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1],
		color: theme.colors.foreground,
		fontSize: theme.fontSize.sm,
		backgroundColor: theme.colors.surface0,
	},
	installButton: {
		backgroundColor: theme.colors.accent,
		borderRadius: theme.borderRadius.md,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[1],
	},
	loadedBox: { gap: theme.spacing[0.5] },
	loadedLine: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	loadedItem: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
}));
