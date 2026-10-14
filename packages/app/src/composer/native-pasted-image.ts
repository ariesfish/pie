// Ported from getpaseo/paseo (Apache-2.0)
export interface NativePastedFile {
  fileName: string;
  fileSize: number;
  type: string;
  uri: string;
}

export class UnsupportedPastedImageError extends Error {
  constructor(fileName: string) {
    super(`Unsupported pasted image '${fileName}'.`);
    this.name = "UnsupportedPastedImageError";
  }
}

// [pie] normalizeNativePastedImages (attachments/image-attachment-picker glue)
// returns with the W4+ attachments subsystem; text-input only needs the
// NativePastedFile type today, so the runtime path stays unported.
