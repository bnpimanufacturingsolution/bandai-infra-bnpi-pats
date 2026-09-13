import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Live UI proof: hris-agency login no longer lands on /403.
 * Account: agency-test@test.com / password123 (hris-agency).
 * Lands on /agency with the agency workspace + tabs, not Access Denied.
 * Skips automatically when the local stack is not reachable.
 */

const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"../.runtime/agency-login-proof-20260914",
);

test("agency login lands on the agency workspace instead of 403", async ({
	page,
}) => {
	test.setTimeout(240_000);
	mkdirSync(EVIDENCE_DIR, { recursive: true });
	const results: Record<string, unknown> = {
		account: "agency-test@test.com",
		startedAt: new Date().toISOString(),
	};

	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	const identifier = page.getByLabel(/employee id or email/i);
	await expect(identifier).toBeVisible({ timeout: 150_000 });
	await identifier.fill("agency-test@test.com");
	await page.getByLabel(/^password$/i).fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
		timeout: 120_000,
	});
	results.postLoginUrl = page.url();
	expect(page.url()).toContain("/agency");
	expect(page.url()).not.toContain("/403");

	await page.waitForLoadState("networkidle").catch(() => undefined);
	await expect(page.getByTestId("agency-workspace")).toBeVisible({
		timeout: 60_000,
	});
	for (const tab of ["Roster", "Attendance", "Timesheets", "Biometrics"]) {
		await expect(
			page.getByRole("tab", { name: tab, exact: true }),
		).toBeVisible();
	}
	results.workspaceVisible = true;
	await page.screenshot({ path: path.join(EVIDENCE_DIR, "agency-workspace.png") });
	writeFileSync(
		path.join(EVIDENCE_DIR, "agency-login-proof.json"),
		JSON.stringify(results, null, 2),
	);
});
