/**
 * Command catalog (architecture.md §5.5). P1 surface, fully typed.
 *
 * Every command maps to a Pi SDK API — see the `maps to` comments; the daemon
 * must not invent a second semantics (ADR-0001). Commands marked `P2` are
 * declared now so clients can code against them, but may return
 * `notImplemented` from the P0 daemon.
 */

import type { EntryId, RequestId, SessionId, WorkspaceId } from "./ids.js";
import type { SessionSnapshot } from "./tree.js";
import type { ContextUsage, FileVersionInfo, FsEntryInfo, FsReadResult, FsWriteResult, GitDiffFile, GitStatusResult, ModelCatalogItem, ModelRef, PackageInfo, ScopedModel, SessionEntry, SkillInfo, ThinkingLevel } from "./values.js";

/** User-editable Pi config files; auth.json is intentionally excluded. */
export const CONFIG_FILES = ["settings", "models", "mcp"] as const;
export type ConfigFile = (typeof CONFIG_FILES)[number];

export interface ModelProviderModelDraft {
	id: string;
	name?: string;
	contextWindow?: number;
	maxTokens?: number;
}

export interface ModelProviderDraft {
	id: string;
	name?: string;
	baseUrl?: string;
	api?: string;
	/** Omitted = keep the current key; empty string = clear it. */
	apiKey?: string;
	models: ModelProviderModelDraft[];
}

export interface ConfigFileInfo {
	file: ConfigFile;
	path: string;
	exists: boolean;
	revision: string;
}

export interface CommandMap {
	// --- daemon -------------------------------------------------------------------
	/** Daemon health + versions. */
	"daemon.status": {
		args: Record<string, never>;
		result: {
			version: string;
			serverId: string;
			pi: { version: string; agentDir: string };
			uptimeMs: number;
			attachedClients: number;
			openSessions: number;
		};
	};
	/** Replay missed events after a reconnect (ADR-0001: ring buffer, 2h/10k). */
	sync: {
		args: { sinceSeq: number };
		result: { replayed: boolean; resumedAtSeq: number };
	};

	// --- workspaces ------------------------------------------------------------------
	/** Known workspaces (derived from session history on the host). */
	"workspace.list": {
		args: Record<string, never>;
		result: { workspaces: WorkspaceInfo[] };
	};
	/** Pi config files readable/writable through the daemon (no auth secrets). */
	"config.overview": {
		args: Record<string, never>;
		result: {
			agentDir: string;
			files: Record<ConfigFile, ConfigFileInfo>;
			authProviders: string[];
			settings: {
				defaultProvider?: string;
				defaultModel?: string;
				defaultThinkingLevel?: string;
				theme?: string;
				defaultProjectTrust?: string;
			};
			models: {
				providers: string[];
				details: Array<{
					id: string;
					name?: string;
					baseUrl?: string;
					api?: string;
					modelCount: number;
					hasApiKey: boolean;
					models: ModelProviderModelDraft[];
				}>;
			};
			mcp: { servers: string[] };
			errors?: Partial<Record<ConfigFile, string>>;
		};
	};
	"config.read": {
		args: { file: ConfigFile };
		result: ConfigFileInfo & { content: string };
	};
	"config.write": {
		args: { file: ConfigFile; content: string; expectedRevision?: string };
		result: { file: ConfigFile; revision: string };
	};
	"config.models.upsertProvider": {
		args: { draft: ModelProviderDraft; expectedRevision?: string };
		result: { revision: string };
	};
	"config.models.removeProvider": {
		args: { providerId: string; expectedRevision?: string };
		result: { revision: string };
	};
	"config.models.setDefault": {
		args: { provider: string; model: string; expectedRevision?: string };
		result: { revision: string };
	};

	/** Track a workspace and (re)check project trust. */
	"workspace.open": {
		args: { path: string };
		result: { workspaceId: WorkspaceId; path: string; trusted: boolean | null; name: string };
	};
	/** Git sub-repos directly under a workspace (project candidates for
	 *  session creation and session grouping). */
	"workspace.projects": {
		args: { workspaceId: WorkspaceId };
		result: {
			projects: Array<{
				/** Absolute project path — also a valid session.create cwd. */
				path: string;
				name: string;
			}>;
		};
	};

	// --- workspace filesystem (P2b, read-only observation) ------------------------------
	/** List a directory of an open workspace (one level, sorted). */
	"fs.list": {
		args: { workspaceId: WorkspaceId; path?: string };
		result: { entries: FsEntryInfo[] };
	};
	/** Read one text file (size-capped, binary-safe) with its version (ADR-0006). */
	"fs.read": {
		args: { workspaceId: WorkspaceId; path: string; maxBytes?: number };
		result: FsReadResult;
	};
	/**
	 * Write one text file (whole-file replace; size-capped, atomic write).
	 * Optimistic concurrency (ADR-0006): when `expectedRevision` (or
	 * `expectedModifiedAt` as the degraded token) is given, the write only
	 * lands if the file still matches; otherwise `conflict` comes back with
	 * the current on-disk version. Both omitted = unconditional write.
	 */
	"fs.write": {
		args: {
			workspaceId: WorkspaceId;
			path: string;
			content: string;
			expectedModifiedAt?: string;
			expectedRevision?: string;
		};
		result: FsWriteResult;
	};
	/** Start the workspace file watcher (idempotent per workspace). */
	"fs.watch": {
		args: { workspaceId: WorkspaceId };
		result: { watchId: string };
	};
	/** Stop a watcher. */
	"fs.unwatch": {
		args: { watchId: string };
		result: Record<string, never>;
	};

	// --- workspace git (P2b, read-only observation) -------------------------------------
	/** `git status` mapped to a stable shape; non-repos return repoRoot: null. */
	"git.status": {
		args: { workspaceId: WorkspaceId };
		result: GitStatusResult;
	};
	/** Working-tree diff vs HEAD (unstaged first, then staged; untracked get
	 *  patch text only when `includeUntracked`), for one path or all files. */
	"git.diff": {
		args: {
			workspaceId: WorkspaceId;
			path?: string;
			/** Stage-inclusive diff (HEAD vs working tree). */
			staged?: boolean;
			/** Emit untracked files as additions (slower: implies content reads). */
			includeUntracked?: boolean;
		};
		result: { files: GitDiffFile[] };
	};

	// --- packages (P2c; pi DefaultPackageManager) ---------------------------------------
	/** Configured packages with resolve status (pi `pi list`). */
	"packages.list": {
		args: { workspaceId: WorkspaceId };
		result: { packages: PackageInfo[] };
	};
	/**
	 * Install a package source (npm spec / git url / local path) and persist to
	 * settings (pi `pi install`). `project` scopes to .pi/settings project settings.
	 */
	"packages.install": {
		args: { workspaceId: WorkspaceId; source: string; project?: boolean };
		result: { source: string };
	};
	/** Remove a configured package (pi `pi remove`). */
	"packages.remove": {
		args: { workspaceId: WorkspaceId; source: string; project?: boolean };
		result: { removed: boolean };
	};
	/** Update one package (or all, when source omitted) (pi `pi update`). */
	"packages.update": {
		args: { workspaceId: WorkspaceId; source?: string };
		result: { updated: true };
	};

	// --- skills (P2c; pi resourceLoader skills) ------------------------------------------
	/** Skills loaded for a session (global + project + package-provided). */
	"skills.list": {
		args: { sessionId: SessionId };
		result: { skills: SkillInfo[] };
	};
	/** Full markdown body of one loaded skill (path must match skills.list). */
	"skills.read": {
		args: { sessionId: SessionId; filePath: string };
		result: { content: string };
	};

	// --- sessions ----------------------------------------------------------------------
	/** Sessions known for a workspace (Pi SessionManager.list). */
	"session.list": {
		/** recursive: include sessions whose project cwd lives under the
		 *  workspace (sub-repos), not just at the workspace root. */
		args: { workspaceId: WorkspaceId; recursive?: boolean };
		result: { sessions: SessionListItem[] };
	};
	/** Create a new session in a workspace. */
	"session.create": {
		args: {
			workspaceId: WorkspaceId;
			model?: ModelRef;
			thinkingLevel?: ThinkingLevel;
			name?: string;
		};
		result: { sessionId: SessionId; sessionFile?: string };
	};
	/** Open (or attach to) a session to receive a snapshot + live events. */
	"session.attach": {
		args: {
			sessionId: SessionId;
			/** When the daemon does not hold this session: open it from this JSONL path. */
			path?: string;
			as?: "readwrite" | "readonly";
		};
		result: {
			sessionId: SessionId;
			presentation: "readwrite" | "readonly";
			leafId: EntryId | null;
			runState: "idle" | "streaming" | "compacting" | "retrying";
		};
	};
	/** Stop receiving events; session keeps running. */
	"session.detach": {
		args: { sessionId: SessionId };
		result: Record<string, never>;
	};
	/** Whole-session tree metadata (id/parentId/label pairs) + active leaf. */
	"session.tree": {
		args: { sessionId: SessionId };
		result: { tree: import("./tree.js").TreeNodeMeta[]; leafId: EntryId | null };
	};
	/**
	 * One page of entries along root -> given leaf (defaults to the active
	 * leaf). `before` is exclusive: pass the previous page's `nextCursor`
	 * to walk backwards; `limit` is clamped by the daemon.
	 */
	"session.entries": {
		args: { sessionId: SessionId; leafId?: EntryId; before?: EntryId; limit?: number };
		result: {
			entries: SessionEntry[];
			leafId: EntryId;
			hasMore: boolean;
			nextCursor: EntryId | null;
		};
	};

	// --- input ---------------------------------------------------------------------------
	/**
	 * Send a prompt. `delivery`:
	 * - "auto": steer/followUp decided by streaming state (rejected with
	 *   steerOrFollowRequired when streaming so the client can ask — mirrors the
	 *   SDK's refuse-to-guess rule).
	 * - "steer" | "followUp": explicit queue choice while streaming.
	 */
	"session.prompt": {
		args: {
			sessionId: SessionId;
			message: string;
			images?: { data: string; mimeType: string }[];
			delivery: "auto" | "steer" | "followUp";
		};
		result: { disposition: "started" | "queued" | "handled" };
	};
	"session.steer": {
		args: { sessionId: SessionId; message: string; images?: { data: string; mimeType: string }[] };
		result: { disposition: "queued" | "handled" };
	};
	"session.followUp": {
		args: { sessionId: SessionId; message: string; images?: { data: string; mimeType: string }[] };
		result: { disposition: "queued" | "handled" };
	};
	"session.abort": {
		args: { sessionId: SessionId };
		result: Record<string, never>;
	};
	"session.queue.clear": {
		args: { sessionId: SessionId };
		result: { steering: string[]; followUp: string[] };
	};

	// --- models & thinking ------------------------------------------------------------------
	"models.list": {
		args: { workspaceId: WorkspaceId };
		result: { models: ModelCatalogItem[] };
	};
	"model.set": {
		args: { sessionId: SessionId; model: ModelRef; thinkingLevel?: ThinkingLevel; persist?: boolean };
		result: { model: ModelRef; thinkingLevel?: ThinkingLevel };
	};
	"thinking.set": {
		args: { sessionId: SessionId; level: ThinkingLevel; persist?: boolean };
		result: Record<string, never>;
	};
	"scope.set": {
		args: { sessionId: SessionId; scoped: ScopedModel[] };
		result: Record<string, never>;
	};

	// --- context management ------------------------------------------------------------------
	"compaction.run": {
		args: { sessionId: SessionId; customInstructions?: string };
		result: Record<string, unknown>;
	};
	"compaction.setAuto": {
		args: { sessionId: SessionId; enabled: boolean };
		result: Record<string, never>;
	};
	"session.stats": {
		args: { sessionId: SessionId };
		result: {
			sessionId: SessionId;
			userMessages: number;
			assistantMessages: number;
			toolCalls: number;
			toolResults: number;
			totalMessages: number;
			tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
			contextUsage?: ContextUsage;
		};
	};

	// --- tree operations ------------------------------------------------------------------------
	/** Fork at an entry (new session file, Pi fork semantics). */
	"session.forkAt": {
		args: { sessionId: SessionId; entryId: EntryId; position?: "at" | "before" };
		result: { sessionId: SessionId; sessionFile?: string; selectedText?: string };
	};
	/** Preview the messages that a fork at `entryId` would show. */
	"session.forkPreview": {
		args: { sessionId: SessionId; entryId?: EntryId };
		result: { items: Array<{ entryId: EntryId; text: string }> };
	};
	/** Navigate (rewind) within the same session file. Streaming sessions reject. */
	"session.navigate": {
		args: { sessionId: SessionId; entryId: EntryId; summarize?: boolean; label?: string };
		result: { cancelled: boolean };
	};

	// --- misc session ops --------------------------------------------------------------------------
	/** Rename a session's display name. `name` semantics: empty or
	 *  whitespace-only string = explicit clear (name removed, list falls back
	 *  to the first-message snippet). Works for open and on-disk sessions. */
	"session.rename": {
		args: { sessionId: SessionId; name: string };
		result: Record<string, never>;
	};
	"session.exportHtml": {
		args: { sessionId: SessionId; outputPath?: string };
		result: { path: string };
	};
	"retry.abort": {
		args: { sessionId: SessionId };
		result: Record<string, never>;
	};
	"bash.abort": {
		args: { sessionId: SessionId };
		result: Record<string, never>;
	};

	// --- resources (P1: read-only overview; P2: management) ------------------------------------------
	"resources.overview": {
		args: { workspaceId?: WorkspaceId };
		result: {
			extensions: Array<{
				name: string;
				builtin: boolean;
				path: string;
			}>;
			commands: Array<{ name: string; description?: string; source: "extension" | "prompt" | "skill" }>;
			skills: Array<{ name: string; description?: string }>;
			promptTemplates: Array<{ name: string; description?: string }>;
		};
	};
	"commands.list": {
		args: { workspaceId: WorkspaceId };
		result: {
			commands: Array<{
				name: string;
				description?: string;
				source: "extension" | "prompt" | "skill";
			}>;
		};
	};

	// --- interactive responses (dialogs / permissions) -------------------------------------------------
	"ext.dialog.respond": {
		args: {
			requestId: RequestId;
			value?: string;
			confirmed?: boolean;
			cancelled?: boolean;
		};
		result: Record<string, never>;
	};
	"permission.respond": {
		args: {
			requestId: RequestId;
			decision: "allow" | "allowSession" | "deny";
		};
		result: Record<string, never>;
	};
	/** Batch settlement: settle many pending permission requests with one decision.
	 * Unknown/expired ids are reported, not errored (single respond keeps its
	 * request_not_found error for compat). */
	"permission.respondMany": {
		args: {
			requestIds: RequestId[];
			decision: "allow" | "allowSession" | "deny";
		};
		result: {
			settled: RequestId[];
			unknown: RequestId[];
		};
	};
}

export type CommandName = keyof CommandMap;
export type CommandArgs<C extends CommandName> = CommandMap[C]["args"];
export type CommandResult<C extends CommandName> = CommandMap[C]["result"];

export type AnyCommandArgs = { [C in CommandName]: { cmd: C; args: CommandArgs<C> } }[CommandName];

// --- shared result item shapes -------------------------------------------------------------------

export interface WorkspaceInfo {
	workspaceId: WorkspaceId;
	/** Absolute path on the daemon host. */
	path: string;
	name: string;
	sessionCount?: number;
	lastActiveAt?: string;
}

export interface SessionListItem {
	sessionId: SessionId;
	/** Session JSONL path (used by attach/fork/switch). */
	path: string;
	workspaceId: WorkspaceId;
	name?: string;
	created: string;
	modified: string;
	messageCount: number;
	firstMessage: string;
	parentSessionPath?: string;
	/** Whether this daemon currently holds the session open. */
	open: boolean;
	pending?: boolean;
}

// Re-export for convenience of command implementers.
export type { SessionSnapshot };
