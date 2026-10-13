import { describe, expect, it } from "vitest";
import { startSidecar } from "../src/sidecar-manager.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fakeDaemon = join(here, "fake-daemon.mjs");

/**
 * Fake "daemon": a plain node HTTP server that binds with port 0 and prints
 * the same "WS ws://127.0.0.1:<port>" line the real daemon prints. Used to
 * exercise the sidecar lifecycle (spawn/parse/probe/stop) without the SDK.
 */
function fakeDaemonCommand(scriptPath: string): () => { cmd: string; args: string[] } {
	return () => ({ cmd: process.execPath, args: [scriptPath] });
}

describe("startSidecar (with a fake daemon child process)", () => {
	it("starts, probes readiness, and stops the child cleanly", async () => {
		const lines: string[] = [];
		const handle = await startSidecar({
			repoRoot: process.cwd(),
			token: "test-token",
			daemonCommand: fakeDaemonCommand(fakeDaemon),
			extraArgs: [],
			log: (line) => lines.push(line),
		});
		expect(handle.token).toBe("test-token");

		const url = await handle.ready;
		expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?token=test-token$/);

		const res = await fetch(url.split("?")[0] as string);
		expect(res.status).toBe(200);

		await handle.stop();
		// Probe again: the server must be gone (or refused).
		await expect(fetch(url.split("?")[0] as string)).rejects.toThrow();
		expect(lines.some((l) => /WS\s+ws:\/\//.test(l))).toBe(true);
	}, 20_000);

	it("rejects readiness when the probe fails", async () => {
		await expect(
			startSidecar({
				repoRoot: process.cwd(),
				token: "t",
				daemonCommand: fakeDaemonCommand(fakeDaemon),
				extraArgs: [],
				probe: () => Promise.reject(new Error("probe simulated failure")),
				log: () => {},
			}).then((h) => h.ready),
		).rejects.toThrow(/probe simulated failure|did not become ready/);
	});

	it("generated tokens are cryptographically random-ish and non-empty", async () => {
		const { generateToken } = await import("../src/sidecar-manager.js");
		const a = generateToken();
		const b = generateToken();
		expect(a.length).toBeGreaterThanOrEqual(20);
		expect(a).not.toBe(b);
	});

	it("stop() is idempotent", async () => {
		const handle = await startSidecar({
			repoRoot: process.cwd(),
			token: "t2",
			daemonCommand: fakeDaemonCommand(fakeDaemon),
			extraArgs: [],
			log: () => {},
		});
		await handle.ready;
		await handle.stop();  // graceful: resolves after the child exits
		await handle.stop();  // second call must return immediately
	}, 20_000);
});
