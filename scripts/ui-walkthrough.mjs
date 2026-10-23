#!/usr/bin/env node
// UI walkthrough (W1 acceptance tool): an interactive end-to-end pass of the
// built app against a real daemon — connection, explorer rail, files +
// CodeMirror, diff, session creation, pane splitting, tab drag, rail resize,
// and the compact drawer gestures. Asserts through the DOM; screenshots land
// next to it for human/vision review.
//
// Usage:
//   npm run ui-walkthrough                     # fresh web export + run
//   npm run ui-walkthrough -- --reuse-export   # reuse packages/app/dist
//   npm run ui-walkthrough -- --shots <dir>    # screenshot dir (default ./ui-walkthrough-shots)
//   npm run ui-walkthrough -- --keep           # keep the scratch fixture for inspection
//
// Requirements: playwright-core (repo devDependency on demand) and either
// system Chrome or downloaded playwright browsers.
import { spawn, spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const REUSE_EXPORT = flag("reuse-export");
const KEEP = flag("keep");
const DAEMON_PORT = Number(opt("daemon-port", "8761"));
const STATIC_PORT = Number(opt("static-port", "8899"));
const TOKEN = `walk-${randomUUID().slice(0, 8)}`;
const SHOTS = resolve(opt("shots", join(ROOT, "ui-walkthrough-shots")));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, extra = "") {
	results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
	if (!ok) process.exitCode = 1;
}

const children = [];

async function main() {
	// ---------------------------------------------------------------- fixture
	const scratch = mkdtempSync(join(tmpdir(), "pie-ui-walk-"));
	const workspace = join(scratch, "workspace");
	const agentDir = join(scratch, "agent");
	mkdirSync(join(workspace, "src"), { recursive: true });
	mkdirSync(agentDir, { recursive: true });
	write(workspace, "src/app.ts", 'export function greet(name: string): string {\n\treturn `Hello, ${name}!`;\n}\n// dirty line\n');
	write(
		workspace,
		"README.md",
		"---\ntitle: Walkthrough Fixture\ntags:\n  - fixture\n  - markdown\n---\n\n# Walkthrough Fixture\n\nA tiny repo for exercising the files tree, changes panel and diff view.\n\n## Rendering\n\nMarkdown preview goes through the ported renderer:\n\n```ts\nconst answer = 42;\n```\n\n```mermaid\ngraph LR\n  Explore[Explore] --> Render[Render]\n  Render --> Ship[Ship]\n```\n",
	);
	run("git", ["init", "-q", "."], { cwd: workspace });
	run("git", ["add", "-A"], { cwd: workspace });
	run("git", ["commit", "-qm", "fixture init"], { cwd: workspace });
	// The commit lands CLEAN, then the tree goes dirty: a tracked-file edit
	// (the trailing-dirty-line app.ts rewrite below) + an untracked notes.txt.
	write(
		workspace,
		"src/app.ts",
		'export function greet(name: string): string {\n\treturn `Hello, ${name}!`;\n}\n',
	);
	write(workspace, "notes.txt", "untracked\n");

	// ---------------------------------------------------------------- web export
	const exportDir = join(scratch, "web-export");
	const bundled = join(ROOT, "packages", "app", "dist");
	if (REUSE_EXPORT && existsSync(bundled)) {
		cpSync(bundled, exportDir, { recursive: true });
	} else {
		console.log("• exporting web bundle (~a minute)…");
		await runAsync(["npx", "expo", "export", "--platform", "web", "--output-dir", exportDir], {
			cwd: join(ROOT, "packages", "app"),
		});
	}

	// ---------------------------------------------------------------- daemon
	console.log("• starting daemon on", DAEMON_PORT, "…");
	const daemon = spawn(
		"npx",
		[
			"tsx",
			"packages/daemon/src/index.ts",
			"--listen",
			`127.0.0.1:${DAEMON_PORT}`,
			"--token",
			TOKEN,
			"--pi",
			agentDir,
		],
		{ cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
	);
	children.push(daemon);
	daemon.stdout.resume();
	daemon.stderr.resume();
	if (!(await waitFor(`http://127.0.0.1:${DAEMON_PORT}/`, 40_000))) {
		console.error("daemon did not come up");
		return finish(null);
	}

	// ---------------------------------------------------------------- static
	const staticServer = serveDir(exportDir, STATIC_PORT);
	if (!(await waitFor(`http://127.0.0.1:${STATIC_PORT}/`, 10_000))) {
		console.error("static server did not come up");
		return finish(staticServer);
	}

	rmSync(SHOTS, { recursive: true, force: true });
	mkdirSync(SHOTS, { recursive: true });
	console.log(`• running assertions (screenshots → ${SHOTS})`);

	const appUrl = `http://127.0.0.1:${STATIC_PORT}/?url=${encodeURIComponent(`ws://127.0.0.1:${DAEMON_PORT}`)}&token=${TOKEN}&workspace=${encodeURIComponent(workspace)}`;
	try {
		await runAssertions(appUrl, workspace);
		await runRenameEvidence(appUrl, workspace, agentDir);
	} catch (error) {
		results.push(`CRASH ${String(error?.stack || error)}`);
		process.exitCode = 1;
	} finally {
		finish(staticServer);
	}

	if (!KEEP) rmSync(scratch, { recursive: true, force: true });
	else console.log(`scratch kept: ${scratch}`);

	console.log("\n=== UI WALKTHROUGH ===");
	console.log(results.join("\n"));
	console.log(`screenshots: ${SHOTS}`);
}

function finish(server) {
	for (const child of children) child.kill("SIGTERM");
	server?.close();
}

// ---------------------------------------------------------------- helpers
function write(dir, rel, body) {
	writeFileSync(join(dir, rel), body);
}

function run(cmd, cmdArgs, opts = {}) {
	const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", ...opts });
	if (r.status !== 0) throw new Error(`${cmd} ${cmdArgs.join(" ")} failed:\n${r.stderr}`);
}

function runAsync([cmd, ...cmdArgs], opts = {}) {
	return new Promise((resolveP, rejectP) => {
		const child = spawn(cmd, cmdArgs, { stdio: "inherit", ...opts });
		children.push(child);
		child.on("exit", (code) =>
			code === 0 ? resolveP() : rejectP(new Error(`${cmd} exited ${code}`)),
		);
	});
}

async function waitFor(url, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (res.ok) return true;
		} catch {}
		await sleep(300);
	}
	return false;
}

function serveDir(dir, port) {
	const MIME = {
		".html": "text/html; charset=utf-8",
		".js": "text/javascript; charset=utf-8",
		".css": "text/css; charset=utf-8",
		".json": "application/json; charset=utf-8",
		".png": "image/png",
		".svg": "image/svg+xml",
		".wasm": "application/wasm",
	};
	const server = createServer((req, res) => {
		const path = decodeURIComponent(req.url?.split("?")[0] ?? "/");
		let file = join(dir, path === "/" ? "index.html" : path);
		if (!existsSync(file) || !statSync(file).isFile()) file = join(dir, "index.html");
		try {
			const data = readFileSync(file);
			res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
			res.end(data);
		} catch {
			res.writeHead(404);
			res.end("not found");
		}
	});
	server.listen(port, "127.0.0.1");
	return server;
}

function loadPlaywright() {
	const require = createRequire(join(ROOT, "package.json"));
	try {
		return require("playwright-core");
	} catch {
		console.error(
			"playwright-core is not installed. Run:\n" +
				"  npm i -D playwright-core\n" +
				"(No browser download needed — the walkthrough drives system Chrome; " +
				"or `npx playwright install chromium` for the bundled one.)",
		);
		process.exit(2);
	}
}

// ---------------------------------------------------------------- assertions
async function runAssertions(appUrl, workspacePath) {
	const { chromium } = loadPlaywright();
	let browser;
	try {
		browser = await chromium.launch({ channel: "chrome", headless: true });
	} catch {
		browser = await chromium.launch({ headless: true });
	}

	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.goto(appUrl, { waitUntil: "networkidle" });
	await sleep(1500);

	// 01 connect → workspace header
	const header = await page.locator("text=workspace").first().isVisible();
	check("01 connect → workspace header", header);
	await shot(page, "01-connect");

	// 02 explorer rail → files tree
	await page.getByLabel("Toggle explorer rail").click();
	await sleep(600);
	check("02 rail open → files tree shows src/", await page.getByText("src", { exact: true }).first().isVisible());
	// T-019 convergence: one segmented control inside the inspector, no icon
	// mode strip, and one new-session entry (the strip's "+").
	const inspectorSegments = await page
		.getByTestId("inspector-modes")
		.getByRole("button")
		.count()
		.catch(() => 0);
	check("02b inspector segments = 5 modes", inspectorSegments === 5, `segments=${inspectorSegments}`);
	await shot(page, "02-rail-files");

	// 03 open app.ts → files tab + CodeMirror
	await page.getByText("src", { exact: true }).first().click();
	await sleep(500);
	await page.getByText("app.ts", { exact: true }).first().click();
	await sleep(900);
	const cm = await page.locator(".cm-editor").count();
	check("03 open app.ts → files tab + CodeMirror mounted", cm > 0, `cm-editors=${cm}`);
	await shot(page, "03-files-tab");

	// 03b open README.md → ported MarkdownRenderer (heading + code fence)
	await page.getByText("app.ts", { exact: true }).first().click(); // collapse src? no — re-focus
	await page.getByText("README.md", { exact: true }).first().click();
	await sleep(1000);
	const mdHeading = await page
		.getByText("Walkthrough Fixture", { exact: true })
		.first()
		.isVisible()
		.catch(() => false);
	const copyBtn = await page
		.getByLabel("Copy code")
		.count()
		.catch(() => 0);
	const mermaidSvg = await page.locator("svg[viewBox][style*='--fg']").count().catch(() => 0);
	const frontMatter = await page.locator('[testID="markdown-front-matter"], [data-testid="markdown-front-matter"]').count().catch(() => 0);
	check(
		"03b README.md → md preview (frontmatter + code copy + mermaid)",
		mdHeading && copyBtn > 0 && mermaidSvg > 0 && frontMatter > 0,
		`heading=${mdHeading} copyBtn=${copyBtn} svg=${mermaidSvg} fm=${frontMatter}`,
	);
	await shot(page, "03b-md-preview");
	await page.mouse.move(10, 10);
	await sleep(300);

	// 03c edit file → CM editor takes over the buffer → the ported
	// FileEditorModel autosaves a CAS write (ADR-0006) onto disk.
	await page.getByLabel("Edit file").click();
	await page
		.locator('[data-testid="file-source-editor"] .cm-content')
		.waitFor({ state: "visible", timeout: 10_000 });
	const cmContent = page.locator('[data-testid="file-source-editor"] .cm-content');
	await cmContent.click();
	await page.keyboard.press("ControlOrMeta+ArrowDown");
	await page.keyboard.type("\nwalkthrough autosave");
	await sleep(1500); // 800ms autosave + settle
	const editorMounted = await page
		.locator('[data-testid="file-source-editor"]')
		.isVisible()
		.catch(() => false);
	const readmeOnDisk = readFileSync(join(workspacePath, "README.md"), "utf8");
	const diskPersisted = readmeOnDisk.includes("walkthrough autosave");
	check(
		"03c edit → autosave CAS write lands on disk",
		editorMounted && diskPersisted,
		`editor=${editorMounted} disk=${diskPersisted}`,
	);
	await shot(page, "03c-editor-autosave");
	await page.getByLabel("Stop editing").click();
	await sleep(600);

	// 04 inspector → changes; click the dirty file → diff view. The rail mode
	// strip became a segmented control inside the inspector (T-019), so the
	// hook is the control's testID, not a tab role.
	await inspectorMode(page, "Changes");
	await sleep(400);
	await page.getByText("src/app.ts", { exact: false }).first().click();
	await page
		.locator("[data-diff-sticky-header-path], canvas")
		.first()
		.waitFor({ state: "visible", timeout: 15_000 })
		.catch(() => {});
	await sleep(600);
	// The W3c diff engine paints lines on canvas — DOM text assertions are
	// gone; assert the document + canvas surfaces + the header path instead.
	const diffDoc = await page.locator("[data-diff-sticky-header-path]").count();
	const diffCanvas = await page.locator("canvas").count();
	check(
		"04 changes tab → diff document renders (canvas + sticky headers)",
		diffDoc > 0 && diffCanvas > 0,
		`headers=${diffDoc} canvas=${diffCanvas}`,
	);
	await shot(page, "04-changes-tab");

	// 04b T-017: layout toggle → effective layout flips (label flip + no crash);
	// wrap toggle present. Label text is locale-independent via testID + text compare.
	const layoutToggle = page.getByTestId("changes-layout-toggle");
	const wrapToggle = page.getByTestId("changes-wrap-toggle");
	const wrapVisible = await wrapToggle.isVisible().catch(() => false);
	if (await layoutToggle.isVisible().catch(() => false)) {
		const before = (await layoutToggle.textContent()) ?? "";
		await layoutToggle.click();
		await sleep(800);
		const after = (await layoutToggle.textContent()) ?? "";
		const canvasAfter = await page.locator("canvas").count();
		check(
			"04b layout toggle → unified/split flips (canvas alive)",
			before !== "" && after !== "" && before !== after && canvasAfter > 0,
			`before="${before}" after="${after}" canvas=${canvasAfter}`,
		);
		await shot(page, "04b-split");
		await layoutToggle.click();
		await sleep(400);
	} else {
		check("04b layout toggle hidden (compact/native: split unavailable)", true);
	}
	check("04c wrap toggle present", wrapVisible);
	await shot(page, "04c-wrap-toggle");


	// 05 sticky creator → start session. T-019: the creator panel is reached
	// through the strip's single "+", never pinned as a tab.
	const creator = page.getByLabel("New session", { exact: false }).first();
	const creatorEntries = await page.getByLabel("New session", { exact: false }).count();
	check(
		"05a single new-session entry (no pinned creator tab)",
		creatorEntries === 1 && (await creator.count()) > 0,
		`entries=${creatorEntries}`,
	);
	await creator.click();
	await sleep(400);
	const startBtn = page.getByText("Start session", { exact: true }).first();
	const startVisible = await startBtn.isVisible().catch(() => false);
	check("05b creator panel shows Start session", startVisible);
	await shot(page, "05-new-panel");
	if (startVisible) {
		await startBtn.click();
		await sleep(2600);
		const composer = await page.locator("textarea, [contenteditable='true']").first().isVisible().catch(() => false);
		// Tab label comes from i18n (agentList.untitled) since T-022 moved the
		// fallback copy out of the daemon; accept either language.
		const sessionTab = await page
			.getByText(/untitled session|未命名会话/i)
			.first()
			.isVisible()
			.catch(() => false);
		check("05c session created → session tab + composer", composer && sessionTab, `composer=${composer}`);
		await shot(page, "06-session");

		// 05d usage rail: the session exists now, so the stats pull renders
		// the token quartet + message count rows (all zeros, fresh session).
		await inspectorMode(page, "Usage");
		await page
			.getByText("Cache read", { exact: true })
			.first()
			.waitFor({ state: "visible", timeout: 10_000 })
			.catch(() => {});
		await sleep(400);
		const usageGrid = await page
			.getByText("Cache read", { exact: true })
			.first()
			.isVisible()
			.catch(() => false);
		const usageCounts = await page
			.getByText("Tool calls", { exact: true })
			.first()
			.isVisible()
			.catch(() => false);
		check("05d usage rail → token quartet + message stats", usageGrid && usageCounts, `tokens=${usageGrid} counts=${usageCounts}`);
		await shot(page, "05d-usage-rail");
		// 07's drag step reaches the app.ts node through the files tree — put
		// the rail back on files mode before leaving.
		await inspectorMode(page, "Files");
		await sleep(600);
	}

	// 06 split the focused pane
	await page.getByLabel("Split pane").last().click();
	await sleep(800);
	const splitButtons = await page.getByLabel("Split pane").count();
	const paneClosers = await page.getByLabel("Close", { exact: true }).count();
	check("06 split pane → two pane headers", splitButtons === 2 && paneClosers >= 1, `split=${splitButtons} close=${paneClosers}`);
	await shot(page, "07-split");

	// 07 drag the app.ts tab across panes
	const chip = page.getByText("app.ts", { exact: false }).first();
	const box = await chip.boundingBox();
	if (box) {
		const centerX = 1440 / 2;
		const targetX = box.x < centerX ? centerX + 240 : centerX - 240;
		await page.mouse.move(box.x + 15, box.y + 6);
		await page.mouse.down();
		await page.mouse.move(box.x + 45, box.y + 6, { steps: 3 });
		await page.mouse.move(targetX, box.y + 6, { steps: 14 });
		await sleep(300);
		await shot(page, "08-drag-mid");
		await page.mouse.up();
		await sleep(700);
		const appTabs = await page.getByText("app.ts", { exact: false }).count();
		check("07 drag drop → files tab still present", appTabs >= 1, `app.ts nodes=${appTabs}`);
		await shot(page, "09-drag-drop");
	} else {
		check("07 drag app.ts tab", false, "chip not found");
	}

	// 08 rail resize
	const railHandle = page.getByLabel("resize explorer rail");
	const rb = await railHandle.boundingBox().catch(() => null);
	if (rb) {
		await page.mouse.move(rb.x, rb.y + 300);
		await page.mouse.down();
		await page.mouse.move(rb.x - 90, rb.y + 300, { steps: 8 });
		await page.mouse.up();
		await sleep(500);
		const wider = await railHandle.boundingBox();
		check("08 rail resize handle widens rail", !!wider && wider.x < rb.x - 60, `x ${rb.x?.toFixed(0)} → ${wider?.x?.toFixed(0)}`);
		await shot(page, "10-rail-resize");
	} else {
		check("08 rail resize handle present", false);
	}

	// 09 compact → sessions drawer (left edge swipe)
	await page.setViewportSize({ width: 390, height: 844 });
	await sleep(800);
	await shot(page, "11-compact");
	await page.mouse.move(3, 400);
	await page.mouse.down();
	await page.mouse.move(240, 400, { steps: 16 });
	await page.mouse.up();
	await sleep(700);
	const drawerText = await page
		.getByText(/Workspaces|SESSIONS/)
		.first()
		.isVisible()
		.catch(() => false);
	check("09 compact → sessions drawer opens (edge swipe)", drawerText);
	await shot(page, "12-compact-sessions");

	// 09b close by pushing the drawer away to the left
	await page.mouse.move(340, 400);
	await page.mouse.down();
	await page.mouse.move(20, 400, { steps: 14 });
	await page.mouse.up();
	await sleep(900);
	const closedBackdrop = await page.locator('[data-testid="sessions-backdrop"]').count();
	check("09b sessions drawer closes (push-away swipe)", closedBackdrop === 0, `backdrop=${closedBackdrop}`);

	// 10 compact → explorer drawer (right edge swipe)
	await page.mouse.move(387, 400);
	await page.mouse.down();
	await page.mouse.move(150, 400, { steps: 16 });
	await page.mouse.up();
	await sleep(1000);
	await sleep(400);
	const explorerBackdrop = await page.locator('[data-testid="explorer-backdrop"]').count();
	// The drawer shares the rail's mode state; after 04 it shows the changes
	// list, so assert the drawer's own rail tabs instead of a files-tree row.
	const drawerFilesTab = await page
		.getByTestId("inspector-modes")
		.getByRole("button", { name: "Files" })
		.count()
		.catch(() => 0);
	check("10 compact → explorer drawer opens (right edge swipe)", explorerBackdrop === 1 && drawerFilesTab === 1, `backdrop=${explorerBackdrop} filesTab=${drawerFilesTab}`);
	await shot(page, "13-compact-explorer");

	await browser.close();
}

/** Press an inspector mode segment (T-019 control) by its visible label. */
async function inspectorMode(page, label) {
	await page
		.getByTestId("inspector-modes")
		.getByRole("button", { name: label, exact: true })
		.first()
		.click();
}

async function shot(page, name) {
	await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

// ---------------------------------------------------------------- rename evidence
// T-005: session rename walkthrough assertions. Fabricates on-disk session
// files (flat JSONL under the daemon's sessions dir — the daemon's listAll
// reads flat files) and drives rename/clear through the real app UI, a
// second "phone" page, and a bare wire client as the "other device".

async function runRenameEvidence(appUrl, workspacePath, agentDir) {
	const sessionsDir = join(agentDir, "sessions");
	mkdirSync(sessionsDir, { recursive: true });

	const now = new Date().toISOString();
	const mk = (type, id, parentId, extra) => Object.assign({ type, id, parentId, timestamp: now }, extra);
	const lines = (entries) => entries.map((e) => JSON.stringify(e)).join("\n") + "\n";

	const parentPath = join(sessionsDir, `${now.replace(/[:.]/g, "-")}_walkparent01.jsonl`);
	const parentId = "walkparent01";
	writeFileSync(
		parentPath,
		lines([
			mk("session", parentId, null, { version: 3, cwd: workspacePath }),
			mk("message", "m0000001", null, { message: { role: "user", content: "分叉源消息" } }),
			mk("session_info", "s0000001", "m0000001", { name: "分叉源名字" }),
		]),
	);
	const forkPath = join(sessionsDir, `${now.replace(/[:.]/g, "-")}_walkfork01.jsonl`);
	writeFileSync(
		forkPath,
		lines([
			mk("session", "walkfork01", null, { version: 3, cwd: workspacePath, parentSession: parentPath }),
			mk("message", "m0000002", null, { message: { role: "user", content: "分叉源消息" } }),
			mk("session_info", "s0000002", "m0000002", { name: "分叉源名字" }),
		]),
	);
	const labelPath = join(sessionsDir, `${now.replace(/[:.]/g, "-")}_walklabel01.jsonl`);
	writeFileSync(
		labelPath,
		lines([
			mk("session", "walklabel01", null, { version: 3, cwd: workspacePath }),
			mk("message", "m0000003", null, { message: { role: "user", content: "标签会话消息" } }),
			mk("message", "m0000004", "m0000003", { message: { role: "assistant", content: "助手回复" } }),
			mk("label", "l0000001", "m0000004", { targetId: "m0000003", label: "重构探索" }),
		]),
	);

	// --- bare wire client = the "other device"
	const wire = new WirePeer(`ws://127.0.0.1:${DAEMON_PORT}`, TOKEN);
	await wire.open;
	await wire.request("workspace.open", { path: workspacePath });

	// fork inheritance: fork carries the name at the fork point; renaming the
	// parent afterwards must not touch the fork.
	let listed = await wire.request("session.list", { workspaceId: workspacePath, recursive: true });
	const forkRow = listed.sessions.find((x) => x.sessionId === "walkfork01");
	check("R1 fork inherits the name at the fork point", forkRow?.name === "分叉源名字", `fork=${forkRow?.name}`);
	await wire.request("session.rename", { sessionId: parentId, name: "改父名" });
	listed = await wire.request("session.list", { workspaceId: workspacePath, recursive: true });
	const forkAfter = listed.sessions.find((x) => x.sessionId === "walkfork01");
	const parentAfter = listed.sessions.find((x) => x.sessionId === "walkparent01");
	check(
		"R2 renaming the parent does not affect the fork",
		forkAfter?.name === "分叉源名字" && parentAfter?.name === "改父名",
		`parent=${parentAfter?.name} fork=${forkAfter?.name}`,
	);

	// label integrity: renaming appends a session_info entry and must leave
	// the branch label entry untouched (file-level, since the app timeline
	// does not render label pills yet).
	const labelBefore = readFileSync(labelPath, "utf8");
	await wire.request("session.rename", { sessionId: "walklabel01", name: "标签会话新名" });
	const labelAfter = readFileSync(labelPath, "utf8");
	const labelLineBefore = labelBefore.split("\n").find((l) => l.includes('"type":"label"'));
	const labelLineAfter = labelAfter.split("\n").find((l) => l.includes('"type":"label"'));
	check(
		"R3 rename leaves the branch label entry intact",
		labelLineAfter !== undefined && labelLineAfter === labelLineBefore,
		`label=${labelLineAfter?.slice(0, 40)}…`,
	);
	const labelListed = await wire.request("session.list", { workspaceId: workspacePath, recursive: true });
	check("R4 labeled session renamed", labelListed.sessions.find((x) => x.sessionId === "walklabel01")?.name === "标签会话新名");

	// --- desktop page: rename + clear through the real UI
	const { chromium } = loadPlaywright();
	const browser = await chromium.launch({ channel: "chrome", headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await page.goto(appUrl, { waitUntil: "networkidle" });
		await sleep(2500);
		const parentRowEl = page.locator('[aria-label="改父名"]').first();
		for (let i = 0; i < 20; i++) {
			if (await parentRowEl.isVisible().catch(() => false)) break;
			await sleep(500);
		}
		check("R5 renamed parent row visible in sidebar", await parentRowEl.isVisible().catch(() => false));
		await parentRowEl.click({ button: "right" });
		await sleep(600);
		await page.getByTestId("session-row-rename").click();
		await sleep(600);
		await page.getByTestId("rename-session-input").fill("支付联调");
		await page.getByText("Save").first().click();
		await sleep(1200);
		check("R6 UI rename: row shows the new name", await page.locator('[aria-label="支付联调"]').first().isVisible().catch(() => false));
		await shot(page, "14-rename-ui");
		const afterRename = await wire.request("session.list", { workspaceId: workspacePath, recursive: true });
		check("R7 wire state matches UI rename", afterRename.sessions.find((x) => x.sessionId === parentId)?.name === "支付联调");

		// clear through the menu
		await page.locator('[aria-label="支付联调"]').first().click({ button: "right" });
		await sleep(600);
		await page.getByTestId("session-row-clear-name").click();
		await sleep(1200);
		check("R8 UI clear: row falls back to the first message", await page.locator('[aria-label="分叉源消息"]').first().isVisible().catch(() => false));
		await shot(page, "15-rename-clear");
		const afterClear = await wire.request("session.list", { workspaceId: workspacePath, recursive: true });
		check("R9 wire state matches UI clear", (afterClear.sessions.find((x) => x.sessionId === parentId)?.name ?? "") === "");

		// --- cross-device live update: the wire peer grabs the write lock first
		// (attach readwrite), then the desktop attaches (downgraded to
		// readonly, subscribed). The wire rename must then reach the desktop
		// row through the session.renamed broadcast — no reload.
		await wire.request("session.attach", { sessionId: parentId, as: "readwrite", path: parentPath });
		await page.locator('[aria-label="分叉源消息"]').first().click();
		await sleep(2000);
		await wire.request("session.rename", { sessionId: parentId, name: "手机端改名" });
		await sleep(1500);
		const desktopLive = await page.locator('[aria-label="手机端改名"]').first().isVisible().catch(() => false);
		check("R10 desktop row updates live after an off-device rename (no reload)", desktopLive);
		await shot(page, "16-live-update");

		// --- phone page: same daemon, same name. The compact header's
		// sessions button opens the sessions drawer without a swipe gesture.
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const phone = await ctx.newPage();
		await phone.goto(appUrl, { waitUntil: "networkidle" });
		await sleep(2500);
		await phone.getByLabel("sessions").first().click();
		await sleep(1200);
		let phoneSees = false;
		for (let i = 0; i < 16 && !phoneSees; i++) {
			phoneSees = await phone.locator('[aria-label="手机端改名"]').first().isVisible().catch(() => false);
			if (!phoneSees) await sleep(500);
		}
		check("R11 phone shows the same session name as the desktop", phoneSees);
		await shot(phone, "17-phone-sessions");

		wire.ws.close();
	} finally {
		await browser.close();
	}
}

/** Minimal wire client (hello + request), reused from the daemon test style. */
class WirePeer {
	constructor(url, token) {
		const require = createRequire(join(ROOT, "package.json"));
		const { WebSocket } = require("ws");
		this.ws = new WebSocket(url);
		this.next = 0;
		this.pending = new Map();
		this.open = new Promise((res) =>
			this.ws.on("open", () => {
				this.ws.send(
					JSON.stringify({
						hello: { v: 1, client: { kind: "cli", version: "0.1.0", platform: "test" }, caps: ["treeSync"], auth: { method: "token", token } },
					}) + "\n",
				);
				res();
			}),
		);
		this.ws.on("message", (chunk) => {
			const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
			for (const line of text.split("\n")) {
				if (!line.trim()) continue;
				const pkt = JSON.parse(line);
				if (pkt.id) {
					const p = this.pending.get(pkt.id);
					if (p) {
						this.pending.delete(pkt.id);
						pkt.ok ? p.resolve(pkt.data) : p.reject(new Error(pkt.error.message));
					}
				}
			}
		});
	}
	request(cmd, args = {}) {
		const id = `c-${++this.next}`;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, cmd, args }) + "\n");
		});
	}
}

main().catch((error) => {
	console.error("walkthrough crashed:", error);
	for (const child of children) child.kill("SIGTERM");
	process.exit(1);
});
