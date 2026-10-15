// [pie] native editor face: the FileEditorModel state machine (autosave,
// CAS write, conflict recovery) is platform-shared; only the surface
// differs — a flat TextInput replaces CodeMirror (vim/find channels are
// web-only in the ported family too).
import { ScrollView, TextInput } from "react-native";
import { useSyncExternalStore } from "react";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import type { FileEditorModel } from "./model";
import type { EditorVisualTheme } from "./extensions.web";
import type { WorkspaceFileLocation } from "@/workspace/file-open";

interface FileEditorViewProps {
	model: FileEditorModel;
	filename: string;
	location: WorkspaceFileLocation;
	navigationRevision: number;
	/** Accepted for face parity; the native face reads unistyles directly. */
	theme?: EditorVisualTheme;
}

export function FileEditorView({
	model,
	location,
	navigationRevision,
}: FileEditorViewProps) {
	const { theme } = useUnistyles();
	const snapshot = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
	return (
		<ScrollView style={styles.root} contentContainerStyle={styles.content} horizontal>
			<TextInput
				value={snapshot.content}
				onChangeText={(text) => model.edit(text)}
				multiline
				scrollEnabled={false}
				style={styles.input}
				testID="file-source-editor-native"
				accessibilityLabel={`Source editor for ${location.path}`}
				key={`${location.path}:${navigationRevision}`}
			/>
		</ScrollView>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, backgroundColor: theme.colors.surface0 },
	content: { flexGrow: 1, padding: theme.spacing[3] },
	input: {
		minWidth: "100%",
		minHeight: "100%",
		textAlignVertical: "top",
		color: theme.colors.foreground,
		fontFamily: theme.fontFamily.mono,
		fontSize: theme.fontSize.code,
		lineHeight: theme.fontSize.code * 1.45,
		padding: 0,
	},
}));
