/**
 * Sync Center — Device Users CSV import job progress (mocked API).
 * Proves drag/drop surface + job polling progress bar (weights + percent)
 * without requiring a live biometric panel.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const timestamp = "2026-08-03T10:00:00.000Z";
const jobId = "job-device-user-import-csv-canary";

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

const importTargetDevice = {
	id: "device-import-target-a",
	organizationId: "org-1",
	name: "Import Target A CSV (192.168.18.35)",
	address: "10.184.37.19",
	port: 58380,
	protocol: "http",
	config: {
		vendor: "Hikvision",
		physicalAddress: "192.168.18.35",
		physicalHttpPort: 80,
		reverseTunnel: true,
		hikvisionRuntimeAddress: "10.184.37.19",
		hikvisionRuntimePort: 58380,
	},
	access: {},
	createdAt: timestamp,
	updatedAt: timestamp,
};

const canaryCsv = `vendorUserId,displayName,userType,rawFingerprintBlob,rawFaceBlob
1,ernest T571774,normal,"FP1(""QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFB"")",/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAk
2,UZARO ISRAEL,normal,"FP1(""QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI="")",/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAk
`;

async function fulfillJson(route: Route, body: unknown, status = 200) {
	await route.fulfill({
		status,
		contentType: "application/json",
		body: JSON.stringify(body),
	});
}

async function installBaseMocks(page: Page) {
	let importJobPolls = 0;

	await page.route("**/api/**", async (route) => {
		const request = route.request();
		const method = request.method();
		const url = new URL(request.url());
		const path = url.pathname.replace(/^\/api/, "") || "/";

		if (path === "/auth/login" && method === "POST") {
			return fulfillJson(route, {
				status: "success",
				data: { token: adminUser.token, user: adminUser },
			});
		}
		if (path === "/auth/me" || path === "/users/me") {
			return fulfillJson(route, { status: "success", data: adminUser });
		}
		if (path.includes("provision") || path.includes("setup/status")) {
			return fulfillJson(route, { status: "success", data: readyProvisioningStatus });
		}
		if (path === "/device" && method === "GET") {
			return fulfillJson(route, {
				status: "success",
				data: { devices: [importTargetDevice], pagination: { total: 1, page: 1, limit: 50 } },
			});
		}
		if (path === `/device/${importTargetDevice.id}/health`) {
			return fulfillJson(route, {
				status: "success",
				data: {
					device: {
						id: importTargetDevice.id,
						name: importTargetDevice.name,
						address: importTargetDevice.address,
						port: importTargetDevice.port,
						protocol: "http",
						vendor: "Hikvision",
						baseUrl: "http://10.184.37.19:58380",
					},
					summary: { status: "online", checkedAt: timestamp, durationMs: 12 },
					checks: {
						hrisApi: { ok: true, status: "online" },
						network: { ok: true, status: "reachable" },
						deviceApi: { ok: true, status: "online" },
					},
				},
			});
		}
		if (path === "/device/users/import/preview" && method === "POST") {
			return fulfillJson(route, {
				status: "success",
				message: "Device user import preview built",
				data: {
					execute: false,
					dryRun: true,
					targetDevice: {
						id: importTargetDevice.id,
						name: importTargetDevice.name,
						address: importTargetDevice.address,
						port: importTargetDevice.port,
					},
					file: {
						schemaVersion: "project-truth.hikvision-device-users.v1",
						users: 2,
						sourceDevices: 1,
					},
					counts: {
						newUsers: 2,
						matchingUsers: 0,
						conflicts: 0,
						missingHrisEmployees: 2,
					},
					rawBiometricPackage: {
						present: true,
						rawFingerprintBlobCount: 2,
						rawFaceBlobCount: 2,
						transferModes: ["rawPackage"],
						status: "spreadsheet_raw_blobs",
					},
					previewToken: "preview-token-csv-canary",
					plan: [
						{
							vendorUserId: "1",
							action: "create_preview",
							transferMode: "rawPackage",
							conflictFields: [],
							missingEmployee: true,
						},
						{
							vendorUserId: "2",
							action: "create_preview",
							transferMode: "rawPackage",
							conflictFields: [],
							missingEmployee: true,
						},
					],
					executeAvailable: true,
					executeRequirements: [
						'confirmation="IMPORT DEVICE USERS"',
						"previewToken from this preview response",
						"biometricTransferMode=sdkPeerCopy, rawPackage, or metadataOnly",
					],
				},
			});
		}
		if (path === "/device/users/import/execute" && method === "POST") {
			const body = request.postDataJSON() as {
				biometricTransferMode?: string;
				runAsJob?: boolean;
				confirmation?: string;
			};
			expect(body.confirmation).toBe("IMPORT DEVICE USERS");
			expect(body.biometricTransferMode).toBe("rawPackage");
			expect(body.runAsJob).toBe(true);
			return fulfillJson(
				route,
				{
					status: "success",
					message: "Device-user import job accepted",
					data: {
						mode: "job",
						jobId,
						status: "processing",
						pollUrl: `/api/device/users/import/jobs/${jobId}`,
						plaintextBiometricExposed: true,
						message: "Device-user import is running in the background.",
					},
				},
				202,
			);
		}
		if (path === `/device/users/import/jobs/${jobId}` && method === "GET") {
			importJobPolls += 1;
			if (importJobPolls < 3) {
				return fulfillJson(route, {
					status: "success",
					data: {
						jobId,
						status: "processing",
						planned: 2,
						imported: 1,
						failed: 0,
						skipped: 0,
						processed: 1,
						progressPercent: 48,
						progressLabel: "Writing 1 of 2 users",
						progressWeights: {
							waveNumerator: 1,
							waveDenominator: 2,
							stages: [
								{ key: "queue", weight: 5, label: "Queued" },
								{ key: "write", weight: 85, label: "Writing biometrics" },
								{ key: "finalize", weight: 10, label: "Finalizing" },
							],
						},
						message: "Processed 1 of 2 device users",
						plaintextBiometricExposed: false,
						results: [],
						startedAt: timestamp,
					},
				});
			}
			return fulfillJson(route, {
				status: "success",
				data: {
					jobId,
					status: "completed",
					planned: 2,
					imported: 2,
					failed: 0,
					skipped: 0,
					processed: 2,
					progressPercent: 100,
					progressLabel: "Import complete",
					progressWeights: {
						waveNumerator: 2,
						waveDenominator: 2,
						stages: [
							{ key: "queue", weight: 5, label: "Queued" },
							{ key: "write", weight: 85, label: "Writing biometrics" },
							{ key: "finalize", weight: 10, label: "Finalizing" },
						],
					},
					message: "Device-user import executed",
					plaintextBiometricExposed: false,
					results: [
						{ vendorUserId: "1", status: "imported", method: "rawPackage" },
						{ vendorUserId: "2", status: "imported", method: "rawPackage" },
					],
					startedAt: timestamp,
					completedAt: timestamp,
				},
			});
		}

		// Default soft OK for other admin shell calls
		return fulfillJson(route, { status: "success", data: {} });
	});
}

test.describe("Device Users CSV import job progress", () => {
	test("drag-drop surface + job progress bar with weights", async ({ page }) => {
		await installBaseMocks(page);

		// Seed auth for app shell
		await page.addInitScript((user) => {
			window.localStorage.setItem("token", user.token);
			window.localStorage.setItem("user", JSON.stringify(user));
		}, adminUser);

		await page.goto(
			`/admin/configuration/devices?action=device-users&syncPanel=users&deviceId=${importTargetDevice.id}`,
		);

		// Open import modal
		const importBtn = page.getByRole("button", { name: /Import device users/i }).first();
		await expect(importBtn).toBeVisible({ timeout: 30_000 });
		await importBtn.click();

		const dropzone = page.getByTestId("device-user-import-dropzone");
		await expect(dropzone).toBeVisible();
		await expect(page.getByText(/Drag & drop CSV here/i)).toBeVisible();

		// Upload via file input inside dropzone (same path as drop handlers)
		const fileInput = dropzone.locator('input[type="file"]');
		await fileInput.setInputFiles({
			name: "main-a-device-users.csv",
			mimeType: "text/csv",
			buffer: Buffer.from(canaryCsv, "utf8"),
		});
		await expect(page.getByText(/Loaded: main-a-device-users.csv/i)).toBeVisible();

		await page.getByRole("button", { name: /Preview import/i }).click();
		await expect(page.getByText(/rawPackage/i).first()).toBeVisible({ timeout: 15_000 });

		await page
			.getByLabel(/Type IMPORT DEVICE USERS/i)
			.fill("IMPORT DEVICE USERS");
		await page.getByRole("button", { name: /^Execute$/i }).click();

		const progress = page.getByTestId("device-user-import-job-progress");
		await expect(progress).toBeVisible({ timeout: 15_000 });
		await expect(progress.getByText(/Import job running|Import job complete/i)).toBeVisible();
		await expect(progress.getByRole("progressbar")).toBeVisible();
		await expect(progress.getByText(/Weights:/i)).toBeVisible();
		await expect(progress.getByText(/Writing biometrics/i)).toBeVisible();

		// Polling should advance to complete
		await expect(progress.getByText(/Import job complete/i)).toBeVisible({
			timeout: 20_000,
		});
		await expect(progress.getByText(/100%/)).toBeVisible();
	});
});
