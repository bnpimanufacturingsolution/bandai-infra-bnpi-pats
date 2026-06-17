import { defineConfig } from "@playwright/test";
import "dotenv/config";

const configuredBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const port = process.env.PLAYWRIGHT_SMOKE_PORT || "5176";
const baseURL = configuredBaseURL || `http://127.0.0.1:${port}`;

export default defineConfig({
	testDir: "./tests/smoke",
	timeout: 45_000,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	expect: {
		timeout: 10_000,
	},
	webServer: configuredBaseURL
		? undefined
		: {
				command: `npm run dev -- --port ${port}`,
				url: baseURL,
				reuseExistingServer: false,
				timeout: 120_000,
				env: {
					VITE_API_BASE_URL: `${baseURL}/api`,
					VITE_AUTH_TOKEN_STORAGE_ENABLED: "true",
				},
			},
	use: {
		baseURL,
		headless: true,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
});
