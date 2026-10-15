// [pie] W4b adapter tests: SessionEntry projections onto the StreamItem
// vocabulary of the ported foundation.
import { describe, expect, it } from "vitest";

import { buildStreamItems } from "./adapter";
import type { MessageEntry, SessionEntry } from "@pie/protocol";

function message(input: {
	id: string;
	role: string;
	content: unknown;
	timestamp?: string;
}): MessageEntry {
	return {
		id: input.id,
		parentId: null,
		timestamp: input.timestamp ?? "2026-07-18T00:00:00.000Z",
		type: "message",
		message: { role: input.role, content: input.content } as MessageEntry["message"],
	};
}

function opaque(): SessionEntry {
	return {
		id: "opaque-1",
		parentId: null,
		timestamp: "2026-07-18T00:00:00.000Z",
		type: "label",
		data: {},
	} as SessionEntry;
}

describe("buildStreamItems", () => {
	it("projects user text to a user message item", () => {
		const { history, liveHead } = buildStreamItems({
			entries: [message({ id: "u1", role: "user", content: "hello there" })],
			deltaText: "",
			deltaKind: null,
			toolCalls: {},
		});
		expect(history).toEqual([
			expect.objectContaining({ kind: "user_message", id: "u1", text: "hello there" }),
		]);
		expect(liveHead).toEqual([]);
	});

	it("lifts assistant blocks into message/thought/tool-call items", () => {
		const { history } = buildStreamItems({
			entries: [
				message({
					id: "a1",
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "pondering" },
						{ type: "text", text: "done" },
						{ type: "tool_use", id: "call-9", name: "bash", input: { cmd: "ls" } },
					],
				}),
			],
			deltaText: "",
			deltaKind: null,
			toolCalls: {
				"call-9": {
					toolCallId: "call-9",
					toolName: "bash",
					status: "ok",
					result: "files",
				},
			},
		});
		expect(history.map((item) => item.kind)).toEqual(["thought", "assistant_message", "tool_call"]);
		const tool = history[2];
		if (tool?.kind === "tool_call") {
			expect(tool.payload.data).toMatchObject({
				toolCallId: "call-9",
				toolName: "bash",
				status: "completed",
				result: "files",
			});
		} else {
			throw new Error("expected tool call");
		}
	});

	it("maps error records to failed calls; unrecorded stay running", () => {
		const { history } = buildStreamItems({
			entries: [
				message({
					id: "a2",
					role: "assistant",
					content: [
						{ type: "tool_use", id: "call-e", name: "bash", input: {} },
						{ type: "tool_use", id: "call-x", name: "fs", input: {} },
					],
				}),
			],
			deltaText: "",
			deltaKind: null,
			toolCalls: {
				"call-e": { toolCallId: "call-e", toolName: "bash", status: "error", result: "boom" },
			},
		});
		const failed = history[0];
		if (failed?.kind === "tool_call") {
			expect(failed.payload.data.status).toBe("failed");
			expect(failed.payload.data.error).toBe("boom");
		}
		const running = history[1];
		if (running?.kind === "tool_call") {
			expect(running.payload.data.status).toBe("running");
		}
	});

	it("renders the live delta as a single head item matching its kind", () => {
		const thinking = buildStreamItems({
			entries: [],
			deltaText: "pondering…",
			deltaKind: "thinking",
			toolCalls: {},
		});
		expect(thinking.liveHead).toEqual([
			expect.objectContaining({ kind: "thought", status: "loading" }),
		]);

		const text = buildStreamItems({
			entries: [],
			deltaText: "answer",
			deltaKind: "text",
			toolCalls: {},
		});
		expect(text.liveHead).toEqual([
			expect.objectContaining({ kind: "assistant_message", text: "answer" }),
		]);
	});

	it("skips non-message entries", () => {
		const { history } = buildStreamItems({
			entries: [opaque()],
			deltaText: "",
			deltaKind: null,
			toolCalls: {},
		});
		expect(history).toEqual([]);
	});
});
