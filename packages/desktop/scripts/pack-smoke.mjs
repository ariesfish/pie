/**
 * Smoke the packaged app: locate the built .app binary, run it with
 * PIE_SMOKE=1, expect exit 0. Complements the dev-mode `smoke` script.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const outDir = join(import.meta.dirname, "..", "dist-out");
let binary = null;

for (const sub of ["", "mac-arm64", "mac", "mac-universal"]) {
	const dir = join(outDir, sub);
	if (!existsSync(dir)) continue;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory() || !entry.name.endsWith(".app")) continue;
		const cand = join(dir, entry.name, "Contents", "MacOS", "Pie");
		if (existsSync(cand)) binary = cand;
	}
}
if (!binary && process.platform === "linux") {
	const candidate = join(outDir, "linux-unpacked", "pie");
	if (existsSync(candidate)) binary = candidate;
}
if (!binary) {
	console.error("[pack:smoke] no packaged app found under dist-out — run `npm run pack` first");
	process.exit(1);
}
console.log(`[pack:smoke] booting ${binary}`);

const res = spawnSync(binary, process.platform === "linux" ? ["--no-sandbox"] : [], {
	env: { ...process.env, PIE_SMOKE: "1", ELECTRON_ENABLE_LOGGING: "1" },
	stdio: "inherit",
	timeout: 120_000,
});
if (res.status === 0) {
	console.log("[pack:smoke] OK");
	process.exit(0);
}
console.error(`[pack:smoke] FAILED exit=${res.status}`);
process.exit(1);
