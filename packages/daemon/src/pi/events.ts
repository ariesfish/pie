/**
 * Pi session-event -> wire-event mapping (architecture.md §5.6), including the
 * delta coalescer (§5.6-A: >16ms windows for partial deltas), order-preserving
 * by flushing pending deltas before any non-delta event.
 */

import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { EventData, EventName } from "@pie/protocol";
import { mapSessionEntry } from "./adapter.js";

export type WireEvent = { ev: EventName; data: EventData<EventName> };
export type PartialDelta = EventData<"session.partial.delta">;

/** Windowed coalescer for high-frequency partial deltas. */
export class PartialCoalescer {
	private pending: PartialDelta | null = null;
	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly emit: (delta: PartialDelta) => void,
		private readonly windowMs = 16,
	) {}

	/** Push one delta; merges into the pending frame when they share a key. */
	push(delta: PartialDelta, sessionId: string): void {
		const keyed = { ...delta, sessionId };
		if (
			this.pending &&
			this.pending.sessionId === keyed.sessionId &&
			this.pending.kind === keyed.kind &&
			this.pending.contentIndex === keyed.contentIndex &&
			this.pending.messageId === keyed.messageId
		) {
			this.pending = { ...this.pending, delta: this.pending.delta + keyed.delta };
		} else {
			this.flush();
			this.pending = keyed;
		}
		if (!this.timer) {
			this.timer = setTimeout(() => {
				this.timer = undefined;
				this.flush();
			}, this.windowMs);
		}
	}

	/** Emit the pending frame immediately (call before any non-delta event). */
	flush(): void {
		if (!this.pending) return;
		const out = this.pending;
		this.pending = null;
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.emit(out);
	}

	dispose(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		this.pending = null;
	}
}

/**
 * Map one Pi `AgentSessionEvent` to zero or more wire events.
 * Deltas are NOT produced here — the host pushes them into the coalescer.
 * The host must call `coalescer.flush()` before forwarding mapped events.
 */
export function mapSessionEvent(ev: AgentSessionEvent, sessionId: string): WireEvent[] {
	const sid = sessionId;
	switch (ev.type) {
		case "agent_start":
			return [{ ev: "session.run.started", data: { sessionId: sid } }];
		case "agent_end":
			return [{ ev: "session.run.ended", data: { sessionId: sid, willRetry: ev.willRetry } }];
		case "agent_settled":
			return [{ ev: "session.settled", data: { sessionId: sid, aborted: ev.aborted } }];
		case "turn_start":
			return [{ ev: "session.turn.started", data: { sessionId: sid } }];
		case "turn_end":
			return [
				{
					ev: "session.turn.ended",
					data: { sessionId: sid, message: ev.message, toolResults: ev.toolResults },
				},
			];
		case "message_start":
			return [{ ev: "session.message.started", data: { sessionId: sid, message: ev.message } }];
		case "message_end":
			return [{ ev: "session.message.ended", data: { sessionId: sid, message: ev.message } }];
		case "message_update":
			// Handled by the host (delta coalescing); nothing to map synchronously.
			return [];
		case "tool_execution_start":
			return [
				{
					ev: "session.tool.started",
					data: {
						sessionId: sid,
						toolCallId: ev.toolCallId,
						toolName: ev.toolName,
						args: ev.args,
						parentToolCallId: (ev as { parentToolCallId?: string }).parentToolCallId,
					},
				},
			];
		case "tool_execution_update":
			return [
				{
					ev: "session.tool.updated",
					data: { sessionId: sid, toolCallId: ev.toolCallId, toolName: ev.toolName, partial: ev.partialResult },
				},
			];
		case "tool_execution_end":
			return [
				{
					ev: "session.tool.ended",
					data: {
						sessionId: sid,
						toolCallId: ev.toolCallId,
						toolName: ev.toolName,
						result: ev.result,
						isError: ev.isError,
						durationMs: ev.durationMs,
						parentToolCallId: (ev as { parentToolCallId?: string }).parentToolCallId,
					},
				},
			];
		case "queue_update":
			return [
				{
					ev: "session.queue.changed",
					data: { sessionId: sid, steering: [...ev.steering], followUp: [...ev.followUp] },
				},
			];
		case "compaction_start":
			return [{ ev: "session.compaction.started", data: { sessionId: sid, reason: ev.reason } }];
		case "compaction_end":
			return [
				{
					ev: "session.compaction.ended",
					data: {
						sessionId: sid,
						reason: ev.reason,
						aborted: ev.aborted,
						willRetry: ev.willRetry,
						errorMessage: ev.errorMessage,
					},
				},
			];
		case "entry_appended":
			return [
				{
					ev: "session.entry.appended",
					data: {
						sessionId: sid,
						entry: mapSessionEntry(ev.entry),
						leafId: null, // host fills the authoritative leafId
					},
				},
			];
		case "session_info_changed":
			return [{ ev: "session.renamed", data: { sessionId: sid, name: ev.name } }];
		case "thinking_level_changed":
			return [{ ev: "session.thinking.changed", data: { sessionId: sid, level: ev.level } }];
		case "auto_retry_start":
			return [
				{
					ev: "session.retry.started",
					data: {
						sessionId: sid,
						attempt: ev.attempt,
						maxAttempts: ev.maxAttempts,
						delayMs: ev.delayMs,
						errorMessage: ev.errorMessage,
					},
				},
			];
		case "auto_retry_end":
			return [
				{ ev: "session.retry.ended", data: { sessionId: sid, success: ev.success, attempt: ev.attempt } },
			];
		case "summarization_retry_scheduled":
			return [
				{
					ev: "session.retry.summarizationScheduled",
					data: {
						sessionId: sid,
						attempt: ev.attempt,
						maxAttempts: ev.maxAttempts,
						delayMs: ev.delayMs,
						errorMessage: ev.errorMessage,
					},
				},
			];
		case "summarization_retry_attempt_start":
			return [
				{
					ev: "session.retry.summarizationAttempt",
					data: { sessionId: sid, source: ev.source },
				},
			];
		case "summarization_retry_finished":
			return [{ ev: "session.retry.summarizationFinished", data: { sessionId: sid } }];
		case "bash_execution_update":
			// Coalesced by the host's bash coalescer (same mechanism, 100ms).
			return [];
		default:
			// Unknown future Pi events: dropped from the wire, logged upstream.
			return [];
	}
}

/** Extract the partial-delta key from a `message_update` assistant event. */
export function partialDeltaFromUpdate(
	ev: Extract<AgentSessionEvent, { type: "message_update" }>,
	sessionId: string,
): PartialDelta | null {
	const assistant = ev.assistantMessageEvent;
	switch (assistant.type) {
		case "text_delta":
			return {
				sessionId,
				kind: "text",
				contentIndex: assistant.contentIndex,
				delta: assistant.delta,
			};
		case "thinking_delta":
			return {
				sessionId,
				kind: "thinking",
				contentIndex: assistant.contentIndex,
				delta: assistant.delta,
			};
		case "toolcall_delta":
			return {
				sessionId,
				kind: "toolArgs",
				contentIndex: assistant.contentIndex,
				delta: assistant.delta,
			};
		default:
			return null;
	}
}
