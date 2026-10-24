// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/navigation/themed-stack.tsx
// (Pie subset: unistyles-driven background color, no appearance-boundary remount.)
import type { NativeStackNavigationOptions } from "expo-router";
import { Stack } from "expo-router";
import { useMemo, type ReactElement, type ReactNode } from "react";
import { withUnistyles } from "react-native-unistyles";

interface ThemedStackBaseProps {
	backgroundColor: string;
	children?: ReactNode;
	screenOptions?: NativeStackNavigationOptions;
}

function ThemedStackBase({ backgroundColor, children, screenOptions }: ThemedStackBaseProps) {
	const themedScreenOptions = useMemo<NativeStackNavigationOptions>(
		() => ({
			...screenOptions,
			contentStyle: [{ backgroundColor }, screenOptions?.contentStyle],
		}),
		[backgroundColor, screenOptions],
	);

	return <Stack screenOptions={themedScreenOptions}>{children}</Stack>;
}

export const ThemedStack = withUnistyles(ThemedStackBase, (theme) => ({
	backgroundColor: theme.colors.surface0,
}));
