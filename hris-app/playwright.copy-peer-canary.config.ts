import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/canary",
	testMatch: ["copy-peer-canary.spec.ts"],
	timeout: 8 * 60_000,
	retries: 0,
	workers: 1,
	fullyParallel: false,
	expect: { timeout: 30_000 },
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://dev.bnpi-hris.tech",
		headless: true,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
		actionTimeout: 45_000,
		navigationTimeout: 60_000,
	},
	reporter: [
		["list"],
		[
			"json",
			{
				outputFile:
					"../.runtime/copy-peer-canary-admin-20260725/playwright/playwright-report.json",
			},
		],
	],
	outputDir: "../.runtime/copy-peer-canary-admin-20260725/playwright/test-results",
});
