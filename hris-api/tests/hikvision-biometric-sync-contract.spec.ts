import { expect } from "chai";
import { readFileSync } from "fs";
import { join } from "path";

describe("Hikvision biometric sync contract", () => {
	const controllerSource = () =>
		readFileSync(join(process.cwd(), "app/device/device.controller.ts"), "utf8");
	const routerSource = () => readFileSync(join(process.cwd(), "app/device/device.router.ts"), "utf8");
	const serviceSource = () =>
		readFileSync(
			join(process.cwd(), "../vendor/hikvision-linux/hikvision_biometric_service.cpp"),
			"utf8",
		);

	it("exposes admin-only dry-run and execute reconciliation without template custody", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include(
			'routes.post("/biometric-sync/reconcile", controller.reconcileBiometricSync)',
		);
		expect(controller).to.include("const reconcileBiometricSync = async");
		expect(controller).to.include("const admin = assertDeviceUserAdmin(req, res)");
		expect(controller).to.include("const execute = body.execute === true");
		expect(controller).to.include("Biometric sync reconcile dry-run completed");
		expect(controller).to.include("deviceUser.upsert");
		expect(controller).to.include("biometricSync: biometricSyncPayload");
		expect(controller).to.include("rawFingerprintTemplateStored: false");
	});

	it("keeps Linux callback work queued and omits raw fingerprint templates from evidence", () => {
		const service = serviceSource();

		expect(service).to.include("NET_DVR_SetDVRMessageCallBack_V51(0, alarm_callback, nullptr)");
		expect(service).to.include("NET_DVR_SetupAlarmChan_V50");
		expect(service).to.include("queue_hris_device_event(job)");
		expect(service).to.include('"/api/hikvision/callback"');
		expect(service).to.include("EN_HCNETSDK_ALARM");
		expect(service).to.include("queue_reconcile(job)");
		expect(service).to.include("worker_loop");
		expect(service).to.include("NET_DVR_GET_FINGERPRINT_CFG_V50");
		expect(service).to.include("NET_DVR_SET_FINGERPRINT_CFG_V50");
		expect(service).to.include("rawFingerprintTemplateStored");
		expect(service).to.not.include('"fingerData"');
	});
});
