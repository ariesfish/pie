// Zustand store pattern mirrors paseo/packages/app/src/stores/* (Apache-2.0).
// Data sources are Pie-specific: PieConnection + SessionTreeStore + the pie
// protocol event stream. The tree instance mutates in place, so consumers
// read `revision` to re-derive the timeline.
import { create } from "zustand";
import { Platform } from "react-native";

import { PieConnection, SessionTreeStore } from "@pie/client";
import { createWsTransportFactory } from "@pie/client/ws";
import type { ContextUsage, SessionEntry } from "@pie/protocol";
import type { ModelCatalogItem, ModelRef, ThinkingLevel } from "@pie/protocol";

import { useWorkspaceStore } from "./workspace-store";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "failed" | "disconnected";
export type SendDisposition = "queued" | "busy-confirmed" | "rejected";

const tree = new SessionTreeStore();

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

export function getSharedTree(): SessionTreeStore {
	return tree;
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
	timeline: Array<{ ts: number; kind: string; text: string }>;
	/** Tool calls keyed by toolCallId; nested calls link via parentToolCallId. */
	toolCalls: Record<string, ToolCallRecord>;
	/** Pending permission request for the active session (W4c). */
	permission: {
		sessionId: string;
		requestId: string;
		toolName: string;
		argsPreview: Record<string, unknown>;
		annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
		reason: string;
	} | null;

	connect: (wsUrl: string, token: string) => Promise<void>;
	startSession: (workspace: string, opts?: { model?: ModelRef; thinkingLevel?: ThinkingLevel }) => Promise<void>;
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
	/** Answer the pending permission request (W4c). */
	respondPermission: (
		decision: "allow" | "allowSession" | "deny",
	) => Promise<void>;
	clearError: () => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
	status: "idle",
	conn: null,
	sessionId: null,
	revision: 0,
	streaming: false,
	permission: null,
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
			const created = await conn.request("session.create", { workspaceId: workspace, ...(model ? { model } : {}), ...(thinkingLevel ? { thinkingLevel } : {}) });
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

	respondPermission: async (decision) => {
		const { conn, permission } = get();
		if (!conn || !permission) return;
		const requestId = permission.requestId;
		useConnectionStore.setState({ permission: null });
		try {
			await conn.request("permission.respond", { requestId, decision });
		} catch (err) {
			useConnectionStore.setState({
				error: err instanceof Error ? err.message : String(err),
			});
		}
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
	const timelineEvent = (kind: string, text: string) => {
		useConnectionStore.setState((st) => ({
			timeline: [...st.timeline, { ts: Date.now(), kind, text }].slice(-250),
		}));
	};
	switch (event.ev) {
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
			timelineEvent("run", "run started");
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
			timelineEvent("queue", `queue: ${event.data.steering.length + event.data.followUp.length}`);
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
			const { sessionId, requestId, toolName, argsPreview, annotations, reason } = event.data;
			// Only the active session's request surfaces (pie renders one chat at a time).
			if (sessionId !== useConnectionStore.getState().sessionId) break;
			timelineEvent("permission", `permission: ${toolName}`);
			useConnectionStore.setState({
				permission: { sessionId, requestId, toolName, argsPreview, annotations, reason },
			});
			break;
		}
		case "session.tool.started": { // timeline
			timelineEvent("tool", `tool: ${event.data.toolName ?? "…"}`);
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
			timelineEvent("tool", `tool done: ${event.data.toolName ?? "…"}`);
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
 * Timeline derived from the shared tree; keyed to `revision` by callers.
 * Renders user/assistant messages only; other entry kinds join in P2b
 * (tool cards, extended dialogs and the typed-widget renderer).
 */
export function deriveTimeline(revision: number): SessionEntry[] {
	void revision; // identity param: callers pass the store's revision to memoize
	return tree.timeline();
}

export const workspaceApplyFsChanged = useWorkspaceStore.getState().applyFsChanged;
