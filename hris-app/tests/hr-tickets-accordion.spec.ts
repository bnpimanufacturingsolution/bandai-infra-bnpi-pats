import { expect, test, type Page } from "@playwright/test";

const HR_EMAIL = process.env.PLAYWRIGHT_HR_EMAIL || "hr-manager@seed.local";
const HR_PASSWORD = process.env.PLAYWRIGHT_HR_PASSWORD || "Password123!";

async function loginAsHrManager(page: Page) {
	await page.goto("/auth/login", { waitUntil: "domcontentloaded" });
	await page.getByPlaceholder("e.g. employee@bandai.com").fill(HR_EMAIL);
	await page.getByPlaceholder("Enter your password").fill(HR_PASSWORD);
	await page.getByRole("button", { name: "Sign In" }).click();
	await page.waitForURL(/\/hr\/|\/dashboard|\/employee\//, { timeout: 30_000 });
}

test("hr tickets overview uses section previews and deep-linked view-all states", async ({
	page,
}) => {
	await loginAsHrManager(page);

	await page.goto("/hr/requests/tickets", { waitUntil: "domcontentloaded" });

	await expect(page.getByRole("heading", { name: "HR Tickets" })).toBeVisible();
	await expect(page.getByText("Needs HR Approval")).toBeVisible();
	await expect(page.getByText("Needs HR Task")).toBeVisible();
	await expect(page.getByText("Recently Completed")).toBeVisible();

	await page.getByPlaceholder("Search ticket code, employee name, or employee ID...").fill("REQ");
	await expect(page).toHaveURL(/search=REQ/);

	await page.getByRole("button", { name: "View all HR approvals" }).click();
	await expect(page).toHaveURL(/\/hr\/requests\/tickets\?(.+&)?view=list/);
	await expect(page).toHaveURL(/section=approval/);
	await expect(page).toHaveURL(/search=REQ/);
	await expect(page.getByRole("heading", { name: "All HR Approval Tickets" })).toBeVisible();

	await page.getByRole("button", { name: "Back To Queue Overview" }).click();
	await expect(page).not.toHaveURL(/view=list/);
	await expect(page.getByRole("heading", { name: "Queue Sections" })).toBeVisible();

	await page.goto("/hr/requests/tickets?view=list&section=task&search=REQ", {
		waitUntil: "domcontentloaded",
	});
	await expect(page.getByRole("heading", { name: "All HR Task Tickets" })).toBeVisible();
	await expect(page.getByText("Needs HR Task")).toBeVisible();

	await page.goto("/hr/requests/tickets?view=list&section=recent", {
		waitUntil: "domcontentloaded",
	});
	await expect(page.getByRole("heading", { name: "Recent HR Outcomes" })).toBeVisible();
	await expect(page.getByText("Recently Completed")).toBeVisible();
});
