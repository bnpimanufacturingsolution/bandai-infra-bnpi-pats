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

test("admin device events opens sync logs modal with DB and SDK truth before real sync", async ({
	page,
}) => {
	const api = await installMockApi(page);

	await page.goto("/admin/configuration/devices/events?view=saved");

	await expect(page.getByRole("heading", { name: "Device attendance" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	await page.getByRole("button", { name: "Sync logs" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Sync device logs" })).toBeVisible();
	await expect(dialog.getByText("SDK/vendor truth", { exact: true })).toBeVisible();
	await expect(dialog.getByText("DB truth", { exact: true })).toBeVisible();
	await expect(dialog.getByText("173,614")).toBeVisible();
	await expect(dialog.getByText("Device tally")).toBeVisible();
	await expect(dialog.getByText("Preview only")).toBeVisible();
	await expect(dialog.getByText("ZKTECO_BRIDGE_STATUS_URL is not configured")).toBeVisible();
	await expect(dialog.getByRole("button", { name: /Start actual sync/i })).toBeDisabled();
	expect(api.getSyncPostCount()).toBe(0);

	const screenshotDir = resolve(process.cwd(), "..", ".runtime", "browser-evidence", "screenshots");
	mkdirSync(screenshotDir, { recursive: true });
	await page.screenshot({
		path: resolve(screenshotDir, "device-events-sync-modal-smoke.png"),
		fullPage: true,
	});
});
