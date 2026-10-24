import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
		).rejects.toMatchObject({ code: "config_conflict" });
	});

	it("releases the file lock and caps oversized payloads", async () => {
		await service.write("models", JSON.stringify({ providers: {} }));
		expect(existsSync(join(dir, "models.json.lock"))).toBe(false);

		await expect(
			service.write("models", JSON.stringify({ padding: "x".repeat(1024 * 1024 + 1) })),
		).rejects.toMatchObject({ code: "config_too_large" });
	});

	it("accepts comments/trailing commas only in models.json", async () => {
		const commented = '{\n  // provider\n  "providers": { "acme": { "models": [{ "id": "m1" },] }, },\n}';
		await expect(service.write("settings", commented)).rejects.toMatchObject({
			code: "config_invalid",
		});
		await expect(service.write("models", commented)).resolves.toMatchObject({ file: "models" });
		expect((await service.overview()).models.providers).toEqual(["acme"]);
		await expect(
			service.upsertProvider({ id: "acme", models: [{ id: "m1" }] }),
		).rejects.toMatchObject({ code: "config_comments" });
	});

	it("does not clear the default when a delete loses the revision race", async () => {
		writeFileSync(
			join(dir, "models.json"),
			JSON.stringify({ providers: { acme: { models: [] } } }),
		);
		writeFileSync(
			join(dir, "settings.json"),
			JSON.stringify({ defaultProvider: "acme", defaultModel: "m1" }),
		);

		await expect(service.removeProvider("acme", "stale")).rejects.toMatchObject({
			code: "config_conflict",
		});
		expect(JSON.parse((await service.read("settings")).content)).toEqual({
			defaultProvider: "acme",
			defaultModel: "m1",
		});
	});

	it("rejects invalid JSON and non-objects", async () => {
		await expect(service.write("models", "{ nope")).rejects.toBeInstanceOf(ConfigError);
		await expect(service.write("models", "[]")).rejects.toMatchObject({ code: "config_invalid" });
	});

	it("upserts a provider while preserving unknown provider/model fields", async () => {
		writeFileSync(
			join(dir, "models.json"),
			JSON.stringify({
				topLevelUnknown: true,
				providers: {
					acme: {
						customProviderField: "keep",
						name: "Old",
						models: [
							{ id: "m1", customModelField: "keep", contextWindow: 1000 },
							{ id: "m2", name: "Second" },
						],
					},
				},
			}),
		);
		const before = await service.read("models");

		await service.upsertProvider(
			{
				id: "acme",
				name: "New",
				baseUrl: "https://acme.test/v1",
				api: "openai-completions",
				apiKey: "secret-key",
				models: [{ id: "m1", name: "First", maxTokens: 4096 }],
			},
			before.revision,
		);

		const parsed = JSON.parse((await service.read("models")).content);
		expect(parsed.topLevelUnknown).toBe(true);
		expect(parsed.providers.acme).toMatchObject({
			customProviderField: "keep",
			name: "New",
			baseUrl: "https://acme.test/v1",
			api: "openai-completions",
			apiKey: "secret-key",
		});
		expect(parsed.providers.acme.models).toEqual([
			{
				id: "m1",
				customModelField: "keep",
				contextWindow: 1000,
				name: "First",
				maxTokens: 4096,
			},
		]);
	});

	it("removes a provider and sets the default model without touching other settings", async () => {
		writeFileSync(
			join(dir, "models.json"),
			JSON.stringify({ providers: { acme: { models: [] }, other: { models: [] } } }),
		);
		writeFileSync(join(dir, "settings.json"), JSON.stringify({ theme: "dark", defaultModel: "old" }));

		const settingsRevision = (await service.read("settings")).revision;
		await service.setDefaultModel("acme", "m1", settingsRevision);
		expect(JSON.parse((await service.read("settings")).content)).toMatchObject({
			defaultProvider: "acme",
			defaultModel: "m1",
		});

		const modelsRevision = (await service.read("models")).revision;
		await service.removeProvider("acme", modelsRevision);
		expect(JSON.parse((await service.read("models")).content).providers).toEqual({
			other: { models: [] },
		});
		expect(JSON.parse((await service.read("settings")).content)).toEqual({ theme: "dark" });

		const nextSettingsRevision = (await service.read("settings")).revision;
		await service.setDefaultModel("other", "m1", nextSettingsRevision);
		expect(JSON.parse((await service.read("settings")).content)).toEqual({
			theme: "dark",
			defaultProvider: "other",
			defaultModel: "m1",
		});
	});

	it("rejects duplicate model ids", async () => {
		await expect(
			service.upsertProvider({
				id: "acme",
				models: [{ id: "m1" }, { id: "m1" }],
			}),
		).rejects.toMatchObject({ code: "config_invalid" });
	});

	it("summarizes settings, providers, MCP servers and auth without secrets", async () => {
		writeFileSync(join(dir, "settings.json"), JSON.stringify({ defaultProvider: "p", theme: "dark" }));
		writeFileSync(
			join(dir, "models.json"),
			JSON.stringify({
				providers: {
					local: { name: "Local", baseUrl: "http://localhost:1234", models: [{ id: "m1" }] },
					"openai-compatible": { apiKey: "$OPENAI_KEY", models: [] },
				},
			}),
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
		expect(overview.models.details).toEqual([
			{
				id: "local",
				name: "Local",
				baseUrl: "http://localhost:1234",
				api: undefined,
				modelCount: 1,
				hasApiKey: false,
				models: [{ id: "m1", name: undefined, contextWindow: undefined, maxTokens: undefined }],
			},
			{
				id: "openai-compatible",
				name: undefined,
				baseUrl: undefined,
				api: undefined,
				modelCount: 0,
				hasApiKey: true,
				models: [],
			},
		]);
		expect(overview.mcp.servers).toEqual(["browser", "files"]);
		expect(overview.authProviders).toEqual(["openai"]);
		expect(JSON.stringify(overview)).not.toContain("secret");
	});
});
