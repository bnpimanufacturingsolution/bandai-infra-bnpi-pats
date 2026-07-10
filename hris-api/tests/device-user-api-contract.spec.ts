import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

describe("DeviceUser API contract", () => {
	const controllerSource = () =>
		readFileSync(join(process.cwd(), "app/device/device.controller.ts"), "utf8");
	const routerSource = () => readFileSync(join(process.cwd(), "app/device/device.router.ts"), "utf8");

	it("exposes admin-only device user sync and manual link routes", () => {
		const router = routerSource();
		const controller = controllerSource();
		expect(router).to.include('routes.get("/:id/users", controller.listDeviceUsers)');
		expect(router).to.include('routes.get("/users/:userId/photo", controller.getDeviceUserPhoto)');
		expect(router).to.include('routes.post("/:id/users/sync", controller.syncDeviceUsers)');
		expect(router).to.include('routes.post("/users/sync-jobs", controller.startDeviceUserSyncJob)');
		expect(router).to.include('routes.get("/users/sync-jobs/:jobId", controller.getDeviceUserSyncJob)');
		expect(router).to.include('routes.post("/users/sync-jobs/:jobId/cancel", controller.cancelDeviceUserSyncJob)');
		expect(router).to.include('routes.post("/:id/users/lifecycle-backfill", controller.backfillDeviceUserLifecycleEvents)');
		expect(router).to.include('routes.get("/:id/sync-runs", controller.getDeviceSyncRuns)');
		expect(router).to.include('routes.post("/import-jobs/:jobId/cancel", controller.cancelDeviceImportJob)');
		expect(router).to.include('routes.post("/users/:userId/link", controller.linkDeviceUser)');
		expect(router).to.include('routes.post("/users/:userId/unlink", controller.unlinkDeviceUser)');
		expect(controller).to.include('req.query.vendorUserId');
		expect(controller).to.include('req.query.vendorUserIds');
		expect(controller).to.include("? { vendorUserId }");
		expect(controller).to.include('vendorUserId: { in: vendorUserIds }');
		expect(controller).to.include("DEVICE_USER_ADMIN_ROLES");
		expect(controller).to.include('"hris-admin"');
		expect(controller).to.include("assertDeviceUserAdmin(req, res)");
		expect(controller).to.include("const getDeviceUserPhoto = async");
		expect(controller).to.include("const backfillDeviceUserLifecycleEvents = async");
		expect(controller).to.include("persistDeviceUserLifecycleBackfill");
		expect(controller).to.include("manual_device_user_lifecycle_backfill");
		expect(controller).to.include("hikvisionFetchBinary");
		expect(controller).to.include("readDeviceUserFaceUrl");
		expect(controller).to.include("Device user face photo host does not match the configured device");
	});

	it("persists log sync run summaries so known skipped rows do not remain forever missing", () => {
		const controller = controllerSource();
		expect(controller).to.include("deviceSyncRun.create");
		expect(controller).to.include('kind: "biometric_lifecycle_reconcile"');
		expect(controller).to.include("await finalizeBiometricLifecycleSyncRun(reconcileRunId");
		expect(controller).to.include('runType: "DEVICE_LOGS"');
		expect(controller).to.include("skippedRecords: skipped");
		expect(controller).to.include("skipMissingEmployeeNo");
		expect(controller).to.include("const skipMissingEmployeeNo =");
		expect(controller).to.include("if (!employeeNo && skipMissingEmployeeNo)");
		expect(controller).to.include("knownSkipped += 1");
		expect(controller).to.include("missingEmployeeNo: knownSkipped");
		expect(controller).to.include("alreadySaved");
		expect(controller).to.include("findExistingHikvisionDeviceEvent");
		expect(controller).to.include("cancelRequested");
		expect(controller).to.include("knownSkippedEventCount");
		expect(controller).to.include("totalUnsavedEventCount");
		expect(controller).to.include("importableIfSkipMissingEmployeeNo");
		expect(controller).to.include("importableIfSaveMissingEmployeeNo");
		expect(controller).to.include("Math.max(Number(totalEvents) - syncedEvents, 0)");
		expect(controller).to.include("Math.max(totalUnsavedEvents - knownSkippedEvents, 0)");
	});
});
