// Ported from getpaseo/paseo (Apache-2.0)
import { resolveFilePreviewReadTarget } from "@/file-explorer/preview-target";

export type AssistantImageSourceResolution =
  | { kind: "direct"; uri: string }
  | { kind: "file_rpc"; cwd: string; path: string };

export function resolveAssistantImageSource(input: {
  source: string;
  workspaceRoot?: string;
}): AssistantImageSourceResolution | null {
  const source = input.source.trim();
  if (!source) {
    return null;
  }

  if (/^(https?:|data:|blob:)/i.test(source)) {
    return { kind: "direct", uri: source };
  }

  // [pie] W4a: file resolution restored (paseo semantics via the ported
  // file-explorer preview-target): workspace-relative paths resolve against
  // the workspace root; absolute paths must stay within it.
  const readTarget = resolveFilePreviewReadTarget({
    path: source,
    workspaceRoot: input.workspaceRoot,
  });
  if (!readTarget) {
    return null;
  }
  return { kind: "file_rpc", cwd: readTarget.cwd, path: readTarget.path };
}
