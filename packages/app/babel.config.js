// Mirrors paseo/packages/app/babel.config.js (Apache-2.0): unistyles plugin
// with src/ root; import.meta transform for Zustand ESM.
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
			[
				"react-native-unistyles/plugin",
				{
					root: "src",
				},
			],
		],
	};
};
