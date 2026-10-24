/**
 * Daemon server: HTTP (demo page) + WebSocket (wire protocol), hello/auth,
 * event fan-out with per-connection sequencing, and the P0 command surface.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { WebSocketServer, type WebSocket } from "ws";
import {
	type ClientCapability,
	type CommandId,
	ErrorCodes,
	type EventName,
	PROTOCOL_VERSION,
	parseClientPacket,
} from "@pie/protocol";
import { DAEMON_VERSION } from "../version.js";
import type { PermissionMode } from "../pi/permissions.js";
import { SessionRegistry } from "../core/daemon.js";
import { FsService } from "../services/fs-service.js";
import { GitService } from "../services/git-service.js";
import { PackageService } from "../services/package-service.js";
import { ConfigService } from "../services/config-service.js";
import { HostSession, HostSessionError } from "../core/host-session.js";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { mapModelCatalog } from "../pi/adapter.js";
import { ClientConnection } from "./connection.js";
import { CommandRouter, type CommandContext } from "./commands.js";
import { registerPermissionCommands } from "./handlers/permissions.js";
import { registerResourceCommands } from "./handlers/resources.js";
import { registerSessionCommands } from "./handlers/session.js";
import { registerSystemCommands } from "./handlers/system.js";
import { registerWorkspaceCommands } from "./handlers/workspace.js";
import { registerConfigCommands } from "./handlers/config.js";
import type { HandlerDeps, SessionEvent } from "./handlers/deps.js";

export interface DaemonServerOptions {
	listenHost: string;
	listenPort: number;
	token: string;
	agentDir?: string;
	servePage: boolean;
	/** Pi SDK version reported in helloAck. */
	piVersion: string;
	/** Pi agent dir reported in helloAck. */
	piAgentDir: string;
	/** Permission card policy. Default: "off" (Pi TUI parity). */
	permissionMode?: PermissionMode;
	/** Permission card timeout ms. Default 10 min. */
	permissionTimeoutMs?: number;
}

export class DaemonServer {
	readonly registry: SessionRegistry;
	readonly router = new CommandRouter();
	/** Last summary broadcast per session (session.summary.updated dedup). */
	private lastSummary = new Map<string, string>();
	/** Lazy no-session catalog runtime (models.list P1 fallback). */
	private catalogRuntime?: Promise<(() => ReturnType<HostSession["models"]>) | null>;
	readonly fsService = new FsService();
	readonly gitService = new GitService();
	readonly packageService = new PackageService();
	private connections = new Map<string, ClientConnection>();
	private wss?: WebSocketServer;
	private startedAt = Date.now();
	readonly serverId = `srv-${DAEMON_VERSION}-${Date.now().toString(36)}`;

	/** Agent-dir-backed model catalog for callers with no open session. */
	private async getCatalogRuntime(): Promise<(() => ReturnType<HostSession["models"]>) | null> {
		const agentDir = this.opts.agentDir;
		if (!agentDir) return null;
		this.catalogRuntime ??= (async () => {
			try {
				const runtime = await ModelRuntime.create({
					authPath: join(agentDir, "auth.json"),
					modelsStorePath: join(agentDir, "models-store.json"),
					refreshOnCreate: false,
				});
				return () =>
					runtime.getAvailableSnapshot().map((m) =>
						mapModelCatalog(m as unknown as Parameters<typeof mapModelCatalog>[0]),
					);
			} catch (err) {
				console.error("[models.list] catalog runtime unavailable:", err);
				return null;
			}
		})();
		return this.catalogRuntime;
	}

	constructor(private readonly opts: DaemonServerOptions) {
		this.registry = new SessionRegistry({
			agentDir: opts.agentDir,
			emitToConnections: (event, filter) => {
				for (const conn of this.connections.values()) {
					if (filter(conn.id, conn.subscribed)) conn.assignSeqAndSend(event.ev, event.data);
				}
			},
		});
		this.fsService.setBroadcaster((ev, data, workspaceId) => {
			for (const conn of this.connections.values()) {
				if (conn.subscribed.has(workspaceId)) conn.assignSeqAndSend(ev, data);
			}
		});
		this.registerHandlers();
	}

	/** Start HTTP+WS. Resolves when listening. */
	async start(): Promise<{ host: string; port: number }> {
		const http = createServer((req, res) => {
			if (this.opts.servePage && req.url && isPageRequest(req.url)) {
				try {
					const html = readFileSync(join(this.publicDir(), "index.html"), "utf8");
					res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
					res.end(html);
					return;
				} catch {
					res.writeHead(500);
					res.end("demo page missing");
					return;
				}
			}
			res.writeHead(404);
			res.end();
		});

		this.wss = new WebSocketServer({ server: http, maxPayload: 2 * 1024 * 1024 });
		this.wss.on("connection", (ws) => this.onWsConnection(ws));

		return new Promise((resolve, reject) => {
			http.once("error", reject);
			http.listen(this.opts.listenPort, this.opts.listenHost, () => {
				http.removeListener("error", reject);
				const address = http.address();
				const port = typeof address === "object" && address ? address.port : this.opts.listenPort;
				resolve({ host: this.opts.listenHost, port });
			});
		});
	}

	async stop(): Promise<void> {
		this.fsService.closeAll();
		for (const conn of this.connections.values()) conn.close();
		this.connections.clear();
		for (const host of this.registry.open) host.dispose();
		await new Promise<void>((resolve) => {
			this.wss?.close(() => resolve());
			resolve();
		});
	}

	get attachedClients(): number {
		return this.connections.size;
	}

	// -------------------------------------------------------------------------
	// connection lifecycle
	// -------------------------------------------------------------------------

	private onWsConnection(ws: WebSocket): void {
		const conn = new ClientConnection(ws, (text) => ws.send(text));
		this.connections.set(conn.id, conn);

		ws.on("message", (data: unknown) => {
			let text: string;
			if (typeof data === "string") text = data;
			else if (data instanceof Buffer) text = data.toString("utf8");
			else if (data instanceof ArrayBuffer) text = Buffer.from(data).toString("utf8");
			else return;
			for (const line of text.split("\n")) {
				const trimmed = line.length > 0 && line.endsWith("\r") ? line.slice(0, -1) : line;
				if (trimmed.length > 0) this.onLine(conn, trimmed);
			}
		});

		const drop = () => {
			for (const sessionId of conn.subscribed) {
				const host = this.registry.get(sessionId);
				if (host && host.writerConnection === conn.id) host.writerConnection = null;
			}
			this.connections.delete(conn.id);
		};
		ws.on("close", drop);
		ws.on("error", drop);
	}

	private onLine(conn: ClientConnection, line: string): void {
		let packet: ReturnType<typeof parseClientPacket>;
		try {
			packet = parseClientPacket(line);
		} catch (err) {
			// Malformed frame: drop the connection (fail-safe).
			conn.close();
			return;
		}

		if ("hello" in packet) return this.onHello(conn, packet.hello);
		if (!conn.authenticated) {
			conn.close();
			return;
		}
		this.onCommand(conn, packet as { id: CommandId; cmd: string; args: Record<string, unknown> });
	}

	private onHello(conn: ClientConnection, hello: {
		v: number;
		client: unknown;
		caps?: string[];
		auth?: { method?: string; token?: string };
	}): void {
		if (hello.v !== PROTOCOL_VERSION) {
			wsFatal(
				conn.ws,
				"version_mismatch",
				`Protocol version mismatch: client ${hello.v}, daemon ${PROTOCOL_VERSION}`,
				PROTOCOL_VERSION,
			);
			conn.close();
			return;
		}
		if (!hello.auth || hello.auth.method !== "token" || hello.auth.token !== this.opts.token) {
			wsFatal(conn.ws, "auth_failed", "Invalid or missing token");
			conn.close();
			return;
		}
		conn.authenticated = true;
		conn.caps = new Set((hello.caps ?? []) as ClientCapability[]);
		conn.identity = { version: DAEMON_VERSION, hostname: os.hostname(), os: os.platform() };
		const payload = {
			helloAck: {
				v: PROTOCOL_VERSION,
				serverId: this.serverId,
				daemon: conn.identity,
				pi: { version: this.opts.piVersion, agentDir: this.opts.piAgentDir },
				caps: [...conn.caps],
				eventSeq: 0,
			},
		};
		(conn.ws as WebSocket).send(`${JSON.stringify(payload)}\n`);
	}

	private onCommand(conn: ClientConnection, packet: { id: CommandId; cmd: string; args: Record<string, unknown> }): void {
		const ctx: CommandContext = {
			registry: this.registry,
			connection: conn,
			serverId: this.serverId,
			uptimeMs: Date.now() - this.startedAt,
		};
		conn.trackPending(packet.id, packet.cmd as never);
		void this.router
			.dispatch(packet.cmd, packet.args ?? {}, ctx)
			.then((result) => {
				conn.untrackPending(packet.id);
				if (result.ok) conn.ok(packet.id, packet.cmd as never, result.data);
				else conn.err(packet.id, result.error);
			})
			.catch((err: unknown) => {
				conn.untrackPending(packet.id);
				conn.err(packet.id, {
					code: ErrorCodes.internal,
					message: String((err as Error)?.message ?? err),
				});
			});
	}

	// -------------------------------------------------------------------------
	// broadcast helper for handlers
	// -------------------------------------------------------------------------

	broadcast(sessionId: string, ev: EventName, data: unknown): void {
		for (const conn of this.connections.values()) {
			if (conn.subscribed.has(sessionId)) conn.assignSeqAndSend(ev, data);
		}
	}

	private publicDir(): string {
		// src/server/server.ts -> packages/daemon/public
		return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
	}

	// -------------------------------------------------------------------------
	// P0 command handlers
	// -------------------------------------------------------------------------

	private registerHandlers(): void {
		const deps: HandlerDeps = {
			registry: this.registry,
			fsService: this.fsService,
			gitService: this.gitService,
			packageService: this.packageService,
			configService: new ConfigService(this.opts.agentDir ?? this.opts.piAgentDir),
			piVersion: this.opts.piVersion,
			piAgentDir: this.opts.piAgentDir,
			permissionMode: this.opts.permissionMode,
			permissionTimeoutMs: this.opts.permissionTimeoutMs,
			attachedClients: () => this.connections.size,
			broadcast: (sessionId, ev, data) => this.broadcast(sessionId, ev, data),
			forwardBySession: (ev) => this.forwardBySession(ev),
			getCatalogRuntime: () => this.getCatalogRuntime(),
			onConfigChanged: () => {
				this.catalogRuntime = undefined;
			},
		};
		registerSystemCommands(this.router, deps);
		registerWorkspaceCommands(this.router, deps);
		registerConfigCommands(this.router, deps);
		registerSessionCommands(this.router, deps);
		registerResourceCommands(this.router, deps);
		registerPermissionCommands(this.router, deps);
	}

	/** Session events flow to subscribed connections by sessionId. */
	private forwardBySession(ev: SessionEvent): void {
		const sid = (ev.data as { sessionId?: string }).sessionId;
		if (!sid) return;
		this.broadcast(sid, ev.ev, ev.data);
		// Summary sync point: after a turn settles (or the title changes), the
		// persisted row may have advanced (first message landed, message count,
		// modified). Diff against the last broadcast and push the row so
		// list-side UI does not keep showing a stale placeholder title.
		if (ev.ev === "session.turn.ended" || ev.ev === "session.renamed") {
			const host = this.registry.get(sid);
			if (host) this.emitSessionSummary(host, ev.ev);
		}
	}

	/** First-broadcast timestamp per session (SessionListItem.created filler). */
	private summaryCreated = new Map<string, string>();

	/** Broadcast session.summary.updated when the persisted row changed. */
	private emitSessionSummary(host: HostSession, cause: string): void {
		// Entry log is the durable source (run-projection `messages` misses
		// entries that landed without an LLM round, e.g. an aborted first turn).
		const entries = host.session.sessionManager.getEntries() as Array<{
			type?: string;
			message?: { role?: string; content?: unknown };
		}>;
		const firstUser = entries.find(
			(e) => e.type === "message" && e.message?.role === "user",
		);
		const firstMessage = firstUser ? firstMessageText(firstUser.message!) : "";
		const messageCount = entries.filter((e) => e.type === "message").length;
		const created =
			this.summaryCreated.get(host.sessionId) ??
			(() => {
				const iso = new Date().toISOString();
				this.summaryCreated.set(host.sessionId, iso);
				return iso;
			})();
		const item = {
			sessionId: host.sessionId,
			path: host.sessionFile ?? "",
			workspaceId: host.cwd,
			name: host.session.sessionManager.getSessionName(),
			created,
			modified: new Date().toISOString(),
			messageCount,
			firstMessage,
			parentSessionPath: undefined,
			open: true,
			pending: host.session.isStreaming,
		};
		const sig = JSON.stringify([
			cause,
			item.name,
			item.firstMessage,
			item.messageCount,
			item.path,
		]);
		if (this.lastSummary.get(host.sessionId) === sig) return;
		this.lastSummary.set(host.sessionId, sig);
		const ev = {
			ev: "session.summary.updated",
			data: { sessionId: host.sessionId, item },
		} satisfies SessionEvent;
		this.broadcast(host.sessionId, "session.summary.updated", ev.data);
	}
}

/** User-facing first-message snippet: first text part, trimmed (parity with
 *  pi's SessionManager firstMessage on the daemon side). */
function firstMessageText(message: { role?: string; content?: unknown }): string {
	const content = message.content;
	if (typeof content === "string") return content.trim();
	if (Array.isArray(content)) {
		for (const part of content) {
			if (part && typeof part === "object" && "text" in part && typeof (part as { text: unknown }).text === "string") {
				return ((part as { text: string }).text).trim();
			}
		}
	}
	return "";
}

function wsFatal(ws: WebSocket, code: string, message: string, version?: number): void {
	if (ws.readyState !== ws.OPEN) return;
	const fatal: Record<string, unknown> = { code, message };
	if (version !== undefined) {
		fatal.minV = version;
		fatal.maxV = version;
	}
	ws.send(`${JSON.stringify({ fatal })}\n`);
}

function isPageRequest(url: string): boolean {
	const path = url.split("?")[0] as string;
	return path === "/" || path === "/index.html";
}
