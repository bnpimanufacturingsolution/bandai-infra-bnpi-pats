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
	});
});
