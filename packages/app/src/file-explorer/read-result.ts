// Ported from getpaseo/paseo (Apache-2.0) — src/file-explorer/read-result.ts.
// [pie] adapted to pie's fs.read result (FsReadResult: decoded text, raw
// bytes, truncated, binary flag — no per-read mtime/revision/mime), with the
// BOM check moved to the decoded text (the daemon already decoded the bytes).
import type { FsReadResult } from "@pie/protocol";

import type { ExplorerFile } from "./types";

export function explorerFileFromReadResult(path: string, result: FsReadResult): ExplorerFile {
	const text = result.binary || result.text === null ? null : result.text;
	const isText = text !== null;
	return {
		path,
		kind: isText ? "text" : "binary",
		content: text ?? undefined,
		hasBom: isText && hasUtf8Bom(text),
		size: result.bytes,
		truncated: result.truncated,
	};
}

function hasUtf8Bom(text: string): boolean {
	return text.length > 0 && text.charCodeAt(0) === 0xfeff;
}
