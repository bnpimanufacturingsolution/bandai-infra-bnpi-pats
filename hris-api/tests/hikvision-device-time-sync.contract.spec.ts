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

	it("keeps Hikvision C++ sources in include/src folders", () => {
		const vendorRoot = resolve(currentDir, "../../vendor/hikvision-linux");
		expect(readFileSync(resolve(vendorRoot, "include/hikvision_bio/types.hpp"), "utf8")).to.contain(
			"struct DeviceSession",
		);
		expect(readFileSync(resolve(vendorRoot, "include/hikvision_bio/common.hpp"), "utf8")).to.contain(
			"stdxml_json_request",
		);
		expect(readFileSync(resolve(vendorRoot, "include/hikvision_bio/device_time.hpp"), "utf8")).to.contain(
			"run_device_time_command",
		);
		expect(readFileSync(resolve(vendorRoot, "scripts/build-hikvision-biometric-service.sh"), "utf8")).to.contain(
			"src/hikvision_bio/main.cpp",
		);
		expect(readFileSync(resolve(vendorRoot, "src/hikvision_bio/time/device_time.cpp"), "utf8")).to.contain(
			"run_device_time_command",
		);
		expect(readFileSync(resolve(vendorRoot, "src/hikvision_bio/acs/listener.inc.cpp"), "utf8")).to.contain(
			"alarm_callback",
		);
	});

	it("adds HCNetSDK STDXML get/set time flags to the listener binary", () => {
		const serviceSource = [
			readFileSync(
				resolve(currentDir, "../../vendor/hikvision-linux/src/hikvision_bio/time/device_time.cpp"),
				"utf8",
			),
			readFileSync(
				resolve(currentDir, "../../vendor/hikvision-linux/src/hikvision_bio/main.cpp"),
				"utf8",
			),
			readFileSync(
				resolve(currentDir, "../../vendor/hikvision-linux/src/hikvision_bio/common.cpp"),
				"utf8",
			),
			readFileSync(
				resolve(currentDir, "../../vendor/hikvision-linux/src/hikvision_bio/runtime/session.inc.cpp"),
				"utf8",
			),
		].join("\n");
		expect(serviceSource).to.contain("bool run_device_time_command");
		expect(serviceSource).to.contain("GET /ISAPI/System/time?format=json");
		expect(serviceSource).to.contain("PUT /ISAPI/System/time?format=json");
		expect(serviceSource).to.contain("GET /ISAPI/System/time");
		expect(serviceSource).to.contain("PUT /ISAPI/System/time");
		expect(serviceSource).to.contain('arg == "--get-time"');
		expect(serviceSource).to.contain('arg == "--set-time"');
		expect(serviceSource).to.contain("device_time_read");
		expect(serviceSource).to.contain("device_time_write");
		expect(serviceSource).to.contain("stdxml_json_request");
	});
});
