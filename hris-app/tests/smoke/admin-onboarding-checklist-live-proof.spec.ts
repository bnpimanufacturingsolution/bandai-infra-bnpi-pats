import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
	await page.goto("/auth/login");
	await page.locator("#login-identifier").fill("admin@bandai.local");
	await page.locator("#login-password").fill("password123");
	await page.getByRole("button", { name: /sign in/i }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), { timeout: 30_000 });
}

test("checklist page shows the created checklist as a full-page preview with nothing employee-related", async ({
	page,
}) => {
	const onboardingConsoleErrors: string[] = [];
	const failedRequests: { url: string; status: number }[] = [];

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

	const templatesResponsePromise = page.waitForResponse(
		(response) => response.url().includes("/api/onboarding/templates") && response.status() === 200,
		{ timeout: 30_000 },
	);
	await page.goto("/admin/configuration/onboarding/checklist");
	const templatesBody = await (await templatesResponsePromise).json();
	const firstTemplate =
		(templatesBody?.data?.templates ?? []).find((t: any) => t.isActive) ??
		(templatesBody?.data?.templates ?? [])[0];

	const main = page.getByRole("main");

	if (firstTemplate) {
		await expect(main.getByText(firstTemplate.name)).toBeVisible();
	} else {
		await expect(main.getByText("No checklist has been built yet.")).toBeVisible();
	}

	// Nothing employee-related on this page.
	await expect(page.getByLabel("Onboarding employee")).toHaveCount(0);
	await expect(main.getByText(/has no checklist yet/i)).toHaveCount(0);
	await expect(page.locator("select")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Go to Builder" })).toBeVisible();

	await page.screenshot({
		path: ".runtime/browser-evidence/onboarding-checklist-live.png",
		fullPage: true,
	});

	expect(onboardingConsoleErrors).toEqual([]);
	expect(failedRequests).toEqual([]);
});

test("builder auto-opens the first checklist and hides create-another-template affordances", async ({
	page,
}) => {
	await login(page);

	const templatesResponsePromise = page.waitForResponse(
		(response) => response.url().includes("/api/onboarding/templates") && response.status() === 200,
		{ timeout: 30_000 },
	);
	await page.goto("/admin/configuration/onboarding/builder");
	const templatesBody = await (await templatesResponsePromise).json();
	const firstTemplate = (templatesBody?.data?.templates ?? [])[0];

	await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();

	// No multi-template affordances.
	await expect(page.getByLabel("Existing template")).toHaveCount(0);
	await expect(page.getByText("New template…")).toHaveCount(0);
	await expect(page.getByRole("combobox", { name: "Existing template" })).toHaveCount(0);

	// Auto-loaded first template's name in the input (when at least one exists).
	if (firstTemplate) {
		await expect(page.getByLabel("Template name")).toHaveValue(firstTemplate.name, {
			timeout: 15_000,
		});
	}

	await page.screenshot({
		path: ".runtime/browser-evidence/onboarding-builder-live.png",
		fullPage: true,
	});
});
