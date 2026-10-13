/**
 * Structural mirror of the Pi value shapes that cross the wire.
 *
 * The protocol package deliberately does NOT import Pi packages
 * (architecture.md §12 R1: Pi type references are confined to the daemon
 * adapter layer). Shapes here mirror the subset clients render; the daemon
 * maps Pi values into these in one place. Unknown fields travel in `extra`.
 *
 * References (pi-mono):
 * - messages/blocks: packages/ai/src/types.ts (Message, AssistantMessage, ToolCall...)
 * - entries:         packages/coding-agent/src/core/session-manager.ts (SessionEntry*)
 * - usage stats:     packages/coding-agent/src/core/agent-session.ts (SessionStats, ContextUsage)
 */

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** Thinking level vocabulary (mirrors pi-agent-core ThinkingLevel). */
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** Model reference for snapshots/state events. */
export interface ModelRef {
	provider: string;
	id: string;
	name?: string;
	api?: string;
	reasoning?: boolean;
	/** True when this is a virtual model dispatching to physical models per request. */
	virtual?: boolean;
}

/** Full model catalog entry (models.list result items). */
export interface ModelCatalogItem extends ModelRef {
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
	/** Present when the model is usable via an OAuth subscription login. */
	oauth?: boolean;
}

/** A model selection + optional thinking level pair used for scoped cycling. */
export interface ScopedModel {
	model: ModelRef;
	thinkingLevel?: ThinkingLevel;
}

// ---------------------------------------------------------------------------
// Message content blocks (mirror of pi-ai ContentBlock variants)
// ---------------------------------------------------------------------------

export interface TextBlock {
	type: "text";
	text: string;
}
export interface ThinkingBlock {
	type: "thinking";
	thinking: string;
	redacted?: boolean;
}
export interface ImageBlock {
	type: "image";
	data: string; // base64
	mimeType: string;
}
export interface ToolCallBlock {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}
/** Fallback for block kinds this protocol version has not modeled yet. */
export interface OpaqueBlock {
	type: string;
	value?: unknown;
}
export type ContentBlock =
	| TextBlock
	| ThinkingBlock
	| ImageBlock
	| ToolCallBlock
	| (OpaqueBlock & Record<string, unknown>);

// ---------------------------------------------------------------------------
// Agent messages (mirror of pi-agent-core AgentMessage)
// ---------------------------------------------------------------------------

export interface UserMessage {
	role: "user";
	content: string | (TextBlock | ImageBlock)[];
	timestamp?: number;
}
export interface AssistantMessage {
	role: "assistant";
	content: ContentBlock[];
	provider: string;
	api?: string;
	model: string;
	/** Concrete response model when different from the requested one. */
	responseModel?: string;
	thinkingLevel?: ThinkingLevel;
	/** Pi thinking level requested for this response (Pi >= 1.0). */
	requestedThinkingLevel?: ThinkingLevel;
	timestamp?: number;
}
export interface ToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: (TextBlock | ImageBlock)[];
	isError: boolean;
	timestamp?: number;
	durationMs?: number;
	/** Bounded record of nested tool calls made while this tool ran. */
	nestedCalls?: unknown;
	/** Tool-specific structured payload (e.g. edit file lists). */
	details?: unknown;
}
/** Fallback for custom message kinds registered by extensions. */
export interface OpaqueMessage {
	role: string;
	value?: unknown;
}
export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage | (OpaqueMessage & Record<string, unknown>);

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

/** Token usage (mirror of pi-ai Usage). */
export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cacheWrite1h?: number;
	reasoning?: number;
	total?: number;
	/** Serialized total cost contribution, when the model catalog carries prices. */
	cost?: number;
}

// ---------------------------------------------------------------------------
// Workspace filesystem + git (P2b): read-only observation surfaces.
// The daemon is the authority; clients poll via commands and subscribe to
// `workspace.fs.changed` for invalidation.
// ---------------------------------------------------------------------------

/** One entry of a directory listing. */
export interface FsEntryInfo {
	/** Relative path from the workspace root, POSIX separators. */
	path: string;
	name: string;
	kind: "file" | "dir" | "symlink";
	/** Bytes for files (0 for dirs); null when unavailable (permission etc.). */
	size: number | null;
	/** ISO-8601 mtime when available. */
	modifiedAt: string | null;
}

/** Read result for one text file. Binary files return text: null. */
export interface FsReadResult {
	path: string;
	/** Decoded UTF-8 text, or null for binary / oversized files. */
	text: string | null;
	/** Raw size in bytes. */
	bytes: number;
	truncated: boolean;
	/** True when the file looked binary (NUL byte in the first 8 KiB). */
	binary: boolean;
}

/** git status porcelain entry (v1) mapped to a stable shape. */
export interface GitStatusEntry {
	path: string;
	/** Rename destination when the status line carries one. */
	origPath?: string;
	/** Staged (index) status letter, lowercase when unchanged. */
	index: string;
	/** Working-tree status letter, lowercase when unchanged. */
	worktree: string;
	/** true when either side is untracked ('?'). */
	untracked: boolean;
}

/** One changed file with its patch (unified diff body, may be empty for binaries). */
export interface GitDiffFile {
	path: string;
	/** Change kind derived from the status letters. */
	change: "added" | "deleted" | "modified" | "renamed" | "untracked" | "copied";
	origPath?: string;
	/** Unified diff hunks for this file (without the `diff --git` header). */
	patch: string;
	binary: boolean;
}

/** Working-tree status summary for a workspace repo. */
export interface GitStatusResult {
	/** Repo root absolute path; null when the workspace is not a git repo. */
	repoRoot: string | null;
	branch: string | null;
	/** Commits ahead/behind of upstream when an upstream is configured. */
	upstream: { ahead: number; behind: number } | null;
	entries: GitStatusEntry[];
}

// ---------------------------------------------------------------------------
// Resources (P2c): packages, skills, extensions — Pi's four resource buckets
// via the DefaultPackageManager / resourceLoader surfaces.
// ---------------------------------------------------------------------------

/** One configured package (settings.packages entry) with resolve status. */
export interface PackageInfo {
	/** npm spec, git url or local path (exactly as configured). */
	source: string;
	scope: "user" | "project";
	/** True when project scope is untrusted and the package is filtered out. */
	filtered: boolean;
	/** Install root on disk when resolved; null when missing (needs install). */
	installedPath: string | null;
}

/** One skill loaded for a session (pi core/skills.ts Skill). */
export interface SkillInfo {
	name: string;
	description?: string;
	/** Absolute file path on the daemon host (for opt-in full reads). */
	filePath: string;
	/** Where it came from (global agentDir, project .pi/skills, package…). */
	origin: string;
	disableModelInvocation: boolean;
}

/** One loaded extension (pi resourceLoader getExtensions). */
export interface ExtensionInfo {
	name: string;
	/** Entry path or builtin:<name>. */
	path: string;
	builtin: boolean;
	/** Package / directory origin label when known. */
	origin?: string;
}

/** Context window occupancy (mirror of pi ContextUsage). */
export interface ContextUsage {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
}

// ---------------------------------------------------------------------------
// Session entries (mirror of pi SessionEntry JSONL records).
// Entries are append-only tree nodes: `id` + `parentId` define the tree.
// ---------------------------------------------------------------------------

export interface EntryBase {
	id: string;
	parentId: string | null;
	/** ISO-8601 timestamp (same string format as Pi JSONL). */
	timestamp: string;
}

export interface MessageEntry extends EntryBase {
	type: "message";
	message: AgentMessage;
	extra?: Record<string, unknown>;
}
export interface ModelChangeEntry extends EntryBase {
	type: "model_change";
	provider: string;
	modelId: string;
}
export interface ThinkingLevelChangeEntry extends EntryBase {
	type: "thinking_level_change";
	level: ThinkingLevel;
}
export interface UsageEntry extends EntryBase {
	type: "usage";
	/** Usage category, e.g. "main" or "cache_warm". */
	kind: string;
	provider: string;
	model: string;
	usage: Usage;
}
export interface SessionInfoEntry extends EntryBase {
	type: "session_info";
	name?: string;
}
export interface LabelEntry extends EntryBase {
	type: "label";
	label: string;
}
/** Compaction, branch summary, context edit, custom and future kinds are opaque to the protocol. */
export interface OpaqueEntry extends EntryBase {
	type: string; // "compaction" | "branch_summary" | "context_edit" | "custom" | "custom_message" | <future>
	data: Record<string, unknown>;
}

export type SessionEntry =
	| MessageEntry
	| ModelChangeEntry
	| ThinkingLevelChangeEntry
	| UsageEntry
	| SessionInfoEntry
	| LabelEntry
	| OpaqueEntry;

// --- type guards: TS consumers narrow the SessionEntry union -------

/**
 * Narrow a SessionEntry to MessageEntry. Runtime-safe: the daemon's adapter
 * produces OpaqueEntry only for entry kinds outside the modeled set.
 */
export function isMessageEntry(entry: SessionEntry): entry is MessageEntry {
	return entry.type === "message";
}
