import { expect, test, type Page } from "@playwright/test";

const timestamp = "2026-07-17T05:36:00.000Z";

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
		id: "device-test-b",
		organizationId: "org-1",
		name: "TEST B",
		address: "192.168.18.43",
		port: 443,
		protocol: "https",
		config: { vendor: "Hikvision" },
		access: {},
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

const deviceUsers = [
	{
		id: "device-user-19",
		organizationId: "org-1",
		deviceId: "device-test-a",
		vendorUserId: "19",
		employeeNo: "19",
		displayName: "User 19",
		userType: "normal",
		status: "UNMATCHED",
		employeeId: null,
		employee: null,
		rawPayload: { UserInfo: { employeeNo: "19", name: "User 19" } },
		lastSyncedAt: timestamp,
	},
	{
		id: "device-user-124015",
		organizationId: "org-1",
		deviceId: "device-test-a",
		vendorUserId: "t18rt124015",
		employeeNo: "t18rt124015",
		displayName: "RT-t18rt124015",
		userType: "normal",
		status: "UNMATCHED",
		employeeId: null,
		employee: null,
		rawPayload: { UserInfo: { employeeNo: "t18rt124015", name: "RT-t18rt124015" } },
		lastSyncedAt: timestamp,
	},
];

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "OK", data }),
});

async function installMockApi(page: Page) {
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
					employees: [],
					pagination: { total: 0, page: 1, limit: 1000, totalPages: 0 },
				}),
			);
			return;
		}

		if (path.endsWith("/device/sync-preview")) {
			await route.fulfill(
				json({
					generatedAt: timestamp,
					scope: { deviceId: "all", source: "all" },
					devices: devices.map((device) => ({
						deviceId: device.id,
						name: device.name,
						address: device.address,
						port: device.port,
						vendor: "Hikvision",
						source: "HIKVISION_CALLBACK",
						syncedEvents: 0,
						totalEvents: 0,
						needsSyncEvents: 0,
						hrisSavedCount: device.id === "device-test-a" ? 164 : 0,
						vendorEventCount: 0,
						vendorUserCount: device.id === "device-test-a" ? 188 : 0,
						hrisUserCount: device.id === "device-test-a" ? 164 : 0,
						openUserCount: device.id === "device-test-a" ? 22 : 0,
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

		if (path.endsWith("/hikvision/access-control/user-info/search")) {
			await route.fulfill(
				json({
					UserInfoSearch: {
						searchID: "device-users-0",
						responseStatusStrg: "OK",
						numOfMatches: 188,
						totalMatches: 188,
						UserInfo: deviceUsers.map((user) => ({
							employeeNo: user.employeeNo,
							name: user.displayName,
							userType: user.userType,
						})),
					},
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
			if (requestUrl.searchParams.get("vendorUserId") === "19") {
				await new Promise((resolve) => setTimeout(resolve, 300));
				await route.fulfill(
					json({
						deviceUsers: [
							{
								...deviceUsers[0],
								vendorMetadata: {
									rawFingerprintPresent: true,
									rawFingerprints: {
										present: true,
										fingerprintCount: 1,
										source: "cpp_sdk_callback_raw",
										templates: [
											{ fingerPrintId: 1, data: "RAW_TEMPLATE_BASE64" },
										],
									},
								},
							},
						],
						summary: {
							total: 1,
							active: 0,
							matched: 0,
							unmatched: 1,
							conflict: 0,
							disabled: 0,
						},
						pagination: { total: 1, page: 1, limit: 5, totalPages: 1 },
					}),
				);
				return;
			}
			if (requestUrl.searchParams.has("vendorUserIds")) {
				await route.fulfill(
					json({
						deviceUsers: [],
						summary: {
							total: 0,
							active: 0,
							matched: 0,
							unmatched: 0,
							conflict: 0,
							disabled: 0,
						},
						pagination: { total: 0, page: 1, limit: 50, totalPages: 0 },
					}),
				);
				return;
			}
			await route.fulfill(
				json({
					deviceUsers,
					summary: {
						total: 188,
						active: 141,
						matched: 141,
						unmatched: 22,
						conflict: 0,
						disabled: 0,
					},
					pagination: { total: deviceUsers.length, page: 1, limit: 50, totalPages: 1 },
				}),
			);
			return;
		}

		await route.fulfill(json({}));
	});
}

test("device-user row action menu opens above the Sync Center modal", async ({ page }) => {
	const consoleErrors: string[] = [];
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	await installMockApi(page);

	await page.goto("/admin/configuration/devices?action=device-users&deviceId=device-test-a", {
		waitUntil: "domcontentloaded",
	});

	const dialog = page.getByRole("dialog").filter({ hasText: "Sync Center" });
	await expect(dialog.getByRole("heading", { name: "Sync Center" })).toBeVisible();
	await expect(dialog.getByRole("heading", { name: "TEST A" })).toBeVisible();
	await expect(dialog.getByText("User 19")).toBeVisible();

	await page
		.locator("tbody")
		.getByRole("button", { name: /More actions for device user User 19/ })
		.click();

	const detailsItem = page.getByRole("menuitem", { name: "Details" });
	await expect(detailsItem).toBeVisible();
	await expect(page.getByRole("menuitem", { name: "Link employee" })).toBeVisible();
	await expect(page.getByRole("menuitem", { name: "Copy to peer device" })).toBeVisible();
	await expect(page.getByRole("menuitem", { name: "Review sync" })).toBeVisible();

	const layerOrder = await page.evaluate(() => {
		const modalShell = document.querySelector<HTMLElement>("[data-modal-shell='true']");
		const menu = document.querySelector<HTMLElement>("[role='menu']");
		return {
			modalZ: Number.parseInt(window.getComputedStyle(modalShell!).zIndex || "0", 10),
			menuZ: Number.parseInt(window.getComputedStyle(menu!).zIndex || "0", 10),
		};
	});

	expect(layerOrder.menuZ).toBeGreaterThan(layerOrder.modalZ);

	await detailsItem.click();
	await expect(page.getByRole("heading", { name: "Device user details" })).toBeVisible();
	await expect(page.getByText("Checking saved templates…", { exact: true })).toBeVisible();
	await expect(page.getByText("Not captured yet", { exact: true })).toHaveCount(0);
	await expect(page.getByText("1 stored", { exact: true })).toBeVisible();
	await expect(page.getByText("Not captured yet", { exact: true })).toHaveCount(0);
	expect(consoleErrors.join("\n")).not.toContain("Maximum update depth exceeded");
});
