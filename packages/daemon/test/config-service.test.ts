import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ConfigError, ConfigService } from "../src/services/config-service.js";

let dir: string;
let service: ConfigService;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "pie-config-"));
	service = new ConfigService(dir);
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("ConfigService", () => {
	it("reads a missing file without creating it", async () => {
		const read = await service.read("settings");
		expect(read.exists).toBe(false);
		expect(read.content).toBe("");
		expect(read.path).toBe(join(dir, "settings.json"));
	});

	it("writes JSON atomically and returns a revision", async () => {
		const content = JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-5" }, null, 2);
		const written = await service.write("settings", content);
		expect(written.revision).toHaveLength(16);

		const read = await service.read("settings");
		expect(read.exists).toBe(true);
		expect(read.content).toBe(content);
		expect(read.revision).toBe(written.revision);
	});

	it("rejects a stale expected revision", async () => {
		const first = await service.write("mcp", JSON.stringify({ mcpServers: {} }));
		await service.write("mcp", JSON.stringify({ mcpServers: { fs: { command: "fs" } } }));

		await expect(
			service.write("mcp", JSON.stringify({ mcpServers: {} }), first.revision),
		).rejects.toMatchObject({ code: "conflict" });
	});

	it("rejects invalid JSON and non-objects", async () => {
		await expect(service.write("models", "{ nope")).rejects.toBeInstanceOf(ConfigError);
		await expect(service.write("models", "[]")).rejects.toMatchObject({ code: "invalid_config" });
	});

	it("summarizes settings, providers, MCP servers and auth without secrets", async () => {
		writeFileSync(join(dir, "settings.json"), JSON.stringify({ defaultProvider: "p", theme: "dark" }));
		writeFileSync(
			join(dir, "models.json"),
			JSON.stringify({ providers: { local: {}, "openai-compatible": {} } }),
		);
		writeFileSync(
			join(dir, "mcp.json"),
			JSON.stringify({ mcpServers: { files: {}, browser: {} } }),
		);
		writeFileSync(join(dir, "auth.json"), JSON.stringify({ openai: { token: "secret" } }));

		const overview = await service.overview();
		expect(overview.agentDir).toBe(dir);
		expect(overview.settings.defaultProvider).toBe("p");
		expect(overview.settings.theme).toBe("dark");
		expect(overview.models.providers).toEqual(["local", "openai-compatible"]);
		expect(overview.mcp.servers).toEqual(["browser", "files"]);
		expect(overview.authProviders).toEqual(["openai"]);
		expect(JSON.stringify(overview)).not.toContain("secret");
	});
});
