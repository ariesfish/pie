/**
 * Daemon server: HTTP (demo page) + WebSocket (wire protocol), hello/auth,
 * event fan-out with per-connection sequencing, and the P0 command surface.
 */

import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
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
import { HostSession, HostSessionError } from "../core/host-session.js";
import { ClientConnection } from "./connection.js";
import { CommandRouter, type CommandContext } from "./commands.js";

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
	readonly fsService = new FsService();
	readonly gitService = new GitService();
	readonly packageService = new PackageService();
	private connections = new Map<string, ClientConnection>();
	private wss?: WebSocketServer;
	private startedAt = Date.now();
	readonly serverId = `srv-${DAEMON_VERSION}-${Date.now().toString(36)}`;

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

		this.wss = new WebSocketServer({ server: http });
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
		const r = this.router;
		const self = this;
		const opts = this.opts;

		const requireHost = (args: Record<string, unknown>): HostSession | HostSessionError => {
			const sessionId = args["sessionId"] as string | undefined;
			const host = sessionId ? self.registry.get(sessionId) : undefined;
			if (!host) return new HostSessionError(`Session not open: ${String(sessionId)}`, "not_found");
			return host;
		};
		const requireWriter = (host: HostSession, conn: ClientConnection): HostSessionError | null => {
			if (host.writerConnection !== null && host.writerConnection !== conn.id) {
				return new HostSessionError(
					"Another client holds this session's write presentation",
					"presentation_readonly",
				);
			}
			return null;
		};
		const permOpts = {
			permissionMode: opts.permissionMode,
			permissionTimeoutMs: opts.permissionTimeoutMs,
		};
		/** Broadcast a fresh snapshot to a session's subscribers (post-mutation resync). */
		const resyncSnapshot = (host2: HostSession, cause: string): void => {
			const snapshot = host2.snapshot();
			if (cause) void cause;
			self.broadcast(host2.sessionId, "session.snapshot", { snapshot });
		};

		r.register("daemon.status", async (_args, ctx) => ({
			version: DAEMON_VERSION,
			serverId: ctx.serverId,
			pi: { version: opts.piVersion, agentDir: opts.piAgentDir },
			uptimeMs: ctx.uptimeMs,
			attachedClients: self.connections.size,
			openSessions: self.registry.size,
		}));

		r.register("sync", async (args, ctx) => ctx.connection.replaySince(Number(args["sinceSeq"] ?? -1)));

		r.register("workspace.list", async () => ({ workspaces: self.registry.workspacesInfo() }));

		// --- workspace filesystem + git (P2b) --------------------------------------
		r.register("fs.list", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			const path = optionalString(args, "path");
			return { entries: await self.fsService.list(workspaceId, path) };
		});
		r.register("fs.read", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			const path = requiredString(args, "path");
			const maxBytes = typeof args["maxBytes"] === "number" ? (args["maxBytes"] as number) : undefined;
			return self.fsService.read(workspaceId, path, maxBytes);
		});
		r.register("fs.write", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			const path = requiredString(args, "path");
			const content = requiredString(args, "content");
			const expectedModifiedAt = optString(args, "expectedModifiedAt");
			const expectedRevision = optString(args, "expectedRevision");
			return self.fsService.write(workspaceId, path, content, {
				modifiedAt: expectedModifiedAt,
				revision: expectedRevision,
			});
		});
		r.register("fs.watch", async (args, ctx) => {
			const workspaceId = requiredString(args, "workspaceId");
			const watchId = await self.fsService.watchWorkspace(workspaceId, workspaceId);
			// Reuse the connection's subscribed set so workspace.fs.changed
			// reaches exactly the connections interested in this workspace.
			ctx.connection.subscribed.add(workspaceId);
			return { watchId };
		});
		r.register("fs.unwatch", async (args) => {
			const watchId = requiredString(args, "watchId");
			self.fsService.unwatch(watchId);
			return {};
		});
		r.register("git.status", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			return self.gitService.status(workspaceId);
		});
		r.register("git.diff", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			const path = optionalString(args, "path");
			const staged = args["staged"] === true;
			const includeUntracked = args["includeUntracked"] === true;
			return self.gitService.diff(workspaceId, { path, staged, includeUntracked });
		});

		r.register("workspace.open", async (args) => {
			const path = requiredString(args, "path");
			// Validate before remembering: the UI's add-workspace flow reports
			// typos immediately instead of failing on the first fs.list later.
			let isDir = false;
			try {
				isDir = statSync(path).isDirectory();
			} catch {
				isDir = false;
			}
			if (!isDir) {
				throw new HostSessionError(
					`Workspace directory not found: ${path}`,
					"not_found",
				);
			}
			self.registry.rememberWorkspace(path);
			return {
				workspaceId: path,
				path,
				name: path.split("/").filter(Boolean).pop() ?? path,
				trusted: true as boolean | null,
			};
		});

		r.register("session.list", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			return { sessions: await self.registry.listSessions(workspaceId) };
		});

		r.register("session.create", async (args) => {
			const cwd = requiredString(args, "workspaceId");
			const host = await self.registry.openSession({
				cwd,
				mode: "new",
				emit: (ev) => self.forwardBySession(ev),
				...permOpts,
			});
			return { sessionId: host.sessionId, sessionFile: host.sessionFile };
		});

		r.register("session.attach", async (args, ctx) => {
			const sessionId = args["sessionId"] as string | undefined;
			const path = args["path"] as string | undefined;
			let host = sessionId ? self.registry.get(sessionId) : undefined;
			if (!host && path) {
				host = await self.registry.openSession({
					mode: "open",
					sessionPath: path,
					emit: (ev) => self.forwardBySession(ev),
					...permOpts,
				});
			}
			if (!host) throw new HostSessionError(`Session not open and no path given: ${String(sessionId)}`, "not_found");
			ctx.connection.subscribed.add(host.sessionId);
			// Presentation lock: first attach wins the write lock (P0).
			const wantsWrite = (args["as"] ?? "readwrite") === "readwrite" && host.writerConnection === null;
			if (wantsWrite) host.writerConnection = ctx.connection.id;
			const snapshot = host.snapshot();
			ctx.connection.assignSeqAndSend("session.snapshot", { snapshot });
			return {
				sessionId: host.sessionId,
				presentation: host.writerConnection === ctx.connection.id ? ("readwrite" as const) : ("readonly" as const),
				leafId: snapshot.leafId,
				runState: host.session.isCompacting
					? ("compacting" as const)
					: host.session.isStreaming
						? ("streaming" as const)
						: ("idle" as const),
			};
		});

		r.register("session.detach", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			ctx.connection.subscribed.delete(host.sessionId);
			if (host.writerConnection === ctx.connection.id) host.writerConnection = null;
			return {};
		});

		r.register("session.entries", async (args) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const snapshot = host.snapshot();
			return {
				entries: snapshot.entries,
				leafId: snapshot.leafId,
			};
		});

		r.register("session.prompt", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lockError = requireWriter(host, ctx.connection);
			if (lockError) throw lockError;
			const message = requiredString(args, "message");
			const delivery = (args["delivery"] ?? "auto") as "auto" | "steer" | "followUp";
			const images = args["images"] as Array<{ data: string; mimeType: string }> | undefined;
			return await new Promise<{ disposition: "started" | "queued" | "handled" }>((resolve, reject) => {
				host.prompt(message, images, delivery, (disposition, error) => {
					if (disposition === "error") reject(new HostSessionError(error ?? "prompt failed", "pi_error"));
					else resolve({ disposition });
				});
			});
		});

		r.register("session.steer", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lockError = requireWriter(host, ctx.connection);
			if (lockError) throw lockError;
			return { disposition: await host.steer(requiredString(args, "message"), args["images"] as never) };
		});

		r.register("session.followUp", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lockError = requireWriter(host, ctx.connection);
			if (lockError) throw lockError;
			return { disposition: await host.followUp(requiredString(args, "message"), args["images"] as never) };
		});

		r.register("session.abort", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lockError = requireWriter(host, ctx.connection);
			if (lockError) throw lockError;
			await host.abort();
			return {};
		});

		r.register("session.queue.clear", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lockError = requireWriter(host, ctx.connection);
			if (lockError) throw lockError;
			return host.clearQueue();
		});

		r.register("session.navigate", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lockError = requireWriter(host, ctx.connection);
			if (lockError) throw lockError;
			const entryId = requiredString(args, "entryId");
			const summarize = Boolean(args["summarize"]);
			const result = await host.navigate(entryId, summarize, args["label"] as string | undefined);
			// Observation resync: the tree walk changed without new appends.
			resyncSnapshot(host, "navigate");
			return result;
		});

		r.register("session.rename", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lockError = requireWriter(host, ctx.connection);
			if (lockError) throw lockError;
			host.rename(requiredString(args, "name"));
			return {};
		});

		r.register("session.stats", async (args) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			return host.stats();
		});

		r.register("models.list", async (args) => {
			// P0: the catalog rides on an open session's ModelRuntime. Prefer an
			// explicit sessionId; else any open session in the requested workspace.
			if (args["sessionId"]) {
				const host = requireHost(args);
				if (host instanceof HostSessionError) throw host;
				return { models: host.models() };
			}
			const workspaceId = args["workspaceId"] as string | undefined;
			const host = self.registry.open.find((h) => !workspaceId || h.cwd === workspaceId);
			return { models: host ? host.models() : [] };
		});

		r.register("model.set", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lockError = requireWriter(host, ctx.connection);
			if (lockError) throw lockError;
			const model = args["model"] as { provider: string; id: string } | undefined;
			if (!model) throw new HostSessionError("model required", "invalid_args");
			const applied = host.setModel(model.provider, model.id, args["thinkingLevel"] as never);
			self.broadcast(host.sessionId, "session.model.changed", { sessionId: host.sessionId, model: applied });
			return {
				model: applied,
				thinkingLevel: host.snapshot().state.thinkingLevel,
			};
		});

		r.register("thinking.set", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lockError = requireWriter(host, ctx.connection);
			if (lockError) throw lockError;
			host.setThinking(requiredString(args, "level") as never);
			return {};
		});

		r.register("session.tree", async (args) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const snapshot = host.snapshot();
			return { tree: snapshot.tree, leafId: snapshot.leafId };
		});

		r.register("session.forkPreview", async (args) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			return { items: host.forkPreview() };
		});

		r.register("session.forkAt", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lock = requireWriter(host, ctx.connection);
			if (lock) throw lock;
			const entryId = requiredString(args, "entryId");
			const position = (args["position"] ?? "at") as "at" | "before";
			const forked = await self.registry.forkSession(host.sessionId, entryId, position, permOpts);
			return forked;
		});

		r.register("compaction.run", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lock = requireWriter(host, ctx.connection);
			if (lock) throw lock;
			return await host.compact(args["customInstructions"] as string | undefined);
		});

		r.register("compaction.setAuto", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lock = requireWriter(host, ctx.connection);
			if (lock) throw lock;
			host.setAutoCompaction(Boolean(args["enabled"]));
			return {};
		});

		r.register("session.exportHtml", async (args) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const path = await host.exportHtml(args["outputPath"] as string | undefined);
			return { path };
		});

		r.register("retry.abort", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lock = requireWriter(host, ctx.connection);
			if (lock) throw lock;
			host.abortRetry();
			return {};
		});

		r.register("bash.abort", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lock = requireWriter(host, ctx.connection);
			if (lock) throw lock;
			host.abortBashCommand();
			return {};
		});

		r.register("scope.set", async (args, ctx) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const lock = requireWriter(host, ctx.connection);
			if (lock) throw lock;
			const scoped = (args["scoped"] as Array<{ provider: string; id: string; thinkingLevel?: never }>) ?? [];
			host.setScope(scoped);
			return {};
		});

		r.register("commands.list", async (args) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			return { commands: host.commandsOverview() };
		});

		// --- packages + skills (P2c) -------------------------------------------------
		r.register("packages.list", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			return self.packageService.list(workspaceId, opts.piAgentDir);
		});
		r.register("packages.install", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			const source = requiredString(args, "source");
			const project = args["project"] === true;
			return self.packageService.install(workspaceId, opts.piAgentDir, source, project);
		});
		r.register("packages.remove", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			const source = requiredString(args, "source");
			const project = args["project"] === true;
			return self.packageService.remove(workspaceId, opts.piAgentDir, source, project);
		});
		r.register("packages.update", async (args) => {
			const workspaceId = requiredString(args, "workspaceId");
			const source = optionalString(args, "source");
			return self.packageService.update(workspaceId, opts.piAgentDir, source);
		});
		r.register("skills.list", async (args) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			return { skills: host.skillsList() };
		});
		r.register("skills.read", async (args) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			const filePath = requiredString(args, "filePath");
			return { content: host.readSkill(filePath) };
		});

		r.register("resources.overview", async (args) => {
			const host = requireHost(args);
			if (host instanceof HostSessionError) throw host;
			return {
				extensions: host.extensionsOverview(),
				commands: host.commandsOverview(),
				skills: host.skillsOverview(),
				promptTemplates: host.promptTemplatesOverview(),
			};
		});

		r.register("permission.respond", async (args) => {
			const requestId = requiredString(args, "requestId");
			const decision = requiredString(args, "decision") as "allow" | "allowSession" | "deny";
			const answered = [...self.registry.open].some((h) => h.permissionGate.respond(requestId, decision));
			if (!answered) throw new HostSessionError(`No pending permission: ${requestId}`, "request_not_found");
			return {};
		});

		r.register("ext.dialog.respond", async (args) => {
			const requestId = requiredString(args, "requestId");
			const answered = [...self.registry.open].some((h) =>
				h.dialogs.respond(requestId, {
					value: args["value"] as string | undefined,
					confirmed: args["confirmed"] as boolean | undefined,
					cancelled: Boolean(args["cancelled"]),
				}),
			);
			if (!answered) throw new HostSessionError(`No pending dialog: ${requestId}`, "request_not_found");
			return {};
		});
	}

	/** Session events flow to subscribed connections by sessionId. */
	private forwardBySession(ev: WireEventLike): void {
		const sid = (ev.data as { sessionId?: string }).sessionId;
		if (!sid) return;
		this.broadcast(sid, ev.ev, ev.data);
	}
}

interface WireEventLike {
	ev: EventName;
	data: unknown;
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

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
	const v = args[key];
	return typeof v === "string" ? v : undefined;
}

function optString(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredString(args: Record<string, unknown>, key: string): string {
	const value = args[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new HostSessionError(`Missing required string argument: ${key}`, "invalid_args");
	}
	return value;
}
