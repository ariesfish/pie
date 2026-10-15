// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/app/_layout.tsx
// (Pie subset: root layout = providers + AppContainer(sidebar | routed stack).
// Host runtime bootstrap, keyboard, portals and command center are not ported.)
import { View } from "react-native";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import "@/styles/unistyles";
import { CommandCenterProvider } from "@/command-center/provider";
import { AppErrorBoundary } from "@/components/error-boundary";
import { UnistylesRuntime, StyleSheet } from "react-native-unistyles";

// Order matters: unistyles must configure before any StyleSheet.create call.
import "@/i18n/i18next";
import { ThemedStack } from "@/navigation/themed-stack";
import { AppContainer } from "@/components/layout/app-container";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useConnectionStore } from "@/stores/connection-store";

const ROOT_STACK_SCREEN_OPTIONS = {
	headerShown: false,
	animation: "none" as const,
};

const flexStyle = { flex: 1 } as const;

// Local-daemon queries are always "online" — the network status semantics of
// react-query (offline event listeners, retry-on-reconnect) do not apply to a
// WS daemon on localhost/relay. Force online before any query runs.
onlineManager.setOnline(true);

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// fs/git data lives behind the pie daemon — refetch on mount is cheap
			// and keeps panels fresh; fs.changed events invalidate explicitly.
			staleTime: 5_000,
			refetchOnWindowFocus: false,
			networkMode: "always",
		},
	},
});

function AppShell() {
	const isCompactLayout = useIsCompactFormFactor();
	const connected = useConnectionStore((s) => s.conn !== null);

	return (
		<AppContainer chromeEnabled={connected} isCompactLayout={isCompactLayout}>
			<RootStack />
		</AppContainer>
	);
}

function RootStack() {
	return (
		<ThemedStack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
			<Stack.Screen name="index" />
			<Stack.Screen name="workspaces" />
			<Stack.Screen name="sessions" />
			<Stack.Screen name="w/[workspaceId]" />
		</ThemedStack>
	);
}

function RootAppTree() {
	return (
		<AppErrorBoundary>
			<QueryClientProvider client={queryClient}>
				<CommandCenterProvider>
					<KeyboardProvider>
						<GestureHandlerRootView style={flexStyle}>
							<SafeAreaProvider>
								<View style={styles.surfaceFill}>
									<AppShell />
								</View>
							</SafeAreaProvider>
						</GestureHandlerRootView>
					</KeyboardProvider>
				</CommandCenterProvider>
			</QueryClientProvider>
		</AppErrorBoundary>
	);
}

export default function RootLayout() {
	// Belt-and-suspenders against a raced-away init; unconditionally re-assert
	// the dark identity once the tree is up.
	useEffect(() => {
		UnistylesRuntime.setTheme("dark");
	}, []);
	return <RootAppTree />;
}

const styles = StyleSheet.create((theme) => ({
	surfaceFill: {
		flex: 1,
		backgroundColor: theme.colors.surface0,
	},
}));
