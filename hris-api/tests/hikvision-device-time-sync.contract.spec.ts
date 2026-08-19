import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";

const currentDir = dirname(fileURLToPath(import.meta.url));
const controllerSource = readFileSync(
	resolve(currentDir, "../app/device/device.controller.ts"),
	"utf8",
);
const routerSource = readFileSync(resolve(currentDir, "../app/device/device.router.ts"), "utf8");

describe("hikvision device time-sync contract", () => {
	it("registers a dry-run-default POST and only PUTs when execute is true", () => {
		expect(routerSource).to.contain('routes.post("/:id/time-sync", controller.syncHikvisionDeviceTime)');
		expect(controllerSource).to.contain("const execute = req.body?.execute === true");
		expect(controllerSource).to.contain("formatHikvisionManilaLocalTime");
		expect(controllerSource).to.contain("buildHikvisionManualTimePut");
		expect(controllerSource).to.contain('method: "PUT"');
		expect(controllerSource).to.contain("if (!execute)");
		expect(controllerSource).to.contain("Hikvision time update is only available on Hikvision devices");
		expect(controllerSource).to.contain("runHikvisionDeviceTimeOnVm");
		expect(controllerSource).to.contain('"--get-time"');
		expect(controllerSource).to.contain('"--set-time"');
		expect(controllerSource).to.contain("sdk_stdxml");
	});

	it("adds HCNetSDK STDXML get/set time flags to the listener binary", () => {
		const serviceSource = readFileSync(
			resolve(currentDir, "../../vendor/hikvision-linux/hikvision_biometric_service.cpp"),
			"utf8",
		);
		expect(serviceSource).to.contain("bool run_device_time_command");
		expect(serviceSource).to.contain("GET /ISAPI/System/time");
		expect(serviceSource).to.contain("PUT /ISAPI/System/time");
		expect(serviceSource).to.contain('arg == "--get-time"');
		expect(serviceSource).to.contain('arg == "--set-time"');
		expect(serviceSource).to.contain("device_time_read");
		expect(serviceSource).to.contain("device_time_write");
		expect(serviceSource).to.contain("stdxml_json_request");
	});
});
