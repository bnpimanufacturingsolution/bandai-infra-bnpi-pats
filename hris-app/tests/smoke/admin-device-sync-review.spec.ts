import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const timestamp = "2026-07-06T06:46:00.000Z";
const evidenceDir = resolve(process.cwd(), "../.runtime/browser-evidence/screenshots");

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

const device = {
	id: "device-main-entrance",
	organizationId: "org-1",
	name: "Main Entrance Device",
	address: "192.168.18.37",
	port: 80,
	protocol: "http",
	config: { vendor: "Hikvision" },
	access: {},
	createdAt: timestamp,
	updatedAt: timestamp,
};

const employees = [
	{
		id: "employee-1",
		organizationId: "org-1",
		employeeId: "EMP-001",
		userId: "user-employee-1",
		user: { id: "user-employee-1", email: "ernest@example.test", userName: "ernest" },
		deviceEmpId: "0001",
		person: {
			personalInfo: { firstName: "Ernest", lastName: "Ramos" },
			contactInfo: { email: "ernest@example.test" },
		},
		department: { id: "dept-1", name: "Operations" },
		position: { id: "position-1", title: "Guard" },
	},
	{
		id: "employee-2",
		organizationId: "org-1",
		employeeId: "EMP-002",
		userId: "user-employee-2",
		user: { id: "user-employee-2", email: "arvin@example.test", userName: "arvin" },
		deviceEmpId: "0002",
		person: {
			personalInfo: { firstName: "Arvin", lastName: "Salud" },
			contactInfo: { email: "arvin@example.test" },
		},
		department: { id: "dept-1", name: "Operations" },
		position: { id: "position-1", title: "Guard" },
	},
];

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "OK", data }),
});

async function installMockApi(page: Page) {
	let deviceUserSyncCompleted = false;

	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-admin");
		window.localStorage.setItem("userSubRole", "hris-admin");
	});

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
					employees,
					pagination: { total: employees.length, page: 1, limit: 1000, totalPages: 1 },
				}),
			);
			return;
		}

		if (path.endsWith("/hikvision/access-control/user-info/search")) {
			await route.fulfill(
				json({
					UserInfoSearch: {
						searchID: "device-users-0",
						responseStatusStrg: "OK",
						numOfMatches: 6,
						totalMatches: 6,
						UserInfo: [
							{ employeeNo: "0001", name: "Ernest", userType: "normal" },
							{ employeeNo: "0002", name: "Arvin", userType: "normal" },
							{ employeeNo: "0003", name: "Maria", userType: "normal" },
							{ employeeNo: "0004", name: "Jose", userType: "normal" },
							{ employeeNo: "0005", name: "Liza", userType: "normal" },
							{ employeeNo: "0006", name: "Noel", userType: "normal" },
						],
					},
				}),
			);
			return;
		}

		if (path.endsWith(`/device/${device.id}/users`)) {
			const syncedDeviceUsers = deviceUserSyncCompleted
				? [
						{
							id: "device-user-2",
							organizationId: "org-1",
							deviceId: device.id,
							vendorUserId: "0002",
							employeeNo: "0002",
							displayName: "Arvin",
							userType: "normal",
							status: "ACTIVE",
							employeeId: "employee-2",
							employee: { id: "employee-2", employeeId: "EMP-002", fullName: "Arvin Salud" },
							rawPayload: { hrisSync: { source: "hikvision" }, UserInfo: { employeeNo: "0002" } },
							lastSyncedAt: timestamp,
						},
						...["0003", "0004", "0005", "0006"].map((vendorUserId, index) => ({
							id: `device-user-${index + 3}`,
							organizationId: "org-1",
							deviceId: device.id,
							vendorUserId,
							employeeNo: vendorUserId,
							displayName: ["Maria", "Jose", "Liza", "Noel"][index],
							userType: "normal",
							status: "UNMATCHED",
							employeeId: null,
							employee: null,
							rawPayload: { hrisSync: { source: "hikvision" }, UserInfo: { employeeNo: vendorUserId } },
							lastSyncedAt: timestamp,
						})),
					]
				: [];
			await route.fulfill(
				json({
					deviceUsers: [
						{
							id: "device-user-1",
							organizationId: "org-1",
							deviceId: device.id,
							vendorUserId: "0001",
							employeeNo: "0001",
							displayName: "Ernest",
							userType: "normal",
							status: "ACTIVE",
							employeeId: "employee-1",
							employee: { id: "employee-1", employeeId: "EMP-001", fullName: "Ernest Ramos" },
							rawPayload: { hrisSync: { source: "hikvision" }, UserInfo: { employeeNo: "0001" } },
							lastSyncedAt: timestamp,
						},
						...syncedDeviceUsers,
						{
							id: "device-user-legacy",
							organizationId: "org-1",
							deviceId: device.id,
							vendorUserId: "01004",
							employeeNo: "01004",
							displayName: "Legacy Backfill User",
							userType: "legacy",
							status: "ACTIVE",
							employeeId: "employee-legacy",
							employee: { id: "employee-legacy", employeeId: "01004", fullName: "Legacy Backfill User" },
							rawPayload: { hrisSync: { source: "legacy-backfill" } },
							lastSyncedAt: timestamp,
						},
					],
					summary: { total: 3, active: 1, matched: 1, unmatched: 1, conflict: 1, disabled: 0 },
					pagination: { total: 3, page: 1, limit: 50, totalPages: 1 },
				}),
			);
			return;
		}

		if (path.endsWith(`/device/${device.id}/users/sync`) && route.request().method() === "POST") {
			deviceUserSyncCompleted = true;
			await route.fulfill(
				json({
					run: {
						id: "run-users-after-click",
						organizationId: "org-1",
						deviceId: device.id,
						runType: "DEVICE_USERS",
						status: "COMPLETED",
						source: "HIKVISION_CALLBACK",
						totalSourceRecords: 6,
						importableRecords: 6,
						savedRecords: 6,
						skippedRecords: 0,
						failedRecords: 0,
						missingRecords: 0,
						startedAt: timestamp,
						completedAt: timestamp,
					},
					summary: {
						totalSourceRecords: 6,
						importableRecords: 6,
						created: 5,
						updated: 1,
						linked: 2,
						unmatched: 4,
						conflict: 0,
						disabled: 0,
						skipped: 0,
						failed: 0,
					},
				}),
			);
			return;
		}

		if (path.endsWith("/device/users/device-user-1/link") && route.request().method() === "POST") {
			await route.fulfill(
				json({
					id: "device-user-1",
					organizationId: "org-1",
					deviceId: device.id,
					vendorUserId: "0001",
					employeeNo: "0001",
					displayName: "Ernest",
					userType: "normal",
					status: "ACTIVE",
					employeeId: "employee-2",
					employee: { id: "employee-2", employeeId: "EMP-002", fullName: "Arvin Salud" },
					rawPayload: { UserInfo: { employeeNo: "0001" } },
					lastSyncedAt: timestamp,
				}),
			);
			return;
		}

		if (path.endsWith(`/device/${device.id}/sync-runs`)) {
			await route.fulfill(
				json({
					syncRuns: [
						{
							id: "run-users",
							organizationId: "org-1",
							deviceId: device.id,
							runType: "DEVICE_USERS",
							status: "COMPLETED",
							source: "HIKVISION_CALLBACK",
							totalSourceRecords: 6,
							importableRecords: 6,
							savedRecords: 6,
							skippedRecords: 0,
							failedRecords: 0,
							missingRecords: 0,
							startedAt: timestamp,
							completedAt: timestamp,
						},
						{
							id: "run-logs",
							organizationId: "org-1",
							deviceId: device.id,
							runType: "DEVICE_LOGS",
							status: "COMPLETED",
							source: "HIKVISION_CALLBACK",
							totalSourceRecords: 982,
							importableRecords: 376,
							savedRecords: 376,
							skippedRecords: 606,
							failedRecords: 0,
							missingRecords: 0,
							startedAt: timestamp,
							completedAt: timestamp,
						},
					],
				}),
			);
			return;
		}

		if (path.endsWith("/device/sync-preview")) {
			await route.fulfill(
				json({
					generatedAt: timestamp,
					scope: { deviceId: device.id, source: "all" },
					devices: [
						{
							deviceId: device.id,
							name: device.name,
							address: device.address,
							port: device.port,
							vendor: "Hikvision",
							source: "HIKVISION_CALLBACK",
							syncedEvents: 376,
							totalEvents: 982,
							needsSyncEvents: 0,
							hrisSavedCount: 376,
							vendorEventCount: 982,
							vendorUserCount: 6,
							knownSkippedEventCount: 606,
							failedEventCount: 0,
							missingEventCount: 0,
							canStartSync: true,
							syncAction: "hikvision-import",
							status: "synced",
							lastSourceEventAt: timestamp,
						},
					],
				}),
			);
			return;
		}

		if (path.endsWith("/device")) {
			await route.fulfill(
				json({
					devices: [device],
					pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
				}),
			);
			return;
		}

		await route.fulfill(json({}));
	});
}

test("admin reviews device user and log sync from the device home", async ({ page }) => {
	mkdirSync(evidenceDir, { recursive: true });
	await installMockApi(page);

	await page.goto("/admin/configuration/devices", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Devices").first()).toBeVisible();
	await expect(page.getByRole("button", { name: "Sync Center" })).toBeVisible();

	await page.getByRole("button", { name: "Sync Center" }).click();
	await expect(page.getByRole("heading", { name: "Sync Center" })).toBeVisible();
	const overviewPanel = page.getByRole("tabpanel", { name: "Overview" });
	await expect(overviewPanel.getByText("Hikvision")).toBeVisible();
	await expect(overviewPanel.getByText("Device read: 6 users, 982 log entries")).toBeVisible();
	await expect(overviewPanel.getByText("Main Entrance Device")).toBeVisible();
	await expect(overviewPanel.getByText("Status").first()).toBeVisible();
	await expect(overviewPanel.getByText("Device users").first()).toBeVisible();
	await expect(overviewPanel.getByText("Device logs").first()).toBeVisible();
	await expect(overviewPanel.getByText("HRIS events").first()).toBeVisible();
	await expect(overviewPanel.getByText("Needs review").first()).toBeVisible();
	await expect(overviewPanel.getByText("Actions").first()).toBeVisible();
	await expect(overviewPanel.getByRole("button", { name: "6", exact: true })).toBeVisible();
	await page.screenshot({ path: `${evidenceDir}/device-sync-review-overview.png`, fullPage: true });

	await overviewPanel.getByRole("button", { name: "6", exact: true }).click();
	await expect(page.getByRole("tab", { name: "Device Users" })).toHaveAttribute("data-state", "active");
	await expect(page).toHaveURL(/deviceUserView=source/);
	await expect(page.getByText("6 read from device")).toBeVisible();
	await expect(page.getByText("ISAPI source", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Refresh source users" })).toBeVisible();
	await expect(page.getByText("Read from device").first()).toBeVisible();
	await expect(page.getByText("Current view")).toBeVisible();
	await expect(page.getByText("HRIS records")).toBeVisible();
	await expect(page.getByText("Linked employees")).toBeVisible();
	await expect(page.getByText("Needs link")).toBeVisible();
	await expect(page.getByText("Arvin")).toBeVisible();
	await expect(page.getByText("Noel")).toBeVisible();
	await expect(page.locator("tbody").getByText("Read from device")).toHaveCount(5);
	await expect(page.locator("tbody").getByText("Open", { exact: true })).toHaveCount(5);
	await expect(page.getByRole("button", { name: "Sync first" })).toHaveCount(0);
	await expect(page.locator("tbody").getByRole("button", { name: /More actions for device user/ })).toHaveCount(6);
	await expect(page.getByText("Legacy Backfill User")).toHaveCount(0);
	await page.getByRole("button", { name: /HRIS records:\s+1/ }).click();
	await expect(page).toHaveURL(/deviceUserView=hris/);
	await expect(page.locator("tbody").getByText("Read from device")).toHaveCount(0);
	await page.locator("tbody").getByRole("button", { name: /More actions for device user Ernest/ }).click();
	await page.getByRole("menuitem", { name: "Change employee link" }).click();
	await expect(page.getByRole("heading", { name: "Link device user" })).toBeVisible();
	await page.locator('button[role="combobox"]').filter({ hasText: "Ernest Ramos" }).click();
	await expect(page.getByRole("option", { name: /Arvin Salud - EMP-002/ })).toBeVisible();
	await page.getByRole("option", { name: /Arvin Salud - EMP-002/ }).click();
	const linkRequest = page.waitForRequest((request) =>
		request.url().includes("/api/device/users/device-user-1/link") && request.method() === "POST",
	);
	await page.getByRole("button", { name: "Link device user" }).click();
	await linkRequest;
	await expect(page.getByRole("heading", { name: "Link device user" })).toHaveCount(0);
	await page.getByRole("button", { name: /Current view:\s+6/ }).click();
	await expect(page).not.toHaveURL(/deviceUserView=hris/);
	await expect(page.locator("tbody").getByText("Read from device")).toHaveCount(5);

	await page.getByRole("button", { name: "Review sync" }).click();
	await expect(page.getByRole("heading", { name: "Sync device users" })).toBeVisible();
	await expect(page.getByText("New records", { exact: true })).toBeVisible();
	await expect(page.getByText("Current device users")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Sync device users" })).toBeVisible();
	await page.screenshot({ path: `${evidenceDir}/device-sync-user-confirmation.png`, fullPage: true });
	const syncRequest = page.waitForRequest((request) =>
		request.url().includes(`/api/device/${device.id}/users/sync`) && request.method() === "POST",
	);
	await page.getByRole("button", { name: "Sync device users" }).click();
	await syncRequest;
	await expect(page.getByText("Auto-linked")).toBeVisible();
	await expect(page.getByText("Rows marked Needs link were saved in HRIS")).toBeVisible();
	await page.screenshot({ path: `${evidenceDir}/device-sync-user-complete.png`, fullPage: true });
	await page
		.getByRole("dialog")
		.filter({ hasText: "Rows marked Needs link were saved in HRIS" })
		.locator("button")
		.filter({ hasText: /^Close$/ })
		.first()
		.click();
	await expect(page.getByRole("button", { name: "Sync first" })).toHaveCount(0);
	await expect(page.locator("tbody").getByRole("button", { name: /More actions for device user/ })).toHaveCount(6);

	await page.getByRole("tab", { name: "Device Users" }).click();
	await expect(page.getByText("Ernest", { exact: true })).toBeVisible();
	await expect(page.getByText("Legacy Backfill User")).toHaveCount(0);
	await page.screenshot({ path: `${evidenceDir}/device-sync-device-users-tab.png`, fullPage: true });
	await page.locator("tbody").getByRole("button", { name: /More actions for device user Ernest/ }).click();
	await page.getByRole("menuitem", { name: "Details" }).click();
	await expect(page.getByRole("heading", { name: "Device user details" })).toBeVisible();
	await expect(page.getByText("Physical device")).toBeVisible();
	await expect(page.locator("pre")).toBeHidden();
	await page.getByText("Raw").click();
	await expect(page.locator("pre")).toBeVisible();

	await page.goto(`/admin/configuration/devices?action=sync-review&deviceId=${device.id}&syncPanel=logs`);
	await expect(page.getByText("Known skipped")).toBeVisible();
	await expect(page.getByRole("button", { name: "Open device events" })).toBeVisible();
	await page.screenshot({ path: `${evidenceDir}/device-sync-device-logs-tab.png`, fullPage: true });

	await page.goto(`/admin/configuration/devices?action=device-users&deviceId=${device.id}`);
	await expect(page.getByRole("heading", { name: "Sync Center" })).toBeVisible();
	await expect(page.getByRole("tab", { name: "Device Users" })).toHaveAttribute("data-state", "active");

	await page.goto(`/admin/configuration/devices/events?deviceId=${device.id}&view=saved`);
	await expect(page).toHaveURL(/\/admin\/configuration\/devices\/events\?deviceId=device-main-entrance&view=saved/);
});
