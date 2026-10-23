// Session-list store rename/clear semantics: wire call shape, local row
// update, error state, event-driven sync, and the fallback title rule.
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionListItem } from "@pie/protocol";

import { useSessionListStore, sessionTitle } from "./session-list-store";
import { useConnectionStore, applyStoreEvent } from "./connection-store";
import { en, zhCN } from "@/i18n/resources";

function row(overrides: Partial<SessionListItem> = {}): SessionListItem {
	return {
		sessionId: "s1",
		path: "/tmp/s1.jsonl",
		workspaceId: "/ws",
		name: "旧名字",
		created: "2026-10-17T00:00:00.000Z",
		modified: "2026-10-17T00:00:00.000Z",
		messageCount: 1,
		firstMessage: "首条消息摘要",
		open: false,
		...overrides,
	};
}

function fakeConn(request: (cmd: string, args: any) => Promise<any>): never {
	return { request: vi.fn(request) } as never;
}

afterEach(() => {
	useSessionListStore.setState({
		sessions: [],
		projects: [],
		loading: false,
		error: null,
		fetchedAt: 0,
		search: "",
		renameError: null,
	});
	useConnectionStore.setState({ conn: null });
});

describe("renameSession", () => {
	it("trims input, sends the wire request, and updates the row locally", async () => {
		const request = vi.fn(async () => ({}));
		useConnectionStore.setState({ conn: fakeConn(request) });
		useSessionListStore.setState({ sessions: [row()] });

		await useSessionListStore.getState().renameSession("s1", "  支付联调  ");

		expect(request).toHaveBeenCalledWith("session.rename", { sessionId: "s1", name: "支付联调" });
		expect(useSessionListStore.getState().sessions[0].name).toBe("支付联调");
		expect(useSessionListStore.getState().renameError).toBeNull();
	});

	it("whitespace-only input clears the name (sends empty string)", async () => {
		const request = vi.fn(async () => ({}));
		useConnectionStore.setState({ conn: fakeConn(request) });
		useSessionListStore.setState({ sessions: [row()] });

		await useSessionListStore.getState().renameSession("s1", "   ");

		expect(request).toHaveBeenCalledWith("session.rename", { sessionId: "s1", name: "" });
		expect(useSessionListStore.getState().sessions[0].name ?? "").toBe("");
		expect(useSessionListStore.getState().renameError).toBeNull();
	});

	it("request failure sets renameError and leaves the row unchanged", async () => {
		const request = vi.fn(async () => {
			throw new Error("presentation_readonly");
		});
		useConnectionStore.setState({ conn: fakeConn(request) });
		useSessionListStore.setState({ sessions: [row()] });

		await useSessionListStore.getState().renameSession("s1", "新名字");

		expect(useSessionListStore.getState().sessions[0].name).toBe("旧名字");
		const err = useSessionListStore.getState().renameError;
		expect(err?.sessionId).toBe("s1");
		expect(err?.message).toContain("presentation_readonly");
	});

	it("without a connection, rename lands in renameError", async () => {
		useSessionListStore.setState({ sessions: [row()] });

		await useSessionListStore.getState().renameSession("s1", "x");

		const err = useSessionListStore.getState().renameError;
		expect(err?.sessionId).toBe("s1");
		expect(err?.message.length).toBeGreaterThan(0);
		expect(useSessionListStore.getState().sessions[0].name).toBe("旧名字");
	});
});

describe("event-driven name sync", () => {
	it("session.renamed updates the row name in place", () => {
		useSessionListStore.setState({ sessions: [row()] });

		applyStoreEvent({ ev: "session.renamed", data: { sessionId: "s1", name: "事件新名" } } as never);

		expect(useSessionListStore.getState().sessions[0].name).toBe("事件新名");
	});

	it("session.renamed with an empty name clears the row name", () => {
		useSessionListStore.setState({ sessions: [row()] });

		applyStoreEvent({ ev: "session.renamed", data: { sessionId: "s1", name: "" } } as never);

		expect(useSessionListStore.getState().sessions[0].name ?? "").toBe("");
	});

	it("session.renamed for an unknown session is ignored (no prepend)", () => {
		useSessionListStore.setState({ sessions: [row()] });

		applyStoreEvent({ ev: "session.renamed", data: { sessionId: "nope", name: "x" } } as never);

		expect(useSessionListStore.getState().sessions).toHaveLength(1);
		expect(useSessionListStore.getState().sessions[0].name).toBe("旧名字");
	});

	it("session.summary.updated still upserts rows (regression)", () => {
		useSessionListStore.setState({ sessions: [row()] });

		applyStoreEvent({
			ev: "session.summary.updated",
			data: { item: row({ sessionId: "s1", name: "汇总新名" }) },
		} as never);

		expect(useSessionListStore.getState().sessions[0].name).toBe("汇总新名");
	});
});

describe("sessionTitle fallback rule", () => {
	it("prefers name, then first message, else empty (caller resolves i18n)", () => {
		expect(sessionTitle(row())).toBe("旧名字");
		expect(sessionTitle(row({ name: undefined }))).toBe("首条消息摘要");
		expect(sessionTitle(row({ name: undefined, firstMessage: "" }))).toBe("");
		expect(sessionTitle(row({ name: "  " }))).toBe("首条消息摘要");
	});
});

describe("agentList.untitled fallback copy", () => {
	it("resolves to a non-empty, distinct label in both languages", () => {
		const enUntitled = en.agentList.untitled;
		const zhUntitled = zhCN.agentList.untitled;
		expect(enUntitled.length).toBeGreaterThan(0);
		expect(zhUntitled.length).toBeGreaterThan(0);
		expect(enUntitled).not.toBe(zhUntitled);
	});
});
