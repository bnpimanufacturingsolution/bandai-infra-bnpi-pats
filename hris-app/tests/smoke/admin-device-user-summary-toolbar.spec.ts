import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const timestamp = "2026-07-15T11:53:00.000Z";
const freshJobTimestamp = new Date().toISOString();
const evidenceDir = resolve(process.cwd(), "../.runtime/browser-evidence/screenshots");
const syncJobId = "job-device-user-sync-live";

const adminUser = {
	id: "user-admin",
	email: "admin@example.test",
	name: "Admin User",
	role: "hris-admin",
	subRole: "hris-admin",
	organizationId: "org-1",
	organization: {
		id: "org-1",
		name: "Test Organization",
		code: "TEST",
		branding: { colors: {} },
	},
	token: "smoke-token",
};

const readyProvisioningStatus = {
	mode: "READY",
	canManageSetup: true,
	currentStep: "admin-account",
	isProvisioned: true,
	initializationStatus: "COMPLETED",
	provisionedAt: timestamp,
	provisionedBy: "user-admin",
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
	organization: { id: "org-1", name: "Test Organization", code: "TEST" },
};

const devices = [
	{
		id: "device-test-a",
		organizationId: "org-1",
		name: "TEST A",
		address: "192.168.18.42",
		port: 443,
		protocol: "https",
		config: { vendor: "Hikvision" },
		access: {},
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "device-main-e",
		organizationId: "org-1",
		name: "Main Entrance Device E",
		address: "10.184.38.200",
		port: 443,
		protocol: "https",
		config: { vendor: "Hikvision" },
		access: {},
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

const liveSyncJobProgress = {
	jobId: syncJobId,
	status: "processing",
	syncMode: "full_refresh",
	totalDevices: devices.length,
	processedDevices: 1,
	failedDevices: 0,
	biometricTotal: 0,
	biometricProcessed: 0,
	biometricFailed: 0,
	startedAt: freshJobTimestamp,
	updatedAt: freshJobTimestamp,
	completedAt: null,
	cancelRequested: false,
	currentModality: null,
	message: "Refreshing device users",
};

const staleSyncJobProgress = {
	...liveSyncJobProgress,
	startedAt: "2026-07-15T19:53:00.000Z",
	updatedAt: "2026-07-15T19:53:00.000Z",
	message: "Stale persisted device-user sync should not be treated as live",
};

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "OK", data }),
});

async function installMockApi(page: Page, options?: { job?: typeof liveSyncJobProgress }) {
	const job = options?.job || liveSyncJobProgress;
	await page.addInitScript(
		({ jobId, job }) => {
			window.localStorage.setItem("authToken", "smoke-token");
			window.localStorage.setItem("userRole", "hris-admin");
			window.localStorage.setItem("userSubRole", "hris-admin");
			window.localStorage.setItem(
				"hris.device-user-sync-job",
				JSON.stringify({ jobId, startedAt: job.startedAt }),
			);
		},
		{ jobId: syncJobId, job },
	);

	await page.route("**/api/**", async (route) => {
		const requestUrl = new URL(route.request().url());
		const path = requestUrl.pathname;

		if (path.endsWith("/auth/me")) {
			await route.fulfill(json(adminUser));
			return;
		}

		if (path.endsWith("/system-provisioning/status")) {
			await route.fulfill(json(readyProvisioningStatus));
			return;
		}

		if (path.endsWith("/employee")) {
			await route.fulfill(
				json({
					employees: [],
					pagination: { total: 0, page: 1, limit: 1000, totalPages: 0 },
				}),
			);
			return;
		}

		if (path.endsWith(`/device/users/sync-jobs/${syncJobId}`)) {
			await route.fulfill(json(job));
			return;
		}

		if (path.endsWith("/device/sync-preview")) {
			await route.fulfill(
				json({
					generatedAt: timestamp,
					scope: { deviceId: "all", source: "all" },
					devices: devices.map((device, index) => ({
						deviceId: device.id,
						name: device.name,
						address: device.address,
						port: device.port,
						vendor: "Hikvision",
						source: "HIKVISION_CALLBACK",
						syncedEvents: 0,
						totalEvents: 0,
						needsSyncEvents: 0,
						hrisSavedCount: 150 + index * 10,
						vendorEventCount: 0,
						vendorUserCount: 200 + index * 10,
						hrisUserCount: 150 + index * 10,
						openUserCount: 10 + index,
						knownSkippedEventCount: 0,
						failedEventCount: 0,
						missingEventCount: 0,
						canStartSync: true,
						syncAction: "hikvision-import",
						status: "synced",
						lastSourceEventAt: timestamp,
					})),
				}),
			);
			return;
		}

		if (path.endsWith("/device")) {
			await route.fulfill(
				json({
					devices,
					pagination: { total: devices.length, page: 1, limit: 10, totalPages: 1 },
				}),
			);
			return;
		}

		if (path.includes("/device/") && path.endsWith("/users")) {
			await route.fulfill(
				json({
					deviceUsers: [],
					summary: { total: 0, active: 0, matched: 0, unmatched: 0, conflict: 0, disabled: 0 },
					pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
				}),
			);
			return;
		}

		await route.fulfill(json({}));
	});
}

test("Device Users does not revive a stale persisted processing job on startup", async ({
	page,
}) => {
	await installMockApi(page, { job: staleSyncJobProgress });

	await page.goto("/admin/configuration/devices?action=device-users", {
		waitUntil: "domcontentloaded",
	});

	const dialog = page.getByRole("dialog").filter({ hasText: "Sync Center" });
	await expect(dialog.getByRole("heading", { name: "Sync Center" })).toBeVisible();
	await expect(
		dialog.getByRole("button", { name: /Open device-user sync status|Sync status/i }),
	).toHaveCount(0);
	await expect(page.getByText(/Processing \d+ of \d+ biometric credentials/i)).toHaveCount(0);
});

test("Device Users summary toolbar keeps title and Sync status aligned", async ({ page }) => {
	mkdirSync(evidenceDir, { recursive: true });
	await installMockApi(page);

	await page.goto("/admin/configuration/devices?action=device-users", {
		waitUntil: "domcontentloaded",
	});

	const dialog = page.getByRole("dialog").filter({ hasText: "Sync Center" });
	await expect(dialog.getByRole("heading", { name: "Sync Center" })).toBeVisible();
	await expect(dialog.getByRole("tab", { name: "Device Users" })).toHaveAttribute(
		"data-state",
		"active",
	);

	const toolbar = dialog.getByTestId("device-user-summary-toolbar");
	await expect(toolbar).toBeVisible();

	const title = toolbar.getByRole("heading", { name: "Choose a device first" });
	const syncStatus = toolbar.getByRole("button", { name: /Open device-user sync status|Sync status/i });
	const refreshSummary = toolbar.getByRole("button", { name: "Refresh summary" });
	const searchBox = toolbar.getByRole("searchbox", { name: /Search device users/i });
	const mergeUsers = toolbar.getByRole("button", { name: "Merge users" });

	await expect(title).toBeVisible();
	await expect(syncStatus).toBeVisible();
	await expect(syncStatus).toContainText("Sync status");
	await expect(syncStatus).toContainText("Live");
	await expect(refreshSummary).toBeVisible();
	await expect(searchBox).toBeVisible();
	await expect(mergeUsers).toBeVisible();
	await expect(dialog.getByText("200").first()).toBeVisible();
	await expect(dialog.getByText("210").first()).toBeVisible();
	await expect(dialog.getByText("Live source totals skipped for fast all-device overview")).toHaveCount(0);

	const titleBox = await title.boundingBox();
	const syncBox = await syncStatus.boundingBox();
	const refreshBox = await refreshSummary.boundingBox();
	const searchBoxGeom = await searchBox.boundingBox();
	const mergeBox = await mergeUsers.boundingBox();
	const toolbarBox = await toolbar.boundingBox();

	expect(titleBox).toBeTruthy();
	expect(syncBox).toBeTruthy();
	expect(refreshBox).toBeTruthy();
	expect(searchBoxGeom).toBeTruthy();
	expect(mergeBox).toBeTruthy();
	expect(toolbarBox).toBeTruthy();

	// Title stays on its own full-width row (not squeezed into a one-word column).
	expect(titleBox!.width).toBeGreaterThan(140);
	expect(titleBox!.height).toBeLessThan(28);

	// Sync status sits below the title and on the same control row baseline as search/actions.
	expect(syncBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height - 2);
	expect(Math.abs(syncBox!.y - searchBoxGeom!.y)).toBeLessThanOrEqual(6);
	expect(Math.abs(syncBox!.y - refreshBox!.y)).toBeLessThanOrEqual(6);
	expect(Math.abs(syncBox!.height - refreshBox!.height)).toBeLessThanOrEqual(4);

	// Controls remain fully visible inside the toolbar (no clipped Merge button).
	expect(syncBox!.x + syncBox!.width).toBeLessThanOrEqual(toolbarBox!.x + toolbarBox!.width + 1);
	expect(mergeBox!.x + mergeBox!.width).toBeLessThanOrEqual(toolbarBox!.x + toolbarBox!.width + 1);
	expect(mergeBox!.y + mergeBox!.height).toBeLessThanOrEqual(toolbarBox!.y + toolbarBox!.height + 1);

	// Sync status label does not wrap; Live bubble stays on the same button line.
	expect(syncBox!.height).toBeLessThanOrEqual(40);

	await page.screenshot({
		path: `${evidenceDir}/device-user-summary-toolbar-aligned.png`,
		fullPage: true,
	});
});
