import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const routeReadyTimeoutMs = 30_000;
const timestamp = "2026-07-17T00:10:00.000Z";

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
	isProvisioned: true,
	initializationStatus: "COMPLETED",
	previewAvailable: true,
	steps: [],
	summary: {
		hasAdmin: true,
		isActivated: true,
		isProvisioned: true,
		initializationStatus: "COMPLETED",
		previewAvailable: true,
	},
	organization: { id: "org-1", name: "Test Organization", code: "TEST" },
};

const testA = {
	id: "cmrlgqsjv000oob01165tbd8n",
	organizationId: "org-1",
	name: "TEST A",
	address: "192.168.254.189",
	port: 443,
	protocol: "https",
	config: { vendor: "Hikvision" },
	access: {},
	createdAt: timestamp,
	updatedAt: timestamp,
};

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "ok", data }),
});

test("sync logs modal shows classified fingerprint/user willAdd not only unknown residual", async ({
	page,
}) => {
	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-admin");
		window.localStorage.setItem("userSubRole", "hris-admin");
	});

	await page.route("**/api/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith("/auth/me")) {
			await route.fulfill(json(adminUser));
			return;
		}
		if (path.endsWith("/system-provisioning/status")) {
			await route.fulfill(json(readyProvisioningStatus));
			return;
		}
		if (path.includes("/device/events")) {
			await route.fulfill(
				json({
					events: [],
					summary: { total: 0, byStatus: {}, bySource: {}, byAction: {} },
					pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
				}),
			);
			return;
		}
		if (path.includes("/device/sync-preview")) {
			// Truth shape after Information logSearch classify + extrapolate.
			await route.fulfill(
				json({
					generatedAt: timestamp,
					scope: { deviceId: "all", source: "all" },
					bridge: null,
					devices: [
						{
							deviceId: testA.id,
							name: testA.name,
							address: testA.address,
							port: testA.port,
							vendor: "Hikvision",
							source: "HIKVISION_CALLBACK",
							syncedEvents: 104,
							totalEvents: 4782,
							operationLogTotal: 20167,
							needsSyncEvents: 25000,
							hrisSavedCount: 104,
							canStartSync: true,
							status: "needs_sync",
							eventRows: [
								{
									key: `${testA.id}-FINGERPRINT_ENROLLED`,
									eventLabel: "Fingerprint enrolled",
									businessArea: "Enrollment",
									eventAction: "FINGERPRINT_ENROLLED",
									eventCategory: "ENROLLMENT",
									willAdd: 10080,
									alreadyInHris: 0,
									sourceProof: "Operation logs",
									readsFrom: "ContentMgmt/logSearch",
									filterAfterSync: "Enrollment > Fingerprint enrolled",
									whereToFind: "Device Events > Enrollment > Fingerprint enrolled",
									status: "Ready",
									confidenceLabel: "Ready",
									deviceLabels: ["Add Fingerprint (By Employee ID)"],
									sourceDetail:
										"Read from device operation logs. Device label: Add Fingerprint (By Employee ID). HRIS will save this as: Fingerprint enrolled.",
								},
								{
									key: `${testA.id}-USER_CREATED`,
									eventLabel: "User created",
									businessArea: "User Management",
									eventAction: "USER_CREATED",
									eventCategory: "USER_MANAGEMENT",
									willAdd: 10078,
									alreadyInHris: 2,
									sourceProof: "Operation logs",
									readsFrom: "ContentMgmt/logSearch",
									filterAfterSync: "User Management > User created",
									whereToFind: "Device Events > User Management > User created",
									status: "Ready",
									confidenceLabel: "Ready",
									deviceLabels: ["Add Person Information"],
									sourceDetail:
										"Read from device operation logs. Device label: Add Person Information. HRIS will save this as: User created.",
								},
								{
									key: `${testA.id}-TAP`,
									eventLabel: "Attendance tap",
									businessArea: "Attendance",
									eventAction: "TAP",
									eventCategory: "ATTENDANCE",
									willAdd: 4743,
									alreadyInHris: 25,
									sourceProof: "Attendance/access events",
									readsFrom: "AccessControl/AcsEvent",
									filterAfterSync: "Attendance > Tap",
									whereToFind: "Device Events > Attendance > Tap",
									status: "Ready",
									confidenceLabel: "Ready",
								},
								{
									key: `${testA.id}-UNKNOWN_OPERATION`,
									eventLabel: "Unclassified device operation",
									businessArea: "Needs review",
									eventAction: "UNKNOWN_OPERATION",
									eventCategory: "UNKNOWN",
									willAdd: 9,
									alreadyInHris: 79,
									sourceProof: "Operation logs",
									readsFrom: "ContentMgmt/logSearch",
									filterAfterSync: "Needs review > Unclassified device operation",
									whereToFind: "Device Events > Needs review > Unclassified device operation",
									status: "Needs review",
									confidenceLabel: "Needs review",
									reviewReason: "HRIS could not identify this device action yet.",
								},
							],
							sources: [
								{
									key: "operation_logs",
									label: "Operation logs",
									ok: true,
									status: "ready",
									total: 20167,
									readsFrom: "ContentMgmt/logSearch",
								},
								{
									key: "attendance_access",
									label: "Attendance",
									ok: true,
									status: "ready",
									total: 4782,
									readsFrom: "AccessControl/AcsEvent",
								},
							],
							readySourceCount: 2,
							sourceCheckTotal: 2,
						},
					],
				}),
			);
			return;
		}
		if (path.endsWith("/device") || /\/device\?/.test(path)) {
			await route.fulfill(
				json({
					devices: [testA],
					pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
				}),
			);
			return;
		}
		await route.fulfill(json({}));
	});

	const startedAt = Date.now();
	await page.goto("/admin/configuration/devices/events?view=saved&action=sync-logs");
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Sync device logs" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});

	// One compact table: classified enroll/user rows, short category tokens, single-line rows.
	const eventTable = dialog.getByTestId("sync-logs-event-table");
	await expect(eventTable).toBeVisible();
	await expect(dialog.getByTestId("sync-logs-event-table")).toHaveCount(1);
	await expect(eventTable.getByRole("columnheader", { name: "Event", exact: true })).toBeVisible();
	await expect(eventTable.getByRole("columnheader", { name: "Category", exact: true })).toBeVisible();
	await expect(eventTable.getByRole("columnheader", { name: "Will add", exact: true })).toBeVisible();
	await expect(eventTable.getByRole("columnheader", { name: "Saved", exact: true })).toBeVisible();
	await expect(eventTable.getByRole("columnheader", { name: "Status", exact: true })).toBeVisible();

	await expect(eventTable.getByText("Fingerprint enrolled", { exact: true }).first()).toBeVisible();
	await expect(eventTable.getByText("User created", { exact: true }).first()).toBeVisible();
	await expect(eventTable.getByText("Attendance tap", { exact: true }).first()).toBeVisible();
	await expect(eventTable.getByText("ENROLLMENT", { exact: true }).first()).toBeVisible();
	await expect(eventTable.getByText("USER MGMT", { exact: true }).first()).toBeVisible();
	await expect(eventTable.getByText("ATTENDANCE", { exact: true }).first()).toBeVisible();
	await expect(eventTable.getByText("REVIEW", { exact: true }).first()).toBeVisible();
	await expect(eventTable.getByText("Unclassified", { exact: true }).first()).toBeVisible();

	// Will-add should be large Ready counts for enroll/user (device maintain truth).
	await expect(eventTable.getByText(/\+10,?0\d{2}/).first()).toBeVisible();
	await expect(eventTable.getByText("Ready").first()).toBeVisible();

	// Fingerprint row is one line: Event + ENROLLMENT + willAdd + Saved + Status.
	const fingerprintRow = eventTable.getByRole("row").filter({ hasText: "Fingerprint enrolled" });
	await expect(fingerprintRow).toHaveCount(1);
	await expect(fingerprintRow.getByText("ENROLLMENT", { exact: true })).toBeVisible();
	await expect(fingerprintRow.getByText(/\+10,?0\d{2}/)).toBeVisible();
	await expect(fingerprintRow.locator("details")).toHaveCount(0);

	const elapsedMs = Date.now() - startedAt;
	expect(elapsedMs).toBeLessThan(8000);

	const screenshotDir = resolve(
		process.cwd(),
		"..",
		".runtime",
		"sync-logs-truth-proof",
		"screenshots",
	);
	mkdirSync(screenshotDir, { recursive: true });
	await page.screenshot({
		path: resolve(screenshotDir, "sync-logs-classified-truth.png"),
		fullPage: true,
	});
	await dialog.screenshot({
		path: resolve(screenshotDir, "sync-logs-one-table-compact.png"),
	});
});

test("sync logs compact table: every event is one line with short category token", async ({ page }) => {
	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-admin");
		window.localStorage.setItem("userSubRole", "hris-admin");
	});

	await page.route("**/api/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith("/auth/me")) {
			await route.fulfill(json(adminUser));
			return;
		}
		if (path.endsWith("/system-provisioning/status")) {
			await route.fulfill(json(readyProvisioningStatus));
			return;
		}
		if (path.includes("/device/events")) {
			await route.fulfill(
				json({
					events: [],
					summary: { total: 0, byStatus: {}, bySource: {}, byAction: {} },
					pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
				}),
			);
			return;
		}
		if (path.includes("/device/sync-preview")) {
			await route.fulfill(
				json({
					generatedAt: timestamp,
					scope: { deviceId: "all", source: "all" },
					bridge: null,
					devices: [
						{
							deviceId: testA.id,
							name: testA.name,
							address: testA.address,
							port: testA.port,
							vendor: "Hikvision",
							source: "HIKVISION_CALLBACK",
							syncedEvents: 104,
							totalEvents: 4782,
							operationLogTotal: 20167,
							needsSyncEvents: 24909,
							hrisSavedCount: 104,
							canStartSync: true,
							status: "needs_sync",
							eventRows: [
								{
									key: `${testA.id}-USER_CREATED`,
									eventLabel: "User created",
									businessArea: "User Management",
									eventAction: "USER_CREATED",
									eventCategory: "USER_MANAGEMENT",
									willAdd: 15125,
									alreadyInHris: 0,
									status: "Ready",
									confidenceLabel: "Ready",
								},
								{
									key: `${testA.id}-USER_DELETED`,
									eventLabel: "User deleted",
									businessArea: "User Management",
									eventAction: "USER_DELETED",
									eventCategory: "USER_MANAGEMENT",
									willAdd: 1008,
									alreadyInHris: 0,
									status: "Ready",
									confidenceLabel: "Ready",
								},
								{
									key: `${testA.id}-FINGERPRINT_ENROLLED`,
									eventLabel: "Fingerprint enrolled",
									businessArea: "Enrollment",
									eventAction: "FINGERPRINT_ENROLLED",
									eventCategory: "ENROLLMENT",
									willAdd: 4033,
									alreadyInHris: 0,
									status: "Ready",
									confidenceLabel: "Ready",
								},
								{
									key: `${testA.id}-TAP`,
									eventLabel: "Attendance tap",
									businessArea: "Attendance",
									eventAction: "TAP",
									eventCategory: "ATTENDANCE",
									willAdd: 4743,
									alreadyInHris: 25,
									status: "Ready",
									confidenceLabel: "Ready",
								},
								{
									key: `${testA.id}-TAP_REJECTED`,
									eventLabel: "Rejected tap",
									businessArea: "Attendance",
									eventAction: "TAP_REJECTED",
									eventCategory: "ATTENDANCE",
									willAdd: 0,
									alreadyInHris: 14,
									status: "No new rows",
									confidenceLabel: "No new rows",
								},
								{
									key: `${testA.id}-UNKNOWN_OPERATION`,
									eventLabel: "Unclassified device operation",
									businessArea: "Needs review",
									eventAction: "UNKNOWN_OPERATION",
									eventCategory: "UNKNOWN",
									willAdd: 0,
									alreadyInHris: 79,
									status: "Needs review",
									confidenceLabel: "Needs review",
								},
							],
							sources: [
								{ key: "operation_logs", label: "Operation logs", ok: true, status: "ready", total: 20167 },
								{ key: "attendance_access", label: "Attendance", ok: true, status: "ready", total: 4782 },
							],
							readySourceCount: 2,
							sourceCheckTotal: 2,
						},
					],
				}),
			);
			return;
		}
		if (path.endsWith("/device") || /\/device\?/.test(path)) {
			await route.fulfill(
				json({
					devices: [testA],
					pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
				}),
			);
			return;
		}
		await route.fulfill(json({}));
	});

	await page.goto("/admin/configuration/devices/events?view=saved&action=sync-logs");
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Sync device logs" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});

	const table = dialog.getByTestId("sync-logs-event-table");
	await expect(table).toBeVisible();
	// One table only (not one table per User Management / Enrollment / Attendance section).
	await expect(dialog.locator('table[data-testid="sync-logs-event-table"]')).toHaveCount(1);
	await expect(dialog.locator("table thead")).toHaveCount(1);

	const bodyRows = table.locator("tbody tr");
	await expect(bodyRows).toHaveCount(6);

	// Each data row is a single visual line: no nested details / multi-line proof.
	for (let i = 0; i < 6; i += 1) {
		const row = bodyRows.nth(i);
		await expect(row.locator("details")).toHaveCount(0);
		await expect(row.locator("td")).toHaveCount(5);
		const box = await row.boundingBox();
		expect(box, `row ${i} bounding box`).toBeTruthy();
		// Single-line row height budget (compact table).
		expect(box!.height).toBeLessThan(40);
	}

	// Category chips match the screenshot truth shape (short tokens).
	await expect(table.locator('tr[data-category="USER MGMT"]')).toHaveCount(2);
	await expect(table.locator('tr[data-category="ENROLLMENT"]')).toHaveCount(1);
	await expect(table.locator('tr[data-category="ATTENDANCE"]')).toHaveCount(2);
	await expect(table.locator('tr[data-category="REVIEW"]')).toHaveCount(1);

	const userCreated = table.locator('tr[data-event-action="USER_CREATED"]');
	await expect(userCreated.getByText("User created", { exact: true })).toBeVisible();
	await expect(userCreated.getByText("USER MGMT", { exact: true })).toBeVisible();
	await expect(userCreated.getByText("+15,125", { exact: true })).toBeVisible();
	await expect(userCreated.getByText("0", { exact: true })).toBeVisible();
	await expect(userCreated.getByText("Ready", { exact: true })).toBeVisible();

	const fingerprint = table.locator('tr[data-event-action="FINGERPRINT_ENROLLED"]');
	await expect(fingerprint.getByText("Fingerprint enrolled", { exact: true })).toBeVisible();
	await expect(fingerprint.getByText("ENROLLMENT", { exact: true })).toBeVisible();
	await expect(fingerprint.getByText("+4,033", { exact: true })).toBeVisible();

	const review = table.locator('tr[data-event-action="UNKNOWN_OPERATION"]');
	await expect(review.getByText("Unclassified", { exact: true })).toBeVisible();
	await expect(review.getByText("REVIEW", { exact: true })).toBeVisible();

	// No long "Where to find it" / business-area section headers in the grid.
	await expect(table.getByText("User Management", { exact: true })).toHaveCount(0);
	await expect(table.getByText("Where to find it", { exact: true })).toHaveCount(0);
	await expect(table.getByText(/Device Events >/i)).toHaveCount(0);

	const screenshotDir = resolve(
		process.cwd(),
		"..",
		".runtime",
		"sync-logs-truth-proof",
		"screenshots",
	);
	mkdirSync(screenshotDir, { recursive: true });
	await dialog.screenshot({
		path: resolve(screenshotDir, "sync-logs-one-table-single-line-rows.png"),
	});
});

test("attendance category only lists attendance actions in the action filter", async ({ page }) => {
	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-admin");
		window.localStorage.setItem("userSubRole", "hris-admin");
	});

	await page.route("**/api/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (path.endsWith("/auth/me")) {
			await route.fulfill(json(adminUser));
			return;
		}
		if (path.endsWith("/system-provisioning/status")) {
			await route.fulfill(json(readyProvisioningStatus));
			return;
		}
		if (path.includes("/device/events")) {
			await route.fulfill(
				json({
					events: [],
					summary: { total: 0, byStatus: {}, bySource: {}, byAction: {} },
					pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
				}),
			);
			return;
		}
		if (path.endsWith("/device") || /\/device\?/.test(path)) {
			await route.fulfill(
				json({
					devices: [testA],
					pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
				}),
			);
			return;
		}
		await route.fulfill(json({}));
	});

	await page.goto(
		"/admin/configuration/devices/events?view=saved&eventCategory=ATTENDANCE",
	);
	await expect(page.getByRole("heading", { name: "Device events" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});

	// Open Action filter while Category=Attendance.
	const actionFilter = page.getByRole("combobox").nth(3);
	await actionFilter.click();
	await expect(page.getByRole("option", { name: "Attendance tap" })).toBeVisible();
	await expect(page.getByRole("option", { name: "Rejected access tap" })).toBeVisible();
	// Must not list enroll/user actions under Attendance.
	await expect(page.getByRole("option", { name: "User created" })).toHaveCount(0);
	await expect(page.getByRole("option", { name: "Fingerprint enrolled" })).toHaveCount(0);
});
