import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readAppFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("admin Hikvision time-sync UI contract", () => {
	it("exposes preview-then-write Update time on the device console", () => {
		const manage = readAppFile("app/routes/admin/devices/manage.tsx");
		const deviceHooks = readAppFile("app/lib/hooks/useDevices.ts");
		const deviceService = readAppFile("app/services/devices.service.ts");
		const deviceController = readAppFile("../hris-api/app/device/device.controller.ts");
		const deviceRouter = readAppFile("../hris-api/app/device/device.router.ts");

		expect(manage).toContain("Update Hikvision time");
		expect(manage).toContain("Preview time");
		expect(manage).toContain("useHikvisionDeviceTimeSync");
		expect(manage).toContain("execute: false");
		expect(manage).toContain("execute: true");
		expect(manage).toContain("<Clock3");
		expect(deviceHooks).toContain("useHikvisionDeviceTimeSync");
		expect(deviceService).toContain("/time-sync");
		expect(deviceRouter).toContain('"/:id/time-sync"');
		expect(deviceController).toContain("syncHikvisionDeviceTime");
		expect(deviceController).toContain("execute === true");
		expect(deviceController).toContain("HIKVISION_MANILA_TIME_ZONE");
		expect(deviceController).toContain("runHikvisionDeviceTimeOnVm");
		expect(manage).toContain("SDK (HCNetSDK STDXML)");
	});
});
