// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/workspace-tabs/identity.ts
// (Pie adaptation: target kinds narrowed to new_tab/session/files/changes.
// The semantics carry over unchanged: normalize guards external input,
// equality is the dedup rule for opening tabs, and deterministic ids are
// stable across restarts (but never for new_tab, which has no identity).)
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

export function normalizeWorkspaceTabTarget(
	value: WorkspaceTabTarget | null | undefined,
): WorkspaceTabTarget | null {
	if (!value || typeof value !== "object" || typeof value.kind !== "string") {
		return null;
	}
	if (value.kind === "new_tab") {
		return { kind: "new_tab" };
	}
	if (value.kind === "session") {
		const sessionId = trimNonEmpty(value.sessionId);
		return sessionId ? { kind: "session", sessionId } : null;
	}
	if (value.kind === "files" || value.kind === "changes") {
		return { kind: value.kind };
	}
	return null;
}

export function workspaceTabTargetsEqual(
	left: WorkspaceTabTarget,
	right: WorkspaceTabTarget,
): boolean {
	if (left.kind === "new_tab" || right.kind === "new_tab") {
		// The sticky creator tab is revealed by id, never deduped by equality.
		return false;
	}
	if (left.kind !== right.kind) {
		return false;
	}
	if (left.kind === "session" && right.kind === "session") {
		return left.sessionId === right.sessionId;
	}
	// files / changes are singletons — equal by kind.
	return true;
}

export function buildDeterministicWorkspaceTabId(target: WorkspaceTabTarget): string {
	if (target.kind === "new_tab") {
		throw new Error("New tabs do not have deterministic target identities");
	}
	if (target.kind === "session") {
		return `session_${target.sessionId}`;
	}
	return target.kind;
}

function trimNonEmpty(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}
