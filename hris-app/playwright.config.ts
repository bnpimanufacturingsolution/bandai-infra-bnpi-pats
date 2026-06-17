import { defineConfig } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
	testDir: "./tests",
	testMatch: ["*.spec.ts"],
	timeout: 60_000,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: process.env.CI ? 2 : undefined,
	expect: {
		timeout: 15_000,
	},
	use: {
		baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5175",
		headless: true,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
});
