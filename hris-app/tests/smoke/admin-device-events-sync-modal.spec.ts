import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const timestamp = "2026-07-02T02:38:00.000Z";
const routeReadyTimeoutMs = 30_000;

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
	organization: {
		id: "org-1",
		name: "Test Organization",
		code: "TEST",
	},
};

const zktecoDevice = {
	id: "device-zk-1",
	organizationId: "org-1",
	name: "ZKTeco sidecar",
	address: "10.184.38.9",
	port: 4370,
	protocol: "tcp",
	config: { vendor: "ZKTeco" },
	access: {},
	createdAt: timestamp,
	updatedAt: timestamp,
};

const savedEvent = {
	id: "event-1",
	organizationId: "org-1",
	deviceId: zktecoDevice.id,
	device: {
		id: zktecoDevice.id,
		name: zktecoDevice.name,
		address: zktecoDevice.address,
		port: zktecoDevice.port,
		protocol: zktecoDevice.protocol,
	},
	employee: {
		id: "employee-1",
		employeeId: "1632",
		deviceEmpId: "1632",
		fullName: "Alliah",
	},
	employeeId: "employee-1",
	attendanceId: "attendance-1",
	eventTime: "2026-07-02T02:38:00.000Z",
	receivedAt: "2026-07-02T02:58:00.000Z",
	employeeNo: "1632",
	source: "ZKTECO_EVENT",
	status: "MATCHED",
	eventType: "AttendanceTransaction",
	dedupeKey: "zk-1",
	payload: {},
	createdAt: timestamp,
	updatedAt: timestamp,
};

const syncPreview = {
	generatedAt: timestamp,
	scope: { deviceId: "all", source: "all" },
	bridge: {
		ok: false,
		status: "not_configured",
		statusUrl: null,
		error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
	},
	devices: [
		{
			deviceId: zktecoDevice.id,
			name: zktecoDevice.name,
			address: zktecoDevice.address,
			port: zktecoDevice.port,
			vendor: "ZKTeco",
			source: "ZKTECO_EVENT",
			syncedEvents: 173614,
			totalEvents: null,
			needsSyncEvents: null,
			hrisSavedCount: 173614,
			vendorEventCount: null,
			vendorUserCount: null,
			missingEventCount: null,
			canStartSync: false,
			syncAction: null,
			status: "source_unavailable",
			error: "ZKTECO_BRIDGE_STATUS_URL is not configured",
			lastSourceEventAt: null,
		},
	],
};

const json = (data: unknown) => ({
	status: 200,
	contentType: "application/json",
	body: JSON.stringify({ success: true, message: "OK", data }),
});

const installMockApi = async (page: Page) => {
	let syncPostCount = 0;

	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-admin");
		window.localStorage.setItem("userSubRole", "hris-admin");
	});

	await page.route("**/api/**", async (route) => {
		const requestUrl = new URL(route.request().url());
		const path = requestUrl.pathname;

		if (route.request().method() === "POST" && path.endsWith("/device/zkteco/sync")) {
			syncPostCount += 1;
			await route.fulfill(json({ status: "started" }));
			return;
		}

		if (path.endsWith("/auth/me")) {
			await route.fulfill(json(adminUser));
			return;
		}

		if (path.endsWith("/system-provisioning/status")) {
			await route.fulfill(json(readyProvisioningStatus));
			return;
		}

		if (path.endsWith("/device/events")) {
			await route.fulfill(
				json({
					events: [savedEvent],
					summary: {
						total: 173614,
						byStatus: { MATCHED: 167877, UNMATCHED: 5463 },
						bySource: { ZKTECO_EVENT: 173614 },
					},
					pagination: { total: 173614, page: 1, limit: 25, totalPages: 6945 },
				}),
			);
			return;
		}

		if (path.endsWith("/device/sync-preview")) {
			await route.fulfill(json(syncPreview));
			return;
		}

		if (path.endsWith(`/device/${zktecoDevice.id}/health`)) {
			await route.fulfill(
				json({
					device: zktecoDevice,
					summary: { status: "degraded", checkedAt: timestamp, durationMs: 3 },
					checks: {
						hrisApi: { ok: true, status: "online" },
						zktecoWebhook: { ok: true, status: "ready", path: "/api/zkteco/events" },
						zktecoBridge: syncPreview.bridge,
						lastZktecoEvent: savedEvent,
						network: {
							ok: true,
							status: "reachable",
							host: zktecoDevice.address,
							port: zktecoDevice.port,
							latencyMs: 1,
						},
					},
				}),
			);
			return;
		}

		if (path.endsWith("/device")) {
			await route.fulfill(
				json({
					devices: [zktecoDevice],
					pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
				}),
			);
			return;
		}

		await route.fulfill(json({}));
	});

	return {
		getSyncPostCount: () => syncPostCount,
	};
};

test("admin device events opens sync logs modal with device and saved counts before sync", async ({
	page,
}) => {
	const api = await installMockApi(page);

	await page.goto("/admin/configuration/devices/events?view=saved");

	await expect(page.getByRole("heading", { name: "Device events" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	await page.getByRole("button", { name: "Sync logs" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Sync device logs" })).toBeVisible();
	await expect(dialog.getByText("Devices (1)", { exact: true })).toBeVisible();
	await expect(dialog.getByText(/Will add:\s*Needs device read/)).toBeVisible();
	await expect(dialog.getByText(/Already saved:\s*173,614/)).toBeVisible();
	await expect(dialog.getByText(/Needs review:\s*0/)).toBeVisible();
	await expect(dialog.getByText(/Devices ready:\s*0 of\s*1/)).toBeVisible();
	await expect(dialog.getByText("ZKTeco", { exact: true })).toBeVisible();
	await expect(dialog.getByText("ZKTeco sidecar", { exact: true }).first()).toBeVisible();
	await expect(dialog.getByText("Device users", { exact: true })).toHaveCount(0);
	// Blocked devices collapse the verbose unavailable catalog.
	await expect(dialog.getByText(/Can.?t read this device|ZKTECO_BRIDGE_STATUS_URL is not configured/i).first()).toBeVisible();
	await expect(dialog.getByText("Blocked", { exact: true }).first()).toBeVisible();
	await expect(dialog.getByText("Event breakdown is hidden until this device can be read")).toBeVisible();
	await expect(dialog.getByRole("columnheader", { name: "Source proof" })).toHaveCount(0);
	await expect(dialog.getByRole("columnheader", { name: "Filter after sync" })).toHaveCount(0);
	await expect(dialog.getByRole("button", { name: /Sync logs/i })).toBeDisabled();
	expect(api.getSyncPostCount()).toBe(0);

	const screenshotDir = resolve(process.cwd(), "..", ".runtime", "device-ux-clarity-proof", "screenshots");
	mkdirSync(screenshotDir, { recursive: true });
	await page.screenshot({
		path: resolve(screenshotDir, "sync-logs-blocked-zkteco.png"),
		fullPage: true,
	});
});

test("admin device events sync logs shows Hikvision event-first rows", async ({ page }) => {
	const hikvisionDevice = {
		id: "device-hik-1",
		organizationId: "org-1",
		name: "Main Entrance Device A",
		address: "10.184.38.173",
		port: 443,
		protocol: "https",
		config: { vendor: "Hikvision" },
		access: {},
		createdAt: timestamp,
		updatedAt: timestamp,
	};

	const hikPreview = {
		generatedAt: timestamp,
		scope: { deviceId: "all", source: "all" },
		bridge: null,
		devices: [
			{
				deviceId: hikvisionDevice.id,
				name: hikvisionDevice.name,
				address: hikvisionDevice.address,
				port: hikvisionDevice.port,
				vendor: "Hikvision",
				source: "HIKVISION_CALLBACK",
				syncedEvents: 27,
				totalEvents: 2112,
				needsSyncEvents: 2085,
				hrisSavedCount: 27,
				vendorEventCount: 2112,
				operationLogTotal: 70,
				canStartSync: true,
				syncAction: "hikvision-import",
				status: "needs_sync",
				readySourceCount: 2,
				sourceCheckTotal: 2,
				sources: [
					{
						key: "operation_logs",
						label: "Operation logs",
						readsFrom: "ContentMgmt/logSearch",
						ok: true,
						total: 70,
						status: "ready",
					},
					{
						key: "attendance_access",
						label: "Attendance/access events",
						readsFrom: "AccessControl/AcsEvent",
						ok: true,
						total: 2112,
						status: "ready",
					},
				],
				eventRows: [
					{
						key: `${hikvisionDevice.id}-FINGERPRINT_ENROLLED`,
						eventLabel: "Fingerprint enrolled",
						willAdd: 24,
						alreadyInHris: 3,
						sourceProof: "Operation logs",
						readsFrom: "ContentMgmt/logSearch",
						filterAfterSync: "Enrollment > Fingerprint enrolled",
						status: "Ready",
					},
					{
						key: `${hikvisionDevice.id}-USER_CREATED`,
						eventLabel: "User created",
						willAdd: 20,
						alreadyInHris: 0,
						sourceProof: "Operation logs",
						readsFrom: "ContentMgmt/logSearch",
						filterAfterSync: "User Management > User created",
						status: "Ready",
					},
					{
						key: `${hikvisionDevice.id}-TAP`,
						eventLabel: "Attendance tap",
						willAdd: 2085,
						alreadyInHris: 23,
						sourceProof: "Attendance/access events",
						readsFrom: "AccessControl/AcsEvent",
						filterAfterSync: "Attendance > Tap",
						status: "Ready",
					},
					{
						key: `${hikvisionDevice.id}-UNKNOWN_OPERATION`,
						eventLabel: "Unknown operation",
						willAdd: 14,
						alreadyInHris: 0,
						sourceProof: "Operation logs",
						readsFrom: "ContentMgmt/logSearch",
						filterAfterSync: "Unknown > Unknown",
						status: "Needs review",
					},
				],
			},
		],
	};

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
		if (path.endsWith("/device/events")) {
			await route.fulfill(
				json({
					events: [],
					summary: { total: 0, byStatus: {}, bySource: {} },
					pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
				}),
			);
			return;
		}
		if (path.endsWith("/device/sync-preview")) {
			await route.fulfill(json(hikPreview));
			return;
		}
		if (path.endsWith("/device")) {
			await route.fulfill(
				json({
					devices: [hikvisionDevice],
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
	await expect(dialog.getByText("Devices (1)", { exact: true })).toBeVisible();
	await expect(dialog.getByText(/Will add:\s*2,143/)).toBeVisible();
	await expect(dialog.getByText(/Devices ready:\s*1 of\s*1/)).toBeVisible();
	await expect(dialog.getByText("Ready to sync", { exact: true }).first()).toBeVisible();
	await expect(dialog.getByText(/Hikvision Main Entrance Device A|Main Entrance Device A/)).toBeVisible();
	await expect(dialog.getByText("10.184.38.173:443")).toBeVisible();
	await expect(dialog.getByRole("columnheader", { name: "Event", exact: true })).toBeVisible();
	await expect(dialog.getByRole("columnheader", { name: "Already saved", exact: true })).toBeVisible();
	await expect(dialog.getByRole("columnheader", { name: "Source proof" })).toHaveCount(0);
	await expect(dialog.getByRole("columnheader", { name: "Filter after sync" })).toHaveCount(0);
	await expect(dialog.getByRole("cell", { name: "Fingerprint enrolled", exact: true })).toBeVisible();
	await expect(dialog.getByRole("cell", { name: "+24", exact: true })).toBeVisible();
	await expect(dialog.getByRole("cell", { name: "User created", exact: true })).toBeVisible();
	await expect(dialog.getByRole("cell", { name: "Attendance tap", exact: true })).toBeVisible();
	await expect(dialog.getByText(/After sync, filter Device events/i)).toBeVisible();
	// No primary VM jargon on the events/sync journey.
	await expect(page.getByText(/VM listener/i)).toHaveCount(0);

	const screenshotDir = resolve(
		process.cwd(),
		"..",
		".runtime",
		"device-ux-clarity-proof",
		"screenshots",
	);
	mkdirSync(screenshotDir, { recursive: true });
	await page.screenshot({
		path: resolve(screenshotDir, "sync-logs-ready-hikvision.png"),
		fullPage: true,
	});
	await dialog.screenshot({
		path: resolve(screenshotDir, "device-events-sync-modal-event-first-dialog.png"),
	});
});

test("sync logs modal still opens fast with mixed ready and unreachable devices", async ({ page }) => {
	const hikvisionDevice = {
		id: "device-hik-1",
		organizationId: "org-1",
		name: "Main Entrance Device A",
		address: "10.184.38.173",
		port: 443,
		protocol: "https",
		config: { vendor: "Hikvision" },
		access: {},
		createdAt: timestamp,
		updatedAt: timestamp,
	};
	const unreachableDevice = {
		...hikvisionDevice,
		id: "device-hik-offline",
		name: "Main Entrance Device Offline",
		address: "10.184.38.199",
	};

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
		if (path.endsWith("/device/events")) {
			await route.fulfill(
				json({
					events: [],
					summary: { total: 0, byStatus: {}, bySource: {} },
					pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
				}),
			);
			return;
		}
		if (path.endsWith("/device/sync-preview")) {
			await route.fulfill(
				json({
					generatedAt: timestamp,
					scope: { deviceId: "all", source: "all" },
					bridge: null,
					devices: [
						{
							deviceId: hikvisionDevice.id,
							name: hikvisionDevice.name,
							address: hikvisionDevice.address,
							port: hikvisionDevice.port,
							vendor: "Hikvision",
							source: "HIKVISION_CALLBACK",
							syncedEvents: 100,
							totalEvents: 200,
							needsSyncEvents: 50,
							hrisSavedCount: 100,
							canStartSync: true,
							status: "needs_sync",
							eventRows: [
								{
									key: `${hikvisionDevice.id}-ATTENDANCE_TAP`,
									eventLabel: "Attendance tap",
									willAdd: 50,
									alreadyInHris: 100,
									sourceProof: "Attendance logs",
									status: "Ready",
								},
							],
							sources: [
								{ key: "attendance", label: "Attendance", ok: true, status: "ready", total: 200 },
							],
							readySourceCount: 1,
							sourceCheckTotal: 1,
						},
						{
							deviceId: unreachableDevice.id,
							name: unreachableDevice.name,
							address: unreachableDevice.address,
							port: unreachableDevice.port,
							vendor: "Hikvision",
							source: "HIKVISION_CALLBACK",
							syncedEvents: 0,
							totalEvents: null,
							needsSyncEvents: null,
							hrisSavedCount: 0,
							canStartSync: false,
							status: "source_unavailable",
							error: "Can't reach this device right now. Other devices can still be reviewed.",
							eventRows: [],
							sources: [
								{
									key: "attendance",
									label: "Attendance",
									ok: false,
									status: "unavailable",
									total: null,
								},
							],
							readySourceCount: 0,
							sourceCheckTotal: 1,
						},
					],
				}),
			);
			return;
		}
		if (path.endsWith("/device")) {
			await route.fulfill(
				json({
					devices: [hikvisionDevice, unreachableDevice],
					pagination: { total: 2, page: 1, limit: 100, totalPages: 1 },
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
	await expect(dialog.getByText(/Partial — some devices unreachable|Partial/i).first()).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	await expect(dialog.getByText(/Main Entrance Device A/)).toBeVisible();
	await expect(dialog.getByText(/Main Entrance Device Offline/)).toBeVisible();
	await expect(dialog.getByText(/Can.?t reach this device right now/i).first()).toBeVisible();
	// Ready device stays actionable even when a peer is unreachable.
	await expect(dialog.getByRole("cell", { name: "Attendance tap", exact: true })).toBeVisible();
	const elapsedMs = Date.now() - startedAt;
	expect(elapsedMs).toBeLessThan(8000);

	const screenshotDir = resolve(
		process.cwd(),
		"..",
		".runtime",
		"device-ux-clarity-proof",
		"screenshots",
	);
	mkdirSync(screenshotDir, { recursive: true });
	await page.screenshot({
		path: resolve(screenshotDir, "sync-logs-partial-unreachable-peer.png"),
		fullPage: true,
	});
});

test("admin device events page uses friendly status copy without inventory strip", async ({ page }) => {
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
		if (path.endsWith("/device/events")) {
			await route.fulfill(
				json({
					events: [],
					summary: { total: 0, byStatus: {}, bySource: {} },
					pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
				}),
			);
			return;
		}
		if (path.endsWith("/device")) {
			await route.fulfill(
				json({
					devices: [zktecoDevice],
					pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
				}),
			);
			return;
		}
		await route.fulfill(json({}));
	});

	await page.goto("/admin/configuration/devices/events?view=saved");
	await expect(page.getByRole("heading", { name: "Device events" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	await expect(page.getByText("Saved event ledger")).toBeVisible();
	await expect(page.getByText("Current inventory")).toHaveCount(0);
	await expect(page.getByText("Needs reverify")).toHaveCount(0);
	await expect(page.getByText(/VM listener/i)).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Sync logs" })).toBeVisible();
	await expect(page.getByText("Device", { exact: true })).toBeVisible();
	await expect(page.getByText("Category", { exact: true })).toBeVisible();
	await expect(page.getByText("Action", { exact: true })).toBeVisible();

	const screenshotDir = resolve(
		process.cwd(),
		"..",
		".runtime",
		"device-ux-clarity-proof",
		"screenshots",
	);
	mkdirSync(screenshotDir, { recursive: true });
	await page.screenshot({
		path: resolve(screenshotDir, "device-events-page-friendly-status.png"),
		fullPage: true,
	});
});
