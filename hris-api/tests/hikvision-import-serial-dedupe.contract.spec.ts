import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "chai";

const currentDir = dirname(fileURLToPath(import.meta.url));
const controllerSource = readFileSync(
	resolve(currentDir, "../app/device/device.controller.ts"),
	"utf8",
);

const findExistingFn = controllerSource.match(
	/const findExistingHikvisionDeviceEvent = async \(params: \{[\s\S]*?\n\t\};/,
)?.[0];

describe("hikvision import serial-only dedupe contract", () => {
	it("extracts findExistingHikvisionDeviceEvent from the controller source", () => {
		expect(findExistingFn, "findExistingHikvisionDeviceEvent function body").to.be.a(
			"string",
		);
		expect(String(findExistingFn)).to.contain("dedupeKey: params.dedupeKey");
	});

	it("keeps dedupeKey lookup first, then serial-only match without employeeNo or source", () => {
		const fn = String(findExistingFn);
		expect(fn).to.match(/dedupeKey:\s*params\.dedupeKey/);
		expect(fn).to.contain("if (existingByDedupe) return existingByDedupe");
		expect(fn).to.contain("if (!serialNo) return null");
		expect(fn).not.to.contain("if (!serialNo || !params.employeeNo) return null");
		expect(fn).not.to.match(/employeeNo:\s*params\.employeeNo/);
		expect(fn).not.to.match(/source:\s*params\.source/);
		expect(fn).to.contain("organizationId: params.organizationId");
		expect(fn).to.contain("deviceId: params.deviceId");
		expect(fn).to.contain("eventTime: { gte: start, lte: end }");
		expect(fn).to.contain("Do not require employeeNo");
	});

	it("reads ACS serial from payload / AcsEventInfo / EventNotificationAlert / AccessControllerEvent", () => {
		const fn = String(findExistingFn);
		expect(fn).to.contain("payload?.serialNo");
		expect(fn).to.contain("payload?.AcsEventInfo?.serialNo");
		expect(fn).to.contain(
			"payload?.EventNotificationAlert?.AccessControllerEvent?.serialNo",
		);
		expect(fn).to.contain("payload?.AccessControllerEvent?.serialNo");
	});

	it("prefers the oldest receivedAt row for a matching serial", () => {
		const fn = String(findExistingFn);
		expect(fn).to.contain('orderBy: { receivedAt: "asc" }');
		expect(fn).not.to.contain('orderBy: { receivedAt: "desc" }');
	});

	it("reuses one attendance ACS searchID per job and only advances searchResultPosition", () => {
		expect(controllerSource).to.contain("const attendanceSearchId = `${jobId}-att`");
		expect(controllerSource).to.contain("searchID: attendanceSearchId");
		expect(controllerSource).to.contain("searchResultPosition: position");
		expect(controllerSource).not.to.contain("searchID: `${jobId}-att-${position}`");
		expect(controllerSource).to.contain(
			"Hikvision ACS snapshot is keyed by searchID",
		);
	});
});
