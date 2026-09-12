import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
	await page.goto("/auth/login");
	await page.locator("#login-identifier").fill("admin@bandai.local");
	await page.locator("#login-password").fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 30_000 });
}

test("admin onboarding checklist page loads live roster data and signs are wired", async ({
	page,
}) => {
	const onboardingConsoleErrors: string[] = [];
	const failedRequests: { url: string; status: number }[] = [];

	// Only onboarding-scoped console failures are relevant; pre-login /auth/me 401
	// bootstrapping noise (asserted by the auth suite) is intentionally ignored.
	page.on("console", (msg) => {
		if (msg.type() === "error" && /onboarding/i.test(msg.text())) {
			onboardingConsoleErrors.push(msg.text());
		}
	});
	page.on("response", (response) => {
		if (response.url().includes("/api/onboarding/") && response.status() >= 400) {
			failedRequests.push({ url: response.url(), status: response.status() });
		}
	});

	await login(page);

	const rosterResponsePromise = page.waitForResponse(
		(response) => response.url().includes("/api/onboarding/employees") && response.status() === 200,
		{ timeout: 30_000 },
	);
	await page.goto("/admin/configuration/onboarding/checklist");
	const rosterResponse = await rosterResponsePromise;
	const rosterBody = await rosterResponse.json();

	expect(Array.isArray(rosterBody?.data?.employees)).toBeTruthy();

	await expect(page.getByRole("main").getByText("Onboarding Checklist")).toBeVisible();
	await expect(page.getByLabel("Onboarding employee")).toBeVisible();
	await expect(page.getByRole("combobox", { name: "Onboarding employee" })).toBeVisible();

	await page.screenshot({
		path: ".runtime/browser-evidence/onboarding-checklist-live.png",
		fullPage: true,
	});

	expect(onboardingConsoleErrors).toEqual([]);
	expect(failedRequests).toEqual([]);
});

test("admin onboarding builder page loads with template controls", async ({ page }) => {
	await login(page);

	const templatesResponsePromise = page.waitForResponse(
		(response) => response.url().includes("/api/onboarding/templates") && response.status() === 200,
		{ timeout: 30_000 },
	);
	await page.goto("/admin/configuration/onboarding/builder");
	const templatesResponse = await templatesResponsePromise;
	expect(templatesResponse.ok()).toBeTruthy();

	await expect(
		page.getByRole("button", { name: "Save Template" }),
	).toBeVisible();
	await expect(page.getByLabel("Template name")).toBeVisible();
	await expect(page.getByLabel("Existing template")).toBeVisible();

	await page.screenshot({
		path: ".runtime/browser-evidence/onboarding-builder-live.png",
		fullPage: true,
	});
});
