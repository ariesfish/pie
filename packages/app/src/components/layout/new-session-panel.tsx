// New-session tab (Wave 1): the "+" tab — workspace path (prefilled by the
// desktop injection), model picker placeholder (model catalog arrives with
// model.set flows), and the create action that opens a fresh session tab.
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useConnectionStore } from "@/stores/connection-store";
import { useSessionListStore } from "@/stores/session-list-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function NewSessionPanel() {
	const { t } = useTranslation();
	const workspaceId = useWorkspaceStore((s) => s.workspaceId);
	const conn = useConnectionStore((s) => s.conn);
	const error = useConnectionStore((s) => s.error);
	const refresh = useSessionListStore((s) => s.refresh);
	const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
	const [path, setPath] = useState(workspaceId ?? "");
	const [busy, setBusy] = useState(false);

	const create = async () => {
		if (!conn || !path.trim() || busy) return;
		setBusy(true);
		try {
			setWorkspace(path.trim());
			const created = await conn.request("session.create", { workspaceId: path.trim() });
			await conn.request("session.attach", { sessionId: created.sessionId });
			useConnectionStore.setState({ sessionId: created.sessionId });
			await refresh();
			useTabsStore.getState().openSession(created.sessionId);
		} catch (err) {
			useConnectionStore.setState({ error: err instanceof Error ? err.message : String(err) });
		} finally {
			setBusy(false);
		}
	};

	return (
		<View style={styles.root}>
			<Text style={styles.title}>{t("agentList.newSession")}</Text>
			<Text style={styles.label}>{t("connect.workspace")}</Text>
			<TextInput
				style={styles.input}
				value={path}
				onChangeText={setPath}
				placeholder={t("connect.workspacePlaceholder")}
				placeholderTextColor="#4b5262"
				autoCapitalize="none"
				autoCorrect={false}
			/>
			{error ? <Text style={styles.error}>{error}</Text> : null}
			<Button variant="default" onPress={() => void create()} disabled={busy}>
				{busy ? t("common.connecting") : t("agentList.start")}
			</Button>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, padding: theme.spacing[6], gap: theme.spacing[2], maxWidth: 420, alignSelf: "center", width: "100%" },
	title: { color: theme.colors.foreground, fontSize: theme.fontSize.xl, fontWeight: "600", marginBottom: theme.spacing[2] },
	label: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	input: {
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		padding: theme.spacing[3],
		color: theme.colors.foreground,
	},
	error: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
}));
