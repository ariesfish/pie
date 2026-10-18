/**
 * Regression guard for the demo page's id bindings.
 *
 * The page (`packages/daemon/public/index.html`) wires its buttons with
 * `$("someId").onclick = ...` where `$` is `document.getElementById`. A typo
 * in a referenced id (e.g. `newSessionn`) does not fail at build time — it
 * returns null (crashing on unguarded assignment at page load, killing the
 * whole script block including boot; silently disabling the element on a
 * guarded read). Lock the invariant statically: every id referenced through
 * `$()` — double-quoted, single-quoted (the page's own style, e.g.
 * `$('sendBtn')`), template-literal backticks, or `?.`-chained — must exist as
 * an `id="..."` attribute in the same file. Quote-agnostic on purpose: the
 * guard must cover the spellings the file could plausibly use. This asserts
 * resolvability only — click-to-behavior wiring is covered by the verify-pie
 * demo-session journey (drive-based), not by source spelling.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HTML = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");

// `$("id")`, `$('id')`, `$(`id`)`, `$("id" )`, `$( "id" )` — any quote style
// (template literals included), leading/trailing inner whitespace tolerated;
// standalone and `?.`-chained calls captured alike (chaining makes a typo
// silent, not safe — that is exactly the class to lock).
const REF = /\$\(\s*(['"`])([^'"`]+)\1\s*\)/g;
const declaredIds = new Set(
	[...HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
);
// The real guard predicate, shared by the invariant test and its own
// mutation self-test (the self-test must exercise the guard itself, not a
// re-implementation that could drift).
const unresolved = (src: string): string[] =>
	[...src.matchAll(REF)].map((m) => m[2]!).filter((id) => !declaredIds.has(id));

describe("demo page id bindings", () => {
	it("every $()-referenced id (any quote style, guarded included) exists as id= in the page", () => {
		expect(
			unresolved(HTML),
			"$() references a nonexistent id — unguarded call sites crash the whole script at load; guarded ones die silently",
		).toEqual([]);
	});

	it("guard bite: the ripened typo class must fail the real guard (mutation self-test)", (t) => {
		const ANCHOR = /\$\(\s*"newSession"\s*\)\.onclick = newSession;/m;
		if (!ANCHOR.test(HTML)) {
			// A legal refactor (e.g. document.querySelector) removed the anchor —
			// this self-test voids itself; the resolvability guard above stands alone.
			return t.skip();
		}
		const mutations = [
			'$("newSessionn").onclick = newSession;',
			"$('newSessionn').onclick = newSession;",
			'$("newSessionn" ).onclick = newSession;',
			'$("newSessionn")?.onclick?.(null);',
			"$(`newSessionn`).onclick = newSession;",
		];
		for (const bad of mutations) {
			const mutated = HTML.replace(ANCHOR, bad);
			expect(
				unresolved(mutated),
				`mutation escaped the guard: ${bad}`,
			).toContain("newSessionn");
		}
	});
});
