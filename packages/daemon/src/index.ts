/**
 * pie-daemon entrypoint.
 *
 * Starts the WS server on --listen (default 127.0.0.1:8760) and prints the
 * connection URL with the auth token (Paseo-style "open and go" bootstrap).
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getAgentDir, VERSION as PI_VERSION } from "@earendil-works/pi-coding-agent";
import { parseDaemonConfig, DaemonUsageError, USAGE } from "./config.js";
import { DaemonServer } from "./server/server.js";
import { DAEMON_VERSION } from "./version.js";

const argv = process.argv.slice(2);
const config = (() => {
	try {
		return parseDaemonConfig(argv);
	} catch (err) {
		if (err instanceof DaemonUsageError) {
			console.error(`${(err as Error).message}\n\n${USAGE}`);
			process.exit(1);
		}
		throw err;
	}
})();

const agentDir = config.agentDir ?? getAgentDir();
const token = config.token ?? randomBytes(24).toString("base64url");

const server = new DaemonServer({
	listenHost: config.listenHost,
	listenPort: config.listenPort,
	token,
	agentDir,
	servePage: config.servePage,
	piVersion: PI_VERSION,
	piAgentDir: agentDir,
	permissionMode: config.permissionMode,
	permissionTimeoutMs: config.permissionTimeoutMs,
});

const { host, port } = await server.start();

console.log(`pie-daemon v${DAEMON_VERSION} (pi ${PI_VERSION})`);
console.log(`  WS        ws://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`);
console.log(`  Agent dir ${agentDir.startsWith("/") || agentDir.startsWith("~") ? agentDir : join(homedir(), agentDir)}`);
if (config.servePage) {
	const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
	console.log(`  Open      http://${displayHost}:${port}/?token=${token}`);
}
console.log(`  Token     ${token}`);
if (config.permissionMode !== "off") {
	console.log(`  Permission ${config.permissionMode} (timeout ${config.permissionTimeoutMs ?? 600000}ms, timeout=deny)`);
}

process.on("SIGINT", async () => {
	console.log("\nshutting down…");
	await server.stop();
	process.exit(0);
});
process.on("SIGTERM", async () => {
	await server.stop();
	process.exit(0);
});
