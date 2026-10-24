import { describe, expect, it } from "vitest";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

import { CommandRouter } from "../src/server/commands.js";
import { ConfigService } from "../src/services/config-service.js";
import { registerConfigCommands } from "../src/server/handlers/config.js";
import type { HandlerDeps } from "../src/server/handlers/deps.js";
import { registerSystemCommands } from "../src/server/handlers/system.js";

describe("daemon command handlers", () => {
	let configDir = "";
	beforeEach(() => {
		configDir = mkdtempSync(join(tmpdir(), "pie-handler-config-"));
	});
	afterEach(() => {
		rmSync(configDir, { recursive: true, force: true });
	});

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

	it("reads and writes config through the router", async () => {
		const router = new CommandRouter();
		const deps = {
			registry: { size: 0 },
			configService: new ConfigService(configDir),
		} as unknown as HandlerDeps;
		registerConfigCommands(router, deps);
		const ctx = {
			registry: deps.registry,
			connection: {} as never,
			serverId: "srv-test",
			uptimeMs: 0,
		};

		const written = await router.dispatch(
			"config.write",
			{ file: "settings", content: JSON.stringify({ defaultProvider: "openai" }) },
			ctx,
		);
		expect(written).toMatchObject({ ok: true, data: { file: "settings" } });

		const read = await router.dispatch("config.read", { file: "settings" }, ctx);
		expect(read).toMatchObject({
			ok: true,
			data: { exists: true, content: '{"defaultProvider":"openai"}' },
		});

		const overview = await router.dispatch("config.overview", {}, ctx);
		expect(overview).toMatchObject({
			ok: true,
			data: { settings: { defaultProvider: "openai" } },
		});

		const upserted = await router.dispatch(
			"config.models.upsertProvider",
			{
				draft: {
					id: "acme",
					api: "openai-completions",
					models: [{ id: "m1", name: "Model One" }],
				},
			},
			ctx,
		);
		expect(upserted.ok).toBe(true);
		const afterUpsert = await router.dispatch("config.overview", {}, ctx);
		expect(afterUpsert).toMatchObject({
			ok: true,
			data: {
				models: { details: [{ id: "acme", modelCount: 1, models: [{ id: "m1" }] }] },
			},
		});

		const defaulted = await router.dispatch(
			"config.models.setDefault",
			{ provider: "acme", model: "m1" },
			ctx,
		);
		expect(defaulted.ok).toBe(true);
		const removed = await router.dispatch(
			"config.models.removeProvider",
			{ providerId: "acme" },
			ctx,
		);
		expect(removed.ok).toBe(true);
	});
});
