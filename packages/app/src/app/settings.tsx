// Settings: Pi config and extensions through the daemon (ADR-0008).
// General/Models write settings.json/models.json with a revision CAS;
// Extensions drive Pi's package manager. MCP is intentionally not a core tab.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ArrowLeft, Package, Pencil, Plus, RotateCw, Star, Trash2, X } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import {
	type CommandResult,
	MODEL_PROVIDER_ID_PATTERN,
	type ConfigFile,
	ErrorCodes,
	stripJsonComments,
	type ModelCatalogItem,
	type ModelProviderDraft,
	type PackageInfo,
} from "@pie/protocol";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useConnectionStore } from "@/stores/connection-store";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useWorkspaceStore } from "@/stores/workspace-store";

type SettingsTab = "general" | "models" | "extensions";
type ConfigOverview = CommandResult<"config.overview">;
type LoadedResources = CommandResult<"resources.overview">;

const TABS: SettingsTab[] = ["general", "models", "extensions"];
const FILE_FOR_TAB: Record<Exclude<SettingsTab, "extensions">, ConfigFile> = {
	general: "settings",
	models: "models",
};

function errorCode(err: unknown): string | undefined {
	return (err as { code?: string }).code;
}

function errorMessage(err: unknown): string | undefined {
	const message = (err as { message?: unknown }).message;
	return typeof message === "string" && message.length > 0 ? message : undefined;
}

function emptyDraft(): ModelProviderDraft {
	return { id: "", models: [{ id: "" }] };
}

export default function SettingsScreen() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const router = useRouter();
	const conn = useConnectionStore((s) => s.conn);
	const sessionId = useConnectionStore((s) => s.sessionId);
	const workspaceId = useWorkspaceStore((s) => s.workspaceId);
	const compact = useIsCompactFormFactor();
	const density = compact ? styles.touch : styles.dense;
	const buttonSize = compact ? "md" : "sm";

	const [tab, setTab] = useState<SettingsTab>("general");
	const [overview, setOverview] = useState<ConfigOverview | null>(null);
	const [content, setContent] = useState("");
	const [revision, setRevision] = useState("");
	const [dirty, setDirty] = useState(false);
	const [busy, setBusy] = useState<"load" | "save" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	const [draft, setDraft] = useState<ModelProviderDraft | null>(null);
	const [draftIsNew, setDraftIsNew] = useState(false);
	const [keyTouched, setKeyTouched] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
	const [providerBusy, setProviderBusy] = useState<string | null>(null);

	const [packages, setPackages] = useState<PackageInfo[]>([]);
	const [packagesLoading, setPackagesLoading] = useState(false);
	const [packageBusy, setPackageBusy] = useState<string | null>(null);
	const [packageSource, setPackageSource] = useState("");
	const [packageScope, setPackageScope] = useState<"user" | "project">("user");
	const [resources, setResources] = useState<LoadedResources | null>(null);
	const [catalog, setCatalog] = useState<ModelCatalogItem[]>([]);
	const [catalogLoaded, setCatalogLoaded] = useState(false);
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [modelsComments, setModelsComments] = useState(false);
	const dirtyRef = useRef(dirty);
	const draftRef = useRef(draft);
	dirtyRef.current = dirty;
	draftRef.current = draft;

	const file = tab === "extensions" ? null : FILE_FOR_TAB[tab];

	const loadOverview = useCallback(async () => {
		if (!conn) return;
		try {
			const next = await conn.request("config.overview", {});
			setOverview(next);
		} catch (err) {
			setError(t("settings.loadFailed"));
		}
	}, [conn, t]);

	const loadFile = useCallback(
		async (target: ConfigFile) => {
			if (!conn) return;
			setBusy("load");
			setError(null);
			try {
				const read = await conn.request("config.read", { file: target });
				setContent(read.exists ? read.content : "{\n}\n");
				setRevision(read.revision);
				setModelsComments(
					target === "models" &&
						read.exists &&
						stripJsonComments(read.content) !== read.content,
				);
				setDirty(false);
				setSaved(false);
			} catch {
				setError(t("settings.loadFailed"));
			} finally {
				setBusy(null);
			}
		},
		[conn, t],
	);

	const loadPackages = useCallback(async () => {
		if (!conn || !workspaceId) return;
		setPackagesLoading(true);
		try {
			const res = await conn.request("packages.list", { workspaceId });
			setPackages(res.packages);
		} catch {
			setError(t("settings.packageFailed"));
		} finally {
			setPackagesLoading(false);
		}
	}, [conn, workspaceId, t]);

	const loadResources = useCallback(async () => {
		if (!conn || !sessionId) return;
		try {
			const res = await conn.request("resources.overview", { workspaceId });
			setResources(res);
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
		if (!conn || dirtyRef.current || draftRef.current) return;
		if (tab === "extensions") {
			void loadPackages();
			void loadResources();
		} else {
			void loadFile(FILE_FOR_TAB[tab]);
			if (tab === "models") void loadCatalog();
		}
	}, [conn, loadCatalog, loadPackages, loadResources, loadFile, tab]);

	const refreshModels = async () => {
		await loadOverview();
		if (!dirty) await loadFile("models");
	};

	const saveProvider = async () => {
		if (!conn || !draft) return;
		const models = draft.models.filter((model) => model.id.trim().length > 0);
		if (!MODEL_PROVIDER_ID_PATTERN.test(draft.id)) {
			setError(t("settings.invalidProviderId"));
			return;
		}
		if (new Set(models.map((model) => model.id)).size !== models.length) {
			setError(t("settings.duplicateModelId"));
			return;
		}
		setProviderBusy("save");
		setError(null);
		try {
			await conn.request("config.models.upsertProvider", {
				draft: {
					...draft,
					id: draft.id.trim(),
					models,
					apiKey: keyTouched ? (draft.apiKey ?? "") : undefined,
				},
				expectedRevision: overview?.files.models.revision ?? "",
			});
			await refreshModels();
			setDraft(null);
		} catch (err) {
			setError(configError(t, err));
		} finally {
			setProviderBusy(null);
		}
	};

	const removeProvider = async (providerId: string) => {
		if (!conn) return;
		setProviderBusy(providerId);
		setError(null);
		try {
			await conn.request("config.models.removeProvider", {
				providerId,
				expectedRevision: overview?.files.models.revision ?? "",
			});
			await refreshModels();
			setConfirmDelete(null);
		} catch (err) {
			setError(configError(t, err));
		} finally {
			setProviderBusy(null);
		}
	};

	const setDefault = async (providerId: string, modelId: string) => {
		if (!conn) return;
		setProviderBusy(`default:${providerId}:${modelId}`);
		setError(null);
		try {
			await conn.request("config.models.setDefault", {
				provider: providerId,
				model: modelId,
				expectedRevision: overview?.files.settings.revision ?? "",
			});
			await loadOverview();
		} catch (err) {
			setError(configError(t, err));
		} finally {
			setProviderBusy(null);
		}
	};

	const save = async () => {
		if (!conn || !file || !dirty) return;
		try {
			JSON.parse(stripJsonComments(content));
		} catch {
			setError(t("settings.invalidJson"));
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
			setError(configError(t, err));
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
		} catch {
			setError(t("settings.packageFailed"));
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
		} catch {
			setError(t("settings.packageFailed"));
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
		} catch {
			setError(t("settings.packageFailed"));
		} finally {
			setPackageBusy(null);
		}
	};

	const options = TABS.map((value) => ({
		value,
		label: t(`settings.tab.${value}`),
		disabled: (dirty || draft !== null) && value !== tab ? true : undefined,
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
					hitSlop={12}
					onPress={() => router.back()}
					style={[styles.back, density]}
				>
					<ArrowLeft size={16} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
				</Pressable>
				<Text style={styles.title}>{t("settings.title")}</Text>
				{tab === "extensions" ? (
					<Button
						variant="outline"
						hitSlop={10}
						size={buttonSize}
						style={styles.buttonShape}
						disabled={!workspaceId || packageBusy !== null}
						onPress={() => void updatePackages()}
					>
						{packageBusy === "update" ? t("settings.updating") : t("settings.updateAll")}
					</Button>
				) : (
					<Pressable
						accessibilityLabel={t("settings.save")}
						disabled={!dirty || busy !== null || draft !== null}
						onPress={() => void save()}
						style={[styles.save, density, (!dirty || busy !== null || draft !== null) && styles.saveDisabled]}
					>
						<Text
							style={[
								styles.saveText,
								(!dirty || busy !== null || draft !== null) && styles.saveTextDisabled,
							]}
						>
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
				{error ? <Text style={styles.error}>{error}</Text> : null}

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
						compact={compact}
						buttonSize={buttonSize}
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
									? Object.entries(overview.errors).map(([name]) => (
											<Text key={name} style={styles.error}>
												{t("settings.fileInvalid", { file: name })}
											</Text>
										))
									: null}
							</View>
						) : null}

						{tab === "models" ? (
							<View style={styles.models}>
								<View style={styles.sectionHead}>
									<Text style={styles.sectionTitle}>{t("settings.customProviders")}</Text>
									<Pressable
										accessibilityLabel={t("settings.addProvider")}
										disabled={modelsComments}
										onPress={() => {
											setDraft(emptyDraft());
											setDraftIsNew(true);
											setKeyTouched(false);
											setConfirmDelete(null);
										}}
										style={[styles.addProvider, density]}
									>
										<Plus size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
										<Text style={styles.link}>{t("settings.addProvider")}</Text>
									</Pressable>
								</View>

								{modelsComments ? (
									<Text style={styles.warning}>{t("settings.commentsWarning")}</Text>
								) : null}
								{draft ? (
									<ProviderForm
										t={t}
										draft={draft}
										isNew={draftIsNew}
										hasKey={
											!draftIsNew &&
											!!overview?.models.details.find((provider) => provider.id === draft.id)
												?.hasApiKey
										}
										keyTouched={keyTouched}
										busy={providerBusy === "save"}
										onChange={setDraft}
										onKeyTouched={() => setKeyTouched(true)}
										onSave={() => void saveProvider()}
										onCancel={() => setDraft(null)}
										compact={compact}
										buttonSize={buttonSize}
									/>
								) : overview?.models.details.length ? (
									overview.models.details.map((provider) => (
										<View key={provider.id} style={styles.provider}>
											<View style={styles.providerHead}>
												<View style={styles.providerTitle}>
													<Text style={styles.providerName}>{provider.name ?? provider.id}</Text>
													<Text style={styles.providerMeta}>
														{t("settings.providerMeta", {
															api: provider.api ?? t("settings.apiGeneric"),
															count: provider.modelCount,
														})}
														{" · "}
														{provider.hasApiKey
															? t("settings.keySet")
															: t("settings.keyMissing")}
													</Text>
												</View>
												<Pressable
													accessibilityLabel={t("settings.editProvider")}
													hitSlop={8}
													disabled={modelsComments}
													onPress={() => {
														setDraft({
															id: provider.id,
															name: provider.name,
															baseUrl: provider.baseUrl,
															api: provider.api,
															models: provider.models.map((model) => ({ ...model })),
														});
														setDraftIsNew(false);
														setKeyTouched(false);
													}}
													style={[styles.iconButton, density]}
												>
													<Pencil size={13} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
												</Pressable>
												<Pressable
													accessibilityLabel={t("settings.removeProvider")}
													hitSlop={8}
													disabled={modelsComments}
													onPress={() => setConfirmDelete(provider.id)}
													style={[styles.iconButton, density]}
												>
													<Trash2 size={13} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
												</Pressable>
											</View>
											{provider.baseUrl ? (
												<Text style={styles.providerUrl} numberOfLines={1}>
													{provider.baseUrl}
												</Text>
											) : null}
											{provider.models.map((model) => {
												const isDefault =
													overview.settings.defaultProvider === provider.id &&
													overview.settings.defaultModel === model.id;
												return (
													<View key={model.id} style={styles.modelRow}>
														<Text style={styles.modelName} numberOfLines={1}>
															{model.name ?? model.id}
														</Text>
														<Text style={styles.modelId} numberOfLines={1}>
															{model.id}
														</Text>
														{isDefault ? (
															<Text style={styles.defaultBadge}>{t("settings.defaultBadge")}</Text>
														) : (
															<Pressable
																accessibilityLabel={t("settings.setDefault")}
																disabled={providerBusy !== null}
																onPress={() => void setDefault(provider.id, model.id)}
																style={[styles.setDefault, density]}
															>
																<Star size={12} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
																<Text style={styles.link}>{t("settings.setDefault")}</Text>
															</Pressable>
														)}
													</View>
												);
											})}
											{confirmDelete === provider.id ? (
												<View style={styles.confirmRow}>
													<Text style={styles.error}>{t("settings.confirmRemoveProvider")}</Text>
													<Button
														variant="destructive"
														hitSlop={10}
														style={styles.buttonShape}
														size={buttonSize}
														loading={providerBusy === provider.id}
														onPress={() => void removeProvider(provider.id)}
													>
														{t("settings.removeProvider")}
													</Button>
													<Button
														variant="ghost"
														hitSlop={10}
														style={styles.buttonShape}
														size={buttonSize}
														onPress={() => setConfirmDelete(null)}
													>
														{t("common.cancel")}
													</Button>
												</View>
											) : null}
										</View>
									))
								) : (
									<Text style={styles.hint}>{t("settings.noCustomProviders")}</Text>
								)}
								<Text style={styles.sectionTitle}>{t("settings.catalog")}</Text>
								{catalog.length ? (
									<Text style={styles.catalog} numberOfLines={8}>
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

						{tab === "models" ? (
							<Pressable
								accessibilityLabel={showAdvanced ? t("settings.hideAdvancedJson") : t("settings.advancedJson")}
								onPress={() => setShowAdvanced((value) => !value)}
								style={[styles.advancedToggle, density]}
							>
								<Text style={styles.link}>
									{showAdvanced ? t("settings.hideAdvancedJson") : t("settings.advancedJson")}
								</Text>
							</Pressable>
						) : null}
						{tab === "models" && showAdvanced ? (
							<Text style={styles.warning}>{t("settings.secretsWarning")}</Text>
						) : null}
						{tab !== "models" || showAdvanced ? (
							<>
						<View style={styles.editorHeader}>
							<Text style={styles.path} numberOfLines={1}>
								{overview?.files[file ?? "settings"]?.path ?? file}
							</Text>
							<Pressable
								accessibilityLabel={t("settings.reload")}
								hitSlop={12}
								onPress={() => file && void loadFile(file)}
								style={[styles.reload, density]}
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
							accessibilityLabel={t("settings.editor")}
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
								<Pressable onPress={() => file && void loadFile(file)} hitSlop={8}>
									<Text style={styles.link}>{t("settings.discard")}</Text>
								</Pressable>
							) : null}
						</View>
							</>
						) : null}
					</>
				)}
			</ScrollView>
		</View>
	);
}

function ProviderForm({
	t,
	draft,
	isNew,
	hasKey,
	keyTouched,
	busy,
	onChange,
	onKeyTouched,
	onSave,
	onCancel,
	compact,
	buttonSize,
}: {
	t: (key: string, options?: Record<string, unknown>) => string;
	draft: ModelProviderDraft;
	isNew: boolean;
	hasKey: boolean;
	keyTouched: boolean;
	busy: boolean;
	onChange: (draft: ModelProviderDraft) => void;
	onKeyTouched: () => void;
	onSave: () => void;
	onCancel: () => void;
	compact: boolean;
	buttonSize: "sm" | "md";
}) {
	const { theme } = useUnistyles();
	const density = compact ? styles.touch : styles.dense;
	const updateModel = (index: number, patch: Partial<ModelProviderDraft["models"][number]>) => {
		const models = draft.models.map((model, i) => (i === index ? { ...model, ...patch } : model));
		onChange({ ...draft, models });
	};

	const numberValue = (value: string): number | undefined => {
		if (value.trim() === "") return undefined;
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	};

	return (
		<View style={styles.form}>
			<View style={styles.formGrid}>
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{t("settings.providerId")}</Text>
					<TextInput
						value={draft.id}
						editable={isNew}
						onChangeText={(id) => onChange({ ...draft, id })}
						accessibilityLabel={t("settings.providerId")}
						autoCapitalize="none"
						autoCorrect={false}
						style={[styles.input, density, !isNew && styles.inputReadonly]}
					/>
				</View>
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{t("settings.providerName")}</Text>
					<TextInput
						value={draft.name ?? ""}
						onChangeText={(name) => onChange({ ...draft, name })}
						accessibilityLabel={t("settings.providerName")}
						style={[styles.input, density]}
					/>
				</View>
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{t("settings.providerBaseUrl")}</Text>
					<TextInput
						value={draft.baseUrl ?? ""}
						onChangeText={(baseUrl) => onChange({ ...draft, baseUrl })}
						placeholder="https://…"
						accessibilityLabel={t("settings.providerBaseUrl")}
						autoCapitalize="none"
						autoCorrect={false}
						style={[styles.input, density]}
					/>
				</View>
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{t("settings.providerApi")}</Text>
					<TextInput
						value={draft.api ?? ""}
						onChangeText={(api) => onChange({ ...draft, api })}
						placeholder="openai-completions"
						accessibilityLabel={t("settings.providerApi")}
						autoCapitalize="none"
						autoCorrect={false}
						style={[styles.input, density]}
					/>
				</View>
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{t("settings.providerKey")}</Text>
					<TextInput
						value={draft.apiKey ?? ""}
						onChangeText={(apiKey) => {
							onKeyTouched();
							onChange({ ...draft, apiKey });
						}}
						placeholder={hasKey && !keyTouched ? t("settings.keyKeep") : t("settings.providerKey")}
						accessibilityLabel={t("settings.providerKey")}
						autoCapitalize="none"
						autoCorrect={false}
						secureTextEntry
						style={[styles.input, density]}
					/>
				</View>
			</View>
			{hasKey && !keyTouched ? (
				<Pressable
					onPress={() => {
						onKeyTouched();
						onChange({ ...draft, apiKey: "" });
					}}
					style={[styles.clearKey, density]}
				>
					<Text style={styles.link}>{t("settings.clearKey")}</Text>
				</Pressable>
			) : null}

			<Text style={styles.formSection}>{t("settings.modelsList")}</Text>
			{draft.models.map((model, index) => (
				<View key={index} style={styles.formModelRow}>
					<View style={styles.modelField}>
						<Text style={styles.fieldLabel}>{t("settings.modelId")}</Text>
						<TextInput
							value={model.id}
							onChangeText={(id) => updateModel(index, { id })}
							placeholder={t("settings.modelId")}
							accessibilityLabel={t("settings.modelId")}
							autoCapitalize="none"
							autoCorrect={false}
							style={[styles.input, density, styles.modelInput]}
						/>
					</View>
					<View style={styles.modelField}>
						<Text style={styles.fieldLabel}>{t("settings.modelName")}</Text>
						<TextInput
							value={model.name ?? ""}
							onChangeText={(name) => updateModel(index, { name })}
							placeholder={t("settings.modelName")}
							accessibilityLabel={t("settings.modelName")}
							style={[styles.input, density, styles.modelInput]}
						/>
					</View>
					<View style={styles.modelNumberField}>
						<Text style={styles.fieldLabel}>{t("settings.contextShort")}</Text>
						<TextInput
							value={model.contextWindow == null ? "" : String(model.contextWindow)}
							onChangeText={(value) => updateModel(index, { contextWindow: numberValue(value) })}
							placeholder={t("settings.contextWindow")}
							accessibilityLabel={t("settings.contextWindow")}
							keyboardType="numeric"
							style={[styles.input, density, styles.modelInput]}
						/>
					</View>
					<View style={styles.modelNumberField}>
						<Text style={styles.fieldLabel}>{t("settings.maxShort")}</Text>
						<TextInput
							value={model.maxTokens == null ? "" : String(model.maxTokens)}
							onChangeText={(value) => updateModel(index, { maxTokens: numberValue(value) })}
							placeholder={t("settings.maxTokens")}
							accessibilityLabel={t("settings.maxTokens")}
							keyboardType="numeric"
							style={[styles.input, density, styles.modelInput]}
						/>
					</View>
					<Pressable
						accessibilityLabel={t("settings.removeModel")}
						hitSlop={10}
						onPress={() =>
							onChange({
								...draft,
								models: draft.models.filter((_, i) => i !== index),
							})
						}
						style={[styles.iconButton, density, styles.removeModel]}
					>
						<X size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
					</Pressable>
				</View>
			))}
			<Pressable
				onPress={() => onChange({ ...draft, models: [...draft.models, { id: "" }] })}
				style={[styles.addModel, density]}
			>
				<Plus size={13} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
				<Text style={styles.link}>{t("settings.addModel")}</Text>
			</Pressable>

			<View style={styles.formActions}>
				<Button
					variant="default"
					hitSlop={10}
					size={buttonSize}
					style={styles.buttonShape}
					disabled={busy}
					loading={busy}
					onPress={onSave}
				>
					{t("settings.saveProvider")}
				</Button>
				<Button variant="ghost" hitSlop={10} style={styles.buttonShape} disabled={busy} onPress={onCancel}>
					{t("common.cancel")}
				</Button>
			</View>
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
	compact,
	buttonSize,
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
	compact: boolean;
	buttonSize: "sm" | "md";
}) {
	const { theme } = useUnistyles();
	const density = compact ? styles.touch : styles.dense;
	return (
		<View style={styles.extensions}>
			<View style={styles.sectionHead}>
				<Text style={styles.sectionTitle}>{t("settings.packages")}</Text>
				<Pressable onPress={onOpenSession} hitSlop={8}>
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
							style={[styles.iconButton, density]}
							hitSlop={12}
						>
							<Trash2 size={14} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
						</Pressable>
					</View>
				))
			)}

			<SegmentedControl
				options={[
					{ value: "user", label: t("settings.scope.user") },
					{ value: "project", label: t("settings.scope.project") },
				]}
				value={scope}
				onValueChange={(next) => onScope(next as "user" | "project")}
			/>
			<View style={styles.installRow}>
				<TextInput
					value={source}
					onChangeText={onSource}
					placeholder={t("settings.installPlaceholder")}
					accessibilityLabel={t("settings.installPlaceholder")}
					autoCapitalize="none"
					autoCorrect={false}
					style={[styles.installInput, density]}
				/>
				<Button
					variant="default"
					hitSlop={10}
					size={buttonSize}
					style={styles.buttonShape}
					disabled={!workspaceId || !source.trim() || busy !== null}
					loading={busy === "install"}
					onPress={onInstall}
				>
					{t("settings.install")}
				</Button>
			</View>

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

function configError(t: (key: string) => string, err: unknown): string {
	const code = errorCode(err);
	if (code === ErrorCodes.configConflict) return t("settings.conflict");
	if (code === ErrorCodes.configInvalid) {
		const detail = errorMessage(err);
		return detail ? `${t("settings.invalidConfig")} ${detail}` : t("settings.invalidConfig");
	}
	if (code === ErrorCodes.configTooLarge) return t("settings.tooLarge");
	if (code === ErrorCodes.configComments) return t("settings.commentsBlockForm");
	return t("settings.saveFailed");
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
	back: { alignItems: "center", justifyContent: "center" },
	dense: { minWidth: 32, minHeight: 32 },
	touch: { minWidth: 44, minHeight: 44 },
	title: {
		flex: 1,
		color: theme.colors.foreground,
		fontSize: theme.fontSize["4xl"],
		fontWeight: theme.fontWeight.semibold,
	},
	save: {
		justifyContent: "center",
		backgroundColor: theme.colors.accent,
		borderRadius: theme.borderRadius.md,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[1],
	},
	saveDisabled: { backgroundColor: theme.colors.surface1 },
	saveText: { color: theme.colors.accentForeground, fontSize: theme.fontSize.base },
	saveTextDisabled: { color: theme.colors.foregroundExtraMuted },
	content: { padding: theme.spacing[3], gap: theme.spacing[3], paddingBottom: theme.spacing[6] },
	summary: {
		gap: theme.spacing[2],
		padding: theme.spacing[3],
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		borderRadius: theme.borderRadius.lg,
		backgroundColor: theme.colors.surface0,
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
	statLabel: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.base },
	statValue: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
	mono: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	models: {
		gap: theme.spacing[2],
		padding: theme.spacing[3],
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		borderRadius: theme.borderRadius.lg,
		backgroundColor: theme.colors.surface0,
	},
	sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing[2] },
	sectionTitle: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize["2xl"],
		fontWeight: theme.fontWeight.semibold,
		marginTop: theme.spacing[2],
	},
	buttonShape: { borderRadius: theme.borderRadius.md },
	field: { flexGrow: 1, minWidth: 160, gap: 2 },
	fieldLabel: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.ui },
	link: {
		color: theme.colors.accent,
		fontSize: theme.fontSize.sm,
		textDecorationLine: "underline",
	},
	addProvider: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
	advancedToggle: { alignSelf: "flex-start", justifyContent: "center" },
	warning: { color: theme.colors.statusWarning, fontSize: theme.fontSize.sm },
	provider: {
		gap: theme.spacing[1],
		paddingVertical: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	providerHead: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
	providerTitle: { flex: 1, gap: 2 },
	providerName: { color: theme.colors.foreground, fontSize: theme.fontSize.base, fontWeight: theme.fontWeight.medium },
	providerMeta: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	providerUrl: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	iconButton: {
		alignItems: "center",
		justifyContent: "center",
	},
	modelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingVertical: theme.spacing[1],
		paddingLeft: theme.spacing[2],
	},
	modelName: { flex: 1, color: theme.colors.foreground, fontSize: theme.fontSize.base },
	modelId: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	defaultBadge: {
		color: theme.colors.foreground,
		fontSize: theme.fontSize.sm,
		backgroundColor: theme.colors.surface3,
		borderRadius: theme.borderRadius.full,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: 1,
	},
	setDefault: { flexDirection: "row", alignItems: "center", gap: 2 },
	confirmRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2], flexWrap: "wrap" },
	catalog: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	form: {
		gap: theme.spacing[2],
		padding: theme.spacing[2],
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		borderRadius: theme.borderRadius.md,
		backgroundColor: theme.colors.surface1,
	},
	formGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[2] },
	formSection: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
	formModelRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: theme.spacing[1] },
	modelField: { flexGrow: 1, minWidth: 120, gap: 2 },
	modelNumberField: { width: 140, gap: 2 },
	modelInput: { minWidth: 0, width: "100%" },
	removeModel: { alignSelf: "flex-end" },
	formActions: { flexDirection: "row", gap: theme.spacing[2], alignItems: "center" },
	input: {
		flexGrow: 1,
		minWidth: 160,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		borderRadius: theme.borderRadius.md,
		backgroundColor: theme.colors.surface0,
		color: theme.colors.foreground,
		fontSize: theme.fontSize.base,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[1],
	},
	inputReadonly: { backgroundColor: theme.colors.surface1, color: theme.colors.foregroundMuted },
	modelIdInput: { minWidth: 120 },
	modelNameInput: { minWidth: 120 },
	numberInput: { minWidth: 92, flexGrow: 0 },
	clearKey: { alignSelf: "flex-start", justifyContent: "center" },
	addModel: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
	editorHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
	path: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, fontFamily: theme.fontFamily.mono },
	reload: { alignItems: "center", justifyContent: "center" },
	editor: {
		minHeight: 360,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		borderRadius: theme.borderRadius.md,
		backgroundColor: theme.colors.surfaceCode,
		color: theme.colors.foreground,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: Math.round(theme.fontSize.code * 1.7),
		padding: theme.spacing[3],
		textAlignVertical: "top",
	},
	footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
	hint: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	error: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
	extensions: { gap: theme.spacing[2] },
	packageRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingVertical: theme.spacing[1],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	packageMain: { flex: 1 },
	packageSource: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
	packageMeta: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	installRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
	installInput: {
		flex: 1,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.borderAccent,
		borderRadius: theme.borderRadius.md,
		paddingHorizontal: theme.spacing[2],
		color: theme.colors.foreground,
		fontSize: theme.fontSize.base,
		backgroundColor: theme.colors.surface0,
	},
	loadedBox: { gap: theme.spacing[0.5] },
	loadedLine: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
	loadedItem: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
}));
