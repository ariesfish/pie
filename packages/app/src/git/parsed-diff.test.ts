// [pie] tests for the pie-native unified-patch → hunks parser.
import { describe, expect, it } from "vitest";
import type { GitDiffFile } from "@pie/protocol";

import { parseDiffHunks, parseGitDiffFile } from "./parsed-diff";

function fixture(patch: string, overrides: Partial<GitDiffFile> = {}): GitDiffFile {
	return {
		path: "src/app.ts",
		change: "modified",
		patch,
		binary: false,
		...overrides,
	};
}

describe("parseDiffHunks", () => {
	it("splits hunks with header lines and counts add/remove body lines", () => {
		const hunks = parseDiffHunks(
			"@@" + " -1,3 +1,4 @@\n context\n-old\n+new\n+extra\n@@ -10,2 +11,2 @@\n ten\n-eleven\n+twelve\n",
		);
		expect(hunks).toHaveLength(2);
		expect(hunks[0]).toMatchObject({
			oldStart: 1,
			oldCount: 3,
			newStart: 1,
			newCount: 4,
		});
		expect(hunks[0]!.lines).toEqual([
			{ type: "header", content: "@@ -1,3 +1,4 @@" },
			{ type: "context", content: "context" },
			{ type: "remove", content: "old" },
			{ type: "add", content: "new" },
			{ type: "add", content: "extra" },
		]);
		expect(hunks[1]!.lines).toHaveLength(4); // header + context + remove + add
	});

	it("treats a missing count as one line (git's single-line form)", () => {
		const hunks = parseDiffHunks("@@ -7 +7 @@\n seven\n");
		expect(hunks[0]).toMatchObject({ oldStart: 7, oldCount: 1, newStart: 7, newCount: 1 });
	});

	it("carries newline annotations as context without numbering semantics", () => {
		const hunks = parseDiffHunks("@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n");
		expect(hunks[0]!.lines).toHaveLength(4);
		expect(hunks[0]!.lines.at(-1)).toEqual({
			type: "context",
			content: "\\ No newline at end of file",
		});
	});
});

describe("parseGitDiffFile", () => {
	it("derives counts and status from a modified file", () => {
		const parsed = parseGitDiffFile(
			fixture("@@ -1,2 +1,2 @@\n ctx\n-one\n+two\n"),
		);
		expect(parsed).toMatchObject({
			path: "src/app.ts",
			isNew: false,
			isDeleted: false,
			additions: 1,
			deletions: 1,
			status: "ok",
		});
		expect(parsed.hunks).toHaveLength(1);
	});

	it("marks added/untracked files new and renames carry oldPath", () => {
		expect(parseGitDiffFile(fixture("", { change: "added" })).isNew).toBe(true);
		expect(
			parseGitDiffFile(fixture("@@ -1 +1 @@\n x\n", { change: "untracked" })).isNew,
		).toBe(true);
		const renamed = parseGitDiffFile(
			fixture("@@ -1 +1 @@\n x\n", { change: "renamed", origPath: "old.ts" }),
		);
		expect(renamed.oldPath).toBe("old.ts");
	});

	it("reports binary files as status binary with no hunks", () => {
		const parsed = parseGitDiffFile(fixture("", { binary: true }));
		expect(parsed.status).toBe("binary");
		expect(parsed.hunks).toEqual([]);
	});
});
