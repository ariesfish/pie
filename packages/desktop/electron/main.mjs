/**
 * Electron main process glue (architecture.md §7).
 *
 * Dev:     npm run dev -w @pie/desktop      (requires `npm i -w @pie/desktop electron`)
 * Smoke:   npm run smoke -w @pie/desktop    (PIE_SMOKE=1: boot sidecar + fetch
 *           page, report, quit — no window, safe in CI)
 */

import { app, BrowserWindow, protocol, session, shell } from "electron";
import { net } from "electron";
import path from "node:path";
import { startSidecar } from "../dist/sidecar-manager.js";

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdirSync } from "node:fs";

/**
 * Runtime root: packaged apps ship Resources/pie-runtime.tgz; the first boot
 * unpacks it into the user data dir (re-unpacks when the archive hash
 * changes). In dev, `electron .` runs from packages/desktop so the repo root
 * is two up. PIE_REPO_ROOT wins for embedded/remote debugging.
 */
function resolveRuntimeRoot() {
	if (process.env.PIE_REPO_ROOT) return process.env.PIE_REPO_ROOT;
	const archive = process.resourcesPath ? path.join(process.resourcesPath, "pie-runtime.tgz") : null;
	if (archive && existsSync(archive)) {
		const hash = createHash("sha256").update(readFileSync(archive)).digest("hex").slice(0, 16);
		const root = path.join(app.getPath("userData"), `pie-runtime-${hash}`);
		if (!existsSync(path.join(root, "package.json"))) {
			mkdirSync(root, { recursive: true });
			console.log(`[runtime] unpacking daemon runtime → ${root}`);
			const res = spawnSync("tar", ["xzf", archive, "-C", root], { stdio: "inherit" });
			if (res.status !== 0) throw new Error(`runtime unpack failed (tar exit ${res.status})`);
		}
		return root;
	}
	return path.resolve(app.getAppPath(), "..", "..");
}

const repoRoot = resolveRuntimeRoot();
let sidecarHandle = null;

async function boot() {
	const sidecar = await startSidecar({
		repoRoot,
		extraArgs: process.env.PIE_PERMISSION ? ["--permission", process.env.PIE_PERMISSION] : [],
		log: (line) => console.log(`[daemon] ${line}`),
	});
	sidecarHandle = sidecar;
	const url = await sidecar.ready;

	if (process.env.PIE_SMOKE) {
		const res = await fetch(url);
		const body = await res.text();
		console.log(`[smoke] page: HTTP ${res.status}, ${body.length} bytes`);
		if (res.status !== 200 || !body.includes("Pie")) throw new Error("demo page did not serve");
		console.log("[smoke] OK");
		await sidecarHandle.stop(); // app.exit bypasses will-quit; stop explicitly.
		app.exit(0);
		return;
	}

	if (process.resourcesPath && existsSync(path.join(process.resourcesPath, "app-web", "index.html"))) {
		// The real UI: the @pie app web bundle, with sidecar coordinates
		// injected via query (app-side URLSearchParams picks them up).
		const winApp = new BrowserWindow({
			width: 1280,
			height: 860,
			title: "Pie",
			webPreferences: { contextIsolation: true, nodeIntegration: false },
		});
		winApp.webContents.on("console-message", (_e, _lvl, msg) => console.log(`[web] ${msg}`));
		winApp.webContents.on("did-fail-load", (_e, code, desc, url) =>
			console.log(`[web] FAIL ${code} ${desc} ${url}`),
		);
		winApp.webContents.on("render-process-gone", (_e, details) =>
			console.log(`[web] GONE ${details.reason}`),
		);
		const q = new URLSearchParams({
			url: `ws://127.0.0.1:${sidecar.listenPort}`,
			token: sidecar.token,
			workspace: process.env.PIE_WORKSPACE ?? process.env.HOME ?? "",
		}).toString();
		// Cache-buster: a previously cached pie-app://app/ entry (from a build
		// before no-store) still serves stale HTML referencing rotated chunk
		// hashes; a fresh URL forces the revalidate.
		await winApp.loadURL(`pie-app://app/?_v=${Date.now().toString(36)}&${q}`);
		if (process.env.PIE_WEB_DEBUG) {
			if (process.env.PIE_CAPTURE) {
				// Window-accurate capture with zero system TCC involvement.
				await new Promise((r) => setTimeout(r, 6000));
				const img = await winApp.webContents.capturePage();
				const { writeFileSync } = await import("node:fs");
				writeFileSync(process.env.PIE_CAPTURE, img.toPNG());
				console.log(`[capture] wrote ${process.env.PIE_CAPTURE}`);
			}
			// Relay every console line — React errors, unhandled rejections and
		// error boundaries land here verbatim.
		winApp.webContents.on("console-message", (_e, _lvl, msg) => {
			if (msg && !msg.startsWith("[H")) console.log(`[web] ${msg}`);
		});
		// Late probe: after mount, after any error boundary replacement.
		await new Promise((r) => setTimeout(r, 5000));
		const liveText = await winApp.webContents.executeJavaScript(
			"document.body ? (document.body.innerText || '|empty|').slice(0, 600) : '|no-body|'"
		).catch((e) => `|probe-failed: ${e.message}|`);
		const themeProbe = await winApp.webContents.executeJavaScript(
			"(() => { const root = document.documentElement; const body = getComputedStyle(document.body); let chain = []; let el = document.getElementById('root') || document.body; for (let i = 0; i < 4 && el; i++) { const cs = getComputedStyle(el); chain.push(el.tagName + ':' + cs.backgroundColor + '/' + cs.height); el = el.firstElementChild; } return 'htmlclass=' + root.className + ' bodybg=' + body.backgroundColor + ' chain=' + chain.join(' -> '); })()"
		).catch((e) => `|theme-probe-failed: ${e.message}|`);
		console.log(`[theme] ${themeProbe}`);
		console.log(`[live-text] ${String(liveText).replace(/\n+/g, " | ")}`);
		const probe = await winApp.webContents.executeJavaScript(`(() => {
				const out = [];
				const walk = (el, depth) => {
					if (depth > 3 || !el) return;
					const cs = getComputedStyle(el);
					out.push({ tag: el.tagName, d: cs.display, fd: cs.flexDirection, w: cs.width, bg: cs.backgroundColor.slice(0, 24), kids: el.children.length });
					for (const c of el.children) walk(c, depth + 1);
				};
				walk(document.querySelector("#root") ?? document.body, 0);
				const htmlLen = document.documentElement.outerHTML.length;
				const sample = document.body.innerText.slice(0, 200);
				const dom = document.querySelector("#root")?.innerHTML.slice(0, 2600) ?? "(no #root)";
				return { out, htmlLen, sample, dom };
			})()`);
			console.log("[web:layout]", JSON.stringify(probe, null, 1));
		}
		return;
	}
	// Dev fallback: the daemon demo page (zero-dependency smoke surface).
	const win = new BrowserWindow({
		width: 1280,
		height: 860,
		title: "Pie",
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
		},
	});
	win.webContents.setWindowOpenHandler(({ url: target }) => {
		void shell.openExternal(target);
		return { action: "deny" };
	});
	await win.loadURL(url);
}

// pie-app:// serves the Expo web bundle. Native absolute asset paths
// (/_expo/...) break under file://; a registered scheme resolves them.
protocol.registerSchemesAsPrivileged([
	{ scheme: "pie-app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

app.whenReady().then(async () => {
	// Nuke every response cache before any load: custom-scheme documents and
	// code caches survive restarts in userData, and a stale index.html that
	// references rotated chunk hashes renders a ghost of the old build —
	// exactly the byte-identical-screenshot failure mode.
	await session.defaultSession.clearCache().catch(() => undefined);
	const appWebDir = process.resourcesPath ? path.join(process.resourcesPath, "app-web") : null;
	if (appWebDir && existsSync(path.join(appWebDir, "index.html"))) {
		protocol.handle("pie-app", async (request) => {
			const u = new URL(request.url);
			let rel = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
			if (rel === "" || rel === "index.html") rel = "index.html";
			const file = path.join(appWebDir, rel);
			if (!file.startsWith(appWebDir)) return new Response("forbidden", { status: 403 });
			const res = await net.fetch(`file://${encodeURIComponent(file).replace(/%2F/gi, "/")}`);
			// Custom-scheme responses are HTTP-cacheable by Chromium; a cached
			// index.html referencing a rotated chunk hash 404s silently into a
			// blank shell after an app-web swap. Never cache.
			return new Response(res.body, {
				status: res.status,
				headers: { ...Object.fromEntries(res.headers), "Cache-Control": "no-store" },
			});
		});
	}
	try {
		await boot();
	} catch (err) {
		console.error("Pie failed to start:", err);
		app.exit(1);
	}
	if (!process.env.PIE_SMOKE) {
		app.on("activate", () => {
			if (BrowserWindow.getAllWindows().length === 0) void boot();
		});
	}
});

app.on("window-all-closed", () => {
	// Keep the helper alive on macOS; quit elsewhere.
	if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", async (event) => {
	if (sidecarHandle) {
		event.preventDefault();
		await sidecarHandle.stop();
		app.exit(0);
	}
});
