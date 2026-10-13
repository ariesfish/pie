/**
 * Session-tree synchronization payload shapes (architecture.md §5.7).
 *
 * The client's authoritative state for a session is: the tree (flat id/parentId
 * pairs), the active leaf, and the entries along the active path. Everything
 * else (streaming content, queues, usage) is derived or attached alongside.
 */

import type {
	AgentMessage,
	ContextUsage,
	ModelRef,
	SessionEntry,
	ThinkingLevel,
} from "./values.js";
import type { SessionId, EntryId } from "./ids.js";

/**
 * One node of the session tree. Flat metadata only: full entry payloads are
 * sent separately (entries of the active path in the snapshot; other branches
 * on demand via session.entries {leafId}).
 */
export interface TreeNodeMeta {
	id: EntryId;
	parentId: EntryId | null;
	/** Pi entry type marker ("message" | "usage" | ...) for lightweight glyphs. */
	type: string;
	/** ISO timestamp (when the daemon knows it; used to order siblings). */
	timestamp?: string;
	/** Branch label, when one is attached at this entry (Pi LabelEntry). */
	label?: string;
	labelTimestamp?: string;
}

/** Queue modes (mirror of Pi steeringMode / followUpMode). */
export type QueueMode = "all" | "one-at-a-time";

/** Streaming/run state summary of a session at snapshot time. */
export interface SessionStateInfo {
	model?: ModelRef;
	thinkingLevel?: ThinkingLevel;
	isStreaming: boolean;
	isCompacting: boolean;
	isRetrying: boolean;
	retryAttempt?: number;
	autoCompaction: boolean;
	steeringMode: QueueMode;
	followUpMode: QueueMode;
	pendingMessages: number;
	messageCount: number;
}

/** Full attach-time snapshot. First frame sent on session.attach. */
export interface SessionSnapshot {
	sessionId: SessionId;
	/** Pi JSONL session file path on the daemon host, when persistent. */
	sessionFile?: string;
	name?: string;
	/** Workspace (project cwd) this session runs in. */
	workspaceId: string;
	/** Protocol revision of snapshot semantics; bump when layout breaks. */
	snapshotVersion: 1;
	/** Whole session tree as flat metadata. */
	tree: TreeNodeMeta[];
	leafId: EntryId | null;
	/** Entries along the root -> leaf path (ordered oldest -> newest). */
	entries: SessionEntry[];
	state: SessionStateInfo;
	queues: { steering: string[]; followUp: string[] };
	contextUsage?: ContextUsage;
	/** Attempt count of CONNECTED runs for viewer-side badge consistency. */
	usage?: { promptCount: number };
}

/** Pending dialog raised by a Pi extension through the daemon host UI context. */
export interface ExtDialogRequest {
	requestId: string;
	sessionId: SessionId;
	kind: "select" | "confirm" | "input" | "editor";
	select?: { title: string; options: string[]; timeoutMs?: number };
	confirm?: { title: string; message: string; timeoutMs?: number };
	input?: { title: string; placeholder?: string; timeoutMs?: number };
	editor?: { title: string; prefill?: string; timeoutMs?: number };
}

/** Permission (tool approval) card payload — P1 surface, types are final. */
export interface PermissionRequest {
	requestId: string;
	sessionId: SessionId;
	toolName: string;
	argsPreview: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
	reason: string;
	timeoutMs: number;
}

/** Convenience mirror of a message for renderers that prefer loose shapes. */
export type SnapshotMessage = AgentMessage;
