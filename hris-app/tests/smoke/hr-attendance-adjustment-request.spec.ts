import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "..", ".runtime", "zen-att-adjust-20260819");

const dump = (name: string, page: Page) =>
	page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true }).catch(() => {});

const login = async (page: Page, email: string, password: string) => {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.locator("#login-identifier");
	await identifier.waitFor({ state: "visible", timeout: 90_000 });
	await identifier.fill(email);
	await page.locator("#login-password").fill(password);
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 45_000 });
};

test("Zen can file a missed clock-out request from My Requests", async ({ page }) => {
	test.setTimeout(180_000);
	mkdirSync(OUT_DIR, { recursive: true });

	await login(page, "zensample@gmail.com", "ZenAndrei00010!Audit");
	await page.goto(
		"/employee/requests?action=create&kind=attendance-adjustment&date=2026-08-18&timeIn=16:22&timeOut=17:00",
		{ waitUntil: "domcontentloaded" },
	);
	await expect(page.getByText("Attendance request")).toBeVisible({ timeout: 45_000 });
	await dump("ui-zen-adjustment-modal", page);

	const notes = page.getByPlaceholder(/forgot to clock in or clock out|stayed to finish/i);
	await notes.fill("Forgot to clock out yesterday after my 4:22 PM punch. Please set time out to 5:00 PM.");
	await page.getByRole("button", { name: /submit request/i }).click();
	await page.waitForTimeout(3_000);
	await dump("ui-zen-after-submit", page);

	const body = ((await page.locator("body").innerText()) || "").replace(/\s+/g, " ");
	expect(body).not.toMatch(/invalid enum value/i);
	expect(body).not.toMatch(/organization context is missing/i);
});

test("HR can open the submitted attendance adjustment in Approvals", async ({ page }) => {
	test.setTimeout(180_000);
	await login(page, "hr-manager@seed.local", "Password123!");
	await page.goto("/hr/approvals/requests", { waitUntil: "domcontentloaded" });
	await expect(page.getByText(/approval|request/i).first()).toBeVisible({ timeout: 45_000 });
	const row = page.getByText(/attendance adjustment|missed punch|00010|clock-out/i).first();
	if (await row.isVisible().catch(() => false)) {
		await row.click();
	}
	await dump("ui-hr-approvals-adjustment", page);
	const approve = page.getByRole("button", { name: /^approve$/i });
	if (await approve.isVisible().catch(() => false)) {
		await approve.click();
		await page.waitForTimeout(2_000);
		await dump("ui-hr-after-approve", page);
	}
});
