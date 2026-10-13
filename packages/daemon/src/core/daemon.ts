/**
 * Daemon core: session registry, event fan-out, presentation lock basics,
 * and workspaces. The WS layer (server/) owns transport concerns.
 */

import { existsSync } from "node:fs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionListItem, WorkspaceInfo } from "@pie/protocol";
import { HostSession, HostSessionError, type HostSessionOptions } from "./host-session.js";
import type { WireEvent } from "../pi/events.js";

export interface EmitToConnections {
	(event: WireEvent, subscribersFilter: (connectionId: string, subscribed: Set<string>) => boolean): void;
}

export interface DaemonDeps {
	agentDir?: string;
	/** Fan a session-scoped wire event to subscribed connections. */
	emitToConnections: EmitToConnections;
}

function makeNoopEmit(): HostSessionOptions["emit"] {
	// Overwritten in openSession before construction; sessions created before
	// any connection exists simply drop their events (nothing to fan out yet).
	return () => {};
}

export class SessionRegistry {
	private sessions = new Map<string, HostSession>();
	private workspaces = new Set<string>();
	/** Default emit binding handed to freshly-opened sessions. */
	private currentEmit: HostSessionOptions["emit"] = makeNoopEmit();

	constructor(private readonly deps: DaemonDeps) {}

	get open(): HostSession[] {
		return [...this.sessions.values()];
	}

	get size(): number {
		return this.sessions.size;
	}

	get(sessionId: string): HostSession | undefined {
		return this.sessions.get(sessionId);
	}

	hasWriter(sessionId: string): boolean {
		return this.sessions.get(sessionId)?.writerConnection != null;
	}

	rememberWorkspace(path: string): void {
		this.workspaces.add(path);
	}

	/** Create a new (or continue/open/branch) session in a workspace. */
	async openSession(opts: {
		cwd?: string;
		mode: HostSessionOptions["mode"];
		sessionPath?: string;
		parentSessionPath?: string;
		emit?: HostSessionOptions["emit"];
		permissionMode?: HostSessionOptions["permissionMode"];
		permissionTimeoutMs?: number;
	}): Promise<HostSession> {
		if (opts.cwd) this.rememberWorkspace(opts.cwd);
		this.currentEmit = opts.emit ?? this.currentEmit;
		const host = await HostSession.open({
			cwd: opts.cwd,
			agentDir: this.deps.agentDir,
			mode: opts.mode,
			sessionPath: opts.sessionPath,
			parentSessionPath: opts.parentSessionPath,
			emit: (ev) => opts.emit?.(ev),
			permissionMode: opts.permissionMode,
			permissionTimeoutMs: opts.permissionTimeoutMs,
		});
		this.sessions.set(host.sessionId, host);
		return host;
	}

	/**
	 * Fork a daemon-held session at an entry (runtime.fork semantics, without
	 * replacing the source session: the daemon keeps both open).
	 *
	 * position "at": the new session's leaf is `entryId` (branch starting there);
	 * position "before": `entryId` must be a user message, the branch starts at
	 * its parent and the message text is returned for the composer.
	 */
	async forkSession(
		sessionId: string,
		entryId: string,
		position: "at" | "before",
		opts: { permissionMode?: HostSessionOptions["permissionMode"]; permissionTimeoutMs?: number },
	): Promise<{ sessionId: string; sessionFile?: string; selectedText?: string }> {
		const host = this.sessions.get(sessionId);
		if (!host) throw new HostSessionError(`Session not open: ${sessionId}`, "not_found");
		if (host.session.isStreaming) {
			throw new HostSessionError("Wait for the current response before forking", "session_streaming");
		}
		const sourceFile = host.sessionFile;
		if (!sourceFile || !existsSync(sourceFile)) {
			throw new HostSessionError(
				"This session has not been saved yet. Send a message before forking it.",
			"pi_error",
			);
		}

		const sourceManager = SessionManager.open(sourceFile, host.session.sessionManager.getSessionDir());
		const entry = sourceManager.getEntry(entryId);
		if (!entry) throw new HostSessionError(`Entry not found: ${entryId}`, "not_found");

		let targetLeafId: string | null;
		let forkPath: string | undefined;
		let forkMode: "open" | "branch";
		if (position === "at") {
			targetLeafId = entry.id;
			forkPath = sourceManager.createBranchedSession(targetLeafId);
			if (!forkPath) throw new HostSessionError("Failed to create forked session", "pi_error");
			forkMode = "open";
		} else {
			if (entry.type !== "message" || entry.message.role !== "user") {
				throw new HostSessionError("position=before requires a user message entry", "invalid_args");
			}
			targetLeafId = entry.parentId;
			if (targetLeafId) {
				forkPath = sourceManager.createBranchedSession(targetLeafId);
				if (!forkPath) throw new HostSessionError("Failed to create forked session", "pi_error");
				forkMode = "open";
			} else {
				// Fork before the very first entry: a fresh session recording the
				// source as parent (lazy file, runtime.fork parity).
				forkMode = "branch";
			}
		}

		const forkEmit = this.currentEmit;
		const forked = await this.openSession({
			cwd: sourceManager.getCwd(),
			mode: forkMode,
			sessionPath: forkMode === "open" ? forkPath : undefined,
			parentSessionPath: sourceFile,
			emit: (ev) => forkEmit(ev),
			permissionMode: opts.permissionMode,
			permissionTimeoutMs: opts.permissionTimeoutMs,
		});
		return {
			sessionId: forked.sessionId,
			sessionFile: forked.sessionFile,
		};
	}

	close(sessionId: string): boolean {
		const host = this.sessions.get(sessionId);
		if (!host) return false;
		host.dispose();
		this.sessions.delete(sessionId);
		return true;
	}

	/**
	 * Read-only session listing for a workspace. Lists both daemon-held
	 * sessions and Pi JSONL files on disk (same storage as `pi` TUI/CLI).
	 *
	 * Note: Pi flushes a session file lazily — a session created but with no
	 * appended entries yet has no file on disk — so the registry-held sessions
	 * are merged in explicitly.
	 */
	async listSessions(workspaceId: string): Promise<SessionListItem[]> {
		const infos = await SessionManager.list(workspaceId);
		const items: SessionListItem[] = infos.map((info) => {
			const host = this.sessions.get(info.id);
			return {
				sessionId: info.id,
				path: info.path,
				workspaceId,
				name: info.name,
				created: info.created.toISOString(),
				modified: info.modified.toISOString(),
				messageCount: info.messageCount,
				firstMessage: info.firstMessage,
				parentSessionPath: info.parentSessionPath,
				open: Boolean(host),
				pending: Boolean(host?.session.isStreaming),
			};
		});
		for (const host of this.sessions.values()) {
			if (host.cwd !== workspaceId) continue;
			if (items.some((item) => item.sessionId === host.sessionId)) continue;
			items.push({
				sessionId: host.sessionId,
				path: host.sessionFile ?? "",
				workspaceId,
				name: host.session.sessionName,
				created: new Date().toISOString(),
				modified: new Date().toISOString(),
				messageCount: host.session.messages.length,
				firstMessage: "（新会话，未落盘）",
				parentSessionPath: undefined,
				open: true,
				pending: host.session.isStreaming,
			});
		}
		return items;
	}

	workspacesInfo(): WorkspaceInfo[] {
		return [...this.workspaces].map((path) => ({
			workspaceId: path,
			path,
			name: path.split("/").filter(Boolean).pop() ?? path,
		}));
	}
}
