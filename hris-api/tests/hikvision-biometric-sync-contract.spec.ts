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
		expect(service).to.include("bool execute_mode = true;");
		expect(service).to.include('arg == "--dry-run"');
		expect(service).to.include('arg == "--device-file"');
		expect(service).to.include("std::ifstream device_file");
		expect(service).to.include("NET_DVR_GET_FINGERPRINT_CFG_V50");
		expect(service).to.include("NET_DVR_SET_FINGERPRINT_CFG_V50");
		expect(service).to.include("NET_DVR_DEL_FINGERPRINT_CFG_V50");
		expect(service).to.include("rawFingerprintTemplateStored");
		expect(service).to.include("delete_peer_user");
		expect(service).to.include("delete_peer_fingerprints");
		expect(service).to.include("MINOR_CLR_USER_INFO");
		expect(service).to.include("MINOR_CLR_FINGER_BY_CARD");
		expect(service).to.not.include('"fingerData"');
	});

	it("exposes fixed local VM listener status and control endpoints for admin recovery", () => {
		const router = routerSource();
		const controller = controllerSource();

		expect(router).to.include(
			'routes.get("/hikvision/listener", controller.getHikvisionListenerStatus)',
		);
		expect(router).to.include(
			'routes.post("/hikvision/listener", controller.controlHikvisionListener)',
		);
		expect(controller).to.include("const getHikvisionListenerStatus = async");
		expect(controller).to.include("const controlHikvisionListener = async");
		expect(controller).to.include("const admin = assertDeviceUserAdmin(req, res)");
		expect(controller).to.include("HIKVISION_HOT_RELOAD_LISTENER_SERVICE");
		expect(controller).to.include('"project-truth-hikvision-hot-reload-listener.service"');
		expect(controller).to.include("HIKVISION_LISTENER_CONTROL_ACTIONS.has(action)");
		expect(controller).to.include("installManagedHikvisionListenerWrapperOnVm");
		expect(controller).to.include('if (action !== "stop")');
		expect(controller).to.include("runFixedProcess");
		expect(controller).to.include("execFile(");
		expect(controller).to.include('"systemctl"');
		expect(controller).to.include('"start", "stop", "restart"');
	});

	it("keeps the VM hot-reload wrapper sourced from all Hikvision device rows instead of one hardcoded device", () => {
		const controller = controllerSource();
		const wrapper = readFileSync(
			join(process.cwd(), "../scripts/project-truth-hikvision-hot-reload-listener.sh"),
			"utf8",
		);

		expect(wrapper).to.include('COALESCE(config->>\'vendor\', \'\') = \'Hikvision\'');
		expect(wrapper).to.include('COALESCE(access->>\'password\', \'\') <> \'\'');
		expect(wrapper).to.include('--device-file "$SPEC"');
		expect(wrapper).to.not.include("where name='Main Entrance Device'");
		expect(controller).to.include("reconcileHikvisionRuntimeAfterDeviceChange");
		expect(controller).to.include('await reconcileHikvisionRuntimeAfterDeviceChange(device, "device_create")');
		expect(controller).to.include('await reconcileHikvisionRuntimeAfterDeviceChange(updatedDevice, "device_update")');
		expect(controller).to.include('await reconcileHikvisionRuntimeAfterDeviceChange(existingDevice, "device_delete")');
	});

	it("auto-syncs Hikvision device users right after create so Sync Center can show linked and open matches immediately", () => {
		const controller = controllerSource();

		expect(controller).to.include("const syncHikvisionDeviceUsersFromSource = async");
		expect(controller).to.include("await syncHikvisionDeviceUsersFromSource({");
		expect(controller).to.include("Post-create Hikvision device users synced");
		expect(controller).to.include("startedByUserId: (req as any).userId || null");
		expect(controller).to.include('if (isHikvisionDevice(device) && String((device as any)?.access?.password || "").trim())');
	});
});
