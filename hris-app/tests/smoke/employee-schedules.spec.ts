import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "..", ".runtime", "employee-schedules-20260821");

const login = async (page: Page) => {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.getByLabel(/employee id or email/i);
	await identifier.waitFor({ state: "visible", timeout: 90_000 });
	await identifier.fill("admin@bandai.local");
	await page.getByLabel(/^password$/i).fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 45_000 });
};

test("admin employee schedules page lists people and opens current hours", async ({ page }) => {
	test.setTimeout(180_000);
	mkdirSync(OUT, { recursive: true });
	await login(page);
	await page.goto("/admin/configuration/employee-schedules", { waitUntil: "domcontentloaded" });
	await expect(page.getByTestId("employee-schedule-org-filter")).toBeVisible({ timeout: 90_000 });
	await expect(page.getByRole("main").getByText("Employee Schedules")).toBeVisible();
	const changeButton = page.getByTestId(/change-schedule-/).first();
	await expect(changeButton).toBeVisible({ timeout: 90_000 });
	await page.screenshot({ path: join(OUT, "01-employee-schedules-table.png"), fullPage: true });
	await changeButton.click();
	await expect(page.getByRole("heading", { name: /change schedule/i })).toBeVisible({
		timeout: 15_000,
	});
	await page.screenshot({ path: join(OUT, "02-employee-schedule-editor.png"), fullPage: true });
});
