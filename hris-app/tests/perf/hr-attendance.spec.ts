import { expect, test } from "@playwright/test";

const HR_EMAIL = process.env.PLAYWRIGHT_HR_EMAIL || "hr-manager@seed.local";
const HR_PASSWORD = process.env.PLAYWRIGHT_HR_PASSWORD || "Password123!";
const ATTENDANCE_URL = "/hr/attendance?page=1";
const TARGET_READY_MS = Number(process.env.PLAYWRIGHT_ATTENDANCE_READY_MS || "2500");

test("hr attendance today view loads within target budget", async ({ page }) => {
	const requestStartedAt = new Map<any, number>();
	const apiDurations: Array<{ url: string; durationMs: number; status: number }> = [];

	page.on("request", (request) => {
		requestStartedAt.set(request, Date.now());
	});

	page.on("response", (response) => {
		const request = response.request();
		const startedAt = requestStartedAt.get(request);
		if (!startedAt) return;
		const url = response.url();
		if (!url.includes("/api/")) return;
		apiDurations.push({
			url,
			durationMs: Date.now() - startedAt,
			status: response.status(),
		});
	});

	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	await page.getByPlaceholder("e.g. employee@bandai.com").fill(HR_EMAIL);
	await page.getByPlaceholder("Enter your password").fill(HR_PASSWORD);
	await page.getByRole("button", { name: "Sign In" }).click();
	await page.waitForURL(/\/hr\/|\/dashboard|\/employee\//, { timeout: 30_000 });

	const routeStart = Date.now();
	await page.goto(ATTENDANCE_URL, { waitUntil: "domcontentloaded" });
	console.log(`[attendance-perf] after goto=${Date.now() - routeStart}`);
	await page.waitForURL(/\/hr\/attendance(\?.*)?$/, { timeout: 30_000 });
	console.log(`[attendance-perf] after url=${Date.now() - routeStart}`);
	await expect(page.getByRole("heading", { name: "Scheduled Today" })).toBeVisible();
	console.log(`[attendance-perf] after cards=${Date.now() - routeStart}`);
	await expect(page.getByText("Attendance Records")).toBeVisible();
	console.log(`[attendance-perf] after records-title=${Date.now() - routeStart}`);

	const tableReady = Promise.race([
		page.getByRole("table").waitFor({ state: "visible", timeout: 30_000 }),
		page.getByText("No attendance records found").waitFor({ state: "visible", timeout: 30_000 }),
	]);
	await tableReady;

	const routeReadyMs = Date.now() - routeStart;
	console.log(`[attendance-perf] routeReadyMs=${routeReadyMs}`);

	const slowApiCalls = apiDurations
		.filter((entry) => entry.durationMs >= 250)
		.sort((left, right) => right.durationMs - left.durationMs);
	for (const call of slowApiCalls) {
		console.log(
			`[attendance-perf] api ${call.status} ${call.durationMs}ms ${call.url}`,
		);
	}

	const metricsCalls = apiDurations
		.filter((entry) => entry.url.includes("/api/metrics"))
		.sort((left, right) => right.durationMs - left.durationMs);
	for (const call of metricsCalls) {
		console.log(
			`[attendance-perf] metrics ${call.status} ${call.durationMs}ms ${call.url}`,
		);
	}

	expect(routeReadyMs).toBeLessThanOrEqual(TARGET_READY_MS);
});
