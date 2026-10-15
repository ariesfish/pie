// [pie] W4c: permission event → state → respond flow.
import { describe, expect, it, vi } from "vitest";

import { applyStoreEvent, useConnectionStore } from "@/stores/connection-store";

function withSession(sessionId: string | null = "s1") {
	useConnectionStore.setState({ sessionId });
}

describe("permission flow", () => {
	it("stores the active session's request and clears it on respond", async () => {
		withSession("s1");
		applyStoreEvent({
			ev: "session.permission.request",
			seq: 1,
			data: {
				sessionId: "s1",
				requestId: "r1",
				toolName: "bash",
				argsPreview: { command: "rm -rf /tmp/x" },
				annotations: undefined,
				reason: "Runs a shell command",
				timeoutMs: 30_000,
			},
		});
		expect(useConnectionStore.getState().permission).toMatchObject({
			requestId: "r1",
			toolName: "bash",
		});

		const request = vi.fn().mockResolvedValue({});
		useConnectionStore.setState({ conn: { request } as never });
		await useConnectionStore.getState().respondPermission("allow");
		expect(request).toHaveBeenCalledWith("permission.respond", {
			requestId: "r1",
			decision: "allow",
		});
		expect(useConnectionStore.getState().permission).toBeNull();
	});

	it("ignores requests for other sessions", () => {
		withSession("s1");
		applyStoreEvent({
			ev: "session.permission.request",
			seq: 1,
			data: {
				sessionId: "other",
				requestId: "r2",
				toolName: "fs.write",
				argsPreview: {},
				annotations: undefined,
				reason: "",
				timeoutMs: 30_000,
			},
		});
		expect(useConnectionStore.getState().permission).toBeNull();
	});
});
