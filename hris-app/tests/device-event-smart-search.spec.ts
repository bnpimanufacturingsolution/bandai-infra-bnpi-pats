import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const evidenceDir = resolve("../.runtime/device-event-smart-search");

async function loginAsAdmin(page: Page) {
	await page.goto("/auth/login");
	await page
		.getByPlaceholder("EMP-HR-MGR-001 or hr-manager@seed.local")
		.fill("admin@bandai.local");
	await page.getByPlaceholder("Enter your password").fill("password123");
	await page.getByRole("button", { name: "Sign In" }).click();
	await page.waitForURL((url) => !url.pathname.includes("/auth/login"), {
		timeout: 30_000,
	});
}

async function search(page: Page, query: string) {
	const responsePromise = page.waitForResponse((response) => {
		if (!response.url().includes("/api/device/events?")) return false;
		const url = new URL(response.url());
		return url.searchParams.get("query") === query && url.searchParams.get("limit") === "10";
	});
	await page
		.getByPlaceholder("Search person ID, name, event, or device…")
		.fill(query);
	const response = await responsePromise;
	expect(response.status()).toBe(200);
	return response.json();
}

test("saved event search ranks exact identity and explains every match", async ({ page }) => {
	mkdirSync(evidenceDir, { recursive: true });
	await loginAsAdmin(page);
	await page.goto("/admin/configuration/devices/events?view=saved");
	await expect(page.getByRole("heading", { name: "Saved events" })).toBeVisible();

	const exact = await search(page, "18");
	expect(exact.data.events[0].employeeNo).toBe("18");
	expect(exact.data.events[0].searchMatch).toMatchObject({
		label: "Event person ID",
		value: "18",
		matchType: "exact",
		rank: 0,
	});
	await expect(page.getByText("Matched Event person ID: 18", { exact: true }).first()).toBeVisible();

	const action = await search(page, "USER_CREATED");
	expect(action.data.events[0].eventAction).toBe("USER_CREATED");
	expect(action.data.events[0].searchMatch.label).toBe("Event action");
	await expect(
		page.getByText("Matched Event action: USER_CREATED", { exact: true }).first(),
	).toBeVisible();

	const name = await search(page, "Ernst");
	expect(name.data.events[0].searchMatch.label).toBe("Employee name");
	expect(String(name.data.events[0].searchMatch.value).toLowerCase()).toContain("ernst");

	const numericFallback = await search(page, "17");
	const numericEvents = numericFallback.data.events as Array<{
		searchMatch: { rank: number; value: unknown };
	}>;
	const numericRanks = numericEvents.map((event) => event.searchMatch.rank);
	expect(numericRanks).toEqual([...numericRanks].sort((a, b) => a - b));
	for (const event of numericEvents) {
		expect(String(event.searchMatch.value).toLowerCase()).toContain("17");
	}
	const numericMatchReason = page.getByText(/Matched .*17/, { exact: false }).first();
	await expect(numericMatchReason).toBeVisible();
	await numericMatchReason.scrollIntoViewIfNeeded();
	await page.screenshot({
		path: resolve(evidenceDir, "device-event-search-17.png"),
		fullPage: true,
	});

	const literalPercent = await search(page, "%");
	expect(literalPercent.data.pagination.total).toBe(0);
	await expect(page.getByText("No saved rows match this filter", { exact: true })).toBeVisible();

	await search(page, "18");
	const finalExactReason = page.getByText("Matched Event person ID: 18", { exact: true }).first();
	await expect(finalExactReason).toBeVisible();
	await finalExactReason.scrollIntoViewIfNeeded();
	await page.screenshot({
		path: resolve(evidenceDir, "device-event-smart-search.png"),
		fullPage: true,
	});
});
