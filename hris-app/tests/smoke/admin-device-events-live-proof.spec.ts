import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const deviceId = "cmrht5s2w00ei7zgsre8y3o5n";
const evidenceDir = resolve(
	process.env.DEVICE_EVENTS_PLAYWRIGHT_EVIDENCE_DIR ||
		"../.runtime/device-events-playwright",
);

test("renders the persisted Hikvision event ledger and direct inventory", async ({ page }) => {
	mkdirSync(evidenceDir, { recursive: true });
	const consoleErrors: string[] = [];
	const failedRequests: Array<{ url: string; error: string | null }> = [];
	const eventApiResponses: Array<{ url: string; status: number; total: number | null }> = [];

	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	page.on("requestfailed", (request) => {
		failedRequests.push({ url: request.url(), error: request.failure()?.errorText || null });
	});
	page.on("response", async (response) => {
		if (!response.url().includes("/api/device/events?")) return;
		let total: number | null = null;
		try {
			const body = await response.json();
			total = Number(body?.data?.summary?.total ?? body?.data?.pagination?.total ?? null);
		} catch {
			// The status and URL remain useful when a non-JSON proxy response occurs.
		}
		eventApiResponses.push({ url: response.url(), status: response.status(), total });
	});

	await page.goto("/auth/login");
	await page.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local").fill("admin@bandai.local");
	await page.getByPlaceholder("Enter your password").fill("password123");
	await page.getByRole("button", { name: "Sign In" }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 30_000 });

	const target = `/admin/configuration/devices/events?deviceId=${deviceId}&view=saved&window=today`;
	await page.goto(target);
	await expect(page.getByRole("heading", { name: "Device events" })).toBeVisible();
	await expect(page.getByText("Main Entrance Device A", { exact: false }).first()).toBeVisible();
	await expect(page.getByText("Hikvision", { exact: false }).first()).toBeVisible();
	await expect(page.getByText("10.184.38.173", { exact: false }).first()).toBeVisible();
	await expect(page.getByText("Users 167", { exact: false })).toBeVisible({ timeout: 30_000 });
	await expect(page.getByText("Fingerprints 162", { exact: false })).toBeVisible();
	await expect(page.getByText("Faces 161", { exact: false })).toBeVisible();
	await expect(page.getByText("Cards 109", { exact: false })).toBeVisible();
	await expect(page.getByText(/Logs [\d,]+/, { exact: false })).toBeVisible();
	await expect(page.getByText("Direct device evidence", { exact: true }).first()).toBeVisible();
	await expect.poll(() =>
		eventApiResponses.find((response) => {
			const url = new URL(response.url);
			return url.searchParams.get("limit") === "10" && !url.searchParams.has("source");
		})?.total ?? null,
	).not.toBeNull();
	const tableResponse = eventApiResponses.find((response) => {
		const url = new URL(response.url);
		return url.searchParams.get("limit") === "10" && !url.searchParams.has("source");
	});
	await expect(
		page.getByText(`${tableResponse?.total} saved rows for this filter`, { exact: true }),
	).toBeVisible();
	await expect(page.getByText("Taps", { exact: false }).first()).toBeVisible();
	await expect(page.getByText("Fingerprints enrolled", { exact: false }).first()).toBeVisible();
	await expect(page.getByText("Users created", { exact: false }).first()).toBeVisible();
	await expect(page.getByRole("columnheader", { name: "Evidence" })).toBeVisible();
	await expect(page.getByRole("columnheader", { name: "Confidence" })).toBeVisible();
	await expect(page.getByRole("columnheader", { name: "HRIS result" })).toBeVisible();

	await page.screenshot({ path: resolve(evidenceDir, "device-events-ledger.png"), fullPage: true });
	await page.getByRole("button", { name: "View" }).first().click();
	await expect(page.getByRole("heading", { name: "Device event details" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Raw payload" })).toBeVisible();
	await page.screenshot({ path: resolve(evidenceDir, "device-event-details.png"), fullPage: true });

	writeFileSync(resolve(evidenceDir, "console-errors.json"), JSON.stringify(consoleErrors, null, 2));
	writeFileSync(resolve(evidenceDir, "failed-requests.json"), JSON.stringify(failedRequests, null, 2));
	writeFileSync(resolve(evidenceDir, "event-api-responses.json"), JSON.stringify(eventApiResponses, null, 2));
	writeFileSync(resolve(evidenceDir, "page-text.txt"), await page.locator("body").innerText());

	expect(
		tableResponse?.status === 200 &&
			tableResponse.total !== null &&
			tableResponse.url.includes(`deviceId=${deviceId}`),
	).toBe(true);
	expect(failedRequests.filter((request) => request.url.includes("/api/device/events"))).toEqual([]);
});
