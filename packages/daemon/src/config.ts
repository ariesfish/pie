/**
 * Daemon CLI configuration (P0). Keep this hand-rolled; revisit when the
 * surface grows (P1 will add --relay, --workspaces, --state-db).
 */

export interface DaemonConfig {
	listenHost: string;
	listenPort: number;
	/** Auth token. When omitted, an ephemeral token is generated and printed. */
	token?: string;
	/** Override the Pi agent dir (default ~/.pi/agent). */
	agentDir?: string;
	/** Serve the built-in demo page at /. Default: true. */
	servePage: boolean;
	/** Permission card policy: "off" (default, Pi TUI parity) | "annotations" | "ask". */
	permissionMode: "off" | "annotations" | "ask";
	/** Permission card timeout ms. Default: 10 minutes. */
	permissionTimeoutMs?: number;
}

export function parseDaemonConfig(argv: string[]): DaemonConfig {
	const config: DaemonConfig = {
		listenHost: "127.0.0.1",
		listenPort: 8760,
		servePage: true,
		permissionMode: "off",
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] as string;
		switch (arg) {
			case "--listen":
			case "-l": {
				const value = argv[i + 1];
				if (!value) throw usageError(`--listen requires host:port`);
				const [host, portStr] = value.split(":");
				if (!host || !portStr) throw usageError(`--listen expects host:port, got ${value}`);
				const port = Number.parseInt(portStr, 10);
				if (!Number.isInteger(port) || port < 0 || port > 65535) {
					throw usageError(`invalid port: ${portStr}`);
				}
				config.listenHost = host;
				config.listenPort = port;
				i++;
				break;
			}
			case "--token":
				config.token = argv[++i];
				if (!config.token) throw usageError(`--token requires a value`);
				break;
			case "--pi":
				config.agentDir = argv[++i];
				if (!config.agentDir) throw usageError(`--pi requires a directory`);
				break;
			case "--no-page":
				config.servePage = false;
				break;
			case "--permission": {
				const value = argv[++i];
				if (value !== "off" && value !== "annotations" && value !== "ask") {
					throw usageError(`--permission expects off|annotations|ask, got ${String(value)}`);
				}
				config.permissionMode = value;
				break;
			}
			case "--permission-timeout-ms": {
				const value = Number.parseInt(argv[++i] ?? "", 10);
				if (!Number.isFinite(value) || value <= 0) {
					throw usageError(`--permission-timeout-ms expects a positive integer`);
				}
				config.permissionTimeoutMs = value;
				break;
			}
			case "--help":
			case "-h":
				throw new DaemonUsageError(USAGE); // prints via catch path
			default:
				throw usageError(`unknown argument: ${arg}`);
		}
	}
	return config;
}

export const USAGE = `pie-daemon — dedicated daemon for the Pi coding agent

Usage:
  pie-daemon [options]

Options:
  --listen <host:port>   Bind address (default 127.0.0.1:8760)
  --token <token>        Auth token; an ephemeral one is printed when omitted
  --pi <dir>             Pi agent directory (default ~/.pi/agent)
  --no-page              Do not serve the built-in demo page at /
  --permission <mode>    off (default) | annotations | ask — tool approval cards
  --permission-timeout-ms <ms>  Approval card timeout (default 600000; timeout = deny)
`;

export class DaemonUsageError extends Error {
	constructor(message: string, readonly printUsage = true) {
		super(message);
		this.name = "UsageError";
	}
}

function usageError(message: string): DaemonUsageError {
	return new DaemonUsageError(message);
}
