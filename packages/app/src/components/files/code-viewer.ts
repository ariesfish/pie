// Platform hub (paseo dnd-surface pattern): tsc reads code-viewer.platform.ts
// (native re-export) as the type source; Metro resolves the platform sibling
// (code-viewer.platform.web.tsx / .native.tsx) per target. First attempt was
// a runtime Platform.OS dispatch, which silently shipped both implementations
// on BOTH platforms (iOS bundle +4.6MB of CodeMirror).
import { CodeViewer, type CodeViewerProps } from "./code-viewer.platform";

export { CodeViewer };
export type { CodeViewerProps };
