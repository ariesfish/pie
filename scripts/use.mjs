#!/usr/bin/env node
// One-command dogfood: daemon + static web app + browser, pointed at a
// real workspace and your real pi agent dir.
//
//   npm run use /path/to/project
//   npm run use /path/to/project -- --agent /path/to/agent-dir
//   npm run use /path/to/project -- --port 8800      # web port
//
// The web bundle is served from packages/app/dist/app-web; build it first
// with `npm run app:build:web` if the script finds it missing.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith("-")) {
	console.log(`usage: npm run use <workspace-path> [-- --agent <dir>] [-- --port <n>]

  <workspace-path>   absolute or relative path of the project to open
  --agent <dir>      pi agent dir (default: ~/.pi/agent)
  --port <n>         web port (default: 8800)`);
	process.exit(0);
}

const workspacePath = resolve(args[0]);
if (!existsSync(workspacePath)) {
	console.error(`✗ workspace not found: ${workspacePath}`);
	process.exit(1);
}

const flag = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const agentDir = resolve(flag("agent", join(homedir(), ".pi", "agent")));
const webPort = Number(flag("port", "8800"));
const daemonPort = webPort + 1;
const token = Math.random().toString(36).slice(2, 10);

const dist = join(import.meta.dirname, "..", "packages", "app", "dist", "app-web");
if (!existsSync(join(dist, "index.html"))) {
	console.error(`✗ web bundle missing: ${dist}
  build it first:  npm run app:build:web`);
	process.exit(1);
}
if (!existsSync(agentDir)) {
	console.error(`✗ agent dir not found: ${agentDir}
  pass yours:  npm run use ${args[0]} -- --agent /path/to/agent`);
	process.exit(1);
}

const node = process.execPath;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const req = createRequire(join(import.meta.dirname, "..", "package.json"));

const children = [];
const cleanup = () => {
	for (const child of children) child.kill();
	process.exit(0);
};
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

const daemonArgs = [
	"--listen",
	`127.0.0.1:${daemonPort}`,
	"--token",
	token,
	"--pi",
	agentDir,
];
const tag = spawnSync(node, ["--version"], { encoding: "utf8" });
console.log(`πie dogfood
  node       ${tag.stdout.trim()}
  workspace  ${workspacePath}
  agent dir  ${agentDir}
  daemon     ws://127.0.0.1:${daemonPort}  (token: ${token})
  web        http://127.0.0.1:${webPort}

  Ctrl-C stops both.
`);

children.push(
	spawn(node, ["--import", req.resolve("tsx"), "packages/daemon/src/index.ts", ...daemonArgs], {
		cwd: join(import.meta.dirname, ".."),
		stdio: "inherit",
	}),
);
children.push(spawn(npx, ["http-server", dist, "-p", String(webPort), "-a", "127.0.0.1", "--silent"], { stdio: "ignore" }));

const url = `http://127.0.0.1:${webPort}/?url=${encodeURIComponent(`ws://127.0.0.1:${daemonPort}`)}&token=${token}&workspace=${encodeURIComponent(workspacePath)}`;

// Give the static server a beat, then open the browser.
setTimeout(() => {
	const opener =
		process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
	spawn(opener, [url], { stdio: "ignore" });
	console.log(`  opened: ${url}\n`);
}, 900);
