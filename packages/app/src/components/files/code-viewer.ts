// Platform dispatcher (paseo pattern): web resolves .platform.native ->
// .platform.web via metro's preferNativePlatform; native platforms resolve
// the .native file directly. tsc types come from the native file; the web
// file is still included in full-project typechecks.
export { CodeViewer, type CodeViewerProps } from "./code-viewer.platform.native";
