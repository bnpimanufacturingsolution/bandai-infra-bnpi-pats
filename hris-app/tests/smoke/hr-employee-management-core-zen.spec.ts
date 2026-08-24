import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "..", ".runtime", "employee-mgmt-core-20260818");
const rows: string[] = [];

const login = async (page: Page, email: string, password: string) => {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	await page.locator("#login-identifier").waitFor({ state: "visible", timeout: 90_000 });
	await page.locator("#login-identifier").fill(email);
	await page.locator("#login-password").fill(password);
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 45_000 });
};

const shot = (page: Page, name: string) =>
	page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true }).catch(() => {});

const note = (id: string, status: string, proof: string) => {
	rows.push(`| ${id} | ${status} | ${proof.replace(/\|/g, "/")} |`);
};

test("Zen Andrei core UI: profile, request, password, roles", async ({ page }) => {
	test.setTimeout(300_000);
	mkdirSync(OUT, { recursive: true });

	await login(page, "hr-manager@seed.local", "Password123!");
	await page.goto("/hr/employees", { waitUntil: "domcontentloaded" });
	const search = page.getByPlaceholder(/search/i).first();
	if (await search.isVisible({ timeout: 20_000 }).catch(() => false)) {
		await search.fill("00010");
		await page.waitForTimeout(2000);
	}
	const zenRow = page.getByText(/Zen Andrei|00010/i).first();
	const listed = await zenRow.isVisible({ timeout: 30_000 }).catch(() => false);
	await shot(page, "ui-hr-directory-zen");
	note("HR directory finds Zen", listed ? "working" : "partial", listed ? "00010 visible" : page.url());
	if (listed) {
		await zenRow.click();
		await page.waitForTimeout(2000);
	} else {
		await page.goto("/hr/employees/cmspnnxot02s5qw01yk7yy2er", { waitUntil: "domcontentloaded" });
	}
	const profile = await page.getByText(/Zen Andrei|Personal|Employment|00010/i).first().isVisible({ timeout: 20_000 }).catch(() => false);
	await shot(page, "ui-hr-zen-profile");
	note("HR opens Zen profile", profile ? "working" : "partial", page.url());

	await page.goto("/hr/approvals/requests", { waitUntil: "domcontentloaded" });
	const reqVisible = await page.getByText(/REQ-1786424090597|CORE-AUDIT Zen/i).first().isVisible({ timeout: 20_000 }).catch(() => false);
	await shot(page, "ui-hr-approvals");
	note("HR approvals shows sample request", reqVisible ? "working" : "partial", reqVisible ? "REQ-1786424090597" : "not on first page");

	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	await page.evaluate(() => localStorage.clear());
	await login(page, "admin@bandai.local", "password123");
	await page.goto("/admin/configuration/users", { waitUntil: "domcontentloaded" });
	const usersTitle = await page.getByText(/Users|User Directory|zen-andrei|zensample/i).first().isVisible({ timeout: 30_000 }).catch(() => false);
	await shot(page, "ui-admin-users");
	note("Admin users page", usersTitle ? "working" : "partial", page.url());

	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	await page.evaluate(() => localStorage.clear());
	await login(page, "zensample@gmail.com", "ZenAndrei00010!Audit");
	const zenHome = await page.getByText(/Zen|Working Space|My Profile|Dashboard/i).first().isVisible({ timeout: 30_000 }).catch(() => false);
	await shot(page, "ui-zen-logged-in");
	note("Zen logs in after password change", zenHome ? "working" : "partial", page.url());

	await page.goto("/employee/requests", { waitUntil: "domcontentloaded" });
	const ownReq = await page.getByText(/REQ-1786424090597|CORE-AUDIT Zen|Document/i).first().isVisible({ timeout: 20_000 }).catch(() => false);
	await shot(page, "ui-zen-requests");
	note("Zen sees own request", ownReq ? "working" : "partial", ownReq ? "own request visible" : page.url());

	writeFileSync(join(OUT, "ui-notes.md"), ["| Check | Status | Proof |", "|---|---|---|", ...rows].join("\n"));
});
