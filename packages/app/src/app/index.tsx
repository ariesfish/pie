// Ported from getpaseo/paseo (Apache-2.0) app structure — packages/app/src/app/index.tsx
// (Pie subset: splash/connect when offline; redirect into the desktop-injected
// workspace (or the workspaces picker) once the daemon connection is live.)
import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useConnectionStore } from "@/stores/connection-store";
import { useWorkspaceStore } from "@/stores/workspace-store";

export default function Index() {
	const { t } = useTranslation();
	const { theme } = useUnistyles();
	const status = useConnectionStore((s) => s.status);
	const error = useConnectionStore((s) => s.error);
	const connect = useConnectionStore((s) => s.connect);
	const workspaceId = useWorkspaceStore((s) => s.workspaceId);

	const [wsUrl, setWsUrl] = useState("ws://127.0.0.1:8760");
	const [token, setToken] = useState("");
	const [injectedWorkspace, setInjectedWorkspace] = useState<string | null>(null);

	// Desktop injection: the Electron window passes sidecar coordinates via
	// query params (web platform only) — auto-connect on mount.
	useEffect(() => {
		if (typeof window === "undefined" || !window.location?.search) return;
		const q = new URLSearchParams(window.location.search);
		const url = q.get("url");
		const tk = q.get("token");
		const ws = q.get("workspace");
		if (!url || !tk) return;
		setWsUrl(url);
		setToken(tk);
		if (ws) {
			setInjectedWorkspace(ws);
			useWorkspaceStore.getState().setWorkspace(ws);
		}
		void connect(url, tk);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (status === "connected") {
		// Desktop injection wins, else the last workspace, else the picker.
		const target = injectedWorkspace ?? workspaceId;
		return target ? (
			<Redirect href={{ pathname: "/w/[workspaceId]", params: { workspaceId: target } }} />
		) : (
			<Redirect href="/workspaces" />
		);
	}

	return (
		<View style={styles.center}>
			<Text style={styles.brand}>πie</Text>
			<Text style={styles.subtitle}>{t("connect.subtitle")}</Text>
			<Text style={styles.fieldLabel}>{t("connect.address")}</Text>
			<TextInput
				style={styles.input}
				placeholder={t("connect.addressPlaceholder")}
				placeholderTextColor={theme.colors.foregroundMuted}
				value={wsUrl}
				onChangeText={setWsUrl}
				autoCapitalize="none"
				autoCorrect={false}
			/>
			<Text style={styles.fieldLabel}>{t("connect.token")}</Text>
			<TextInput
				style={styles.input}
				placeholder="…"
				placeholderTextColor={theme.colors.foregroundMuted}
				value={token}
				onChangeText={setToken}
				autoCapitalize="none"
				autoCorrect={false}
			/>
			{error ? <Text style={styles.errorText}>{error}</Text> : null}
			<Button
				variant="default"
				onPress={() => {
					void connect(wsUrl, token);
				}}
			>
				{status === "connecting" ? t("common.connecting") : t("common.connect")}
			</Button>
		</View>
	);
}

const styles = StyleSheet.create((theme) => ({
	center: {
		flex: 1,
		backgroundColor: theme.colors.surface0,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: theme.spacing[8],
		gap: theme.spacing[2],
	},
	brand: { color: theme.colors.foreground, fontSize: theme.fontSize["4xl"], fontWeight: "700" },
	subtitle: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.content, marginBottom: theme.spacing[4] },
	fieldLabel: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm, alignSelf: "stretch" },
	input: {
		width: "100%",
		backgroundColor: theme.colors.surface1,
		borderRadius: theme.borderRadius.lg,
		borderWidth: theme.borderWidth[1],
		borderColor: theme.colors.border,
		padding: theme.spacing[3],
		color: theme.colors.foreground,
	},
	errorText: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm },
}));
