import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "..", ".runtime", "change-weekly-hours-20260820");
const ZEN_ID = "cmspnnxot02s5qw01yk7yy2er";

const login = async (page: Page) => {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.getByLabel(/employee id or email/i);
	await identifier.waitFor({ state: "visible", timeout: 90_000 });
	await identifier.fill("admin@bandai.local");
	await page.getByLabel(/^password$/i).fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 45_000 });
};

test("admin can open Change schedule weekly hours for Zen", async ({ page }) => {
	test.setTimeout(180_000);
	mkdirSync(OUT, { recursive: true });
	await login(page);
	await page.goto(`/admin/configuration/employees/${ZEN_ID}?tab=schedule`, {
		waitUntil: "domcontentloaded",
	});
	await page.getByRole("tab", { name: /work schedule/i }).click({ timeout: 90_000 });
	await expect(page.getByText(/active assignment/i)).toBeVisible({
		timeout: 60_000,
	});
	await page.screenshot({ path: join(OUT, "01-work-schedule-tab.png"), fullPage: true });
	await page.getByTestId("change-weekly-hours").click();
	await expect(page.getByText(/change weekly hours/i)).toBeVisible({ timeout: 10_000 });
	await page.getByLabel("Mon start").fill("06:00");
	await page.getByLabel("Mon end").fill("15:00");
	await page.getByLabel("Tue start").fill("07:00");
	await page.getByLabel("Tue end").fill("16:00");
	await expect(page.getByLabel("Mon start")).toHaveValue("06:00");
	await expect(page.getByLabel("Tue start")).toHaveValue("07:00");
	await page.screenshot({ path: join(OUT, "02-weekly-hours-modal.png"), fullPage: true });
	await page.getByRole("button", { name: /cancel/i }).click();
	await expect(page.getByText(/change weekly hours/i)).toHaveCount(0);
});
