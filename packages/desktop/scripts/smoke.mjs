/** Cross-platform PIE_SMOKE=1 electron runner (no cross-env dependency). */
import { spawn } from "node:child_process";
import { electronCommandFromEnv } from "./electron.cjs";

const electron = electronCommandFromEnv();
const child = spawn(electron.cmd, [...electron.args, "."], {
	cwd: new URL("..", import.meta.url).pathname,
	stdio: "inherit",
	env: { ...process.env, PIE_SMOKE: "1" },
});
child.on("exit", (code) => process.exit(code ?? 1));
