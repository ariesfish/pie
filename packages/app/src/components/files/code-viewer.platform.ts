// Ported from getpaseo/paseo (Apache-2.0) — platform hub shape (paseo uses the
// same pattern for its dnd surfaces). tsc resolves this file as the module's
// type source (native re-export); Metro resolves the platform-suffixed
// siblings (code-viewer.platform.web.tsx / code-viewer.platform.native.tsx)
// per target, so neither implementation rides the other platform's bundle.
export { CodeViewer, type CodeViewerProps } from "./code-viewer.platform.native";
