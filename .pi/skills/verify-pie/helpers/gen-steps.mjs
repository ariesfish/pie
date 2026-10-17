#!/usr/bin/env node
// gen-steps.mjs <runId> <evidenceDir> — materialize concrete control-web steps
// files from /tmp/pie-verify-<runId>/run.json (port/token/workspace vary per
// run; the frozen harness takes a static JSON file, so this generator is the
// seam). Zero deps.
//
// Writes:
//   <evidenceDir>/steps-demo-session.json   demo page: connect → workspace → new session
//   <evidenceDir>/steps-app-web-files.json  app web: explorer rail → CodeMirror → markdown

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const runId = process.argv[2];
const outDir = process.argv[3];
if (!runId || !outDir) {
	console.error("usage: gen-steps.mjs <runId> <evidenceDir>");
	process.exit(2);
}

const run = JSON.parse(readFileSync(`/tmp/pie-verify-${runId}/run.json`, "utf8"));
mkdirSync(outDir, { recursive: true });

const demoUrl = `http://127.0.0.1:${run.port}/?token=${run.token}`;
const stepsDemo = {
	navigate: demoUrl,
	settleMs: 2500,
	steps: [
		{ label: "conn-connected", find: { selector: "#connState" }, expectVisible: true, read: true },
		{ label: "type-workspace-path", find: { selector: "#wsPath" }, type: run.workspace },
		{ label: "click-add-workspace", find: { selector: "#openWs" }, click: true },
		{ label: "settle+shot-workspace", shot: "demo-01-workspace-added" },
		{ label: "ws-chip-visible", find: { selector: "#wsChips .chip" }, expectVisible: true, read: true },
		{ label: "click-new-session", find: { selector: "#newSession" }, click: true },
		{ label: "settle+shot-session", shot: "demo-02-session-created" },
		{ label: "session-badge", find: { selector: "#sessionBadge" }, expectVisible: true, read: true },
		{ label: "session-list-item", find: { selector: ".session-item" }, expectVisible: true, read: true },
		{ label: "final-shot", shot: "demo-03-final" },
	],
};

const appUrl =
	`http://127.0.0.1:${run.staticPort}/?url=${encodeURIComponent(`ws://127.0.0.1:${run.port}`)}` +
	`&token=${encodeURIComponent(run.token)}&workspace=${encodeURIComponent(run.workspace)}`;
const stepsAppWeb = {
	navigate: appUrl,
	settleMs: 4000,
	steps: [
		{ label: "settle+shot-connect", shot: "appweb-00-connect" },
		{ label: "toggle-explorer-rail", find: { aria: "Toggle explorer rail" }, click: true },
		{ label: "settle+shot-rail", shot: "appweb-01-rail" },
		{ label: "open-src-dir", find: { text: "src" }, click: true },
		{ label: "open-app-ts", find: { text: "app.ts" }, click: true },
		{ label: "codemirror-mounted", find: { selector: ".cm-editor" }, expectVisible: true },
		{ label: "shot-codemirror", shot: "appweb-02-codemirror" },
		{ label: "open-readme", find: { text: "README.md" }, click: true },
		{ label: "markdown-heading", find: { text: "Verify Fixture" }, expectVisible: true },
		{ label: "markdown-copy-code", find: { aria: "Copy code" }, expectVisible: true },
		{ label: "shot-markdown", shot: "appweb-03-markdown" },
	],
};

writeFileSync(join(outDir, "steps-demo-session.json"), JSON.stringify(stepsDemo, null, 2));
writeFileSync(join(outDir, "steps-app-web-files.json"), JSON.stringify(stepsAppWeb, null, 2));
console.log(JSON.stringify({ demo: join(outDir, "steps-demo-session.json"), appWeb: join(outDir, "steps-app-web-files.json") }));
