// Files panel (P2b-1): one-level directory navigation with the workspace
// store as the single data source (fs.list on demand, invalidated by
// workspace.fs.changed). File viewing is plain monospace text — CodeMirror
// editing and markdown preview land in P2b-2 (paseo file-pane port).
import { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	Text,
	View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check, FileText, Folder, Pencil } from "lucide-react-native";

import { useSyncExternalStore } from "react";
import { useConnectionStore } from "@/stores/connection-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { FileSourceView } from "@/file-pane/source/view";
import { editorVisualTheme } from "@/file-pane/visual-theme";
import { FileMarkdownPreview } from "@/file-pane/markdown-preview";
import { FileEditorView } from "@/file-pane/editor/view";
import { useFileEditor } from "@/file-pane/editor/session";
import {
	getFileConflictCallout,
	type FileConflictCallout,
} from "@/file-pane/editor/model";
import { FileConflictAlert, type FileConflictAlertState } from "@/file-pane/conflict-alert";

export function FilesPanel() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const dir = useWorkspaceStore((s) => s.dir);
	const node = useWorkspaceStore((s) => s.dirs[s.dir]);
	const listDir = useWorkspaceStore((s) => s.listDir);
	const openPath = useWorkspaceStore((s) => s.openPath);
	const openFile = useWorkspaceStore((s) => s.openFile);
	const openFilePath = useWorkspaceStore((s) => s.openFilePath);
	const fileLoading = useWorkspaceStore((s) => s.fileLoading);
	const closeFile = useWorkspaceStore((s) => s.closeFile);
	const [editing, setEditing] = useState(false);
	const conn = useConnectionStore((s) => s.conn);
	// W3b-4: while editing, the ported FileEditorModel owns the buffer —
	// autosave, ADR-0006 CAS writes, conflict calls (native TextInput and
	// web CodeMirror share the same state machine).
	const editor = useFileEditor({
		connection: conn,
		workspaceId: useWorkspaceStore.getState().workspaceId,
		path: openFilePath,
		enabled: editing && openFile?.text != null && !openFile.binary,
	});
	const editorSnapshot = useSyncExternalStore(
		editor.model ? editor.model.subscribe : noopSubscribe,
		editor.model ? editor.model.getSnapshot : noopSnapshot,
		editor.model ? editor.model.getSnapshot : noopSnapshot,
	);

	useEffect(() => {
		if (!node || (node.fetchedAt === 0 && !node.loading)) void listDir(dir);
	}, [node, dir, listDir]);

	// A file switch leaves edit mode; the editor model is per-path.
	useEffect(() => {
		setEditing(false);
	}, [openFilePath]);

	const isMarkdown = /\.(md|markdown|mdx)$/i.test(openFilePath ?? "");
	const viewerText = openFile?.text ?? "";
	// [W3b-4] the ported FileEditorModel is the only editor buffer; its
	// snapshot drives the header chrome and the CAS save path.
	const editorActive = editing && editor.model != null;
	const headerDirty = editorActive && editorSnapshot.modified;
	const saving = editorActive && editorSnapshot.status === "saving";

	if (openFile && openFilePath) {
		return (
			<View style={styles.root}>
				<View style={styles.headerRow}>
					<Pressable style={styles.backBtn} onPress={closeFile} hitSlop={8}>
						<ArrowLeft size={16} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
					</Pressable>
					<Text style={styles.pathText} numberOfLines={1}>
						{openFilePath}
						{openFile.truncated ? ` · ${t("files.truncated")}` : ""}
						{headerDirty ? ` · ${t("files.unsaved")}` : ""}
						{saving ? ` · ${t("files.saving")}` : ""}
					</Text>
					{textBadge(openFile.binary, t)}
					{openFile.text != null && !editing && (
						<Pressable
							style={styles.backBtn}
							accessibilityLabel={t("files.editFile")}
							onPress={() => setEditing(true)}
							hitSlop={8}
						>
							<Pencil size={15} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
						</Pressable>
					)}
					{editing && (
						<>
							<Pressable
								style={[styles.backBtn, headerDirty && styles.saveBtn]}
								disabled={!headerDirty || saving}
								accessibilityLabel={t("files.saveFile")}
								onPress={() => void editor.model?.save()}
								hitSlop={8}
							>
								<Check
									size={15}
									color={headerDirty ? theme.colors.accentForeground : theme.colors.foregroundMuted}
									strokeWidth={1.5}
								/>
							</Pressable>
							<Pressable
								style={styles.backBtn}
								accessibilityLabel={t("files.stopEditing")}
								onPress={() => setEditing(false)}
								hitSlop={8}
							>
								<FileText size={15} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
							</Pressable>
						</>
					)}
				</View>
				{openFile.binary ? (
					<View style={styles.center}>
						<Text style={styles.binaryText}>{t("files.binary")}</Text>
					</View>
				) : isMarkdown && !editing ? (
					// [W3b-3] ported markdown preview: front-matter table + reading frame.
					<ScrollView>
						<FileMarkdownPreview source={viewerText} />
					</ScrollView>
				) : editing && editor.model ? (
					// [W3b-4] ported editor: CAS write through fs.write
					// (ADR-0006), autosave after 800ms of inactivity, conflict
					// callouts with overwrite/reload on the live observation.
					<>
						{fileConflictAlertState(
							getFileConflictCallout(editorSnapshot),
							editor.model,
						) ? (
							<FileConflictAlert
								state={fileConflictAlertState(
									getFileConflictCallout(editorSnapshot),
									editor.model,
								)!}
							/>
						) : null}
						<FileEditorView
							model={editor.model}
							filename={openFilePath}
							location={{ path: openFilePath }}
							navigationRevision={0}
							theme={editorVisualTheme(theme)}
						/>
					</>
				) : editing ? (
					<View style={styles.center}>
						<ActivityIndicator color={theme.colors.foregroundMuted} />
					</View>
				) : (
					<FileSourceView
						content={viewerText}
						filename={openFilePath}
						location={{ path: openFilePath }}
						navigationRevision={0}
						size={openFile?.bytes ?? 0}
						theme={editorVisualTheme(theme)}
						tooLargeMessage={t("files.truncated")}
					/>
				)}
			</View>
		);
	}

	return (
		<View style={styles.root}>
			<View style={styles.headerRow}>
				<Pressable
					style={styles.backBtn}
					disabled={dir === ""}
					onPress={() => {
						const parent = dir.split("/").slice(0, -1).join("/");
						void listDir(parent);
						useWorkspaceStore.setState({ dir: parent });
					}}
					hitSlop={8}
				>
					<ArrowLeft
						size={16}
						color={dir === "" ? theme.colors.border : theme.colors.foreground}
						strokeWidth={1.5}
					/>
				</Pressable>
				<Text style={styles.pathText} numberOfLines={1}>
					{dir === "" ? "/" : `${dir}/`}
				</Text>
				{fileLoading && <ActivityIndicator size="small" />}
			</View>
			<ScrollView contentContainerStyle={styles.list}>
				{node?.error ? (
					<Text style={styles.errorText}>{node.error}</Text>
				) : (
					(node?.entries ?? []).map((entry) => (
						<Pressable
							key={entry.path}
							style={styles.row}
							onPress={() => {
								if (entry.kind === "dir") {
									useWorkspaceStore.setState({ dir: entry.path });
									void listDir(entry.path);
								} else {
									void openPath(entry.path);
								}
							}}
						>
							{entry.kind === "dir" ? (
								<Folder size={16} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
							) : (
								<FileText size={16} color={theme.colors.foregroundMuted} strokeWidth={1.5} />
							)}
							<Text style={styles.rowText} numberOfLines={1}>
								{entry.name}
							</Text>
						</Pressable>
					))
				)}
				{node?.loading && node.entries.length === 0 && (
					<View style={styles.center}>
						<ActivityIndicator />
					</View>
				)}
				{!node?.loading && (node?.entries ?? []).length === 0 && !node?.error && (
					<Text style={styles.emptyText}>{t("files.empty")}</Text>
				)}
			</ScrollView>
		</View>
	);
}

const noopSubscribe = () => () => undefined;
const IDLE_EDITOR_SNAPSHOT = {
	status: "clean",
	content: "",
	lineSeparator: "\n",
	modified: false,
	version: { status: "ready", version: { modifiedAt: "", size: 0, revision: "" } },
	observedVersion: { status: "ready" },
	error: null,
} as const;
const noopSnapshot = () => IDLE_EDITOR_SNAPSHOT;

function fileConflictAlertState(
	callout: FileConflictCallout | null,
	model: NonNullable<ReturnType<typeof useFileEditor>["model"]>,
): FileConflictAlertState | null {
	if (!callout) return null;
	if (callout.kind === "deleted") return { kind: "deleted" };
	if (callout.kind === "checkFailed") {
		return { kind: "checkFailed", retrying: false, onRetry: () => void model.reload() };
	}
	return {
		kind: "changed",
		canOverwrite: callout.canOverwrite,
		onReload: () => void model.reload(),
		onOverwrite: () => void model.overwrite(),
	};
}

function textBadge(binary: boolean, t: (k: string) => string) {
	if (!binary) return null;
	return (
		<View style={styles.badge}>
			<Text style={styles.badgeText}>{t("files.binary")}</Text>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, backgroundColor: theme.colors.surface0 },
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		borderBottomWidth: theme.borderWidth[1],
		borderBottomColor: theme.colors.border,
	},
	backBtn: { padding: theme.spacing[1] },
	pathText: { flex: 1, color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
	list: { padding: theme.spacing[2], gap: theme.spacing[1] },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: theme.spacing[2],
		paddingVertical: theme.spacing[1.5],
		paddingHorizontal: theme.spacing[2],
		borderRadius: theme.borderRadius.md,
	},
	rowText: { color: theme.colors.foreground, fontSize: theme.fontSize.content },
	errorText: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
	emptyText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, alignSelf: "center", padding: theme.spacing[4] },
	center: { padding: theme.spacing[4] },
	binaryText: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.content },
	saveBtn: { backgroundColor: theme.colors.accent, borderRadius: 6 },
	badge: {
		backgroundColor: theme.colors.surface2,
		borderRadius: theme.borderRadius.full,
		paddingHorizontal: theme.spacing[2],
		paddingVertical: theme.spacing[0.5],
	},
	badgeText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
}));
