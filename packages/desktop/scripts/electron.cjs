/** Resolve the electron binary whether installed (node_modules/.bin) or globally. */
const path = require("node:path");

function electronCommandFromEnv() {
	// npm puts node_modules/.bin in PATH when running scripts.
	const bins = (process.env.PATH || "").split(path.delimiter);
	for (const dir of bins) {
		const candidate = path.join(dir, "electron");
		try {
			require("node:fs").accessSync(candidate);
			return { cmd: candidate, args: [] };
		} catch {
			// keep scanning
		}
	}
	return { cmd: "electron", args: [] };
}

module.exports = { electronCommandFromEnv };
