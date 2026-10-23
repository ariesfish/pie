// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/app/_layout.tsx
// (Pie subset: root layout = providers + AppContainer(sidebar | routed stack).
// Host runtime bootstrap, keyboard, portals and command center are not ported.)
import { Text, TextInput, View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import "@/styles/unistyles";
import { CommandCenterProvider } from "@/command-center/provider";
import { AppErrorBoundary } from "@/components/error-boundary";
import { DEFAULT_UI_FONT_STACK } from "@/styles/theme";
import { StyleSheet } from "react-native-unistyles";

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
								<BottomSheetModalProvider>
									<View style={styles.surfaceFill}>
										<AppShell />
									</View>
								</BottomSheetModalProvider>
							</SafeAreaProvider>
						</GestureHandlerRootView>
					</KeyboardProvider>
				</CommandCenterProvider>
			</QueryClientProvider>
		</AppErrorBoundary>
	);
}

export default function RootLayout() {
	// User feedback first flight: unify the app-wide font family (browser
	// defaults leaked serif in a few unlabeled spots). Text.defaultProps
	// covers every descendant that does not opt into a mono face.
	const textType = Text as unknown as { defaultProps: Record<string, unknown> };
	const inputType = TextInput as unknown as { defaultProps: Record<string, unknown> };
	textType.defaultProps = { ...textType.defaultProps, fontFamily: DEFAULT_UI_FONT_STACK };
	inputType.defaultProps = { ...inputType.defaultProps, fontFamily: DEFAULT_UI_FONT_STACK };

	return <RootAppTree />;
}

const styles = StyleSheet.create((theme) => ({
	surfaceFill: {
		flex: 1,
		backgroundColor: theme.colors.surface0,
	},
}));
