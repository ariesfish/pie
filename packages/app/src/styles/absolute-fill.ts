import type { ViewStyle } from "react-native";

/** RN 0.86 removed StyleSheet.absoluteFillObject; keep one local object. */
export const ABSOLUTE_FILL = {
	position: "absolute",
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
} satisfies ViewStyle;
