import { expect, test, type Page, type Route } from "@playwright/test";

const adminEmail = "admin@bandai.local";
const adminPassword = "password123";

const devices = [
	{
		id: "device-online-1",
		name: "TEST A",
		address: "192.168.254.189",
		port: 443,
		protocol: "https",
		config: { vendor: "Hikvision" },
		access: { username: "admin" },
	},
	{
		id: "device-offline-2",
		name: "Main Entrance Device E",
		address: "10.184.38.168",
		port: 443,
		protocol: "https",
		config: { vendor: "Hikvision" },
		access: { username: "admin" },
	},
];

const fulfillJson = async (route: Route, body: unknown, status = 200) => {
	await route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	});
};

const installDeviceReachabilityMocks = async (page: Page) => {
	await page.route("**/api/**", async (route) => {
		const request = route.request();
		const method = request.method().toUpperCase();
		const url = new URL(request.url());
		const path = url.pathname;

		if (method === "POST" && path.endsWith("/api/auth/login")) {
			await fulfillJson(route, {
				success: true,
				message: "ok",
				data: {
					token: "reachability-token",
					user: {
						id: "admin-1",
						email: adminEmail,
						roles: ["hris-admin"],
					},
				},
			});
			return;
		}

		if (method === "GET" && /\/api\/device\/[^/]+\/health$/.test(path)) {
			const deviceId = path.split("/").slice(-2)[0];
			const online = deviceId === "device-online-1";
			await fulfillJson(route, {
				success: true,
				message: "Device health checked successfully",
				data: {
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
						checkedAt: new Date().toISOString(),
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
				},
			});
			return;
		}

		if (method === "GET" && path.endsWith("/api/device")) {
			await fulfillJson(route, {
				success: true,
				message: "ok",
				data: {
					devices,
					pagination: { total: devices.length, page: 1, limit: 10 },
				},
			});
			return;
		}

		if (method === "GET" && path.includes("/api/device/events")) {
			await fulfillJson(route, {
				success: true,
				message: "ok",
				data: {
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
					pagination: { total: 0, page: 1, limit: 20 },
				},
			});
			return;
		}

		if (method === "GET" && path.includes("/api/device/hikvision/listener")) {
			await fulfillJson(route, {
				success: true,
				message: "ok",
				data: {
					service: "project-truth-hikvision-hot-reload-listener.service",
					vm: { host: "10.184.37.19", user: "infra" },
					running: true,
					status: "running",
					activeState: "active",
					subState: "running",
					restarts: 0,
					execMainStatus: 0,
					checkedAt: new Date().toISOString(),
					control: { available: true, actions: ["start", "stop", "restart"] },
					sdk: {
						receivingCallbacks: false,
						postingToHris: false,
						armed: false,
						state: "idle",
						devices: [],
					},
					logs: { available: true, recent: [] },
				},
			});
			return;
		}

		if (method === "GET" && path.includes("/api/auth/me")) {
			await fulfillJson(route, {
				success: true,
				message: "ok",
				data: {
					id: "admin-1",
					email: adminEmail,
					roles: ["hris-admin"],
				},
			});
			return;
		}

		await fulfillJson(route, { success: true, message: "ok", data: {} });
	});
};

const loginAsAdmin = async (page: Page) => {
	await page.goto("/auth/login");
	await page.getByLabel(/email/i).fill(adminEmail);
	await page.getByLabel(/password/i).fill(adminPassword);
	await page.getByRole("button", { name: /sign in|log in|login/i }).click();
	await page.waitForURL(/admin|dashboard|configuration/i, { timeout: 30_000 }).catch(() => undefined);
};

test.describe("admin device reachability status", () => {
	test("devices table shows Online/Offline status from health checks", async ({ page }) => {
		await installDeviceReachabilityMocks(page);
		await loginAsAdmin(page);
		await page.goto("/admin/configuration/devices");

		const online = page.locator('[data-testid="device-reachability-status"][data-device-id="device-online-1"]');
		const offline = page.locator(
			'[data-testid="device-reachability-status"][data-device-id="device-offline-2"]',
		);

		await expect(online).toBeVisible({ timeout: 20_000 });
		await expect(online).toHaveAttribute("data-reachability", "online");
		await expect(online).toContainText(/Online/i);

		await expect(offline).toBeVisible({ timeout: 20_000 });
		await expect(offline).toHaveAttribute("data-reachability", "offline");
		await expect(offline).toContainText(/Offline/i);
	});

	test("device events filter shows green/red reachability dots", async ({ page }) => {
		await installDeviceReachabilityMocks(page);
		await loginAsAdmin(page);
		await page.goto("/admin/configuration/devices/events?view=saved");

		// Open the device filter combobox (first select on filters row is Device).
		const deviceFilter = page.getByRole("combobox").first();
		await expect(deviceFilter).toBeVisible({ timeout: 20_000 });
		await deviceFilter.click();

		const onlineDot = page.locator(
			'[data-testid="device-filter-reachability-dot"][data-device-id="device-online-1"]',
		);
		const offlineDot = page.locator(
			'[data-testid="device-filter-reachability-dot"][data-device-id="device-offline-2"]',
		);

		await expect(onlineDot).toBeVisible({ timeout: 15_000 });
		await expect(onlineDot).toHaveAttribute("data-reachability", "online");
		await expect(offlineDot).toBeVisible();
		await expect(offlineDot).toHaveAttribute("data-reachability", "offline");
	});
});
