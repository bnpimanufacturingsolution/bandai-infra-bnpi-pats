import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"generated/**",
			"reports/**",
			"output/**",
			"exports/**",
			"test-artifacts/**",
		],
	},
	{
		files: ["**/*.ts"],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: "latest",
			sourceType: "module",
		},
		plugins: {
			"@typescript-eslint": tsPlugin,
		},
		rules: {
			// Compatibility mode while the repo is still on a pre-flat-config lint posture.
		},
	},
];
