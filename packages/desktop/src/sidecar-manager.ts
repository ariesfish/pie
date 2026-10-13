/**
 * Sidecar lifecycle for the Electron shell (architecture.md §7).
 *
 * Spawns the pie daemon as a child process on an ephemeral port,
 * waits for HTTP readiness, and owns its teardown. Pure Node — the Electron
 * main process only supplies the spawn/reap hooks, so this module is unit
 * testable without a display.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";

export interface SidecarOptions {
	/** Repo root (cwd for the daemon process). */
	repoRoot: string;
	/** Daemon lister override; defaults to an ephemeral OS port. */
	listenPort?: number;
	/** Pre-generated auth token. One is generated when omitted. */
	token?: string;
	/** Spawn implementation (Electron main replaces this in tests / packaging). */
	spawnImpl?: typeof spawn;
	/** Readiness probe override (tests). */
	probe?: (url: string, token: string, timeoutMs: number) => Promise<void>;
	/** How to resolve the daemon command. Default: npx tsx <entry>. */
	daemonCommand?: () => { cmd: string; args: string[] };
	/** Extra daemon flags (e.g. --permission annotations). */
	extraArgs?: string[];
	log?: (line: string) => void;
}

export interface SidecarHandle {
	listenPort: number;
	token: string;
	/** Resolves when the daemon responds on HTTP (page serves). */
	ready: Promise<string>; // connection base URL

	url(): string;
	stop(): Promise<void>;
}

export const DEFAULT_DAEMON_PORT = 8760;

export function generateToken(): string {
	return randomBytes(24).toString("base64url");
}

export function defaultDaemonCommand(repoRoot: string): { cmd: string; args: string[] } {
	const tsxCli = joinPath(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
	const daemonEntry = joinPath(repoRoot, "packages", "daemon", "src", "index.ts");
	if (!existsSync(tsxCli)) {
		throw new Error(`tsx not found at ${tsxCli} — run npm install at the repo root first`);
	}
	if (!existsSync(daemonEntry)) {
		throw new Error(`daemon entry not found: ${daemonEntry}`);
	}
	return { cmd: process.execPath, args: [tsxCli, daemonEntry] };
}

function joinPath(...parts: string[]): string {
	return parts.join("/").replace(/\\/g, "/");
}

/** HTTP readiness probe: GET / must serve the demo page (200). */
export async function httpProbe(url: string, _token: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError: Error | undefined;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, { redirect: "manual" });
			if (res.ok) return;
			lastError = new Error(`HTTP ${res.status}`);
		} catch (err) {
			lastError = err as Error;
		}
		await new Promise((r) => setTimeout(r, 150));
	}
	throw new Error(`sidecar did not become ready: ${lastError?.message ?? "timeout"}`);
}

export async function startSidecar(options: SidecarOptions): Promise<SidecarHandle> {
	const spawnImpl = options.spawnImpl ?? spawn;
	const probe = options.probe ?? httpProbe;
	const repoRoot = options.repoRoot;
	const listenPort = options.listenPort ?? 0;
	const token = options.token ?? generateToken();
	const daemon = options.daemonCommand?.() ?? defaultDaemonCommand(repoRoot);
	const log = options.log ?? (() => {});
	const listenSpec = listenPort === 0 ? "127.0.0.1:0" : `127.0.0.1:${listenPort}`;

	// process.execPath under Electron is the Electron binary; run children in
	// plain-Node mode so tsx behaves like under node (official Electron recipe).
	const child = spawnImpl(daemon.cmd, [...daemon.args, "--listen", listenSpec, "--token", token, ...(options.extraArgs ?? [])], {
		cwd: repoRoot,
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE ?? "1" },
	});

	let stdout = "";
	child.stdout?.on("data", (chunk: Buffer) => {
		const text = chunk.toString();
		stdout += text;
		for (const line of text.split("\n")) if (line.trim()) log(line);
	});
	let stderrTail = "";
	child.stderr?.on("data", (chunk: Buffer) => {
		const text = chunk.toString();
		stderrTail = (stderrTail + text).slice(-2000);
		for (const line of text.split("\n")) if (line.trim()) log(`[stderr] ${line}`);
	});

	// The daemon prints its bound port when listening on an ephemeral port.
	const boundPortPromise = new Promise<number>((resolve, reject) => {
		if (listenPort !== 0) return resolve(listenPort);
		const timer = setTimeout(() => reject(new Error("daemon never printed its WS URL")), 10_000);
		const watch = () => {
			const m = /ws:\/\/[^\s]*?:(\d+)/.exec(stdout);
			if (m) {
				clearTimeout(timer);
				resolve(Number.parseInt(m[1] as string, 10));
			} else setTimeout(watch, 100);
		};
		watch();
	});

	const ready = (async (): Promise<string> => {
		const port = await boundPortPromise;
		const base = `http://127.0.0.1:${port}`;
		await probe(base, token, 15_000);
		return `${base}/?token=${encodeURIComponent(token)}`;
	})();

	ready.catch(() => {
		try {
			child.kill();
		} catch {
			// already gone
		}
	});

	async function stop(): Promise<void> {
		if (child.exitCode !== null) return;
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				child.kill("SIGKILL");
				resolve();
			}, 2500);
			child.once("exit", () => {
				clearTimeout(timer);
				resolve();
			});
			child.kill();
		});
	}

	// Reap when the daemon dies on its own (crash reporting lands in the shell).
	child.once("exit", (code) => {
		log(`daemon exited (code ${code})${stderrTail ? `\n${stderrTail}` : ""}`);
	});

	return { listenPort: await boundPortPromise, token, ready, url: () => `${ready}`, stop };
}
