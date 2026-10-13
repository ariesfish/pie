// Platform dispatcher: runtime selection (Platform.OS). Metro's extension
// resolution cannot express this hub as an import (an explicit .native path
// binds web to the native viewer; a bare ".platform" gets captured by the
// nearest .ts) — so both implementations load and the pick happens at
// runtime. Bundle cost: the native viewer rides along on web (~KBs, tokens
// renderer only).
import { Platform } from "react-native";
import { CodeViewer as CodeViewerNative } from "./code-viewer.platform.native";
import { CodeViewer as CodeViewerWeb } from "./code-viewer.platform.web";
import type { CodeViewerProps } from "./code-viewer.platform.native";

export type { CodeViewerProps };

export const CodeViewer = Platform.OS === "web" ? CodeViewerWeb : CodeViewerNative;
