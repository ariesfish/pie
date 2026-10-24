/** Wire error codes. Codes are stable strings; clients must match on code, not message. */
export const ErrorCodes = {
	/** Protocol version mismatch. Connection is closed after this. */
	versionMismatch: "version_mismatch",
	/** Authentication failed (bad or missing token). */
	authFailed: "auth_failed",
	/** Unknown command name. */
	unknownCommand: "unknown_command",
	/** Command exists but arguments failed validation. */
	invalidArgs: "invalid_args",
	/** Session (or other resource) not found. */
	notFound: "not_found",
	/** Session exists but is held by another writer (see architecture.md §5.7 attachment lock). */
	presentationReadonly: "presentation_readonly",
	/** Command requires an idle session but it is streaming. */
	sessionStreaming: "session_streaming",
	/** Command requires idle but compaction is running. */
	sessionCompacting: "session_compacting",
	/** Write policy requires choosing steer or followUp explicitly. */
	steerOrFollowRequired: "steer_or_follow_required",
	/** Interactive request (dialog/permission) not found or already settled. */
	requestNotFound: "request_not_found",
	/** Not implemented in this daemon version (P1+ surface). */
	notImplemented: "not_implemented",
	/** Error raised upstream by the Pi SDK. */
	piError: "pi_error",
	/** Config file changed between read and write. */
	configConflict: "config_conflict",
	/** Config JSON/schema rejected by the daemon. */
	configInvalid: "config_invalid",
	/** Config payload exceeds the daemon cap. */
	configTooLarge: "config_too_large",
	/** Structured edit would discard comments/trailing commas. */
	configComments: "config_comments",
	/** Unexpected internal error. */
	internal: "internal",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export interface WireError {
	code: ErrorCode | (string & {});
	message: string;
	/** When true, the same command may succeed after the user changes state (e.g. waits for idle). */
	retryable?: boolean;
	/** Additional machine-readable details when available. */
	details?: Record<string, unknown>;
}
