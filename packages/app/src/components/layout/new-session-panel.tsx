// New-session tab (the "+" tab): create a session in the active workspace —
// or pick one of the registered workspaces first. The model picker arrives
// with the composer/model-selection surface.
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useConnectionStore } from "@/stores/connection-store";
import { useSessionListStore } from "@/stores/session-list-store";
import { useTabsStore } from "@/stores/tabs-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useWorkspaceRegistryStore } from "@/stores/workspace-registry-store";

export function NewSessionPanel() {
	const { t } = useTranslation();
	const workspaceId = useWorkspaceStore((s) => s.workspaceId);
	const conn = useConnectionStore((s) => s.conn);
	const error = useConnectionStore((s) => s.error);
	const registry = useWorkspaceRegistryStore((s) => s.workspaces);
	const [pick, setPick] = useState(workspaceId ?? null);
	const [busy, setBusy] = useState(false);
	const router = useRouter();

	const target = pick ?? workspaceId;
	const options = useMemo(() => {
		const ids = registry.map((w) => w.id).filter((id) => id !== target);
		return target ? [target, ...ids] : ids;
	}, [registry, target]);

	const create = async () => {
		const ws = target?.trim();
		if (!conn || !ws || busy) return;
		setBusy(true);
		try {
			// startSession = workspace.open + session.create + attach (retry-safe).
			await useConnectionStore.getState().startSession(ws);
			await useSessionListStore.getState().refresh();
			const sessionId = useConnectionStore.getState().sessionId;
			if (sessionId) useTabsStore.getState().openSession(sessionId);
			// A different workspace was picked — navigate there (route owns the id).
			if (ws !== workspaceId) {
				router.replace({ pathname: "/w/[workspaceId]", params: { workspaceId: ws } });
			}
		} catch {
			// startSession already surfaced the error in connection-store.
		} finally {
			setBusy(false);
		}
	};

	return (
		<View style={styles.root}>
			<Text style={styles.title}>{t("agentList.newSession")}</Text>
			{options.length > 0 ? (
				<>
					<Text style={styles.label}>{t("connect.workspace")}</Text>
					{options.map((id) => {
						const on = id === target;
						return (
							<Pressable
								key={id}
								style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && styles.optionPressed]}
								onPress={() => setPick(id)}
							>
								<View style={styles.optionMain}>
									<Text style={[styles.optionTitle, on && styles.optionTitleOn]} numberOfLines={1}>
										{id.split("/").filter(Boolean).pop() ?? id}
									</Text>
									<Text style={styles.optionPath} numberOfLines={1}>
										{id}
									</Text>
								</View>
							</Pressable>
						);
					})}
					<Button variant="default" onPress={() => void create()} disabled={busy}>
						{busy ? t("common.connecting") : t("agentList.start")}
					</Button>
					{error ? <Text style={styles.error}>{error}</Text> : null}
				</>
			) : (
				<Text style={styles.empty}>{t("workspaces.empty")}</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	root: { flex: 1, padding: theme.spacing[6], gap: theme.spacing[2], maxWidth: 480, alignSelf: "center", width: "100%" },
	title: { color: theme.colors.foreground, fontSize: theme.fontSize.xl, fontWeight: "600", marginBottom: theme.spacing[2] },
	label: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
	option: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		paddingHorizontal: theme.spacing[3],
		paddingVertical: theme.spacing[2],
		gap: 2,
	},
	optionOn: { borderColor: theme.colors.accent, backgroundColor: theme.colors.surface2 },
	optionPressed: { opacity: 0.7 },
	optionMain: { flex: 1 },
	optionTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.sm },
	optionTitleOn: { color: theme.colors.foreground, fontWeight: theme.fontWeight.semibold },
	optionPath: { color: theme.colors.foregroundExtraMuted, fontSize: 10 },
	error: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
	empty: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base, textAlign: "center", padding: theme.spacing[4] },
}));
