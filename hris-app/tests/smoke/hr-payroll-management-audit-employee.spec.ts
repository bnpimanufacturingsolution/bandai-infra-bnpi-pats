import { test, type Page } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "..", ".runtime", "payroll-mgmt-audit-20260819-204314", "ui");

const dump = (name: string, page: Page) =>
	page.screenshot({ path: join(OUT_DIR, `${name}.png`), fullPage: true }).catch(() => {});

const visibleAny = async (page: Page, patterns: Array<string | RegExp>, timeoutMs = 20_000) => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		for (const pattern of patterns) {
			const loc =
				typeof pattern === "string"
					? page.getByText(pattern, { exact: false })
					: page.getByText(pattern);
			if (await loc.first().isVisible().catch(() => false)) {
				return true;
			}
		}
		await page.waitForTimeout(400);
	}
	return false;
};

test("Payroll Management employee surfaces", async ({ page }) => {
	test.setTimeout(180_000);
	mkdirSync(OUT_DIR, { recursive: true });
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.locator("#login-identifier");
	await identifier.waitFor({ state: "visible", timeout: 90_000 });
	await identifier.fill("employee@seed.local");
	await page.locator("#login-password").fill("Password123!");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 90_000 });
	await dump("00-employee-after-login", page);

	await page.goto("/hr/payroll", { waitUntil: "domcontentloaded" });
	await visibleAny(page, ["Payroll", "Payslip", "Net", "Gross", "No payroll"], 30_000);
	await dump("3.1.1c-employee-payroll", page);

	await page.goto("/employee/benefits/epp", { waitUntil: "domcontentloaded" });
	await visibleAny(page, ["EPP", "Gundam", "Purchase", "Benefits"], 20_000);
	await dump("3.1.2b-epp", page);

	await page.goto("/employee/requests", { waitUntil: "domcontentloaded" });
	await visibleAny(page, ["Request", "Payroll Correction", "My Requests"], 20_000);
	await dump("3.2.1b-employee-requests", page);
});
