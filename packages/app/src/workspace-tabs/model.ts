// Ported from getpaseo/paseo (Apache-2.0) — packages/app/src/workspace-tabs/model.ts
// (Pie adaptation: tab target kinds narrowed to pie's surface — sessions are
// tabs ("a tab IS a session"), files/changes are workspace-global singletons,
// new_tab is the sticky creator tab. Drafts/subagents/terminals/plugins are
// paseo concepts that do not apply.)
export type WorkspaceTabTarget =
	| { kind: "new_tab" }
	| { kind: "session"; sessionId: string }
	| { kind: "files" }
	| { kind: "changes" };

export interface WorkspaceTab {
	/** Deterministic identity derived from the target (see identity.ts). */
	tabId: string;
	target: WorkspaceTabTarget;
	createdAt: number;
}
