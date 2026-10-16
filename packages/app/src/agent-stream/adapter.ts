// [pie] W4b: SessionEntry timeline → StreamItem adapter. Paseo builds its
// StreamItem stream from daemon agent events; pie's connection store keeps
// a SessionEntry tree plus a live delta channel, so the adapter projects
// both onto the ported foundation's item vocabulary:
// - user messages → UserMessageItem (text blocks joined)
// - assistant messages → AssistantMessageItem (text blocks) with thinking
//   and tool_use blocks lifted into their own items (tool-call status from
//   the connection store's ToolCallRecord)
// - the streaming delta → a single live-head item (kind per deltaKind)
// Entry ids stay stable, so the inverted list's key extraction and the
// history-row identity mechanics keep working.
import { isMessageEntry, type SessionEntry, type MessageEntry } from "@pie/protocol";

import type { StreamItem, ToolCallItem } from "@/types/stream";
import type { ToolCallRecord } from "@/stores/connection-store";

type Block = { type?: string; [key: string]: unknown };

export interface BuildStreamItemsInput {
	entries: SessionEntry[];
	deltaText: string;
	/** pie's delta channel kind; toolArgs renders within the tool-call rows. */
	deltaKind: "thinking" | "text" | "toolArgs" | null;
	toolCalls: Record<string, ToolCallRecord>;
}

export function buildStreamItems(input: BuildStreamItemsInput): {
	history: StreamItem[];
	liveHead: StreamItem[];
} {
	const history: StreamItem[] = [];
	for (const entry of input.entries) {
		history.push(...entryItems(entry, input.toolCalls));
	}
	const liveHead = liveDeltaItem(input.deltaText, input.deltaKind, input.toolCalls);
	return { history, liveHead };
}

function entryItems(entry: SessionEntry, toolCalls: Record<string, ToolCallRecord>): StreamItem[] {
	if (!isMessageEntry(entry)) return [];
	const msg = entry.message;
	if (typeof msg !== "object" || msg === null || !("role" in msg)) return [];
	const m = msg as { role: string; content: string | Block[] };
	const blocks: Block[] =
		typeof m.content === "string"
			? [{ type: "text", text: m.content }]
			: Array.isArray(m.content)
				? (m.content as Block[])
				: [];
	const timestamp = new Date(entry.timestamp);
	const items: StreamItem[] = [];

	if (m.role === "user") {
		const text = blocks
			.map((b) => (typeof b.text === "string" ? b.text : ""))
			.join("")
			.trim();
		if (text) {
			items.push({
				kind: "user_message",
				id: entry.id,
				turnId: entry.parentId ?? undefined,
				text,
				timestamp,
			});
		}
		return items;
	}

	for (const block of blocks) {
		if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
			items.push({
				kind: "assistant_message",
				id: `${entry.id}:t${items.length}`,
				turnId: entry.parentId ?? undefined,
				text: block.text,
				timestamp,
			});
		} else if (block.type === "thinking") {
			const text = String(block.thinking ?? block.text ?? "").trim();
			if (text) {
				items.push({
					kind: "thought",
					id: `${entry.id}:h${items.length}`,
					turnId: entry.parentId ?? undefined,
					text,
					timestamp,
					status: "ready",
				});
			}
		} else if (block.type === "toolCall") {
			const toolCallId = String(block.id ?? "");
			const record = toolCalls[toolCallId];
			items.push({
				kind: "tool_call",
				id: `${entry.id}:c${items.length}`,
				turnId: entry.parentId ?? undefined,
				timestamp,
				payload: {
					source: "agent",
					data: {
						toolCallId,
						toolName: record?.toolName ?? String(block.name ?? ""),
						// pie's store records ok/error; the stream vocabulary expects the ran set.
						status: record?.status === "error" ? "failed" : record ? "completed" : "running",
						arguments: record?.args ?? block.arguments,
						result: record?.result,
						error: record?.status === "error" ? record.result : undefined,
					},
				},
			} satisfies ToolCallItem);
		}
	}
	return items;
}


/** Best-effort parse for streaming tool-arg payloads (may be partial JSON). */
function tryParseJson(text: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(text);
		return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function liveDeltaItem(
	deltaText: string,
	deltaKind: "thinking" | "text" | "toolArgs" | null,
	toolCalls: Record<string, ToolCallRecord>,
): StreamItem[] {
	if (!deltaText) return [];
	if (deltaKind === "thinking") {
		return [
			{
				kind: "thought",
				id: "live:delta",
				text: deltaText,
				timestamp: new Date(),
				status: "loading",
			},
		];
	}
	if (deltaKind === "toolArgs") {
		// Tool arguments streaming in: render a live tool card, not prose
		// (first-flight audit: raw JSON leaked into the assistant message).
		// Prefer the newest running tool from the store; fall back to a bare
		// running card when the start event has not landed yet.
		const running = Object.values(toolCalls).filter((t) => t.status === "running");
		const latest = running[running.length - 1];
		return [
			{
				kind: "tool_call",
				id: "live:delta",
				turnId: undefined,
				timestamp: new Date(),
				payload: {
					source: "agent",
					data: {
						toolCallId: latest?.toolCallId ?? "live",
						toolName: latest?.toolName ?? "tool",
						status: "running",
						arguments: tryParseJson(deltaText) ?? deltaText,
					},
				},
			} satisfies ToolCallItem,
		];
	}
	return [
		{
			kind: "assistant_message",
			id: "live:delta",
			text: deltaText,
			timestamp: new Date(),
		},
	];
}

/** Tests + future view wiring share the MessageEntry narrowing. */
export function asMessageEntry(entry: SessionEntry): MessageEntry | null {
	return isMessageEntry(entry) ? entry : null;
}
