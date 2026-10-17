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
 * `$('sendBtn')`), or `?.`-guarded — must exist as an `id="..."` attribute in
 * the same file. Quote-agnostic on purpose: the guard must cover the spellings
 * the file actually uses. This asserts resolvability only — click-to-behavior
 * wiring is covered by the verify-pie demo-session journey (drive-based), not
 * by source spelling.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HTML = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");

// `$("id")`, `$('id')`, `$("id" )`, `$( "id" )` — any quote, leading/trailing
// inner whitespace tolerated; both standalone and `?.`-chained calls captured
// (the chain makes a typo silent, not safe — that is exactly the class to lock).
const REF = /\$\(\s*(['"])([^'"]+)\1\s*\)/g;
const referencedIds = [...HTML.matchAll(REF)].map((m) => m[2]);
const declaredIds = new Set(
	[...HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
);

describe("demo page id bindings", () => {
	it("every $()-referenced id (any quote style, guarded included) exists as id= in the page", () => {
		const missing = referencedIds.filter((id) => !declaredIds.has(id));
		expect(
			missing,
			"$() references a nonexistent id — unguarded call sites crash the whole script at load; guarded ones die silently",
		).toEqual([]);
	});

	it("guard bite: the ripened typo class must fail this file (self-test on a mutated copy)", (t) => {
		// The historical instance, in every spelling the file uses:
		// double/single quotes, inner space, and ?. chaining.
		const ANCHOR = /\$\("newSession"\)\.onclick = newSession;/m;
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
		];
		for (const bad of mutations) {
			const mutated = HTML.replace(ANCHOR, bad);
			expect(mutated, "mutation harness: anchor replace failed").not.toBe(HTML);
			expect(mutated, "mutation harness: anchor line not found").not.toBe(HTML);
			const stillResolves = [...mutated.matchAll(REF)]
				.map((m) => m[2])
				.every((id) => declaredIds.has(id));
			expect(
				stillResolves,
				`mutation escaped the guard: ${bad}`,
			).toBe(false);
		}
	});
});
