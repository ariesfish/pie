// Mirrors paseo/packages/app/babel.config.js (Apache-2.0): unistyles plugin
// with src/ root; import.meta transform for Zustand ESM. The worklets plugin
// is a pie addition (W1): without it the `"worklet"` directives in the
// ported mobile-panels gesture system compile as plain functions — native
// still works through the New Architecture worklet runtime, but web gestures
// silently no-op (caught by the walkthrough's compact edge-swipe).
module.exports = function (api) {
	api.cache(true);

	const expoPreset = [
		"babel-preset-expo",
		{
			unstable_transformImportMeta: true,
		},
	];

	return {
		presets: [expoPreset],
		plugins: [
			"react-native-worklets/plugin",
			[
				"react-native-unistyles/plugin",
				{
					root: "src",
				},
			],
		],
	};
};
