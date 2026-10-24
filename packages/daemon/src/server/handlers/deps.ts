import type { EventName } from "@pie/protocol";
import type { SessionRegistry } from "../../core/daemon.js";
import type { HostSession } from "../../core/host-session.js";
import type { FsService } from "../../services/fs-service.js";
import type { GitService } from "../../services/git-service.js";
import type { PackageService } from "../../services/package-service.js";
import type { ConfigService } from "../../services/config-service.js";
import type { PermissionMode } from "../../pi/permissions.js";

/** One session-scoped wire event (the server adds no envelope here). */
export interface SessionEvent {
	ev: EventName;
	data: unknown;
}

/**
 * Everything a command domain needs from the server. The server keeps
 * transport/lifecycle; modules only see services, registry and fan-out.
 */
export interface HandlerDeps {
	registry: SessionRegistry;
	fsService: FsService;
	gitService: GitService;
	packageService: PackageService;
	configService: ConfigService;
	piVersion: string;
	piAgentDir: string;
	permissionMode?: PermissionMode;
	permissionTimeoutMs?: number;
	attachedClients: () => number;
	broadcast: (sessionId: string, ev: EventName, data: unknown) => void;
	forwardBySession: (ev: SessionEvent) => void;
	getCatalogRuntime: () => Promise<(() => ReturnType<HostSession["models"]>) | null>;
}
