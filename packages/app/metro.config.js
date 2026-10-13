/**
 * Metro config for the Pie monorepo: the app lives in packages/app but
 * imports workspace packages (@pie/client, @pie/protocol) from their TS
 * sources, so Metro must watch and resolve from the repo root too — and
 * shim TypeScript-NodeNext "./x.js" specifiers ("x.js" -> "x.ts").
 */

const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules"),
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
	if (/^(\.\.?\/|@pie\/)/.test(moduleName) && moduleName.endsWith(".js")) {
		// TypeScript-NodeNext emits ".js" specifiers that resolve to ".ts"
		// sources. Prefer the .ts candidate; fall back to default resolution.
		try {
			return context.resolveRequest(
				context,
				moduleName.slice(0, -3) + ".ts",
				platform,
			);
		} catch {
			// fall through
		}
	}
	return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
