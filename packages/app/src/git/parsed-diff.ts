// [pie] paseo's protocol hands the app pre-parsed diff hunks (ParsedDiffFile);
// pie's git.diff returns unified patch strings per file (GitDiffFile). This
// derives the parsed shape app-side so the ported diff-document engine
// (git/diff-document) can consume it unchanged.
import type { GitDiffFile } from "@pie/protocol";

export interface ParsedDiffLine {
	type: "add" | "remove" | "context" | "header";
	content: string;
	// Syntax tokens ride the renderer's highlight pass (paseo fills them
	// server-side); pie highlights in the renderer, so this stays absent.
	tokens?: never;
}

export interface ParsedDiffHunk {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: ParsedDiffLine[];
}

export interface ParsedDiffFile {
	path: string;
	oldPath?: string;
	isNew: boolean;
	isDeleted: boolean;
	additions: number;
	deletions: number;
	hunks: ParsedDiffHunk[];
	status?: "ok" | "too_large" | "binary";
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parse one file's unified patch body (without the `diff --git` header) into hunks. */
export function parseDiffHunks(patch: string): ParsedDiffHunk[] {
	const hunks: ParsedDiffHunk[] = [];
	let current: ParsedDiffHunk | null = null;
	for (const line of patch.split("\n")) {
		const header = HUNK_HEADER.exec(line);
		if (header) {
			if (current) hunks.push(current);
			current = {
				oldStart: Number(header[1]),
				oldCount: header[2] === undefined ? 1 : Number(header[2]),
				newStart: Number(header[3]),
				newCount: header[4] === undefined ? 1 : Number(header[4]),
				lines: [{ type: "header", content: line }],
			};
			continue;
		}
		if (!current) continue;
		if (line.startsWith("+")) {
			current.lines.push({ type: "add", content: line.slice(1) });
		} else if (line.startsWith("-")) {
			current.lines.push({ type: "remove", content: line.slice(1) });
		} else if (line.startsWith(" ")) {
			current.lines.push({ type: "context", content: line.slice(1) });
		} else if (line.startsWith("\\")) {
			// "\ No newline at end of file" — annotation, not a numbered line.
			current.lines.push({ type: "context", content: line });
		} else if (line === "") {
			// Trailing newline of the last hunk body (or the gap before the next
			// `diff --git` header, which the daemon strips per file).
			continue;
		} else {
			current.lines.push({ type: "context", content: line });
		}
	}
	if (current) hunks.push(current);
	return hunks;
}

/** Derive the engine's parsed shape from pie's wire shape. */
export function parseGitDiffFile(file: GitDiffFile): ParsedDiffFile {
	const hunks = file.binary ? [] : parseDiffHunks(file.patch);
	let additions = 0;
	let deletions = 0;
	for (const hunk of hunks) {
		for (const line of hunk.lines) {
			if (line.type === "add") additions += 1;
			else if (line.type === "remove") deletions += 1;
		}
	}
	return {
		path: file.path,
		...(file.origPath ? { oldPath: file.origPath } : {}),
		isNew: file.change === "added" || file.change === "untracked",
		isDeleted: file.change === "deleted",
		additions,
		deletions,
		hunks,
		status: file.binary ? "binary" : "ok",
	};
}
