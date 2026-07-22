const path = require("path");

module.exports = {
	mode: "production",
	entry: {
		server: "./index.ts",
		cron: "./cron-entry.ts",
		backup: "./scripts/run-database-backup.ts",
	},
	target: "node",
	externals: [
		/^[a-z\-0-9]+$/, // Ignore node_modules folder
	],
	output: {
		filename: "[name].js", // output file
		path: path.join(__dirname, "dist"),
		libraryTarget: "commonjs",
	},
	resolve: {
		// Add in `.ts` and `.tsx` as a resolvable extension.
		extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js", ".json", ".yaml"],
		// NodeNext-style source imports intentionally use the emitted `.js` suffix.
		// During the TypeScript bundle, resolve those requests back to source `.ts`.
		extensionAlias: {
			".js": [".js", ".ts"],
		},
		modules: ["./node_modules", "node_modules"],
	},
	resolveLoader: {
		//root: [`${root}/node_modules`],
	},
	module: {
		rules: [
			{
				// all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
				test: /\.tsx?$/,
				use: [
					{
						loader: "ts-loader",
						options: {
							// Keep Docker deploy builds fast; run `npm run typecheck` separately for full TS checks.
							transpileOnly: true,
							onlyCompileBundledFiles: true,
						},
					},
				],
			},
		],
	},
};
