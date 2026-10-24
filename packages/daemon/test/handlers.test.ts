import { describe, expect, it } from "vitest";

import { CommandRouter } from "../src/server/commands.js";
import type { HandlerDeps } from "../src/server/handlers/deps.js";
import { registerSystemCommands } from "../src/server/handlers/system.js";

describe("daemon command handlers", () => {
	it("registers daemon.status without booting the WebSocket server", async () => {
		const router = new CommandRouter();
		const deps = {
			registry: { size: 2, workspacesInfo: () => [] },
			attachedClients: () => 3,
			piVersion: "0.0.0-test",
			piAgentDir: "/tmp/agent",
		} as unknown as HandlerDeps;

		registerSystemCommands(router, deps);
		const result = await router.dispatch("daemon.status", {}, {
			registry: deps.registry,
			serverId: "srv-test",
			connection: {} as never,
			uptimeMs: 42,
		});

		expect(result).toMatchObject({
			ok: true,
			data: {
				serverId: "srv-test",
				uptimeMs: 42,
				attachedClients: 3,
				openSessions: 2,
				pi: { version: "0.0.0-test", agentDir: "/tmp/agent" },
			},
		});
	});
});
