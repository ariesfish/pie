/**
 * fs-service + git-service tests: real temp directories and a real git repo
 * (git is required on the host — same as the daemon deployment assumption).
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FsService } from "../src/services/fs-service.js";
import {
	changeKindOf,
	GitService,
	parseStatusZ,
	parseUnifiedDiff,
} from "../src/services/git-service.js";

const exec = promisify(execFile);

let root: string;
let fsService: FsService;
let gitService: GitService;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), "pie-p2b-"));
	fsService = new FsService();
	gitService = new GitService();

	await exec("git", ["init", "-q"], { cwd: root });
	await exec("git", ["config", "user.email", "t@t"], { cwd: root });
	await exec("git", ["config", "user.name", "t"], { cwd: root });
	// Hostile diff config on purpose: a user-global diff.mnemonicPrefix renames
	// the a/ b/ markers the parser splits on; the daemon must pin prefixes and
	// parse regardless (regression: both gitService.diff cases parsed to []).
	await exec("git", ["config", "diff.mnemonicPrefix", "true"], { cwd: root });
	await mkdir(join(root, "node_modules"), { recursive: true });
	await mkdir(join(root, "src"), { recursive: true });
	await writeFile(join(root, "src", "committed.ts"), "export const a = 1;\n");
	await writeFile(join(root, "node_modules", "junk.txt"), "junk\n");
	await writeFile(join(root, ".gitignore"), "node_modules/\n");
	await exec("git", ["add", "-A"], { cwd: root });
	await exec("git", ["commit", "-q", "-m", "init"], { cwd: root });
});

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

describe("FsService.list", () => {
	it("lists one level, dirs first, ignoring known junk", async () => {
		const entries = await fsService.list(root, undefined);
		const names = entries.map((e) => e.name);
		expect(names).toContain("src");
		expect(names).toContain(".gitignore");
		expect(names).not.toContain("node_modules");
		expect(names).not.toContain(".git");
		const srcIdx = names.indexOf("src");
		const giIdx = names.indexOf(".gitignore");
		expect(srcIdx).toBeLessThan(giIdx);
	});

	it("lists subdirectories via relPath", async () => {
		const entries = await fsService.list(root, "src");
		expect(entries.map((e) => e.path)).toEqual(["src/committed.ts"]);
		expect(entries[0]!.kind).toBe("file");
		expect(entries[0]!.size).toBeGreaterThan(0);
		expect(entries[0]!.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("maps missing dirs to not_found", async () => {
		await expect(fsService.list(root, "does/not/exist")).rejects.toMatchObject({
			code: "not_found",
		});
	});
});

describe("FsService.read", () => {
	it("reads text with byte size and no truncation", async () => {
		const res = await fsService.read(root, "src/committed.ts", undefined);
		expect(res.binary).toBe(false);
		expect(res.truncated).toBe(false);
		expect(res.text).toContain("export const a = 1");
		expect(res.bytes).toBe(res.text!.length);
	});

	it("detects binary content", async () => {
		const bin = Buffer.from([0x00, 0x01, 0x02, 0x00, 0x05]);
		await writeFile(join(root, "blob.bin"), bin);
		const res = await fsService.read(root, "blob.bin", undefined);
		expect(res.binary).toBe(true);
		expect(res.text).toBeNull();
		expect(res.bytes).toBe(5);
	});

	it("truncates at maxBytes", async () => {
		const res = await fsService.read(root, "src/committed.ts", 4);
		expect(res.truncated).toBe(true);
		expect(res.text!.length).toBe(4);
	});

	it("maps missing files to not_found", async () => {
		await expect(fsService.read(root, "nope.ts", undefined)).rejects.toMatchObject({
			code: "not_found",
		});
	});
});

describe("FsService.write", () => {
	it("writes atomically and reports bytes", async () => {
		const res = await fsService.write(root, "src/written.ts", "const w = 1;\n");
		expect(res.status).toBe("written");
		expect(res).toMatchObject({ status: "written", path: "src/written.ts", bytes: 13 });
		const readBack = await fsService.read(root, "src/written.ts", undefined);
		expect(readBack.text).toBe("const w = 1;\n");
		// no tmp leftovers
		const entries = await fsService.list(root, "src");
		expect(entries.some((e) => e.name.includes(".pie-tmp-"))).toBe(false);
	});

	it("rejects path traversal with forbidden", async () => {
		await expect(fsService.write(root, "../outside.txt", "x")).rejects.toMatchObject({
			code: "forbidden",
		});
		await expect(fsService.write(root, "/abs.txt", "x")).rejects.toMatchObject({
			code: "forbidden",
		});
	});
});

// ADR-0006: optimistic concurrency (two-token CAS; conflicts carry the
// current on-disk version, null for deleted).
describe("FsService.write CAS (ADR-0006)", () => {
	it("written returns the fresh on-disk version", async () => {
		const res = await fsService.write(root, "src/cas-a.ts", "const a = 1;\n");
		expect(res.status).toBe("written");
		if (res.status !== "written") return;
		expect(res.version.revision).toMatch(/^\d+:\d+:13:/);
		expect(res.version.size).toBe(13);
		expect(typeof res.version.modifiedAt).toBe("string");
	});

	it("matches by revision token (no same-ms TOCTOU)", async () => {
		const read0 = await fsService.read(root, "src/cas-a.ts", undefined);
		const res = await fsService.write(root, "src/cas-a.ts", "const a = 2;\n", {
			revision: read0.version.revision,
		});
		expect(res.status).toBe("written");
	});

	it("conflicts when the revision drifted (outside edit)", async () => {
		const read0 = await fsService.read(root, "src/cas-a.ts", undefined);
		await fsService.write(root, "src/cas-a.ts", "const a = 3;\n"); // unconditional bump
		const res = await fsService.write(root, "src/cas-a.ts", "const a = 4;\n", {
			revision: read0.version.revision,
		});
		expect(res.status).toBe("conflict");
		if (res.status !== "conflict") return;
		expect(res.version).not.toBeNull();
		expect(res.version?.size).toBe(13); // still the "a = 3" content
	});

	it("degrades to ISO-mtime matching when no revision is given", async () => {
		const read0 = await fsService.read(root, "src/cas-a.ts", undefined);
		const ok = await fsService.write(root, "src/cas-a.ts", "const a = 4;\n", {
			modifiedAt: read0.version.modifiedAt,
		});
		expect(ok.status).toBe("written");
		const stale = await fsService.write(root, "src/cas-a.ts", "const a = 5;\n", {
			modifiedAt: "2000-01-01T00:00:00.000Z",
		});
		expect(stale.status).toBe("conflict");
	});

	it("conflicts with version null after the file was deleted", async () => {
		const read0 = await fsService.read(root, "src/cas-a.ts", undefined);
		await rm(join(root, "src/cas-a.ts"));
		const res = await fsService.write(root, "src/cas-a.ts", "const a = 6;\n", {
			revision: read0.version.revision,
		});
		expect(res.status).toBe("conflict");
		if (res.status !== "conflict") return;
		expect(res.version).toBeNull();
	});

	it("omitting both tokens writes unconditionally (legacy callers)", async () => {
		await writeFile(join(root, "src/cas-b.ts"), "const b = 1;\n");
		const res = await fsService.write(root, "src/cas-b.ts", "const b = 2;\n");
		expect(res.status).toBe("written");
		const readB = await fsService.read(root, "src/cas-b.ts", undefined);
		expect(readB.text).toBe("const b = 2;\n");
	});

	it("read results carry the version for CAS callers", async () => {
		const read0 = await fsService.read(root, "src/cas-b.ts", undefined);
		expect(read0.version.revision).toMatch(/^\d+:\d+:13:/);
		expect(typeof read0.version.modifiedAt).toBe("string");
	});
});

describe("parseStatusZ", () => {
	it("parses branch header, plain and rename entries", () => {
		const raw = [
			"## main",
			"R  src/renamed2.txt",
			"src/renamed.txt",
			"?? new.txt",
			" M  changed.ts",
		].join("\0");
		const { branch, entries } = parseStatusZ(raw);
		expect(branch).toBe("main");
		expect(entries).toHaveLength(3);
		expect(entries[0]).toMatchObject({
			index: "R",
			worktree: " ",
			origPath: "src/renamed.txt",
			path: "src/renamed2.txt",
		});
		expect(entries[1]).toMatchObject({ untracked: true });
		expect(entries[2]).toMatchObject({ index: " ", worktree: "M" });
	});

	it("changeKindOf maps letters to kinds", () => {
		expect(changeKindOf({ path: "x", index: "A", worktree: " ", untracked: false })).toBe("added");
		expect(changeKindOf({ path: "x", index: "?", worktree: "?", untracked: true })).toBe("untracked");
		expect(changeKindOf({ path: "x", index: " ", worktree: "M", untracked: false })).toBe("modified");
	});
});

describe("GitService (real repo)", () => {
	beforeAll(async () => {
		await writeFile(join(root, "src", "committed.ts"), "export const a = 2;\n");
		await writeFile(join(root, "untracked.ts"), "const u = 1;\n");
	});

	it("status returns branch and entries for a real repo", async () => {
		const st = await gitService.status(root);
		expect(st.repoRoot).toBe(root);
		expect(st.branch).toBeTruthy();
		const paths = st.entries.map((e) => e.path);
		expect(paths).toContain("src/committed.ts");
		expect(paths).toContain("untracked.ts");
	});

	it("diff returns the modified file with a patch body", async () => {
		const { files } = await gitService.diff(root, { path: "src/committed.ts" });
		expect(files).toHaveLength(1);
		const f = files[0]!;
		expect(f.change).toBe("modified");
		expect(f.patch).toContain("-export const a = 1;");
		expect(f.patch).toContain("+export const a = 2;");
	});

	it("diff includeUntracked synthesizes an add patch", async () => {
		const { files } = await gitService.diff(root, {
			path: "untracked.ts",
			includeUntracked: true,
		});
		expect(files).toHaveLength(1);
		expect(files[0]!.change).toBe("untracked");
		expect(files[0]!.patch).toContain("+const u = 1;");
	});

	it("status on a non-repo dir reports not_a_repo", async () => {
		const plain = await mkdtemp(join(tmpdir(), "pie-nogit-"));
		try {
			await expect(gitService.status(plain)).rejects.toMatchObject({
				code: "not_a_repo",
			});
		} finally {
			await rm(plain, { recursive: true, force: true });
		}
	});
});

describe("parseUnifiedDiff", () => {
	it("splits per-file bodies with the b-side path", () => {
		const raw = [
			"diff --git a/src/a.ts b/src/b.ts",
			"index 111..222 100644",
			"--- a/src/a.ts",
			"+++ b/src/b.ts",
			"@@ -1 +1 @@",
			"-x",
			"+y",
			"diff --git a/c.txt b/c.txt",
			"new file mode 100644",
			"--- /dev/null",
			"+++ b/c.txt",
			"@@ -0,0 +1 @@",
		].join("\n");
		const files = parseUnifiedDiff(raw);
		expect(files).toHaveLength(2);
		expect(files[0]).toMatchObject({ path: "src/b.ts", change: "modified" });
		expect(files[0]!.patch).toContain("-x");
		expect(files[1]!.change).toBe("added");
	});

	it("flags binary patches", () => {
		const raw = ["diff --git a/x.bin b/x.bin", "Binary files a/x.bin and b/x.bin differ"].join("\n");
		const files = parseUnifiedDiff(raw);
		expect(files[0]!.binary).toBe(true);
	});
});
