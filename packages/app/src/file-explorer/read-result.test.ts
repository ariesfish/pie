// Ported from getpaseo/paseo (Apache-2.0) — src/file-explorer/read-result.test.ts.
// [pie] reshaped around pie's FsReadResult (decoded text + truncated flag).
import { describe, expect, it } from "vitest";
import type { FsReadResult } from "@pie/protocol";

import { explorerFileFromReadResult } from "./read-result";

function readResult(overrides: Partial<FsReadResult>): FsReadResult {
	return {
		path: "notes/sprites.md",
		text: "# hello\n",
		bytes: 9,
		truncated: false,
		binary: false,
		version: { modifiedAt: "2026-01-01T00:00:00.000Z", size: 9, revision: "0:0:9:1" },
		...overrides,
	};
}

describe("explorerFileFromReadResult", () => {
	it("keeps text and detects a leading BOM", () => {
		const withBom = explorerFileFromReadResult("a.md", readResult({ text: "\uFEFF# hello\n" }));
		expect(withBom).toEqual({
			path: "a.md",
			kind: "text",
			content: "\uFEFF# hello\n",
			hasBom: true,
			size: 9,
			truncated: false,
		});
	});

	it("marks binary reads as binary with only size", () => {
		const binary = explorerFileFromReadResult(
			"sprite.png",
			readResult({ text: null, binary: true, bytes: 4096 }),
		);
		expect(binary.kind).toBe("binary");
		expect(binary.content).toBeUndefined();
		expect(binary.hasBom).toBe(false);
		expect(binary.size).toBe(4096);
	});

	it("carries the daemon's truncation flag", () => {
		const truncated = explorerFileFromReadResult(
			"big.log",
			readResult({ text: "…", truncated: true, bytes: 1024 * 1024 }),
		);
		expect(truncated.truncated).toBe(true);
	});
});
