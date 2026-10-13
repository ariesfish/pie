// Platform dispatcher (paseo pattern): web resolves .native -> .web via
// metro's preferNativePlatform; native platforms resolve the .native file
// directly. tsc types come from the native file; the web file is still
// included in full-project typechecks.
export { SplitDndShell, useSplitDnd } from "./split-dnd-shell.native";
