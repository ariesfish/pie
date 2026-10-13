/**
 * package-service tests: drive the real DefaultPackageManager against temp
 * agent/project dirs (local sources only — no network).
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PackageService } from "../src/services/package-service.js";

let agentDir: string;
let cwd: string;
let localSourceDir: string;
let service: PackageService;

beforeAll(async () => {
	const base = await mkdtemp(join(tmpdir(), "pie-pkg-"));
	agentDir = join(base, "agent-home");
	cwd = join(base, "workspace");
	localSourceDir = join(base, "my-local-pkg");
	await mkdir(join(agentDir, "sessions"), { recursive: true });
	await mkdir(cwd, { recursive: true });
	await mkdir(join(cwd, ".pi"), { recursive: true });
	await mkdir(localSourceDir, { recursive: true });
	await writeFile(
		join(localSourceDir, "package.json"),
		JSON.stringify({
			name: "my-local-pkg",
			version: "1.0.0",
			pi: { extensions: ["ext.ts"], skills: ["skill.md"] },
		}),
	);
	await writeFile(join(localSourceDir, "ext.ts"), "export default () => () => {};\n");
	await writeFile(join(localSourceDir, "skill.md"), "---\nname: local-skill\ndescription: local\n---\n\nbody\n");
	service = new PackageService();
});

afterAll(async () => {
	await rm(join(agentDir, ".."), { recursive: true, force: true });
});

describe("PackageService (real DefaultPackageManager, local sources)", () => {
	it("lists empty when nothing configured", async () => {
		const res = await service.list(cwd, agentDir);
		expect(res.packages).toEqual([]);
	});

	it("installs a local source into project settings and resolves it", async () => {
		await service.install(cwd, agentDir, localSourceDir, true);
		const listed = await service.list(cwd, agentDir);
		// pi normalizes local sources to a relative spec when persisting.
		const mine = listed.packages.find(
			(p) => p.installedPath === localSourceDir || p.source.endsWith("my-local-pkg"),
		);
		expect(mine).toBeDefined();
		expect(mine!.scope).toBe("project");
		expect(mine!.filtered).toBe(false);
		expect(mine!.installedPath).toBeTruthy();
	});

	it("removes the configured source (absolute path matches the stored spec)", async () => {
		const res = await service.remove(cwd, agentDir, localSourceDir, true);
		expect(res.removed).toBe(true);
		const listed = await service.list(cwd, agentDir);
		expect(listed.packages).toHaveLength(0);
	});

	it("removing an unconfigured source reports false (not an error)", async () => {
		const res = await service.remove(cwd, agentDir, localSourceDir, true);
		expect(res.removed).toBe(false);
	});
});
