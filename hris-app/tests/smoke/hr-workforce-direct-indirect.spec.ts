import { expect, test } from "@playwright/test";
import { mkdirSync } from "fs";
import { join } from "path";

const OUT_DIR = join(process.cwd(), "..", ".runtime", "direct-indirect-2.1.7-browser");

test("2.1.7 Direct vs Indirect labor is mounted without replacing Manpower or tardiness", async ({
	page,
}) => {
	test.setTimeout(180_000);
	mkdirSync(OUT_DIR, { recursive: true });

	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	await page.locator("#login-identifier").waitFor({ state: "visible", timeout: 90_000 });
	await page.locator("#login-identifier").fill("hr-manager@seed.local");
	await page.locator("#login-password").fill("Password123!");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 45_000 });

	await page.goto("/hr/reports/workforce", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("tab", { name: "Manpower Distribution" })).toHaveAttribute(
		"data-state",
		"active",
		{ timeout: 45_000 },
	);
	await expect(page.getByRole("tab", { name: "Direct vs Indirect" })).toHaveAttribute(
		"data-state",
		"inactive",
	);
	await page.screenshot({ path: join(OUT_DIR, "workforce-default-manpower.png"), fullPage: true });

	await page.goto("/hr/reports/workforce?tab=direct-indirect", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("tab", { name: "Direct vs Indirect" })).toHaveAttribute(
		"data-state",
		"active",
		{ timeout: 45_000 },
	);
	await expect(page.getByText("Direct vs Indirect Labor Report")).toBeVisible();
	await expect(page.getByText("Labor Type")).toBeVisible();
	await expect(page.getByText("Direct Employees").first()).toBeVisible();
	await expect(page.getByText("Indirect Employees").first()).toBeVisible();
	await page.screenshot({
		path: join(OUT_DIR, "workforce-direct-indirect.png"),
		fullPage: true,
	});

	await page.goto("/hr/reports/attendance?tab=tardiness", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("tab", { name: /tardiness/i })).toBeVisible({ timeout: 45_000 });
	await expect(page.getByText(/tardiness/i).first()).toBeVisible();
	await page.screenshot({ path: join(OUT_DIR, "attendance-tardiness.png"), fullPage: true });
});
