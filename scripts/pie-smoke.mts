/**
 * pi-smoke: hermetic end-to-end check of the daemon + wire protocol.
 *
 * Boots a daemon with a temporary Pi agent dir (no ~/.pi/agent writes, no LLM
 * calls), then drives the protocol over a real WebSocket: hello, workspace,
 * session create/attach/snapshot/stats/models/list. Exit 0 = healthy.
 *
 * For a live check with a real model, start the daemon (`npm run daemon`) and
 * chat from the demo page instead.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { DaemonServer } from "../packages/daemon/src/server/server.js";
import { DAEMON_VERSION } from "../packages/daemon/src/version.js";

const PORT = 8799;
const TOKEN = "smoke-token";

function ok(label: string, detail = ""): void {
	console.log(`  ✓ ${label}${detail ? ` (${detail})` : ""}`);
}
function fail(label: string, err: unknown): never {
	console.error(`  ✗ ${label}: ${String(err)}`);
	process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "pie-smoke-"));
mkdirSync(join(dir, "agent-home", "sessions"), { recursive: true });
const workspace = join(dir, "workspace");
mkdirSync(workspace, { recursive: true });
process.env.PI_CODING_AGENT_DIR = join(dir, "agent-home");

const server = new DaemonServer({
	listenHost: "127.0.0.1",
	listenPort: PORT,
	token: TOKEN,
	agentDir: join(dir, "agent-home"),
	servePage: true,
	piVersion: "1.1.0",
	piAgentDir: join(dir, "agent-home"),
});

try {
	console.log(`pi-smoke (daemon v${DAEMON_VERSION})`);
	const bound = await server.start();
	ok(`listening on ${bound.host}:${bound.port}`);

	// P0 static page serves.
	const page = await fetch(`http://127.0.0.1:${PORT}/?token=${TOKEN}`);
	const html = await page.text();
	if (page.status !== 200 || !html.includes("pie")) throw new Error("demo page missing");
	ok("HTTP demo page serves");

	// Wire flow over a real WebSocket.
	const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
	await new Promise((resolve, reject) => {
		ws.on("open", resolve);
		ws.on("error", reject);
	});

	let next = 0;
	const pending = new Map<string, { resolve: (d: unknown) => void; reject: (e: Error) => void }>();
	const events: Array<{ ev: string; data: Record<string, unknown> }> = [];
	ws.on("message", (chunk) => {
		const text = typeof chunk === "string" ? chunk : Buffer.from(chunk as ArrayBuffer).toString("utf8");
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			const pkt = JSON.parse(line) as Record<string, any>;
			if (pkt.helloAck) {
				const p = pending.get("hello");
				pending.delete("hello");
				p?.resolve(pkt.helloAck);
			} else if (pkt.fatal) {
				const p = pending.get("hello");
				pending.delete("hello");
				p?.reject(new Error(`fatal: ${pkt.fatal.code} ${pkt.fatal.message}`));
			} else if (pkt.ev !== undefined) {
				events.push({ ev: pkt.ev, data: pkt.data });
			} else if (pkt.id) {
				const p = pending.get(pkt.id);
				if (p) {
					pending.delete(pkt.id);
					if (pkt.ok) p.resolve(pkt.data);
					else p.reject(new Error(`${pkt.error.code}: ${pkt.error.message}`));
				}
			}
		}
	});
	const request = (cmd: string, args: Record<string, unknown> = {}) =>
		new Promise<Record<string, any>>((resolve, reject) => {
			const id = `c-${++next}`;
			pending.set(id, { resolve: resolve as never, reject });
			ws.send(JSON.stringify({ id, cmd, args }) + "\n");
		});

	// Hello
	const hello = new Promise<Record<string, any>>((resolve, reject) => {
		pending.set("hello", { resolve: resolve as never, reject });
	});
	ws.send(
		JSON.stringify({
			hello: {
				v: 1,
				client: { kind: "cli", version: "0.1.0", platform: process.platform },
				caps: ["treeSync"],
				auth: { method: "token", token: TOKEN },
			},
		}) + "\n",
	);
	const ack = await hello;
	ok("hello/helloAck", `serverId ${String(ack.serverId).slice(0, 14)}…`);

	const status = await request("daemon.status");
	ok("daemon.status", `daemon v${String(status.version)}, pi ${String(status.pi.version)}`);

	await request("workspace.open", { path: workspace });
	ok("workspace.open");

	const created = await request("session.create", { workspaceId: workspace });
	const sessionId = created.sessionId as string;
	ok("session.create", `id ${sessionId.slice(0, 8)}…`);

	const attach = await request("session.attach", { sessionId });
	if (attach.presentation !== "readwrite") throw new Error("expected readwrite presentation");
	ok("session.attach", `leaf ${String(attach.leafId)}`);

	await new Promise((resolve) => {
		const check = () => {
			if (events.some((e) => e.ev === "session.snapshot")) resolve(null);
			else setTimeout(check, 20);
		};
		check();
	});
	const snap = events.find((e) => e.ev === "session.snapshot");
	const snapshotData = snap!.data.snapshot as Record<string, any>;
	if (snapshotData.sessionId !== sessionId) throw new Error("snapshot sessionId mismatch");
	ok("session.snapshot", `tree ${snapshotData.tree.length} nodes, entries ${snapshotData.entries.length}`);

	const stats = await request("session.stats", { sessionId });
	ok("session.stats", `${String(stats.totalMessages)} messages`);

	const models = await request("models.list", { workspaceId: workspace, sessionId });
	ok("models.list", `${models.models.length} models`);

	const listed = await request("session.list", { workspaceId: workspace });
	const mine = (listed.sessions as Array<Record<string, unknown>>).filter((s) => s.sessionId === sessionId);
	if (mine.length !== 1) throw new Error("created session missing from session.list");
	ok("session.list", "created session present");

	// --- P1: tree / fork / navigate / resources --------------------------------
	// Fixture session on disk (session-format.md shape, version 3).
	const fixtureDir = join(dir, "agent-home", "sessions", "--smoke-fixture--");
	mkdirSync(fixtureDir, { recursive: true });
	const fixturePath = join(fixtureDir, "2026-10-11T00-00-00-000Z_smokefix1.jsonl");
	writeFileSync(
		fixturePath,
		[
			JSON.stringify({ type: "session", version: 3, id: "smokefix1", timestamp: "2026-10-11T00:00:00.000Z", cwd: workspace }),
			JSON.stringify({ type: "message", id: "s1", parentId: null, timestamp: "2026-10-11T00:00:01.000Z", message: { role: "user", content: "smoke fixture", timestamp: 1 } }),
			JSON.stringify({ type: "message", id: "s2", parentId: "s1", timestamp: "2026-10-11T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "reply" }], provider: "fake", model: "fake", timestamp: 2 } }),
		].join("\n") + "\n",
	);
	const attached = await request("session.attach", { sessionId: "smokefix1", path: fixturePath });
	ok("session.attach by path", `leaf ${String(attached.leafId).slice(0, 8)}…`);

	const tree = await request("session.tree", { sessionId: "smokefix1" });
	if (!Array.isArray(tree.tree) || tree.tree.length < 3) throw new Error("session.tree returned no tree");
	ok("session.tree", `${tree.tree.length} nodes`);

	const forked = await request("session.forkAt", { sessionId: "smokefix1", entryId: "s2", position: "at" });
	if (typeof forked.sessionId !== "string") throw new Error("forkAt failed");
	ok("session.forkAt", `new session ${String(forked.sessionId).slice(0, 8)}…`);

	const navd = await request("session.navigate", { sessionId: "smokefix1", entryId: "s2" });
	ok("session.navigate", `cancelled=${String(navd.cancelled)}`);

	const resources = await request("resources.overview", { sessionId: "smokefix1" });
	ok("resources.overview", `${(resources.commands as unknown[]).length} commands, ${(resources.extensions as unknown[]).length} extensions`);

	const forkPreview = await request("session.forkPreview", { sessionId: "smokefix1" });
	ok("session.forkPreview", `${(forkPreview.items as unknown[]).length} fork points`);

	// --- P2b-1: workspace fs + git observation --------------------------------
	// Real git repo fixture in the smoke workspace.
	const { execFile: execCb } = await import("node:child_process");
	const { promisify } = await import("node:util");
	const exec = promisify(execCb);
	await exec("git", ["init", "-q"], { cwd: workspace });
	await exec("git", ["config", "user.email", "smoke@t"], { cwd: workspace });
	await exec("git", ["config", "user.name", "smoke"], { cwd: workspace });
	writeFileSync(join(workspace, "committed.ts"), "export const a = 1;\n");
	mkdirSync(join(workspace, "src"), { recursive: true });
	await exec("git", ["add", "-A"], { cwd: workspace });
	await exec("git", ["commit", "-qm", "init"], { cwd: workspace });
	writeFileSync(join(workspace, "committed.ts"), "export const a = 2;\n");
	writeFileSync(join(workspace, "untracked.ts"), "const u = 1;\n");
	// Project-local skill, present before the first session.create so its
	// resourceLoader discovers it.
	mkdirSync(join(workspace, ".pi", "skills"), { recursive: true });
	writeFileSync(
		join(workspace, ".pi", "skills", "smoke-skill.md"),
		"---\nname: smoke-skill\ndescription: smoke test skill\n---\n\nUseful body text.\n",
	);

	const fsList = await request("fs.list", { workspaceId: workspace });
	const names = (fsList.entries as Array<Record<string, unknown>>).map((e) => e.name);
	if (!names.includes("committed.ts") || names.includes(".git")) throw new Error("fs.list wrong shape");
	ok("fs.list", `${names.length} entries, .git ignored`);

	const fsRead = await request("fs.read", { workspaceId: workspace, path: "committed.ts" });
	if (fsRead.text !== "export const a = 2;\n") throw new Error("fs.read content mismatch");
	ok("fs.read", `${String(fsRead.bytes)} bytes, not truncated`);

	const watchRes = await request("fs.watch", { workspaceId: workspace });
	ok("fs.watch", `id ${String(watchRes.watchId)}`);

	const gitStatus = await request("git.status", { workspaceId: workspace });
	const statusPaths = (gitStatus.entries as Array<Record<string, unknown>>).map((e) => e.path);
	if (!statusPaths.includes("committed.ts") || !statusPaths.includes("untracked.ts")) {
		throw new Error("git.status missing entries");
	}
	ok("git.status", `branch ${String(gitStatus.branch)}, ${statusPaths.length} entries`);

	const gitDiff = await request("git.diff", { workspaceId: workspace, path: "committed.ts" });
	const patch = String((gitDiff.files as Array<Record<string, unknown>>)[0]?.patch ?? "");
	if (!patch.includes("-export const a = 1;") || !patch.includes("+export const a = 2;")) {
		throw new Error("git.diff patch content mismatch");
	}
	ok("git.diff", `patch ${patch.split("\n").length} lines`);

	const gitDiffUntracked = await request("git.diff", {
		workspaceId: workspace,
		path: "untracked.ts",
		includeUntracked: true,
	});
	const uPatch = String((gitDiffUntracked.files as Array<Record<string, unknown>>)[0]?.patch ?? "");
	if (!uPatch.includes("+const u = 1;")) throw new Error("untracked diff patch missing");
	ok("git.diff includeUntracked", "synthesize add patch");

	// Watcher event end-to-end: touching a file under the workspace must
	// surface workspace.fs.changed on this connection.
	writeFileSync(join(workspace, "watched.txt"), "v1\n");
	const fsChanged = await new Promise<Record<string, unknown>>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("workspace.fs.changed not received in 8s")), 8000);
		const tick = () => {
			// Wait for a batch that carries watched.txt — earlier batches from
			// git plumbing noise are legitimate and skew the first-hit.
			const hit = events.find(
				(e) => e.ev === "workspace.fs.changed" && JSON.stringify(e.data.paths ?? []).includes("watched.txt"),
			);
			if (hit) {
			 clearTimeout(timer);
				resolve(hit.data);
			} else setTimeout(tick, 50);
		};
		tick();
	});
	if (!String(fsChanged.paths ?? "").includes("watched.txt")) {
		throw new Error("workspace.fs.changed paths missing watched.txt");
	}
	ok("workspace.fs.changed event", `${(fsChanged.paths as unknown[]).length} paths batched`);

	const unwatch = await request("fs.unwatch", { watchId: watchRes.watchId });

	// --- P2c: packages + skills ------------------------------------------------
	// Local package fixture in the smoke workspace.
	const localPkg = join(dir, "smoke-local-pkg");
	mkdirSync(localPkg, { recursive: true });
	writeFileSync(
		join(localPkg, "package.json"),
		JSON.stringify({ name: "smoke-local-pkg", version: "1.0.0", pi: { skills: [] } }),
	);

	const cfg0 = await request("config.overview");
	ok("config.overview", `${cfg0.agentDir} (models ${cfg0.files.models.exists ? "present" : "absent"})`);
	await request("config.models.upsertProvider", {
		draft: {
			id: "smoke-model",
			baseUrl: "http://127.0.0.1:9/v1",
			api: "openai-completions",
			models: [{ id: "smoke-1", name: "Smoke" }],
		},
		expectedRevision: cfg0.files.models.revision,
	});
	const cfg1 = await request("config.overview");
	const smokeProvider = (cfg1.models.details as Array<{ id: string; modelCount: number }>).find(
		(provider) => provider.id === "smoke-model",
	);
	if (!smokeProvider || smokeProvider.modelCount !== 1) throw new Error("config upsert missing");
	ok("config.models.upsertProvider", "smoke-model/1 model");
	await request("config.models.removeProvider", {
		providerId: "smoke-model",
		expectedRevision: cfg1.files.models.revision,
	});
	ok("config.models.removeProvider", "smoke-model");

	const pkgs0 = await request("packages.list", { workspaceId: workspace });
	ok("packages.list (empty)", `${(pkgs0.packages as unknown[]).length} configured`);

	await request("packages.install", { workspaceId: workspace, source: localPkg, project: true });
	const pkgs1 = await request("packages.list", { workspaceId: workspace });
	if ((pkgs1.packages as unknown[]).length !== 1) throw new Error("installed package not listed");
	ok("packages.install (local)", "1 configured");

	const rmPkg = await request("packages.remove", { workspaceId: workspace, source: localPkg, project: true });
	if (rmPkg.removed !== true) throw new Error("package remove failed");
	const pkgs2 = await request("packages.list", { workspaceId: workspace });
	if ((pkgs2.packages as unknown[]).length !== 0) throw new Error("package list not empty after remove");
	ok("packages.remove (local)", "0 configured");

	// A session created after the skill fixture exists picks it up
	// (the very first session predates .pi/skills in this workspace).
	const resourced = await request("session.create", { workspaceId: workspace });
	const resourcedId = resourced.sessionId as string;
	const skills = await request("skills.list", { sessionId: resourcedId });
	const skill = (skills.skills as Array<Record<string, unknown>>).find((x) => x.name === "smoke-skill");
	if (!skill) {
		console.error(
			"[smoke] skills.list returned:",
			JSON.stringify(
				(skills.skills as Array<Record<string, unknown>>).map((x) => x.name).slice(0, 8),
			),
		);
		throw new Error("smoke-skill missing from skills.list");
	}
	ok("skills.list", `${(skills.skills as unknown[]).length} skills, found fixture`);

	const skillBody = await request("skills.read", { sessionId: resourcedId, filePath: skill.filePath });
	if (!String(skillBody.content).includes("Useful body text.")) throw new Error("skills.read body mismatch");
	ok("skills.read", `${String(skillBody.content).length} chars`);

	const badRead = await request("skills.read", {
		sessionId: resourcedId,
		filePath: join(workspace, "committed.ts"),
	}).then(
		() => null,
		(e: Error) => e,
	);
	if (!badRead) throw new Error("skills.read must reject unknown paths");
	ok("skills.read (rejects unknown path)", badRead.message.slice(0, 40));
	ok("fs.unwatch", `${JSON.stringify(unwatch) === "{}" ? "ok" : "?"}`);

	ws.close();
	await server.stop();
	rmSync(dir, { recursive: true, force: true });
	console.log("pi-smoke: ALL GREEN");
	process.exit(0);
} catch (err) {
	fail("smoke", err);
}
