// Ported from getpaseo/paseo (Apache-2.0)
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

  // [pie] file_rpc resolution (workspace-relative image attachments) is not
  // ported yet — it rides on the attachments/file-explorer subsystem (W4+).
  return null;
}
