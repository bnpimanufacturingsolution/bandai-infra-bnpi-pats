import { expect, test, type Page } from "@playwright/test";

const timestamp = "2026-06-01T00:00:00.000Z";
const routeReadyTimeoutMs = 30_000;

const publicJob = {
	id: "job-public-1",
	headcountRequested: 2,
	tags: ["QA", "Automation"],
	type: "FULL_TIME",
	description: "Test our internal tools.",
	position: {
		id: "position-1",
		title: "QA Engineer",
		description: "Test our internal tools.",
		minSalary: 30000,
		maxSalary: 50000,
	},
	level: {
		id: "level-1",
		name: "Senior",
	},
	location: "REMOTE",
	createdAt: timestamp,
	updatedAt: timestamp,
	applicants: [],
	isDeleted: false,
};

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "OK", data }),
});

const installMockApi = async (page: Page) => {
	await page.route("**/api/**", async (route) => {
		const requestUrl = new URL(route.request().url());
		const path = requestUrl.pathname;

		if (path.endsWith("/auth/me")) {
			await route.fulfill(json(null));
			return;
		}

		if (path.endsWith("/system-provisioning/status")) {
			await route.fulfill(
				json({
					mode: "READY",
					canManageSetup: true,
					currentStep: "admin-account",
					isProvisioned: true,
					initializationStatus: "COMPLETED",
					provisionedAt: timestamp,
					provisionedBy: "system",
					previewAvailable: true,
					steps: [],
					summary: {
						hasAdmin: true,
						isActivated: true,
						hasHrSettings: true,
						hasTimesheetConfig: true,
						hasPayrollCycleConfig: true,
						hasOpenPayrollPeriod: true,
						hasLeavePolicies: true,
						hasDefaultCalculator: true,
						isProvisioned: true,
						initializationStatus: "COMPLETED",
						previewAvailable: true,
					},
					organization: {
						id: "org-1",
						name: "Test Organization",
						code: "TEST",
					},
				}),
			);
			return;
		}

		if (path.endsWith("/job")) {
			await route.fulfill(
				json({
					jobs: [publicJob],
					pagination: {
						total: 1,
						page: 1,
						limit: 100,
						totalPages: 1,
						hasNext: false,
						hasPrev: false,
					},
				}),
			);
			return;
		}

		if (path.endsWith(`/job/${publicJob.id}`)) {
			await route.fulfill(json(publicJob));
			return;
		}

		await route.fulfill(json({}));
	});
};

test("public jobs flow preserves existing query params and reaches the apply page", async ({
	page,
}) => {
	await installMockApi(page);

	await page.goto("/jobs?source=career-fair&ref=homepage");

	await expect(page.getByRole("heading", { name: "Senior - QA Engineer" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});

	await page.getByRole("heading", { name: "Senior - QA Engineer" }).click();

	await page.waitForURL((url) => {
		return (
			url.pathname === "/jobs" &&
			url.searchParams.get("source") === "career-fair" &&
			url.searchParams.get("ref") === "homepage" &&
			url.searchParams.get("id") === publicJob.id
		);
	});

	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Role overview")).toBeVisible();
	await dialog.getByRole("button", { name: /apply now/i }).click();

	await page.waitForURL(`**/jobs/${publicJob.id}/apply`);
	await expect(page.getByRole("heading", { name: "QA Engineer" })).toBeVisible();
	await expect(page.getByRole("button", { name: /submit application/i })).toBeVisible();
});
