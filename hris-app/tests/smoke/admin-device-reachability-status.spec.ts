import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const routeReadyTimeoutMs = 30_000;
const timestamp = "2026-07-16T15:00:00.000Z";

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

const devices = [
	{
		id: "device-online-1",
		organizationId: "org-1",
		name: "TEST A",
		address: "192.168.254.189",
		port: 443,
		protocol: "https",
		config: { vendor: "Hikvision" },
		access: { username: "admin" },
		createdAt: timestamp,
		updatedAt: timestamp,
	},
	{
		id: "device-offline-2",
		organizationId: "org-1",
		name: "Main Entrance Device E",
		address: "10.184.38.168",
		port: 443,
		protocol: "https",
		config: { vendor: "Hikvision" },
		access: { username: "admin" },
		createdAt: timestamp,
		updatedAt: timestamp,
	},
];

const json = (data: unknown, status = 200) => ({
	status,
	contentType: "application/json",
	body: JSON.stringify({
		success: true,
		message: "ok",
		data,
	}),
});

const installAuth = async (page: Page) => {
	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-admin");
		window.localStorage.setItem("userSubRole", "hris-admin");
	});
};

const installApiMocks = async (page: Page) => {
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
		if (path.includes("/device/") && path.endsWith("/health")) {
			const parts = path.split("/").filter(Boolean);
			const healthIndex = parts.lastIndexOf("health");
			const deviceId = healthIndex > 0 ? parts[healthIndex - 1] : "";
			const online = deviceId === "device-online-1";
			await route.fulfill(
				json({
					device: {
						id: deviceId,
						name: online ? "TEST A" : "Main Entrance Device E",
						address: online ? "192.168.254.189" : "10.184.38.168",
						port: 443,
						protocol: "https",
						vendor: "Hikvision",
					},
					summary: {
						status: online ? "online" : "offline",
						checkedAt: timestamp,
						durationMs: 120,
					},
					checks: {
						hrisApi: { ok: true, status: "online" },
						network: {
							ok: online,
							status: online ? "reachable" : "unreachable",
							host: online ? "192.168.254.189" : "10.184.38.168",
							port: 443,
							latencyMs: online ? 12 : null,
						},
						deviceApi: {
							ok: online,
							status: online ? "online" : "offline",
							latencyMs: online ? 40 : null,
						},
					},
				}),
			);
			return;
		}
		if (
			(path.endsWith("/device") || /\/device\?/.test(path) || /\/api\/device$/.test(path)) &&
			!path.includes("/health")
		) {
			await route.fulfill(
				json({
					devices,
					pagination: { total: devices.length, page: 1, limit: 100, totalPages: 1 },
				}),
			);
			return;
		}
		if (path.includes("/device/events")) {
			await route.fulfill(
				json({
					events: [],
					summary: {
						total: 0,
						matched: 0,
						needsEmployeeMatch: 0,
						ignored: 0,
						failed: 0,
						byStatus: {},
						bySource: {},
					},
					pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
				}),
			);
			return;
		}
		if (path.includes("/device/hikvision/listener")) {
			await route.fulfill(
				json({
					service: "project-truth-hikvision-hot-reload-listener.service",
					vm: { host: "10.184.37.19", user: "infra" },
					running: true,
					status: "running",
					activeState: "active",
					subState: "running",
					restarts: 0,
					execMainStatus: 0,
					checkedAt: timestamp,
					control: { available: true, actions: ["start", "stop", "restart"] },
					sdk: {
						receivingCallbacks: false,
						postingToHris: false,
						armed: false,
						state: "idle",
						devices: [],
					},
					logs: { available: true, recent: [] },
				}),
			);
			return;
		}

		await route.fulfill(json({}));
	});
};

test.describe("admin device reachability status", () => {
	test("devices table shows Online/Offline status from health checks", async ({ page }) => {
		await installAuth(page);
		await installApiMocks(page);
		await page.goto("/admin/configuration/devices");

		// DataTable can render desktop + card layouts, so assert on the first match.
		const online = page
			.locator('[data-testid="device-reachability-status"][data-device-id="device-online-1"]')
			.first();
		const offline = page
			.locator('[data-testid="device-reachability-status"][data-device-id="device-offline-2"]')
			.first();

		await expect(online).toBeVisible({ timeout: routeReadyTimeoutMs });
		await expect(online).toHaveAttribute("data-reachability", "online", {
			timeout: routeReadyTimeoutMs,
		});
		await expect(online).toContainText(/Online/i);

		await expect(offline).toBeVisible({ timeout: routeReadyTimeoutMs });
		await expect(offline).toHaveAttribute("data-reachability", "offline", {
			timeout: routeReadyTimeoutMs,
		});
		await expect(offline).toContainText(/Offline/i);

		const screenshotDir = resolve(
			process.cwd(),
			"..",
			".runtime",
			"device-reachability-proof",
			"screenshots",
		);
		mkdirSync(screenshotDir, { recursive: true });
		await page.screenshot({
			path: resolve(screenshotDir, "devices-table-reachability-status.png"),
			fullPage: true,
		});
	});

	test("device events filter does not run health probes for dropdown dots", async ({ page }) => {
		await installAuth(page);
		const healthRequests: string[] = [];
		page.on("request", (request) => {
			const path = new URL(request.url()).pathname;
			if (path.includes("/device/") && path.endsWith("/health")) {
				healthRequests.push(path);
			}
		});
		await installApiMocks(page);
		await page.goto("/admin/configuration/devices/events?view=saved");

		const deviceFilter = page.getByRole("combobox").first();
		await expect(deviceFilter).toBeVisible({ timeout: routeReadyTimeoutMs });
		await deviceFilter.click();

		const onlineDot = page.locator(
			'[data-testid="device-filter-reachability-dot"][data-device-id="device-online-1"]',
		);
		const offlineDot = page.locator(
			'[data-testid="device-filter-reachability-dot"][data-device-id="device-offline-2"]',
		);

		await expect(onlineDot).toBeVisible({ timeout: routeReadyTimeoutMs });
		await expect(onlineDot).toHaveAttribute("data-reachability", "not_checked");
		await expect(offlineDot).toBeVisible();
		await expect(offlineDot).toHaveAttribute("data-reachability", "not_checked");
		expect(healthRequests).toEqual([]);

		const screenshotDir = resolve(
			process.cwd(),
			"..",
			".runtime",
			"device-reachability-proof",
			"screenshots",
		);
		mkdirSync(screenshotDir, { recursive: true });
		await page.screenshot({
			path: resolve(screenshotDir, "device-events-filter-no-health-probes.png"),
			fullPage: true,
		});
	});
});
