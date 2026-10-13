/**
 * Capability negotiation (architecture.md §5.2).
 *
 * Capabilities are additive strings. A daemon that does not know a cap simply
 * does not emit payloads guarded by it; a client that does not know a cap
 * ignores it. Removing/renaming a cap requires a protocol version bump.
 */

/** Capabilities a *client* may declare in its Hello. */
export const CLIENT_CAPS = [
	/** Understands session-tree sync (snapshot + entry.appended + leaf.changed). */
	"treeSync",
	/** Renders extension UI (dialogs, widgets, status lines). */
	"extWidgets",
	/** Understands typed widget payloads (P2). */
	"typedWidgets",
	/** Accepts binary frames on the same socket (P2). */
	"binaryFrames",
	/** Accepts file-transfer channel (P2). */
	"fileTransfer",
	// NOTE: no "terminal" capability — removed by ADR-0004 (no terminal
	// channel; tool output rides session events, user shells stay in TUI).
] as const;

export type ClientCapability = (typeof CLIENT_CAPS)[number];

/** Capabilities a *daemon* may declare in its HelloAck. */
export const DAEMON_CAPS = [...CLIENT_CAPS] as const;

export type DaemonCapability = (typeof DAEMON_CAPS)[number];

export function isKnownClientCap(value: unknown): value is ClientCapability {
	return (CLIENT_CAPS as readonly string[]).includes(value as string);
}

/** Negotiate the effective capability set: the intersection of both sides. */
export function negotiateCapabilities(
	client: readonly string[],
	daemon: readonly string[],
): ClientCapability[] {
	const daemonSet = new Set<string>(daemon);
	return client.filter(isKnownClientCap).filter((cap) => daemonSet.has(cap));
}
