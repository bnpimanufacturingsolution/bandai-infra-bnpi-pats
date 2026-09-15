import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Live UI proof for the agency workspace pages (hris-agency).
 * Dedicated /agency/* routes with sidebar navigation + chart dashboard.
 * Actor: agency-test@test.com / password123.
 */

const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	".runtime/agency-workspace-20260914",
);

async function loginAsAgency(page: any, results: Record<string, unknown>) {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	await expect(page.getByLabel(/employee id or email/i)).toBeVisible({ timeout: 120_000 });
	await page.getByLabel(/employee id or email/i).fill("agency-test@test.com");
	await page.getByLabel(/^password$/i).fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url: any) => !url.pathname.includes("/auth/login"), {
		timeout: 120_000,
	});
	results.postLoginUrl = page.url();
	expect(page.url()).toContain("/agency/dashboard");
	expect(page.url()).not.toContain("/403");
	await page.waitForLoadState("networkidle").catch(() => undefined);
}

test("agency sidebar navigates dedicated pages and dashboard charts render", async ({
	page,
}) => {
	test.setTimeout(240_000);
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	const results: Record<string, unknown> = {
		account: "agency-test@test.com",
		startedAt: new Date().toISOString(),
	};

	await loginAsAgency(page, results);

	// Sidebar agency section with five page links.
	for (const label of ["Overview", "Employees", "Attendance", "Timesheets", "Biometrics"]) {
		await expect(page.getByRole("link", { name: label, exact: true }).first()).toBeVisible({
			timeout: 30_000,
		});
	}
	results.sidebarVisible = true;

	// Dashboard charts render from live rows.
	await expect(page.getByTestId("agency-page-dashboard")).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId("agency-chart-attendance-trend")).toBeVisible();
	await expect(page.getByTestId("agency-chart-timesheet-mix")).toBeVisible();
	await expect(page.getByTestId("agency-chart-departments")).toBeVisible();
	await expect(page.getByText("Agency members", { exact: true }).first()).toBeVisible();
	results.dashboardChartsVisible = true;
	await page.screenshot({ path: path.join(EVIDENCE_DIR, "agency-dashboard.png") });

	// Employees page shows real members.
	await page.getByRole("link", { name: "Employees", exact: true }).first().click();
	await expect(page.getByTestId("agency-page-roster")).toBeVisible({ timeout: 30_000 });
	results.rosterVisited = true;
	await page.screenshot({ path: path.join(EVIDENCE_DIR, "agency-roster.png") });

	// Timesheets + biometrics pages render.
	await page.getByRole("link", { name: "Timesheets", exact: true }).first().click();
	await expect(page.getByTestId("agency-page-timesheets")).toBeVisible({ timeout: 30_000 });
	await page.getByRole("link", { name: "Biometrics", exact: true }).first().click();
	await expect(page.getByTestId("agency-page-biometrics")).toBeVisible({ timeout: 30_000 });
	results.timesheetsBiometricsVisited = true;

	// Reports page is charts-and-graphs only (date filter + Excel export kept).
	await page.getByRole("link", { name: "Reports", exact: true }).first().click();
	await expect(page.getByTestId("agency-page-reports")).toBeVisible({ timeout: 30_000 });
	for (const t of [
		"agency-report-attendance-trend",
		"agency-report-timesheet-mix",
		"agency-report-departments",
		"agency-report-absentee-trend",
		"agency-report-employment-mix",
		"agency-report-date-filter",
	]) {
		await expect(page.getByTestId(t)).toBeVisible({ timeout: 30_000 });
	}
	await expect(page.getByTestId("agency-page-reports").locator("table")).toHaveCount(0);
	await expect(page.getByRole("button", { name: /export excel/i })).toBeVisible();
	results.reportsDeepDiveVisible = true;
	// Coordinator sidebar: no duplicate generic Dashboard (Overview is the dashboard).
	await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
	await page.screenshot({ path: path.join(EVIDENCE_DIR, "agency-reports.png") });

	writeFileSync(
		path.join(EVIDENCE_DIR, "agency-workspace-proof.json"),
		JSON.stringify({ ...results, finishedAt: new Date().toISOString() }, null, 2),
	);
});
