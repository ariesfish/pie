// Zustand store pattern mirrors paseo/packages/app/src/stores/* (Apache-2.0).
// Data sources are Pie-specific: PieConnection + SessionTreeStore + the pie
// protocol event stream. The tree instance mutates in place, so consumers
// read `revision` to re-derive the timeline.
import { useMemo } from "react";
import { create } from "zustand";
import { Platform } from "react-native";

import { PieConnection, SessionTreeStore } from "@pie/client";
import { createWsTransportFactory } from "@pie/client/ws";
import type { ContextUsage, SessionEntry } from "@pie/protocol";
import type { ModelCatalogItem, ModelRef, ThinkingLevel } from "@pie/protocol";
import type { PermissionSettledData } from "@pie/protocol";

import { useSessionListStore } from "./session-list-store";
import { useWorkspaceStore } from "./workspace-store";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "failed" | "disconnected";
export type SendDisposition = "queued" | "busy-confirmed" | "rejected";

/**
 * Events that describe the sidebar/list rather than the open transcript. They
 * arrive for sessions this client is not attached to and must not be filtered
 * by the active session id.
 */
const LIST_LEVEL_EVENTS = new Set<string>(["session.summary.updated", "session.renamed"]);

const tree = new SessionTreeStore();

/** One right-rail activity record; labels live in the UI, not the store. */
export type ActivityKind = "run" | "tool" | "toolDone" | "queue" | "permission";

export interface ActivityItem {
	ts: number;
	kind: ActivityKind;
	/** Tool or permission name, when the event carries one. */
	name?: string;
	/** Queue depth (steering + follow-up). */
	count?: number;
}

/** Live tool-call record (event-sourced from session.tool.*). */
export interface ToolCallRecord {
	toolCallId: string;
	toolName: string;
	parentToolCallId?: string;
	status: "running" | "ok" | "error";
	args?: Record<string, unknown>;
	result?: unknown;
	durationMs?: number;
}

interface ConnectionState {
	status: ConnectionStatus;
	conn: PieConnection | null;
	sessionId: string | null;
	/** Bumped whenever the shared tree mutates; derive timelines off this. */
	revision: number;
	streaming: boolean;
	deltaText: string;
	deltaKind: "text" | "thinking" | "toolArgs" | null;
	queue: { steering: string[]; followUp: string[] };
	usage: ContextUsage | null;
	error: string | null;
	/** ext widgets keyed by session+key (typed-widget surfaces, P2c). */
	widgets: Record<string, { sessionId: string; key: string; lines: string[]; placement?: string }>;
	/** Model catalog (models.list). */
	models: ModelCatalogItem[];
	/** Per-new-session picks applied on session.create. */
	pendingModel: ModelRef | null;
	pendingThinking: ThinkingLevel | null;
	/** Right-rail event timeline (ring buffer). */
	timeline: ActivityItem[];
	/** Tool calls keyed by toolCallId; nested calls link via parentToolCallId. */
	toolCalls: Record<string, ToolCallRecord>;
	/** Pending permission requests for the active session (T-014, batchable);
	 * arrival order; session.permission.settled prunes authoritatively. */
	permissions: PermissionCard[];
	/** requestIds selected for batch approval (subset of permissions). */
	permissionSelection: string[];

	connect: (wsUrl: string, token: string) => Promise<void>;
	startSession: (
		workspace: string,
		opts?: {
			model?: ModelRef;
			thinkingLevel?: ThinkingLevel;
			/** Session cwd: a project sub-repo under the workspace (sessions
			 *  belong to projects; the workspace stays the pane context). */
			projectPath?: string;
		},
	) => Promise<void>;
	refreshModels: () => Promise<void>;
	setPendingModel: (model: ModelRef | null) => void;
	setPendingThinking: (level: ThinkingLevel | null) => void;
	applySessionPreset: (sessionId: string) => Promise<void>;
	disconnect: () => Promise<void>;
	/** Switch the chat surface to another session. Passes the session file
	 * path when known so the daemon can open disk sessions (TUI/CLI-created)
	 * the daemon does not already hold in memory. */
	switchSession: (sessionId: string, sessionPath?: string) => Promise<void>;
	sendPrompt: (
		text: string,
		delivery: "auto" | "steer" | "followUp",
		images?: { data: string; mimeType: string }[],
	) => Promise<SendDisposition>;
	abortRun: () => Promise<void>;
	/** Answer one pending permission request (single-card path, W4c). */
	respondPermission: (requestId: string, decision: PermissionDecision) => Promise<void>;
	/** Batch-settle many pending requests with one decision (T-014). */
	respondPermissions: (requestIds: string[], decision: PermissionDecision) => Promise<void>;
	/** Selection lifecycle for batch approval. */
	togglePermissionSelection: (requestId: string) => void;
	selectAllPermissions: () => void;
	clearPermissionSelection: () => void;
	clearError: () => void;
}

export type PermissionDecision = "allow" | "allowSession" | "deny";

/** One pending permission card (active session only). */
export interface PermissionCard {
	sessionId: string;
	requestId: string;
	toolName: string;
	argsPreview: Record<string, unknown>;
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
	reason: string;
	timeoutMs: number;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
	status: "idle",
	conn: null,
	sessionId: null,
	revision: 0,
	streaming: false,
	permissions: [],
	permissionSelection: [],
	deltaText: "",
	deltaKind: null,
	queue: { steering: [], followUp: [] },
	usage: null,
	error: null,
	widgets: {},
	models: [],
	pendingModel: null,
	pendingThinking: null,
	timeline: [],
	toolCalls: {},

	connect: async (wsUrl, token) => {
		set({ status: "connecting", error: null });
		try {
			const Ctor = globalThis.WebSocket as unknown as new (url: string) => never;
			const conn = await PieConnection.connect({
				client: { kind: "app", version: "0.1.0", platform: Platform.OS as string },
				token,
				transportFactory: createWsTransportFactory(wsUrl, Ctor),
			});
			conn.onEvent(applyStoreEvent);
			set({ status: "connected", conn });
			void get().refreshModels();
		} catch (err) {
			set({
				status: "failed",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	},

	startSession: async (workspace, opts) => {
		const conn = get().conn;
		if (!conn) return;
		try {
			await conn.request("workspace.open", { path: workspace });
			const preset = opts ?? {};
			const model = preset.model ?? get().pendingModel ?? undefined;
			const thinkingLevel = preset.thinkingLevel ?? get().pendingThinking ?? undefined;
			const sessionCwd = preset.projectPath ?? workspace;
			const created = await conn.request("session.create", { workspaceId: sessionCwd, ...(model ? { model } : {}), ...(thinkingLevel ? { thinkingLevel } : {}) });
			const previousSessionId = get().sessionId;
			if (previousSessionId && previousSessionId !== created.sessionId) {
				await conn.request("session.detach", { sessionId: previousSessionId }).catch(() => {});
			}
			set({ sessionId: created.sessionId });
			void get().applySessionPreset(created.sessionId);
			await conn.request("session.attach", { sessionId: created.sessionId });
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	disconnect: async () => {
		const { conn } = get();
		try {
			await conn?.close();
		} finally {
			set({
				status: "disconnected",
				conn: null,
				sessionId: null,
				streaming: false,
				deltaText: "",
				deltaKind: null,
			});
		}
	},

	sendPrompt: async (text, delivery, images) => {
		const { conn, sessionId } = get();
		if (!conn || !sessionId) return "rejected";
		try {
			const res = await conn.request("session.prompt", {
				sessionId,
				message: text,
				images: images && images.length > 0 ? images : undefined,
				delivery,
			});
			return res.disposition === "queued" ? "queued" : "busy-confirmed";
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
			return "rejected";
		}
	},

	abortRun: async () => {
		const { conn, sessionId } = get();
		if (!conn || !sessionId) return;
		try {
			await conn.request("session.abort", { sessionId });
		} catch (err) {
			useConnectionStore.setState({
				error: err instanceof Error ? err.message : String(err),
			});
		}
	},

	respondPermission: async (requestId, decision) => {
		const { conn, permissions } = get();
		const card = permissions.find((c) => c.requestId === requestId);
		if (!conn || !card) return;
		useConnectionStore.setState((st) => ({
			permissions: st.permissions.filter((c) => c.requestId !== requestId),
			permissionSelection: st.permissionSelection.filter((id) => id !== requestId),
		}));
		try {
			await conn.request("permission.respond", { requestId, decision });
		} catch (err) {
			// 失败还原:卡在服务端仍 pending(settled 事件才是权威撤卡依据)
			useConnectionStore.setState((st) => ({
				permissions: st.permissions.some((c) => c.requestId === requestId)
					? st.permissions
					: [...st.permissions, card],
				error: err instanceof Error ? err.message : String(err),
			}));
		}
	},

	respondPermissions: async (requestIds, decision) => {
		const { conn, permissions, permissionSelection } = get();
		if (!conn || requestIds.length === 0) return;
		const removed = permissions.filter((c) => requestIds.includes(c.requestId));
		const removedSelection = permissionSelection.filter((id) => requestIds.includes(id));
		useConnectionStore.setState((st) => ({
			permissions: st.permissions.filter((c) => !requestIds.includes(c.requestId)),
			permissionSelection: st.permissionSelection.filter((id) => !requestIds.includes(id)),
		}));
		try {
			await conn.request("permission.respondMany", { requestIds, decision });
		} catch (err) {
			// 失败还原:卡仍 pending;settled 事件才是权威撤卡依据
			useConnectionStore.setState((st) => {
				const present = new Set(st.permissions.map((c) => c.requestId));
				return {
					permissions: [...st.permissions, ...removed.filter((c) => !present.has(c.requestId))],
					permissionSelection: [
						...st.permissionSelection,
						...removedSelection.filter((id) => !st.permissionSelection.includes(id)),
					],
					error: err instanceof Error ? err.message : String(err),
				};
			});
		}
	},

	togglePermissionSelection: (requestId) => {
		useConnectionStore.setState((st) => ({
			permissionSelection: st.permissionSelection.includes(requestId)
				? st.permissionSelection.filter((id) => id !== requestId)
				: [...st.permissionSelection, requestId],
		}));
	},

	selectAllPermissions: () => {
		useConnectionStore.setState((st) => ({
			permissionSelection: st.permissions.map((c) => c.requestId),
		}));
	},

	clearPermissionSelection: () => {
		useConnectionStore.setState({ permissionSelection: [] });
	},

	clearError: () => set({ error: null }),

	refreshModels: async () => {
		const conn = get().conn;
		if (!conn) return;
		try {
			const res = await conn.request("models.list", { workspaceId: useWorkspaceStore.getState().workspaceId ?? "" });
			set({ models: res.models });
		} catch {
			/* catalog is optional; composer falls back to session defaults */
		}
	},

	setPendingModel: (model) => set({ pendingModel: model }),

	setPendingThinking: (level) => set({ pendingThinking: level }),

	/** Apply pending picks to a live session (model.set). */
	applySessionPreset: async (sessionId) => {
		const conn = get().conn;
		const { pendingModel, pendingThinking } = get();
		if (!conn || !pendingModel) return;
		try {
			await conn.request("model.set", {
				sessionId,
				model: pendingModel,
				...(pendingThinking ? { thinkingLevel: pendingThinking } : {}),
			});
		} catch {
			/* best effort */
		}
	},

	switchSession: async (sessionId, sessionPath) => {
		const conn = get().conn;
		if (!conn) return;
		// Detach the previous session before attaching the next one. Without
		// this, the daemon keeps the old subscription and its events keep
		// flowing into the shared tree after the switch.
		const previousSessionId = get().sessionId;
		if (previousSessionId && previousSessionId !== sessionId) {
			await conn.request("session.detach", { sessionId: previousSessionId }).catch(() => {});
		}
		// Reset single-session surfaces; the attach snapshot rebuilds the tree.
		// The model catalog & pending picks are workspace-level and survive the
		// switch (they are re-applied on session.create via applySessionPreset).
		set({
			sessionId,
			deltaText: "",
			deltaKind: null,
			streaming: false,
			queue: { steering: [], followUp: [] },
			usage: null,
			toolCalls: {},
			widgets: {},
			timeline: [],
			permissions: [],
			permissionSelection: [],
			revision: get().revision + 1,
		});
		await conn.request("session.attach", {
			sessionId,
			as: "readwrite",
			...(sessionPath ? { path: sessionPath } : {}),
		});
	},
}));

/** Route one protocol event into the store (registered in connect()). */
export function applyStoreEvent(
	event: Parameters<NonNullable<Parameters<PieConnection["onEvent"]>[0]>>[0],
): void {
	// Session-scoped events carry their sessionId (protocol/events.ts). Drop
	// events from a session this client is no longer showing; list-level
	// updates still apply so the sidebar stays live.
	const eventSessionId =
		event.ev === "session.snapshot"
			? event.data.snapshot.sessionId
			: (event.data as { sessionId?: string }).sessionId;
	const activeSessionId = useConnectionStore.getState().sessionId;
	if (
		eventSessionId &&
		eventSessionId !== activeSessionId &&
		!LIST_LEVEL_EVENTS.has(event.ev)
	) {
		return;
	}

	const pushActivity = (item: Omit<ActivityItem, "ts">) => {
		useConnectionStore.setState((st) => ({
			timeline: [...st.timeline, { ts: Date.now(), ...item }].slice(-250),
		}));
	};
	switch (event.ev) {
		case "session.summary.updated":
			// Unprompted list-row update (session file landed / row advanced):
			// upsert in place so sidebar + tab titles shed the placeholder.
			useSessionListStore.getState().upsert(event.data.item);
			break;
		case "session.renamed":
			// Rename broadcast (open sessions): sync the row name in place.
			useSessionListStore.getState().applyRenamed(event.data.sessionId, event.data.name);
			break;
		case "session.snapshot":
			tree.applySnapshot(event.data.snapshot);
			useConnectionStore.setState((s) => ({
				revision: s.revision + 1,
				streaming: event.data.snapshot.state.isStreaming,
				queue: event.data.snapshot.queues,
				usage: event.data.snapshot.contextUsage ?? null,
			}));
			break;
		case "session.entry.appended":
			tree.applyEvent(event);
			useConnectionStore.setState((s) => ({ revision: s.revision + 1 }));
			break;
		case "session.run.started":
			pushActivity({ kind: "run" });
			useConnectionStore.setState({ streaming: true, deltaText: "", deltaKind: null });
			break;
		case "session.partial.delta":
			useConnectionStore.setState((s) => ({
				deltaText: s.deltaText + event.data.delta,
				deltaKind: event.data.kind,
			}));
			break;
		case "session.settled":
			useConnectionStore.setState({ streaming: false, deltaText: "", deltaKind: null });
			break;
		case "session.queue.changed":
			pushActivity({ kind: "queue", count: event.data.steering.length + event.data.followUp.length });
			useConnectionStore.setState({
				queue: { steering: event.data.steering, followUp: event.data.followUp },
			});
			break;
		case "session.contextUsage.changed":
			useConnectionStore.setState({ usage: event.data.usage });
			break;
		case "workspace.fs.changed":
			workspaceApplyFsChanged(event.data);
			break;
		case "session.permission.request": {
			const { sessionId, requestId, toolName, argsPreview, annotations, reason, timeoutMs } = event.data;
			// Only the active session's requests surface (pie renders one chat at a time).
			if (sessionId !== useConnectionStore.getState().sessionId) break;
			pushActivity({ kind: "permission", name: toolName });
			useConnectionStore.setState((st) => ({
				permissions: [...st.permissions, { sessionId, requestId, toolName, argsPreview, annotations, reason, timeoutMs }],
			}));
			break;
		}
		case "session.permission.settled": {
			// Authoritative removal (user / timeout / dispose): prune card + selection.
			const { requestId } = event.data as PermissionSettledData;
			useConnectionStore.setState((st) => ({
				permissions: st.permissions.filter((c) => c.requestId !== requestId),
				permissionSelection: st.permissionSelection.filter((id) => id !== requestId),
			}));
			break;
		}
		case "session.tool.started": { // timeline
			pushActivity({ kind: "tool", name: event.data.toolName ?? "…" });
			const { toolCallId, toolName, parentToolCallId, args } = event.data;
			if (typeof toolCallId !== "string") break;
			useConnectionStore.setState((st) => ({
				toolCalls: {
					...st.toolCalls,
					[toolCallId]: {
						toolCallId,
						toolName: typeof toolName === "string" ? toolName : "(tool)",
						parentToolCallId: typeof parentToolCallId === "string" ? parentToolCallId : undefined,
						status: "running",
						args: (args ?? undefined) as Record<string, unknown> | undefined,
					},
				},
			}));
			break;
		}
		case "session.tool.updated":
			break;
		case "session.tool.ended": { // timeline
			pushActivity({ kind: "toolDone", name: event.data.toolName ?? "…" });
			const { toolCallId, result, isError, durationMs } = event.data;
			if (typeof toolCallId !== "string") break;
			useConnectionStore.setState((st) => {
				const prev = st.toolCalls[toolCallId];
				return {
					toolCalls: {
						...st.toolCalls,
						[toolCallId]: {
							...prev,
							toolCallId,
							toolName: prev?.toolName ?? "(tool)",
							status: isError ? "error" : "ok",
							result,
							durationMs: typeof durationMs === "number" ? durationMs : prev?.durationMs,
						} satisfies ToolCallRecord,
					},
				};
			});
			break;
		}
		case "session.ext.widget": {
			const { sessionId, key, lines, clear, placement } = event.data;
			const wid = `${sessionId}:${key}`;
			useConnectionStore.setState((st) => {
				const widgets = { ...st.widgets };
				if (clear) delete widgets[wid];
				else widgets[wid] = { sessionId, key, lines: [...(lines ?? [])], placement };
				return { widgets };
			});
			break;
		}
		default:
			break;
	}
}

/**
 * The session timeline derived from the shared tree. The tree mutates in
 * place, so `revision` is the cache key: it changes on every snapshot/append.
 */
export function useSessionTimeline(): SessionEntry[] {
	const revision = useConnectionStore((s) => s.revision);
	return useMemo(() => tree.timeline(), [revision]);
}

export const workspaceApplyFsChanged = useWorkspaceStore.getState().applyFsChanged;
