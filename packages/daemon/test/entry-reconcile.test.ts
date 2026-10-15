// Dogfood #1 regression cover: message-kind appends that pi does not mirror
// as entry_appended are diffed onto the wire by the host.
import { describe, expect, it } from "vitest";

import { diffUnemittedEntries } from "../src/core/host-session.js";

describe("diffUnemittedEntries", () => {
	it("returns only entries whose ids are not on the wire yet", () => {
		const entries = [
			{ id: "a", type: "message" },
			{ id: "b", type: "message" },
			{ id: "c", type: "usage" },
		];
		const emitted = new Set(["a"]);
		expect(diffUnemittedEntries(emitted, entries)).toEqual([
			{ id: "b", type: "message" },
			{ id: "c", type: "usage" },
		]);
	});

	it("returns nothing once everything has been emitted (snapshot-filled set)", () => {
		const entries = [
			{ id: "a", type: "message" },
			{ id: "b", type: "message" },
		];
		const emitted = new Set(["a", "b"]);
		expect(diffUnemittedEntries(emitted, entries)).toEqual([]);
	});

	it("preserves append order for late-arriving ids", () => {
		const entries = [
			{ id: "a", type: "message" },
			{ id: "z", type: "message" },
			{ id: "m", type: "label" },
		];
		const emitted = new Set(["a"]);
		expect(diffUnemittedEntries(emitted, entries).map((e) => e.id)).toEqual(["z", "m"]);
	});
});
