#!/usr/bin/env node
// ws-probe.mjs <runId> <cmd> '[jsonArgs]' — one authenticated wire-protocol
// command against the verify daemon, for server-side side-effect evidence.
//
// Read-only commands only: session.list, session.entries, daemon.status, ...
// Outputs JSON {ok, cmd, data | error} to stdout. Zero deps (Node >= 22).

const runId = process.argv[2];
const cmd = process.argv[3];
const args = process.argv[4] ? JSON.parse(process.argv[4]) : {};
if (!runId || !cmd) {
	console.error('usage: ws-probe.mjs <runId> <cmd> \'[jsonArgs]\'');
	process.exit(2);
}

const run = JSON.parse(
	(await import("node:fs")).readFileSync(`/tmp/pie-verify-${runId}/run.json`, "utf8"),
);

const out = await new Promise((resolveP, reject) => {
	const ws = new WebSocket(`ws://127.0.0.1:${run.port}`);
	const t = setTimeout(() => { try { ws.close(); } catch {} reject(new Error("probe timeout (15s)")); }, 15000);
	ws.onopen = () =>
		ws.send(
			JSON.stringify({
				hello: {
					v: 1,
					client: { kind: "verify-pie-probe", version: "0.1.0", platform: "node" },
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
				ws.send(JSON.stringify({ id: "verify-pie-probe-1", cmd, args }) + "\n");
				continue;
			}
			if (pkt.id === "verify-pie-probe-1") {
				clearTimeout(t);
				try { ws.close(); } catch {}
				resolveP(pkt.ok ? { ok: true, cmd, data: pkt.data } : { ok: false, cmd, error: pkt.error });
			}
		}
	};
});

console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
