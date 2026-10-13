#!/usr/bin/env node
// UI walkthrough (W1 acceptance tool): an interactive end-to-end pass of the
// built app against a real daemon — connection, explorer rail, files +
// CodeMirror, diff, session creation, pane splitting, tab drag, rail resize,
// and the compact drawer gestures. Asserts through the DOM; screenshots land
// next to it for human/vision review.
//
// Usage:
//   npm run ui-walkthrough                     # fresh web export + run
//   npm run ui-walkthrough -- --reuse-export   # reuse packages/app/dist/app-web
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
	write(workspace, "README.md", "# Walkthrough Fixture\n\nA tiny repo for exercising the files tree, changes panel and diff view.\n");
	write(workspace, "notes.txt", "untracked\n"); // stays untracked for the changes list
	run("git", ["init", "-q", "."], { cwd: workspace });
	run("git", ["add", "-A"], { cwd: workspace });
	run("git", ["commit", "-qm", "fixture init"], { cwd: workspace });

	// ---------------------------------------------------------------- web export
	const exportDir = join(scratch, "web-export");
	const bundled = join(ROOT, "packages", "app", "dist", "app-web");
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
		await runAssertions(appUrl);
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
async function runAssertions(appUrl) {
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
	await shot(page, "02-rail-files");

	// 03 open app.ts → files tab + CodeMirror
	await page.getByText("src", { exact: true }).first().click();
	await sleep(500);
	await page.getByText("app.ts", { exact: true }).first().click();
	await sleep(900);
	const cm = await page.locator(".cm-editor").count();
	check("03 open app.ts → files tab + CodeMirror mounted", cm > 0, `cm-editors=${cm}`);
	await shot(page, "03-files-tab");

	// 04 rail → changes; click the dirty file → diff view
	await page.locator('[style*="flex: 1"]').filter({ has: page.locator("svg") }).nth(1).click();
	await sleep(400);
	await page.getByText("src/app.ts", { exact: false }).first().click();
	await sleep(900);
	check("04 changes tab → diff renders (+dirty line)", await page.getByText("dirty line").first().isVisible().catch(() => false));
	await shot(page, "04-changes-tab");

	// 05 sticky creator → start session
	const creator = page.getByLabel("New session", { exact: false }).first();
	check("05a sticky creator + entry present", (await creator.count()) > 0);
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
		const sessionTab = await page
			.getByText(/untitled session|新会话，未落盘/)
			.first()
			.isVisible()
			.catch(() => false);
		check("05c session created → session tab + composer", composer && sessionTab, `composer=${composer}`);
		await shot(page, "06-session");
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
	const explorerTree = await page.getByText("README.md", { exact: true }).first().isVisible().catch(() => false);
	check("10 compact → explorer drawer opens (right edge swipe)", explorerBackdrop === 1 && explorerTree, `backdrop=${explorerBackdrop} tree=${explorerTree}`);
	await shot(page, "13-compact-explorer");

	await browser.close();
}

async function shot(page, name) {
	await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

main().catch((error) => {
	console.error("walkthrough crashed:", error);
	for (const child of children) child.kill("SIGTERM");
	process.exit(1);
});
