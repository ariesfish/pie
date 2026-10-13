/**
 * Stable identifier types used across the wire.
 *
 * All IDs are plain strings on the wire. These aliases exist for readability
 * and to keep the origin of an ID obvious at call sites.
 */

/** Daemon instance identity (stable across restarts of the same install). */
export type ServerId = string;
/** Normalized workspace (project cwd) identity. See architecture.md §5.3. */
export type WorkspaceId = string;
/** Pi session id (the JSONL session identity, shared with `pi` TUI/CLI). */
export type SessionId = string;
/** Pi entry id (a node in the session tree). */
export type EntryId = string;
/** Correlation id for daemon->client interactive requests (dialogs, permissions). */
export type RequestId = string;
/** Client command correlation id. */
export type CommandId = string;

let counter = 0;

/** Generate a new id with an optional short prefix (unique within this process). */
export function newId(prefix = "id"): string {
	counter = (counter + 1) % 1_000_000;
	return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
