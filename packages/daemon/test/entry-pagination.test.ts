import { describe, expect, it } from "vitest";

import { ENTRY_PAGE_MAX, paginateEntries } from "../src/core/host-session.js";

const entries = Array.from({ length: 250 }, (_, index) => ({ id: `e${index + 1}` }));

describe("paginateEntries", () => {
	it("returns the newest page and a cursor for the next one", () => {
		const first = paginateEntries(entries, null, 100);
		expect(first).not.toBeNull();
		expect(first!.page).toHaveLength(100);
		expect(first!.page[0]!.id).toBe("e151");
		expect(first!.page.at(-1)?.id).toBe("e250");
		expect(first!.hasMore).toBe(true);
		expect(first!.nextCursor).toBe("e151");

		const second = paginateEntries(entries, first!.nextCursor, 100);
		expect(second!.page[0]!.id).toBe("e51");
		expect(second!.page.at(-1)?.id).toBe("e150");
		expect(second!.nextCursor).toBe("e51");

		const third = paginateEntries(entries, second!.nextCursor, 100);
		expect(third!.page[0]!.id).toBe("e1");
		expect(third!.page.at(-1)?.id).toBe("e50");
		expect(third!.hasMore).toBe(false);
		expect(third!.nextCursor).toBeNull();
	});

	it("rejects a cursor that is not on this branch", () => {
		expect(paginateEntries(entries, "missing", 100)).toBeNull();
	});

	it("clamps the page size", () => {
		const many = Array.from({ length: ENTRY_PAGE_MAX + 20 }, (_, index) => ({ id: `m${index}` }));
		expect(paginateEntries(many, null, ENTRY_PAGE_MAX + 1)!.page).toHaveLength(ENTRY_PAGE_MAX);
		expect(paginateEntries(entries, null, 0)!.page).toHaveLength(1);
	});
});
