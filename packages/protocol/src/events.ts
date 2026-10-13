/**
 * Event catalog (architecture.md §5.6). Every daemon->client notification is an
 * event envelope `{ ev, seq, data }` where `data` is one of the payloads below.
 *
 * Naming: past tense (`session.entry.appended`), session-scoped events carry
 * `sessionId` in their payload. Additive changes only; renames need a protocol
 * version bump (ADR-0001).
 */

import type { EntryId, RequestId, SessionId } from "./ids.js";
import type {
	ContextUsage,
	ModelRef,
	SessionEntry,
	ThinkingLevel,
} from "./values.js";

// --- run lifecycle ----------------------------------------------------------

export interface RunStartedData {
	sessionId: SessionId;
}
export interface RunEndedData {
	sessionId: SessionId;
	willRetry: boolean;
}
export interface SettledData {
	sessionId: SessionId;
	aborted: boolean;
}

// --- turns and messages -----------------------------------------------------

export interface TurnEndedData {
	sessionId: SessionId;
	message: unknown; // canonical final assistant AgentMessage (values.ts shape)
	toolResults: unknown[];
}

export interface MessageStartedData {
	sessionId: SessionId;
	message: unknown;
}
export interface MessageEndedData {
	sessionId: SessionId;
	message: unknown;
}

/**
 * Coalesced streaming increments from an in-flight assistant message.
 * `kind` follows the assistant content block the delta belongs to.
 */
export interface PartialDeltaData {
	sessionId: SessionId;
	messageId?: string;
	kind: "text" | "thinking" | "toolArgs";
	contentIndex: number;
	delta: string;
}

// --- queue / compaction / retry ----------------------------------------------

export interface QueueChangedData {
	sessionId: SessionId;
	steering: string[];
	followUp: string[];
}
export interface CompactionStartedData {
	sessionId: SessionId;
	reason: "manual" | "threshold" | "overflow";
}
export interface CompactionEndedData {
	sessionId: SessionId;
	reason: "manual" | "threshold" | "overflow";
	aborted: boolean;
	willRetry: boolean;
	errorMessage?: string;
}
export interface RetryStartedData {
	sessionId: SessionId;
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	errorMessage: string;
}
export interface RetryEndedData {
	sessionId: SessionId;
	success: boolean;
	attempt: number;
}
export interface SummarizationRetryScheduledData {
	sessionId: SessionId;
	attempt: number;
	maxAttempts: number;
	delayMs: number;
	errorMessage: string;
}
export interface SummarizationRetryAttemptData {
	sessionId: SessionId;
	source: "branchSummary" | "compaction";
}
export interface SummarizationRetryFinishedData {
	sessionId: SessionId;
}

// --- tool execution ----------------------------------------------------------

export interface ToolStartedData {
	sessionId: SessionId;
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	/** Set when this call was made by another tool (codemode / nested calls). */
	parentToolCallId?: string;
}
export interface ToolUpdatedData {
	sessionId: SessionId;
	toolCallId: string;
	toolName: string;
	partial: unknown;
}
export interface ToolEndedData {
	sessionId: SessionId;
	toolCallId: string;
	toolName: string;
	result: unknown;
	isError: boolean;
	durationMs?: number;
	parentToolCallId?: string;
	nestedCalls?: unknown;
}
/** Terminal-style incremental output of a bash tool call (coalesced ~100ms). */
export interface ToolBashDeltaData {
	sessionId: SessionId;
	requestId?: string;
	toolCallId?: string;
	delta: string;
}

// --- session tree --------------------------------------------------------------

/** Authoritative tree increment: a new entry was appended. */
export interface EntryAppendedData {
	sessionId: SessionId;
	entry: SessionEntry;
	/** The leaf after this append (append may or may not advance the leaf). */
	leafId: EntryId | null;
}
/** Observation-only branch switch (leaf changed without mutation). */
export interface LeafChangedData {
	sessionId: SessionId;
	leafId: EntryId;
	cause: "switch" | "fork" | "navigate" | "external";
}
export interface SessionRenamedData {
	sessionId: SessionId;
	name?: string;
}
export interface ThinkingChangedData {
	sessionId: SessionId;
	level: ThinkingLevel;
}
export interface ModelChangedData {
	sessionId: SessionId;
	model: ModelRef;
}
/** Coarse state summary changed (streaming/compacting/retry flags, pending count). */
export interface StateChangedData {
	sessionId: SessionId;
	isStreaming: boolean;
	isCompacting: boolean;
	isRetrying: boolean;
	pendingMessages: number;
}
export interface ContextUsageChangedData {
	sessionId: SessionId;
	usage: ContextUsage;
}

// --- extension UI (bridge of Pi ExtensionUIContext, arch §5.8) ------------------

export interface ExtDialogData {
	sessionId: SessionId;
	requestId: RequestId;
	kind: "select" | "confirm" | "input" | "editor";
	select?: { title: string; options: string[]; timeoutMs?: number };
	confirm?: { title: string; message: string; timeoutMs?: number };
	input?: { title: string; placeholder?: string; timeoutMs?: number };
	editor?: { title: string; prefill?: string; timeoutMs?: number };
}
export interface ExtWidgetData {
	sessionId: SessionId;
	key: string;
	placement?: "aboveEditor" | "belowEditor";
	/** v1: terminal line rows. typed payload is a P2 capability. */
	lines?: string[];
	/** When true, remove the widget with this key. */
	clear?: boolean;
}
export interface ExtStatusData {
	sessionId: SessionId;
	key: string;
	text?: string;
}
export interface ExtNotifyData {
	sessionId: SessionId;
	message: string;
	notifyType?: "info" | "warning" | "error";
}
export interface ExtTitleData {
	sessionId: SessionId;
	title: string;
}
export interface ExtEditorTextData {
	sessionId: SessionId;
	text: string;
}

// --- permissions (P1) -----------------------------------------------------------

export interface PermissionRequestData {
	sessionId: SessionId;
	requestId: RequestId;
	toolName: string;
	argsPreview: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
	reason: string;
	timeoutMs: number;
}

// --- daemon-level ----------------------------------------------------------------

/** Session list (for some workspace, or all) changed; clients refetch. */
export interface SessionsChangedData {
	workspaceId?: string;
}

// --- event map ---------------------------------------------------------------------

export interface EventPayloadMap {
	"session.run.started": RunStartedData;
	"session.run.ended": RunEndedData;
	"session.settled": SettledData;
	"session.turn.started": { sessionId: SessionId };
	"session.turn.ended": TurnEndedData;
	"session.message.started": MessageStartedData;
	"session.message.ended": MessageEndedData;
	"session.partial.delta": PartialDeltaData;
	"session.queue.changed": QueueChangedData;
	"session.compaction.started": CompactionStartedData;
	"session.compaction.ended": CompactionEndedData;
	"session.retry.started": RetryStartedData;
	"session.retry.ended": RetryEndedData;
	"session.retry.summarizationScheduled": SummarizationRetryScheduledData;
	"session.retry.summarizationAttempt": SummarizationRetryAttemptData;
	"session.retry.summarizationFinished": SummarizationRetryFinishedData;
	"session.tool.started": ToolStartedData;
	"session.tool.updated": ToolUpdatedData;
	"session.tool.ended": ToolEndedData;
	"session.tool.bashDelta": ToolBashDeltaData;
	"session.entry.appended": EntryAppendedData;
	"session.leaf.changed": LeafChangedData;
	"session.snapshot": { snapshot: import("./tree.js").SessionSnapshot };
	"session.renamed": SessionRenamedData;
	"session.thinking.changed": ThinkingChangedData;
	"session.model.changed": ModelChangedData;
	"session.state.changed": StateChangedData;
	"session.contextUsage.changed": ContextUsageChangedData;
	"session.ext.dialog": ExtDialogData;
	"session.ext.widget": ExtWidgetData;
	"session.ext.status": ExtStatusData;
	"session.ext.notify": ExtNotifyData;
	"session.ext.title": ExtTitleData;
	"session.ext.editorText": ExtEditorTextData;
	"session.permission.request": PermissionRequestData;
	"daemon.sessions.changed": SessionsChangedData;
	/** Watched workspace files changed (batched paths, relative POSIX). */
	"workspace.fs.changed": FsChangedData;
}

/** Payload of `workspace.fs.changed`. */
export interface FsChangedData {
	workspaceId: string;
	/** Relative POSIX paths (files or directories) that changed. */
	paths: string[];
	/** Watch handle that produced the batch. */
	watchId: string;
}

export type EventName = keyof EventPayloadMap;
export type EventData<E extends EventName> = EventPayloadMap[E];

/**
 * Discriminated event envelope: a mapped union so `switch (ev)` narrows `data`
 * to the matching payload type for TS consumers.
 */
export type EventFrameMap = {
	[E in EventName]: { ev: E; seq: number; data: EventPayloadMap[E] };
};
