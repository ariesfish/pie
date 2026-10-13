/**
 * Pack the desktop app (P2 closing item). Two stages:
 *   1. Assemble dist/staging — a mini-monorepo (protocol/client/daemon src +
 *      production node_modules) that sidecar-manager's layout checks accept
 *      unchanged (repoRoot/node_modules/tsx + repoRoot/packages/daemon/src).
 *   2. electron-builder — app code in asar, staging as extraResources/pie-runtime.
 *
 * Verify with `npm run pack:smoke -w @pie/desktop` (boots the packaged .app
 * with PIE_SMOKE=1, expects exit 0 with zero leftovers).
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgDir = join(here, "..");
const repoRoot = join(pkgDir, "..", "..");
const staging = join(pkgDir, "dist", "staging");

// --- stage 1: staging ------------------------------------------------------

rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, "packages"), { recursive: true });

const rootPkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
writeFileSync(
	join(staging, "package.json"),
	JSON.stringify(
		{
			name: "pie-runtime",
			private: true,
			workspaces: ["packages/protocol", "packages/client", "packages/daemon"],
		},
		null,
		"\t",
	) + "\n",
);

for (const name of ["protocol", "client", "daemon"]) {
	const src = join(repoRoot, "packages", name);
	const dst = join(staging, "packages", name);
	mkdirSync(dst, { recursive: true });
	cpSync(join(src, "package.json"), join(dst, "package.json"));
	cpSync(join(src, "src"), join(dst, "src"), { recursive: true });
	if (name === "daemon" && existsSync(join(src, "public"))) {
		cpSync(join(src, "public"), join(dst, "public"), { recursive: true });
	}
	if (name === "daemon" && existsSync(join(src, "scripts"))) {
		// daemon embeds no repo-relative scripts at runtime; skipped.
	}
	void rootPkg;
}

// Expo web build → desktop/dist/app-web (the real UI the window loads).
console.log("[pack] building @pie/app web bundle…");
execFileSync("npx", ["expo", "export", "--platform", "web", "--output-dir", join(pkgDir, "dist", "app-web")], {
	cwd: join(repoRoot, "packages", "app"),
	stdio: "inherit",
});
// expo export's "single" web mode ships the expo-reset style with the
// height chain but no dark floor (and ignores app/+html.tsx). Post-process
// the exported index.html: paint the window canvas dark so the app never
// sits on Chromium's default white. Keep in sync with theme surface0.
{
	const htmlPath = join(pkgDir, "dist", "app-web", "index.html");
	let html = readFileSync(htmlPath, "utf8");
	if (!html.includes("pie-dark-floor")) {
		html = html.replace(
			"</head>",
			`\t<style id="pie-dark-floor">html, body, #root { margin: 0; background: #101216; }</style>\n  </head>`,
		);
		writeFileSync(htmlPath, html);
		console.log("[pack] injected pie-dark-floor into index.html");
	}
}


console.log("[pack] staging assembled; installing production deps…");
execFileSync(
	"npm",
	["install", "--omit=dev", "--include-workspace-root", "--no-audit", "--no-fund"],
	{ cwd: staging, stdio: "inherit" },
);
// tsx rides in devDependencies in the repo (dev-time convenience only), but
// the packaged sidecar still boots the daemon from src/ — install it
// explicitly into the staging runtime.
execFileSync("npm", ["install", "--no-save", "--no-audit", "--no-fund", "tsx"], {
	cwd: staging,
	stdio: "inherit",
});

// --- stage 2: electron-builder ----------------------------------------------

const runtimeArchive = join(pkgDir, "dist", "pie-runtime.tgz");
console.log("[pack] archiving staging…");
execFileSync("tar", ["czf", runtimeArchive, "-C", staging, "."], { stdio: "inherit" });

console.log("[pack] electron-builder…");
execFileSync("npx", ["--yes", "electron-builder", "--config", join(pkgDir, "electron-builder.json5")], {
	cwd: pkgDir,
	stdio: "inherit",
});
console.log("[pack] done — see packages/desktop/dist-out/");
