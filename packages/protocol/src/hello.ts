import type { ClientCapability, DaemonCapability } from "./capabilities.js";
import { PROTOCOL_VERSION } from "./version.js";

/** Where a client runs; affects default UI affordances, not protocol behavior. */
export type ClientKind = "app" | "desktop" | "cli" | "web";

export interface ClientInfo {
	kind: ClientKind;
	version: string;
	/** e.g. "ios", "android", "macos", "linux", "windows", "browser" */
	platform: string;
}

/** Handshake a client sends as its first frame. */
export interface Hello {
	v: number;
	client: ClientInfo;
	caps?: ClientCapability[];
	auth: { method: "token"; token: string };
}

/** Daemon response to a successful Hello. */
export interface HelloAck {
	v: number;
	serverId: string;
	daemon: { version: string; hostname: string; os: string };
	/** Pi SDK runtime the daemon embeds. */
	pi: { version: string; agentDir: string };
	caps?: DaemonCapability[];
	/** The seq the event stream starts at for this connection (see sync). */
	eventSeq: number;
}

/** Terminal frame the daemon sends on unrecoverable handshake failure, then closes. */
export interface FatalError {
	code: "version_mismatch" | "auth_failed" | string;
	message: string;
	minV?: number;
	maxV?: number;
}

/** The protocol version this build speaks. Re-exported for convenience. */
export { PROTOCOL_VERSION };
