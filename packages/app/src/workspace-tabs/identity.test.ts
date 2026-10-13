// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/workspace-tabs/identity.test.ts
// (Pie adaptation: cases narrowed to pie's target kinds; the new_tab identity
// rule and trimming semantics carry over verbatim.)
import { describe, expect, it } from "vitest";
import {
	buildDeterministicWorkspaceTabId,
	normalizeWorkspaceTabTarget,
	workspaceTabTargetsEqual,
} from "./identity";

describe("new tab identity", () => {
	it("stays outside deterministic target identity", () => {
		const target = { kind: "new_tab" } as const;

		expect(normalizeWorkspaceTabTarget(target)).toEqual(target);
		expect(workspaceTabTargetsEqual(target, target)).toBe(false);
		expect(() => buildDeterministicWorkspaceTabId(target)).toThrow(
			"New tabs do not have deterministic target identities",
		);
	});
});

describe("session tab identity", () => {
	it("normalizes and compares by session id", () => {
		const target = normalizeWorkspaceTabTarget({
			kind: "session",
			sessionId: " 01a1340d-abc ",
		});

		expect(target).toEqual({ kind: "session", sessionId: "01a1340d-abc" });
		expect(
			target &&
				workspaceTabTargetsEqual(target, { kind: "session", sessionId: "01a1340d-abc" }),
		).toBe(true);
		expect(
			target &&
				workspaceTabTargetsEqual(target, { kind: "session", sessionId: "other" }),
		).toBe(false);
	});

	it("rejects a blank session id", () => {
		expect(normalizeWorkspaceTabTarget({ kind: "session", sessionId: "  " })).toBeNull();
	});

	it("keys a session tab by its session id", () => {
		expect(
			buildDeterministicWorkspaceTabId({ kind: "session", sessionId: "01a1340d" }),
		).toBe("session_01a1340d");
	});
});

describe("singleton tab identity", () => {
	it("treats two files targets as equal and deterministically keyed", () => {
		const a = { kind: "files" } as const;
		const b = { kind: "files" } as const;

		expect(workspaceTabTargetsEqual(a, b)).toBe(true);
		expect(buildDeterministicWorkspaceTabId(a)).toBe("files");
		expect(buildDeterministicWorkspaceTabId(b)).toBe("files");
	});

	it("keeps changes and files tabs distinct", () => {
		expect(
			workspaceTabTargetsEqual({ kind: "changes" }, { kind: "files" }),
		).toBe(false);
	});

	it("never collides a session tab id with a singleton tab id", () => {
		// A session literally named "files" still keys distinct from the files tab.
		expect(
			buildDeterministicWorkspaceTabId({ kind: "session", sessionId: "files" }),
		).not.toBe(buildDeterministicWorkspaceTabId({ kind: "files" }));
	});
});

describe("normalization guards", () => {
	it("rejects unknown kinds and non-objects", () => {
		expect(normalizeWorkspaceTabTarget(null)).toBeNull();
		expect(normalizeWorkspaceTabTarget(undefined)).toBeNull();
		expect(normalizeWorkspaceTabTarget("files" as never)).toBeNull();
		expect(normalizeWorkspaceTabTarget({ kind: "terminal" } as never)).toBeNull();
	});
});
