// Settings: Pi config through the daemon (ADR-0008). Desktop and remote use
// the same API; the editor writes settings/models/mcp with a revision CAS.
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ArrowLeft, RotateCw } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { ConfigFile } from "@pie/protocol";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useConnectionStore } from "@/stores/connection-store";

const FILES: ConfigFile[] = ["settings", "models", "mcp"];

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
	models: { providers: string[] };
	mcp: { servers: string[] };
	errors?: Partial<Record<ConfigFile, string>>;
}

export default function SettingsScreen() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const router = useRouter();
	const conn = useConnectionStore((s) => s.conn);
	const [overview, setOverview] = useState<ConfigOverview | null>(null);
	const [file, setFile] = useState<ConfigFile>("settings");
	const [content, setContent] = useState("");
	const [revision, setRevision] = useState("");
	const [dirty, setDirty] = useState(false);
	const [busy, setBusy] = useState<"load" | "save" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	const loadFile = useCallback(
		async (target: ConfigFile) => {
			if (!conn) return;
			setBusy("load");
			setError(null);
			try {
				const read = await conn.request("config.read", { file: target });
				setFile(target);
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

	const loadOverview = useCallback(async () => {
		if (!conn) return;
		try {
			const next = await conn.request("config.overview", {});
			setOverview(next as ConfigOverview);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [conn]);

	useEffect(() => {
		if (!conn) return;
		void loadOverview();
		void loadFile("settings");
	}, [conn, loadFile, loadOverview]);

	const save = async () => {
		if (!conn || !dirty) return;
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
			setError(
				/conflict|changed on disk/i.test(message)
					? t("settings.conflict")
					: message,
			);
		} finally {
			setBusy(null);
		}
	};

	const options = FILES.map((value) => ({
		value,
		label: t(`settings.file.${value}`),
		disabled: dirty,
	}));

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
				<Pressable
					accessibilityLabel={t("settings.save")}
					disabled={!dirty || busy !== null}
					onPress={() => void save()}
					style={[styles.save, (!dirty || busy !== null) && styles.saveDisabled]}
				>
					<Text style={styles.saveText}>{busy === "save" ? t("settings.saving") : t("settings.save")}</Text>
				</Pressable>
			</View>
			<ScrollView contentContainerStyle={styles.content}>
				{!conn ? <Text style={styles.error}>{t("settings.noConnection")}</Text> : null}
				{overview ? (
					<View style={styles.summary}>
						<Text style={styles.summaryTitle}>{t("settings.agentDir")}</Text>
						<Text style={styles.mono} selectable>
							{overview.agentDir}
						</Text>
						<View style={styles.summaryGrid}>
							<Stat label={t("settings.defaultModel")} value={overview.settings.defaultModel ?? "—"} />
							<Stat label={t("settings.auth")} value={overview.authProviders.join(", ") || "—"} />
							<Stat label={t("settings.models")} value={String(overview.models.providers.length)} />
							<Stat label={t("settings.mcp")} value={String(overview.mcp.servers.length)} />
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

				<SegmentedControl options={options} value={file} onValueChange={(next) => void loadFile(next)} />

				<View style={styles.editorHeader}>
					<Text style={styles.path} numberOfLines={1}>
						{overview?.files[file]?.path ?? t(`settings.file.${file}`)}
					</Text>
					<Pressable
						accessibilityLabel={t("settings.reload")}
						hitSlop={6}
						onPress={() => void loadFile(file)}
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
						{dirty ? t("settings.dirtyHint") : saved ? t("settings.saved") : t("settings.revision", { revision: revision || "—" })}
					</Text>
					{dirty ? (
						<Pressable onPress={() => void loadFile(file)} hitSlop={6}>
							<Text style={styles.reloadText}>{t("settings.discard")}</Text>
						</Pressable>
					) : null}
				</View>
				{error ? <Text style={styles.error}>{error}</Text> : null}
			</ScrollView>
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
	editorHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
	},
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
}));
