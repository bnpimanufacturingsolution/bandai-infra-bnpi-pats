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
		expect(router).to.include('routes.post("/:id/users/sync", controller.syncDeviceUsers)');
		expect(router).to.include('routes.post("/users/:userId/link", controller.linkDeviceUser)');
		expect(router).to.include('routes.post("/users/:userId/unlink", controller.unlinkDeviceUser)');
		expect(controller).to.include("DEVICE_USER_ADMIN_ROLES");
		expect(controller).to.include('"hris-admin"');
		expect(controller).to.include("assertDeviceUserAdmin(req, res)");
	});

	it("persists log sync run summaries so known skipped rows do not remain forever missing", () => {
		const controller = controllerSource();
		expect(controller).to.include("deviceSyncRun.create");
		expect(controller).to.include('runType: "DEVICE_LOGS"');
		expect(controller).to.include("skippedRecords: skipped");
		expect(controller).to.include("knownSkippedEventCount");
		expect(controller).to.include("Math.max(Number(totalEvents) - syncedEvents - knownSkippedEvents, 0)");
	});
});
