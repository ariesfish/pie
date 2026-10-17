#!/usr/bin/env node
// doctor.mjs <runId> [evidenceDir] — read-only "is this instance worth driving?"
//
// Checks (each with evidence), against /tmp/pie-verify-<runId>/run.json:
//   1. pid-alive          recorded daemon pid responds to kill -0
//   2. http-page          GET / is 200 and contains <title>Pie</title>
//   3. ws-hello-auth      WS hello with our token -> helloAck (records versions)
//   4. port-owned-by-us   helloAck.pi.agentDir === our scratch agent dir
//   5. version-match      helloAck.daemon.version === DAEMON_VERSION in
//                         packages/daemon/src/version.ts
//   6. scratch-isolated   agent dir under /tmp/pie-verify-<runId>, not ~/.pi/agent
// Outputs {ok, checks[]} to stdout; with evidenceDir also writes doctor.json.
// Zero deps (Node >= 22 native fetch/WebSocket).

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const runId = process.argv[2];
const evidenceDir = process.argv[3];
if (!runId) {
	console.error("usage: doctor.mjs <runId> [evidenceDir]");
	process.exit(2);
}

const runDir = `/tmp/pie-verify-${runId}`;
const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const checks = [];
async function check(name, fn) {
	try {
		const detail = await fn();
		checks.push({ name, ok: true, ...detail });
	} catch (err) {
		checks.push({ name, ok: false, error: String(err?.message ?? err) });
	}
}

await check("pid-alive", async () => {
	try {
		process.kill(run.pid, 0);
		return { pid: run.pid };
	} catch {
		throw new Error(`daemon pid ${run.pid} is dead`);
	}
});

await check("http-page", async () => {
	const res = await fetch(`http://127.0.0.1:${run.port}/`);
	const body = await res.text();
	if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
	if (!body.includes("<title>Pie</title>")) throw new Error("page is not the Pie demo page");
	return { status: res.status };
});

let helloAck = null;
await check("ws-hello-auth", async () => {
	helloAck = await new Promise((resolveP, reject) => {
		const ws = new WebSocket(`ws://127.0.0.1:${run.port}`);
		const t = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("hello timeout (10s)")); }, 10000);
		ws.onopen = () =>
			ws.send(
				JSON.stringify({
					hello: {
						v: 1,
						client: { kind: "verify-pie-doctor", version: "0.1.0", platform: "node" },
						caps: [],
						auth: { method: "token", token: run.token },
					},
				}) + "\n",
			);
		ws.onerror = () => { clearTimeout(t); reject(new Error("ws error")); };
		ws.onmessage = (m) => {
			for (const line of String(m.data).split("\n")) {
				if (!line.trim()) continue;
				const pkt = JSON.parse(line);
				if (pkt.helloAck) {
					clearTimeout(t);
					try { ws.close(); } catch {}
					resolveP(pkt.helloAck);
					return;
				}
				if (pkt.fatal) {
					clearTimeout(t);
					try { ws.close(); } catch {}
					reject(new Error(`fatal: ${pkt.fatal.message}`));
					return;
				}
			}
		};
	});
	return { daemon: helloAck.daemon.version, pi: helloAck.pi.version };
});

await check("port-owned-by-us", async () => {
	const agentDir = helloAck?.pi?.agentDir;
	if (!agentDir) throw new Error("no agentDir in helloAck");
	if (agentDir !== run.agentDir) {
		throw new Error(`port serves foreign daemon (agentDir=${agentDir}, want ${run.agentDir})`);
	}
	return { agentDir };
});

await check("version-match", async () => {
	const versionTs = readFileSync(join(ROOT, "packages/daemon/src/version.ts"), "utf8");
	const m = versionTs.match(/DAEMON_VERSION\s*=\s*"([^"]+)"/);
	const expected = m?.[1];
	if (!expected) throw new Error("could not parse DAEMON_VERSION from version.ts");
	if (helloAck?.daemon?.version !== expected) {
		throw new Error(`daemon ${helloAck?.daemon?.version} != source ${expected}`);
	}
	return { expected };
});

await check("scratch-isolated", async () => {
	const real = join(homedir(), ".pi", "agent");
	if (!run.agentDir.startsWith(`/tmp/pie-verify-${runId}/`)) throw new Error(`agentDir ${run.agentDir} not under the run dir`);
	if (run.agentDir === real) throw new Error("agentDir is the real ~/.pi/agent — refuse to drive");
	return { agentDir: run.agentDir, realAgentDir: real };
});

const result = { ok: checks.every((c) => c.ok), runId, checkedAt: new Date().toISOString(), checks };
console.log(JSON.stringify(result, null, 2));
if (evidenceDir) {
	writeFileSync(join(evidenceDir, "doctor.json"), JSON.stringify(result, null, 2) + "\n");
	console.error(`doctor.json written to ${join(evidenceDir, "doctor.json")}`);
}
process.exit(result.ok ? 0 : 1);
