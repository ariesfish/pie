// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/constants/platform.ts
// (Pie subset: the two platform predicates the ported UI needs.)
import { Platform } from "react-native";

export const isWeb = Platform.OS === "web";
export const isNative = Platform.OS !== "web";
export const isIos = Platform.OS === "ios";
export const isAndroid = Platform.OS === "android";
export const isMac = Platform.OS === "macos";
