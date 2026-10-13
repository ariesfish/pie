/** diff-model: unified patch -> structured rows (pure functions). */
import { describe, expect, it } from "vitest";

import { buildDiffModel, intraLine, lcsOps } from "../src/components/panels/diff-model.js";

const SAMPLE = [
	"--- a/src/a.ts",
	"+++ b/src/a.ts",
	"@@ -1,5 +1,5 @@",
	 "import x from \"x\";",
	 "-const a = 1;",
	 "+const ab = 21;",
	 " ",
	 " ",
	 " ",
	 " ",
	 " ",
	 " ",
	 " ",
	 " ",
	 " ",
	 " ",
	 " ",
	 " // end",
].join("\n");

describe("buildDiffModel", () => {
	it("tracks dual line numbers from the hunk header", () => {
		const m = buildDiffModel(
			["@@ -10,3 +20,3 @@", " ctx", "-old", "+new", " tail2"].join("\n").replace(/^-old/, "-old").replace(/^\+/gm, "+"),
		);
		const ctx = m.rows.find((r) => r.type === "context");
		expect(ctx).toMatchObject({ oldN: 10, newN: 20 });
		const del = m.rows.find((r) => r.type === "del");
		expect(del).toMatchObject({ oldN: 11 });
		const add = m.rows.find((r) => r.type === "add");
		expect(add).toMatchObject({ newN: 21 });
		expect(m.addedLines).toBe(1);
		expect(m.deletedLines).toBe(1);
	});

	it("pairs adjacent del/add runs and counts them", () => {
		const m = buildDiffModel("@@ -1,2 +1,2 @@\n-old1\n-old2\n+new1\n+new2\n");
		const dels = m.rows.filter((r) => r.type === "del");
		const adds = m.rows.filter((r) => r.type === "add");
		expect(dels).toHaveLength(2);
		expect(adds).toHaveLength(2);
		expect(m.addedLines).toBe(2);
		expect(m.deletedLines).toBe(2);
		// pairing turns runs into del,add,del,add order
		expect(m.rows.map((r) => r.type)).toEqual(["hunk", "del", "add", "del", "add"]);
	});

	it("emits hunk rows for file headers and @@ headers", () => {
		const m = buildDiffModel(SAMPLE);
		const hunks = m.rows.filter((r) => r.type === "hunk");
		expect(hunks.length).toBeGreaterThanOrEqual(3); // ---, +++, @@
	});

	it("collapses long context gaps but keeps edges", () => {
		const m = buildDiffModel(SAMPLE);
		// 14 context lines in the middle -> one collapse range
		expect(m.collapseRanges).toHaveLength(1);
		const r = m.collapseRanges[0]!;
		expect(r.hidden).toBe(6); // 12 context lines - 2*3 kept
	});

	it("does not collapse short gaps", () => {
		const m = buildDiffModel("@@ -1,4 +1,4 @@\n a\n b\n c\n d\n");
		expect(m.collapseRanges).toHaveLength(0);
	});
});

describe("intraLine", () => {
	it("marks the changed words, keeps shared tokens clean", () => {
		const [d, a] = intraLine("const a = 1;", "const ab = 21;");
		const changedD = d.filter((s) => s.changed).map((s) => s.text).join("");
		const changedA = a.filter((s) => s.changed).map((s) => s.text).join("");
		// ';' is a shared token so word-level LCS keeps it clean on both sides
		expect(changedD).toBe("a1");
		expect(changedA).toBe("ab21");
		const cleanD = d.filter((s) => !s.changed).map((s) => s.text).join("");
		// shared tokens: 'const', ' ', ' ', '=', ' ', ' ', ';' (merged presentation)
		expect(cleanD).toBe("const  = ;");
	});

	it("handles fully changed lines", () => {
		const [d, a] = intraLine("old", "completely different");
		expect(d.every((s) => s.changed)).toBe(true);
		expect(a.every((s) => s.changed)).toBe(true);
	});

	it("handles empty lines", () => {
		const [d, a] = intraLine("", "x");
		expect(d).toEqual([]);
		expect(a.every((s) => s.changed)).toBe(true);
	});
});

describe("lcsOps", () => {
	it("falls back to whole-line changed for pathological inputs", () => {
		const ops = lcsOps(
			Array.from({ length: 300 }, (_, i) => `a${i}`),
			Array.from({ length: 300 }, (_, i) => `b${i}`),
		);
		expect(ops).toHaveLength(600);
		expect(ops.filter((o) => o === "same")).toHaveLength(0);
	});
});
