#!/usr/bin/env node
// serve-app-web.mjs <runId> [exportDir] — static server for the @pie/app expo
// web export (SPA fallback to index.html), the secondary surface. Serves on
// run.json's staticPort (8899), logs to /tmp/pie-verify-<runId>/static.log,
// and records its pid in run.json (staticPid). Runs in the foreground —
// start it with & and kill the recorded pid; never pkill.
//
// Canonical build first: npm run app:build:web  → packages/app/dist

import { createServer } from "node:http";
import { existsSync, statSync, readFileSync, writeFileSync, readFileSync as rf } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const runId = process.argv[2];
if (!runId) {
	console.error("usage: serve-app-web.mjs <runId> [exportDir]");
	process.exit(2);
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const exportDir = resolve(process.argv[3] || join(ROOT, "packages/app/dist"));
if (!existsSync(join(exportDir, "index.html"))) {
	console.error(`no index.html in ${exportDir} — run: npm run app:build:web`);
	process.exit(1);
}

const runFile = `/tmp/pie-verify-${runId}/run.json`;
const run = JSON.parse(rf(runFile, "utf8"));
const port = run.staticPort || 8899;

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
	let file = join(exportDir, path === "/" ? "index.html" : path);
	if (!existsSync(file) || !statSync(file).isFile()) file = join(exportDir, "index.html");
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

run.staticPid = process.pid;
run.staticLog = `/tmp/pie-verify-${runId}/static.log`;
writeFileSync(runFile, JSON.stringify(run, null, 2));
console.log(`serving ${exportDir} on http://127.0.0.1:${port} (pid ${process.pid})`);
