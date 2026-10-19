// [pie] W4c → T-014: permission events → list + selection + batch respond flow.
// W4c 单请求语义保留为等价路径：respondPermission 走 permission.respond；
// 批量走 permission.respondMany；撤卡以 session.permission.settled 为权威。
import { describe, expect, it, vi } from "vitest";

import { applyStoreEvent, useConnectionStore } from "@/stores/connection-store";

function withSession(sessionId: string | null = "s1") {
	useConnectionStore.setState({ sessionId });
}

function resetPermissions() {
	useConnectionStore.setState({ permissions: [], permissionSelection: [], error: null });
}

function requestEvent(requestId: string, sessionId = "s1", toolName = "bash") {
	applyStoreEvent({
		ev: "session.permission.request",
		seq: 1,
		data: {
			sessionId,
			requestId,
			toolName,
			argsPreview: { command: "rm -rf /tmp/x" },
			annotations: undefined,
			reason: "Runs a shell command",
			timeoutMs: 30_000,
		},
	});
}

function settledEvent(requestId: string, source: "user" | "timeout" | "dispose" = "user") {
	applyStoreEvent({
		ev: "session.permission.settled",
		seq: 2,
		data: { sessionId: "s1", requestId, source },
	});
}

const decision = (ok = true) => {
	const request = vi.fn(ok ? vi.fn().mockResolvedValue({}) : vi.fn().mockRejectedValue(new Error("boom")));
	useConnectionStore.setState({ conn: { request } as never });
	return request;
};

describe("permission list (T-014)", () => {
	it("多请求 append 不互覆盖,顺序稳定,timeoutMs 保留", () => {
		withSession("s1");
		resetPermissions();
		requestEvent("r1");
		requestEvent("r2", "s1", "write");
		const cards = useConnectionStore.getState().permissions;
		expect(cards.map((c) => c.requestId)).toEqual(["r1", "r2"]);
		expect(cards[0]).toMatchObject({ requestId: "r1", toolName: "bash", timeoutMs: 30_000 });
	});

	it("非当前会话的请求忽略(既有语义)", () => {
		withSession("s1");
		resetPermissions();
		requestEvent("r9", "other");
		expect(useConnectionStore.getState().permissions).toEqual([]);
	});

	it("settled 到达移行 + 选择集同步(来源无关)", () => {
		withSession("s1");
		resetPermissions();
		requestEvent("r1");
		requestEvent("r2");
		useConnectionStore.getState().togglePermissionSelection("r1");
		useConnectionStore.getState().togglePermissionSelection("r2");
		expect(useConnectionStore.getState().permissionSelection).toEqual(["r1", "r2"]);

		settledEvent("r1", "user");
		expect(useConnectionStore.getState().permissions.map((c) => c.requestId)).toEqual(["r2"]);
		expect(useConnectionStore.getState().permissionSelection).toEqual(["r2"]);

		settledEvent("r2", "timeout");
		expect(useConnectionStore.getState().permissions).toEqual([]);
		expect(useConnectionStore.getState().permissionSelection).toEqual([]);
	});

	it("选择集生命周期:toggle 进出 / selectAll / clear", () => {
		withSession("s1");
		resetPermissions();
		requestEvent("r1");
		requestEvent("r2");
		requestEvent("r3");
		const s = useConnectionStore.getState();
		s.togglePermissionSelection("r1");
		s.togglePermissionSelection("r2");
		s.togglePermissionSelection("r1"); // 再点取消
		expect(useConnectionStore.getState().permissionSelection).toEqual(["r2"]);
		useConnectionStore.getState().clearPermissionSelection();
		expect(useConnectionStore.getState().permissionSelection).toEqual([]);
		useConnectionStore.getState().selectAllPermissions();
		expect(useConnectionStore.getState().permissionSelection).toEqual(["r1", "r2", "r3"]);
	});

	it("批量携带所选 id:selectAll + respondPermissions → respondMany(全部),乐观撤卡", async () => {
		withSession("s1");
		resetPermissions();
		requestEvent("r1");
		requestEvent("r2");
		const request = decision();
		useConnectionStore.getState().selectAllPermissions();
		await useConnectionStore.getState().respondPermissions(["r1", "r2"], "allow");
		expect(request).toHaveBeenCalledWith("permission.respondMany", {
			requestIds: ["r1", "r2"],
			decision: "allow",
		});
		expect(useConnectionStore.getState().permissions).toEqual([]);
		expect(useConnectionStore.getState().permissionSelection).toEqual([]);
	});

	it("单卡等价:respondPermission 走 permission.respond,同 id 结算乐观撤卡", async () => {
		withSession("s1");
		resetPermissions();
		requestEvent("r1");
		const request = decision();
		await useConnectionStore.getState().respondPermission("r1", "deny");
		expect(request).toHaveBeenCalledWith("permission.respond", {
			requestId: "r1",
			decision: "deny",
		});
		expect(useConnectionStore.getState().permissions).toEqual([]);
	});

	it("批量失败:错误置位 + 卡还原(服务端仍 pending,不加 settled 不丢卡)", async () => {
		withSession("s1");
		resetPermissions();
		requestEvent("r1");
		requestEvent("r2");
		const request = decision(false);
		await useConnectionStore.getState().respondPermissions(["r1", "r2"], "allow");
		expect(useConnectionStore.getState().error).toBe("boom");
		expect(useConnectionStore.getState().permissions.map((c) => c.requestId)).toEqual(["r1", "r2"]);
		expect(request).toHaveBeenCalledTimes(1);
	});

	it("单卡失败同样错误置位 + 卡还原(与批量一致)", async () => {
		withSession("s1");
		resetPermissions();
		requestEvent("r1");
		decision(false);
		await useConnectionStore.getState().respondPermission("r1", "allow");
		expect(useConnectionStore.getState().error).toBe("boom");
		expect(useConnectionStore.getState().permissions.map((c) => c.requestId)).toEqual(["r1"]);
	});
});
