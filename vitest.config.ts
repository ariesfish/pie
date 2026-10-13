import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	resolve: {
		alias: {
			// The app package's tsconfig paths ("@/*" → "packages/app/src/*");
			// inert for protocol/client/daemon/desktop, which never use "@/…".
			"@": resolve(__dirname, "packages/app/src"),
		},
	},
});
