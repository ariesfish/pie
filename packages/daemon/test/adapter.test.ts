import { describe, expect, it } from "vitest";
import {
	buildStateInfo,
	mapSessionEntry,
	mapTree,
} from "../src/pi/adapter.js";
import type { SessionEntry as PiSessionEntry, SessionTreeNode } from "@earendil-works/pi-coding-agent";

describe("mapSessionEntry", () => {
	it("passes known entry kinds through structurally", () => {
		const piMessage = {
			type: "message",
			id: "e1",
			parentId: null,
			timestamp: "2025-10-11T00:00:00Z",
			message: { role: "assistant", content: [{ type: "text", text: "hi" }], provider: "x", model: "m" },
		} as PiSessionEntry;
		const mapped = mapSessionEntry(piMessage) as { type: string; message: { role: string } };
		expect(mapped.type).toBe("message");
		expect(mapped.message.role).toBe("assistant");

		const modelChange = {
			type: "model_change",
			id: "e2",
			parentId: "e1",
			timestamp: "t",
			provider: "openai",
			modelId: "gpt-5",
		} as PiSessionEntry;
		const mappedModel = mapSessionEntry(modelChange) as { type: string; provider: string; modelId: string };
		expect(mappedModel.type).toBe("model_change");
		expect(mappedModel.provider).toBe("openai");
	});

	it("collapses unknown entry kinds into opaque { data } entries", () => {
		const compaction = {
			type: "compaction",
			id: "e3",
			parentId: "e2",
			timestamp: "t",
			tokensBefore: 123,
			whateverFuture: "field",
		} as unknown as PiSessionEntry;
		const mapped = mapSessionEntry(compaction) as {
			type: string;
			data: Record<string, unknown>;
		};
		expect(mapped.type).toBe("compaction");
		expect(mapped.data).toEqual({ tokensBefore: 123, whateverFuture: "field" });
	});

	it("keeps custom entries (extension-owned) opaque", () => {
		const custom = {
			type: "custom",
			id: "e4",
			parentId: null,
			timestamp: "t",
			customType: "todo",
			data: { items: 3 },
		} as unknown as PiSessionEntry;
		const mapped = mapSessionEntry(custom) as { data: Record<string, unknown> };
		expect(mapped.data).toEqual({ customType: "todo", data: { items: 3 } });
	});
});

describe("mapTree", () => {
	it("flattens nested SessionTreeNode[] into TreeNodeMeta[]", () => {
		const node = (id: string, parentId: string | null, children: SessionTreeNode[] = []): SessionTreeNode =>
			({
				entry: { id, parentId, timestamp: `t-${id}`, type: "message" } as PiSessionEntry,
				children,
				label: id === "b" ? "experiment" : undefined,
			}) as SessionTreeNode;
		const tree = [node("a", null, [node("b", "a", [node("c", "b")]), node("d", "a")])];
		const flat = mapTree(tree);
		expect(flat).toHaveLength(4);
		expect(flat.find((n) => n.id === "b")).toMatchObject({ parentId: "a", label: "experiment" });
		expect(flat.find((n) => n.id === "d")).toMatchObject({ parentId: "a" });
	});

	it("carries a plain-text preview and role for message rows", () => {
		const node = {
			entry: {
				type: "message",
				id: "m1",
				parentId: null,
				timestamp: "t",
				message: {
					role: "user",
					content: [{ type: "text", text: "  hello\n  world  " }],
				},
			} as PiSessionEntry,
			children: [],
		} as SessionTreeNode;

		expect(mapTree([node])[0]).toMatchObject({
			id: "m1",
			role: "user",
			preview: "hello world",
		});
	});
});

describe("buildStateInfo (against a synthetic session)", () => {
	it("summarizes run/queue/compaction flags", () => {
		const session = {
			model: { provider: "openai", id: "gpt-5", name: "GPT-5", reasoning: true },
			thinkingLevel: "high",
			isStreaming: false,
			isCompacting: false,
			isRetrying: false,
			retryAttempt: 0,
			autoCompactionEnabled: true,
			steeringMode: "all",
			followUpMode: "all",
			pendingMessageCount: 0,
			messages: [{}, {}, {}],
		};
		const info = buildStateInfo(session as never);
		expect(info).toMatchObject({
			model: { provider: "openai", id: "gpt-5" },
			thinkingLevel: "high",
			isStreaming: false,
			autoCompaction: true,
			messageCount: 3,
		});
	});
});
