// Ported from getpaseo/paseo (Apache-2.0) — app/h/[serverId]/_layout.tsx
// (Pie subset: a single daemon connection, so the workspace stack hangs
// directly off the root at w/[workspaceId].)
import { Stack } from "expo-router";
import { ThemedStack } from "@/navigation/themed-stack";

const WORKSPACE_STACK_SCREEN_OPTIONS = {
	headerShown: false,
	animation: "none" as const,
};

export default function WorkspaceRouteLayout() {
	return (
		<ThemedStack screenOptions={WORKSPACE_STACK_SCREEN_OPTIONS}>
			<Stack.Screen name="index" />
		</ThemedStack>
	);
}
