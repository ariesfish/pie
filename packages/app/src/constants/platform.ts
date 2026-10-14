// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/constants/platform.ts
// (Pie subset: the two platform predicates the ported UI needs.)
import { Platform } from "react-native";

export const isWeb = Platform.OS === "web";
export const isNative = Platform.OS !== "web";
export const isIos = Platform.OS === "ios";
export const isAndroid = Platform.OS === "android";
export const isMac = Platform.OS === "macos";

// ---------------------------------------------------------------------------
// Electron detection (paseo constants/platform.ts, adapted: the pie
// desktop-host bridge does not exist yet, so detection is UA-based and stays
// false until the Electron shell lands. Only caches `true` — keeps re-checking
// otherwise, because the desktop bridge may load after module evaluation.)
// ---------------------------------------------------------------------------
let _isElectronCached: boolean | null = null;
let _isElectronMacCached: boolean | null = null;

/** Running inside the Electron desktop wrapper (any OS). */
export function getIsElectron(): boolean {
	if (_isElectronCached === true) return true;
	if (!isWeb) return false;
	const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent ?? "";
	const result = /electron/i.test(userAgent);
	if (result) _isElectronCached = true;
	return result;
}

/** Running inside the Electron desktop wrapper on macOS. */
export function getIsElectronMac(): boolean {
	if (_isElectronMacCached === true) return true;
	if (!getIsElectron()) return false;
	const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent ?? "";
	const result = /Macintosh|Mac OS/i.test(userAgent);
	if (result) _isElectronMacCached = true;
	return result;
}
