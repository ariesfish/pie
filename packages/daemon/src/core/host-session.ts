/**
 * HostSession: daemon-side wrapper of one Pi `AgentSession`.
 *
 * Owns: subscription/wiring of pi events -> wire events (with delta
 * coalescing), the host ExtensionUIContext, snapshot production, and the
 * P0 command surface (prompt/steer/followUp/abort/queue/stats).
 */

import {
	type AgentSession,
	type AgentSessionEvent,
	DefaultResourceLoader,
	createAgentSession,
	getAgentDir as getDefaultAgentDir,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ContextUsage,
	EventData,
	EventName,
	ModelCatalogItem,
	ModelRef,
	SessionSnapshot,
	SessionStateInfo,
	ThinkingLevel,
	TreeNodeMeta,
} from "@pie/protocol";
import {
	buildStateInfo,
	mapImages,
	mapModel,
	mapModelCatalog,
	mapSessionEntry,
	mapTree,
} from "../pi/adapter.js";
import type { WireEvent } from "../pi/events.js";
import { PartialCoalescer, mapSessionEvent, partialDeltaFromUpdate } from "../pi/events.js";
import { createHostUiContext, type DialogRegistry } from "../pi/ui-context.js";
import {
	PermissionGate,
	createPermissionExtension,
	type PermissionMode,
	type WirePermissionRequest,
	type WirePermissionSettled,
} from "../pi/permissions.js";

export type EmitFn = (ev: WireEvent) => void;

export interface HostSessionOptions {
	/** Workspace cwd. Required for "new"/"continue"; derived from the session header for "open". */
	cwd?: string;
	agentDir?: string;
	sessionDir?: string;
	/** Open mode: new | continue-recent | open-path | branch-off-parent. */
	mode: "new" | "continue" | "open" | "branch";
	sessionPath?: string;
	/** For mode "branch": the source session file recorded as parent (runtime.fork parity). */
	parentSessionPath?: string;
	model?: ModelRef;
	thinkingLevel?: ThinkingLevel;
	emit: EmitFn;
	/** Permission card policy. Default: "off" (Pi TUI parity). */
	permissionMode?: PermissionMode;
	/** Permission card timeout. Default: PERMISSION_TIMEOUT_MS (10 min). */
	permissionTimeoutMs?: number;
}

/** One attached client (daemon->client writer + presentation lock). */
export interface ClientHandle {
	connectionId: string;
	/** Sessions this client subscribes to. */
	subscribed: Set<string>;
}

export class HostSessionError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
		this.name = "HostSessionError";
	}
}

/**
 * Pure reconciliation (dogfood #1): entries present in the session manager
 * but not yet on the wire — pi's live stream reports message_end without a
 * mirrored entry_appended for message-kind appends, so the host diffs after
 * append-ish events and the agent UI tree catches up.
 */
export function diffUnemittedEntries<T extends { id: string }>(
	emittedIds: ReadonlySet<string>,
	entries: readonly T[],
): T[] {
	return entries.filter((entry) => !emittedIds.has(entry.id));
}

export class HostSession {
	readonly dialogs: DialogRegistry;
	readonly permissionGate: PermissionGate;
	private unsubscribePi?: () => void;
	private readonly partialCoalescer: PartialCoalescer;
	private readonly bashCoalescer: PartialCoalescer;
	private lastStateInfo: SessionStateInfo | undefined;
	/**
	 * Entry ids already visible on the wire (snapshot or emitted). Pi's live
	 * event stream reports message_end without a mirrored entry_appended for
	 * message-kind appends (the dogfood first flight caught a UI tree that
	 * never rendered the transcript), so the host reconciles the wire against
	 * the session manager's tree after append-ish events and emits what is
	 * missing — the host is the wire authority either way.
	 */
	private emittedEntryIds = new Set<string>();
	/** Connection holding write presentation; P0: first attach wins. */
	writerConnection: string | null = null;

	private constructor(
		readonly session: AgentSession,
		private readonly opts: HostSessionOptions & { cwd: string },
		permissionGate: PermissionGate,
	) {
		this.partialCoalescer = new PartialCoalescer((d) => this.emitDirect({ ev: "session.partial.delta", data: d }), 16);
		this.bashCoalescer = new PartialCoalescer((d) => this.emitDirect({ ev: "session.tool.bashDelta", data: d as EventData<"session.tool.bashDelta"> }), 100);

		const { ui, dialogs } = createHostUiContext({
			sessionId: this.sessionId,
			emitExt: (ev, data) => this.emitDirect({ ev: ev as EventName, data: data as never }),
			publishDialog: (request) =>
				this.emitDirect({ ev: "session.ext.dialog", data: request as EventData<"session.ext.dialog"> }),
		});
		this.dialogs = dialogs;

		this.permissionGate = permissionGate;

		this.unsubscribePi = session.subscribe((piEvent) => this.handlePiEvent(piEvent));

		// Bind our UI context + rpc-style mode so every extension (built-in or
		// user-installed) renders through the Pie protocol.
		void session
			.bindExtensions({ uiContext: ui, mode: "rpc" })
			.catch((err) => console.error(`[host-session ${this.sessionId}] bindExtensions failed:`, err));
	}

	static async open(opts: HostSessionOptions): Promise<HostSession> {
		let cwd = opts.cwd;
		let sessionManager: SessionManager;
		// Sessions persist under the agent dir (an isolated agentDir —
		// dogfood copies, tests — must own its sessions, not ~/.pi/agent).
		const agentDir = opts.agentDir ?? getDefaultAgentDir();
		const agentSessionsDir = opts.sessionDir ?? join(agentDir, "sessions");
		if (opts.mode === "open" && opts.sessionPath) {
			sessionManager = SessionManager.open(opts.sessionPath, opts.sessionDir, opts.cwd);
			cwd = opts.cwd ?? sessionManager.getCwd() ?? process.cwd();
		} else if (opts.mode === "continue") {
			cwd = cwd ?? process.cwd();
			sessionManager = SessionManager.continueRecent(cwd, agentSessionsDir);
		} else if (opts.mode === "branch" && opts.parentSessionPath) {
			// runtime.fork parity for "fork before the first entry": a fresh empty
			// session whose header records the source as parentSession.
			cwd = cwd ?? process.cwd();
			sessionManager = SessionManager.create(cwd, agentSessionsDir);
			sessionManager.newSession({ parentSession: opts.parentSessionPath });
		} else {
			cwd = cwd ?? process.cwd();
			sessionManager = SessionManager.create(cwd, agentSessionsDir);
		}

		const settingsManager = SettingsManager.create(cwd, agentDir);
		// A workspace the user explicitly opened through the daemon is trusted:
		// project-level resources (.pi/extensions, .pi/skills, …) must load.
		// Without this, pi's resource loader silently drops all of them
		// (projectTrusted defaults to false here — the TUI asks interactively).
		settingsManager.setProjectTrusted(true);
		// Late-bound holder: the gate publishes through the host once it exists.
		const holder: { host?: HostSession } = {};
		const gate = new PermissionGate({
			mode: opts.permissionMode ?? "off",
			timeoutMs: opts.permissionTimeoutMs,
			sessionId: () => holder.host?.sessionId ?? "(pending)",
			publish: (request: WirePermissionRequest) => holder.host?.emitPermissionRequest(request),
			publishSettled: (settled: WirePermissionSettled) => holder.host?.emitPermissionSettled(settled),
		});

		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			extensionFactories: gate.enabled ? [createPermissionExtension(gate)] : [],
		});
		await resourceLoader.reload();

		const created = await createAgentSession({
			cwd,
			agentDir,
			settingsManager,
			resourceLoader,
			sessionManager,
		});
		const host = new HostSession(created.session, { ...opts, cwd }, gate);
		holder.host = host;
		return host;
	}

	get sessionId(): string {
		return this.session.sessionId;
	}
	get sessionFile(): string | undefined {
		return this.session.sessionFile;
	}
	get cwd(): string {
		return this.opts.cwd ?? process.cwd();
	}

	dispose(): void {
		this.partialCoalescer.dispose();
		this.bashCoalescer.dispose();
		this.dialogs.cancelAll();
		this.permissionGate.denyAll();
		this.unsubscribePi?.();
		this.session.dispose();
	}

	// ---------------------------------------------------------------------------
	// Wire event plumbing
	// ---------------------------------------------------------------------------

	private emitDirect(ev: WireEvent): void {
		this.opts.emit(ev);
	}

	/** PermissionGate publish target (wire routing lives here, not in the gate). */
	emitPermissionRequest(request: WirePermissionRequest): void {
		this.emitDirect({ ev: "session.permission.request", data: request as EventData<"session.permission.request"> });
	}

	/** PermissionGate settled broadcast target (same routing rule as requests). */
	emitPermissionSettled(settled: WirePermissionSettled): void {
		this.emitDirect({ ev: "session.permission.settled", data: settled as EventData<"session.permission.settled"> });
	}

	/** Emit an event derived from a Pi event, flushing pending deltas first. */
	private emitOrdered(evs: WireEvent[]): void {
		if (evs.length > 0) this.partialCoalescer.flush();
		// Preserve original order; coalesced deltas were flushed before.
		for (const ev of evs) this.emitDirect(ev);
		// Follow with a coarse state summary change when the flags moved.
		const info = buildStateInfo(this.session);
		if (
			!this.lastStateInfo ||
			this.lastStateInfo.isStreaming !== info.isStreaming ||
			this.lastStateInfo.isCompacting !== info.isCompacting ||
			this.lastStateInfo.isRetrying !== info.isRetrying ||
			this.lastStateInfo.pendingMessages !== info.pendingMessages
		) {
			this.lastStateInfo = info;
			this.emitDirect({
				ev: "session.state.changed",
				data: {
					sessionId: this.sessionId,
					isStreaming: info.isStreaming,
					isCompacting: info.isCompacting,
					isRetrying: info.isRetrying,
					pendingMessages: info.pendingMessages,
				},
			});
		}
	}

	private handlePiEvent(piEvent: AgentSessionEvent): void {
		if (piEvent.type === "message_update") {
			const delta = partialDeltaFromUpdate(piEvent, this.sessionId);
			if (delta) {
				this.partialCoalescer.push(delta, this.sessionId);
				return;
			}
			this.partialCoalescer.flush();
			return;
		}
		if (piEvent.type === "bash_execution_update") {
			const requestId = (piEvent as { id?: string }).id;
			this.bashCoalescer.push(
				{
					sessionId: this.sessionId,
					kind: "toolArgs",
					contentIndex: 0,
					delta: piEvent.delta,
					messageId: requestId,
				},
				this.sessionId,
			);
			return;
		}
		const mapped = mapSessionEvent(piEvent, this.sessionId);
		// entry_appended needs the authoritative leafId after append.
		for (const ev of mapped) {
			if (ev.ev === "session.entry.appended") {
				const data = ev.data as { leafId: string | null };
				data.leafId = this.session.sessionManager.getLeafId();
			}
		}
		if (mapped.length > 0) this.emitOrdered(mapped);
		// Reconcile message-kind appends that pi does not mirror as
		// entry_appended on the live stream.
		if (piEvent.type === "message_end" || piEvent.type === "turn_end") {
			this.syncTreeEntries();
		}
		// Context usage moves with usage entries; refresh the gauge (§5.6-D).
		if (piEvent.type === "entry_appended" && piEvent.entry.type === "usage") {
			const usage = this.session.getContextUsage();
			if (usage) {
				this.emitDirect({ ev: "session.contextUsage.changed", data: { sessionId: this.sessionId, usage } });
			}
		}
	}

	private syncTreeEntries(): void {
		const mgr = this.session.sessionManager;
		for (const entry of diffUnemittedEntries(this.emittedEntryIds, mgr.getEntries())) {
			this.emittedEntryIds.add(entry.id);
			this.emitDirect({
				ev: "session.entry.appended",
				data: {
					sessionId: this.sessionId,
					entry: mapSessionEntry(entry),
					leafId: mgr.getLeafId(),
				},
			});
		}
	}

	// ---------------------------------------------------------------------------
	// Snapshot
	// ---------------------------------------------------------------------------

	snapshot(): SessionSnapshot {
		const mgr = this.session.sessionManager;
		// A fresh snapshot implies its entries reached the wire with it; late
		// reconciliation must not replay them.
		for (const entry of mgr.getEntries()) this.emittedEntryIds.add(entry.id);
		const tree: TreeNodeMeta[] = mapTree(mgr.getTree());
		const leafId = mgr.getLeafId();
		// Entries along root -> leaf by walking parents.
		const path: string[] = [];
		let cursor: string | null = leafId;
		while (cursor) {
			const node = tree.find((n) => n.id === cursor);
			if (!node) break;
			path.push(node.id);
			cursor = node.parentId;
		}
		path.reverse();
		const entriesById = new Map(mgr.getEntries().map((e) => [e.id, e]));
		const entries = path
			.map((id) => entriesById.get(id))
			.filter((e): e is NonNullable<typeof e> => e !== undefined)
			.map(mapSessionEntry);
		const state = buildStateInfo(this.session);
		this.lastStateInfo = state;
		return {
			sessionId: this.sessionId,
			sessionFile: this.sessionFile,
			name: this.session.sessionName,
			workspaceId: this.opts.cwd,
			snapshotVersion: 1,
			tree,
			leafId,
			entries,
			state,
			queues: {
				steering: [...this.session.getSteeringMessages()],
				followUp: [...this.session.getFollowUpMessages()],
			},
			contextUsage: this.session.getContextUsage(),
		};
	}

	// ---------------------------------------------------------------------------
	// P0 command surface
	// ---------------------------------------------------------------------------

	/** Prompt with daemon-side refuse-to-guess enforcement (ADR-0001 / §5.5). */
	prompt(
		message: string,
		images: Array<{ data: string; mimeType: string }> | undefined,
		delivery: "auto" | "steer" | "followUp",
		onAccepted: (disposition: "started" | "queued" | "handled" | "error", error?: string) => void,
	): void {
		if (this.session.isStreaming && delivery === "auto") {
			onAccepted("error", "steer_or_follow_required: session is streaming; choose steer or followUp");
			return;
		}
		if (this.session.isCompacting) {
			onAccepted("error", "session_compacting: wait for compaction to finish");
			return;
		}
		const streamingBehavior =
			this.session.isStreaming && (delivery === "steer" || delivery === "followUp") ? delivery : undefined;
		let accepted = false;
		void this.session
			.prompt(message, {
				images: mapImages(images),
				streamingBehavior,
				source: "rpc",
				preflightResult: (disposition) => {
					accepted = true;
					onAccepted(disposition === "queued" ? "queued" : disposition === "handled" ? "handled" : "started");
				},
			})
			.catch((err: unknown) => {
				if (!accepted) onAccepted("error", String((err as Error)?.message ?? err));
			});
	}

	async steer(message: string, images?: Array<{ data: string; mimeType: string }>): Promise<"queued" | "handled"> {
		return (await this.session.steer(message, mapImages(images), { source: "rpc" })) as "queued" | "handled";
	}

	async followUp(message: string, images?: Array<{ data: string; mimeType: string }>): Promise<"queued" | "handled"> {
		return (await this.session.followUp(message, mapImages(images), { source: "rpc" })) as
			| "queued"
			| "handled";
	}

	async abort(): Promise<void> {
		await this.session.abort();
	}

	clearQueue(): { steering: string[]; followUp: string[] } {
		return this.session.clearQueue();
	}

	async navigate(entryId: string, summarize: boolean, label?: string): Promise<{ cancelled: boolean }> {
		if (this.session.isStreaming) {
			throw new HostSessionError("Wait for the current response before navigating", "session_streaming");
		}
		const result = await this.session.navigateTree(entryId, { summarize, label });
		return { cancelled: result.cancelled };
	}

	stats() {
		const stats = this.session.getSessionStats();
		return {
			sessionId: this.sessionId,
			userMessages: stats.userMessages,
			assistantMessages: stats.assistantMessages,
			toolCalls: stats.toolCalls,
			toolResults: stats.toolResults,
			totalMessages: stats.totalMessages,
			tokens: {
				input: stats.tokens.input,
				output: stats.tokens.output,
				cacheRead: stats.tokens.cacheRead,
				cacheWrite: stats.tokens.cacheWrite,
			},
			contextUsage: this.session.getContextUsage(),
		};
	}

	rename(name: string): void {
		this.session.setSessionName(name);
	}

	/** Set an active model by provider/id (resolves through the runtime catalog). */
	setModel(provider: string, modelId: string, thinkingLevel?: ThinkingLevel): ModelRef {
		const runtime = this.session.modelRuntime;
		const model = runtime.getModel(provider, modelId);
		if (!model) {
			throw new HostSessionError(`Model not found: ${provider}/${modelId}`, "not_found");
		}
		void this.session.setModel(model as never, {});
		if (thinkingLevel) this.session.setThinkingLevel(thinkingLevel, {});
		return mapModel(model as never);
	}

	setThinking(level: ThinkingLevel): void {
		this.session.setThinkingLevel(level, {});
	}

	/** Model catalog snapshot (available models). */
	models(): ModelCatalogItem[] {
		const available = this.session.modelRuntime.getAvailableSnapshot();
		return available.map((m) =>
			mapModelCatalog(m as unknown as Parameters<typeof mapModelCatalog>[0]),
		);
	}

	/** Map current usage into protocol shape. */
	contextUsage(): ContextUsage | undefined {
		return this.session.getContextUsage();
	}

	// --- P1 surface ----------------------------------------------------------

	/** User messages available as fork points (getForkMessages parity). */
	forkPreview(): Array<{ entryId: string; text: string }> {
		return this.session.getUserMessagesForForking();
	}

	compact(customInstructions?: string): Promise<Record<string, unknown>> {
		return this.session.compact(customInstructions) as unknown as Promise<Record<string, unknown>>;
	}

	setAutoCompaction(enabled: boolean): void {
		this.session.setAutoCompactionEnabled(enabled);
	}

	exportHtml(outputPath?: string): Promise<string> {
		return this.session.exportToHtml(outputPath);
	}

	abortRetry(): void {
		this.session.abortRetry();
	}

	abortBashCommand(): void {
		this.session.abortBash();
	}

	/** Scoped model cycle list (Ctrl+P parity). */
	setScope(scoped: Array<{ provider: string; id: string; thinkingLevel?: ThinkingLevel }>): void {
		const models = scoped
			.map((entry) => {
				const model = this.session.modelRuntime.getModel(entry.provider, entry.id);
				if (!model) return undefined;
				return { model: model as never, thinkingLevel: entry.thinkingLevel };
			})
			.filter((m): m is NonNullable<typeof m> => m !== undefined);
		this.session.setScopedModels(models);
	}

	/** Merged slash-command catalog (extensions + prompt templates + skills). */
	commandsOverview(): Array<{ name: string; description?: string; source: "extension" | "prompt" | "skill" }> {
		const out: Array<{ name: string; description?: string; source: "extension" | "prompt" | "skill" }> = [];
		for (const command of this.session.extensionRunner.getRegisteredCommands()) {
			out.push({ name: command.name, description: command.description, source: "extension" });
		}
		for (const template of this.session.promptTemplates) {
			out.push({ name: template.name, description: template.description, source: "prompt" });
		}
		for (const skill of this.session.resourceLoader.getSkills().skills) {
			out.push({ name: `skill:${skill.name}`, description: skill.description, source: "skill" });
		}
		return out;
	}

	/** Extension inventory for resources.overview. */
	extensionsOverview(): Array<{ name: string; builtin: boolean; path: string }> {
		const out: Array<{ name: string; builtin: boolean; path: string }> = [];
		for (const ext of this.session.resourceLoader.getExtensions().extensions) {
			out.push({
				name: ext.sourceInfo.path,
				builtin: ext.sourceInfo.path.startsWith("builtin:"),
				path: ext.path,
			});
		}
		return out;
	}

	skillsOverview(): Array<{ name: string; description?: string }> {
		return this.session.resourceLoader
			.getSkills()
			.skills.map((skill) => ({ name: skill.name, description: skill.description }));
	}

	/** Skills with origin metadata (P2c skills.list). */
	skillsList(): Array<{
		name: string;
		description?: string;
		filePath: string;
		origin: string;
		disableModelInvocation: boolean;
	}> {
		return this.session.resourceLoader
			.getSkills()
			.skills.map((skill) => ({
				name: skill.name,
				description: skill.description,
				filePath: skill.filePath,
				origin: [
					skill.sourceInfo.origin,
					skill.sourceInfo.scope,
					skill.sourceInfo.source ?? "",
				]
					.filter(Boolean)
					.join(":"),
				disableModelInvocation: skill.disableModelInvocation,
			}));
	}

	/** Read one skill's body; the path must be one of the loaded skills. */
	readSkill(filePath: string): string {
		const skill = this.session.resourceLoader
			.getSkills()
			.skills.find((s) => s.filePath === filePath);
		if (!skill) {
			throw new HostSessionError(
				"Not a loaded skill of this session; call skills.list first",
				"not_found",
			);
		}
		return readFileSync(filePath, "utf8");
	}

	promptTemplatesOverview(): Array<{ name: string; description?: string }> {
		return this.session.promptTemplates.map((t) => ({ name: t.name, description: t.description }));
	}
}
