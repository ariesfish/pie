// Root vitest config shared by all packages. The app package's tests can
// import React Native components, which Node cannot execute directly — the
// aliases below point them at react-native-web and neutralized stubs (the
// same technique as paseo's vitest.config.ts). The extensions list prefers
// `.web.*` platform files so platform-forked modules (markdown-text, dnd)
// resolve to their web implementation under test.
import { defineConfig, configDefaults } from "vitest/config";
import { resolve } from "node:path";

const RN_WEB = resolve(__dirname, "node_modules/react-native-web/dist/index.js");
const APP_STUBS = resolve(__dirname, "packages/app/test-stubs");

export default defineConfig({
	resolve: {
		alias: {
			// The app package's tsconfig paths ("@/*" → "packages/app/src/*");
			// inert for protocol/client/daemon/desktop, which never use "@/…".
			"@": resolve(__dirname, "packages/app/src"),
			react: resolve(__dirname, "node_modules/react"),
			"react-dom": resolve(__dirname, "node_modules/react-dom"),
			"react-native": RN_WEB,
			"react-native-unistyles": resolve(APP_STUBS, "react-native-unistyles.ts"),
			"lucide-react-native": resolve(APP_STUBS, "lucide-react-native.ts"),
		},
		// Web-first platform resolution (mirrors paseo): forked imports like
		// "./markdown-text" must land on .web.tsx in the node test environment.
		extensions: [
			".web.mjs",
			".web.js",
			".web.mts",
			".web.ts",
			".web.jsx",
			".web.tsx",
			".mjs",
			".js",
			".mts",
			".ts",
			".jsx",
			".tsx",
			".json",
		],
	},
	test: {
		exclude: [...configDefaults.exclude, "**/dist/**"],
		// React Native bundler globals (paseo vitest.config.ts define block).
		define: {
			__DEV__: "false",
			"process.env.JEST_WORKER_ID": "undefined",
		},
		// Global shims for RN/expo/env globals in node tests (paseo setup):
		// __DEV__, matchMedia, expo modules, rAF. The setup file runs before the
		// module graph, so reanimated's top-level reads see __DEV__ === false.
		setupFiles: [resolve(__dirname, "packages/app/vitest.setup.ts")],
	},
});
