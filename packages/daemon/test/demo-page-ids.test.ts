/**
 * Regression guard for the demo page's id bindings.
 *
 * The page (`packages/daemon/public/index.html`) wires its buttons with
 * `$("someId").onclick = ...` where `$` is `document.getElementById`. A typo
 * in a binding id (e.g. `newSessionn`) does not fail at build time — it
 * throws at top level when the page loads, killing the whole script block
 * (boot included). Lock the invariant statically: every `$("id")` call site
 * must reference an id attribute that exists in the same file.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HTML = readFileSync(join(__dirname, "..", "public", "index.html"), "utf8");

const bindingIds = [...HTML.matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]);
// `?.`-guarded reads are intentionally optional (e.g. tokenInput, emptyHint).
const guardedIds = new Set(
	[...HTML.matchAll(/\$\("([^"]+)"\)\?\./g)].map((m) => m[1]),
);
const declaredIds = new Set(
	[...HTML.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]),
);

describe("demo page id bindings", () => {
	it("every unguarded $(\"id\") target exists as id=\"id\" in the page", () => {
		const missing = bindingIds.filter((id) => !guardedIds.has(id) && !declaredIds.has(id));
		expect(missing, "binding targets a nonexistent id — the page script will crash at load").toEqual([]);
	});

	it("the new-session button is wired", () => {
		expect(declaredIds).toContain("newSession");
		expect(bindingIds).toContain("newSession");
	});
});
