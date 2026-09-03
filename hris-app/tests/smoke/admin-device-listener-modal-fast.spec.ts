import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const routeReadyTimeoutMs = 30_000;
const timestamp = "2026-07-17T00:00:00.000Z";

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

const testADevice = {
	id: "cmrlgqsjv000oob01165tbd8n",
	organizationId: "org-1",
	name: "TEST A",
	address: "192.168.254.189",
	port: 443,
	protocol: "https",
	config: {
		vendor: "Hikvision",
		hikvisionSdkRuntimeAddress: "127.0.0.1",
		hikvisionSdkRuntimePort: 59000,
		hikvisionSdkRuntimeTransport: "ssh-reverse-forward",
	},
	access: {},
	createdAt: timestamp,
	updatedAt: timestamp,
};

const json = (data: unknown, status = 200) => ({
	status,
	contentType: "application/json",
	body: JSON.stringify({
		success: true,
		message: "ok",
		data,
	}),
});

test("listener modal settles quickly and shows configured address + reverse tunnel host", async ({
	page,
}) => {
	await page.addInitScript(() => {
		window.localStorage.setItem("authToken", "smoke-token");
		window.localStorage.setItem("userRole", "hris-admin");
		window.localStorage.setItem("userSubRole", "hris-admin");
	});

	let listenerHits = 0;
	let proveHits = 0;
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
		if (path.includes("/device/hikvision/listener") && route.request().method() === "GET") {
			listenerHits += 1;
			await route.fulfill(
				json({
					service: "project-truth-hikvision-hot-reload-listener.service",
					vm: { host: "10.184.37.19", user: "infra", path: "alias:project-truth-hris" },
					running: true,
					status: "running",
					activeState: "active",
					subState: "running",
					restarts: 0,
					execMainStatus: 0,
					checkedAt: timestamp,
					control: { available: true, actions: ["start", "stop", "restart"] },
					sdk: {
						receivingCallbacks: true,
						postingToHris: true,
						armed: true,
						state: "receiving",
						lastAlarmAt: timestamp,
						lastPostAt: timestamp,
						lastLoginOk: true,
						devices: [
							{
								deviceId: testADevice.id,
								name: "TEST A",
								host: "127.0.0.1",
								sdkPort: "59000",
								lastLogAt: timestamp,
								lastLoginOk: true,
								armed: true,
								receivingCallbacks: true,
								postingToHris: true,
								state: "receiving",
							},
						],
					},
					logs: {
						available: true,
						recent: [
							`{"ts":"${timestamp}","deviceId":"${testADevice.id}","deviceName":"TEST A","event":"sdk_login","host":"127.0.0.1","ok":"true","sdkPort":"59000"}`,
						],
					},
				}),
			);
			return;
		}
		if (
			path.endsWith("/device/events/live-readiness/prove") &&
			route.request().method() === "POST"
		) {
			proveHits += 1;
			await route.fulfill(
				json({
					proven: true,
					restartAttempted: false,
					steps: [],
					readiness: {
						overall: "green",
						safeToTap: true,
						safeToEnroll: true,
						headline: "Safe to tap and enroll — live path is receiving",
					},
				}),
			);
			return;
		}
		if (path.endsWith("/device/events/live-readiness")) {
			await route.fulfill(
				json({
					overall: "green",
					safeToTap: true,
					safeToEnroll: true,
					headline: "Safe to tap and enroll — live path is receiving",
				}),
			);
			return;
		}
		if (path.includes("/device/events")) {
			await route.fulfill(
				json({
					events: [],
					summary: { total: 0, byStatus: {}, bySource: {} },
					pagination: { total: 0, page: 1, limit: 25, totalPages: 0 },
				}),
			);
			return;
		}
		if (path.endsWith("/device") || /\/device\?/.test(path)) {
			await route.fulfill(
				json({
					devices: [testADevice],
					pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
				}),
			);
			return;
		}
		await route.fulfill(json({}));
	});

	const startedAt = Date.now();
	await page.goto(
		"/admin/configuration/devices/events?view=saved&action=listener-control&deviceId=cmrlgqsjv000oob01165tbd8n",
	);

	const dialog = page.getByRole("dialog");
	await expect(dialog.getByRole("heading", { name: "Hikvision listener" })).toBeVisible({
		timeout: routeReadyTimeoutMs,
	});
	// Must not remain stuck on "Checking live capture…"
	await expect(dialog.getByText(/Checking live capture/i)).toHaveCount(0, {
		timeout: routeReadyTimeoutMs,
	});
	await expect(dialog.getByText(/Service enabled/i)).toBeVisible();
	await expect(dialog.getByText(/TEST A/i).first()).toBeVisible();
	// Configured address + reverse-tunnel runtime host (not only 127.0.0.1).
	await expect(dialog.getByText("192.168.254.189")).toBeVisible();
	await expect(dialog.getByText(/SDK via reverse tunnel 127\.0\.0\.1/i)).toBeVisible();
	await expect(dialog.getByText(/Receiving callbacks|receiving/i).first()).toBeVisible();
	const tunnelButton = dialog.getByRole("button", { name: /Check reverse tunnel for TEST A/i });
	await expect(tunnelButton).toBeVisible();
	await tunnelButton.click();
	await expect.poll(() => proveHits).toBe(1);

	const elapsedMs = Date.now() - startedAt;
	expect(elapsedMs).toBeLessThan(8000);
	expect(listenerHits).toBeGreaterThan(0);

	const screenshotDir = resolve(
		process.cwd(),
		"..",
		".runtime",
		"listener-fast-proof",
		"screenshots",
	);
	mkdirSync(screenshotDir, { recursive: true });
	await page.screenshot({
		path: resolve(screenshotDir, "listener-modal-fast-settle.png"),
		fullPage: true,
	});
});
