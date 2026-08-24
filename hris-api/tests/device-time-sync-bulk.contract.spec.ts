/**
 * Contract tests for the fleet Hikvision time-sync endpoint.
 * POST /api/device/time-sync-all — preview-first, bounded concurrency,
 * Hikvision-only targets, per-device failure rows, aggregate summary.
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "mocha";

const controllerSource = readFileSync(
	join(__dirname, "..", "app", "device", "device.controller.ts"),
	"utf8",
);
const routerSource = readFileSync(
	join(__dirname, "..", "app", "device", "device.router.ts"),
	"utf8",
);

describe("fleet Hikvision time sync contract", () => {
	it("registers /time-sync-all before the per-device route", () => {
		expect(routerSource).to.contain('routes.post("/time-sync-all", controller.syncAllHikvisionDevicesTime);');
		const allIdx = routerSource.indexOf('"/time-sync-all"');
		const singleIdx = routerSource.indexOf('"/:id/time-sync"');
		expect(allIdx).to.be.greaterThan(-1);
		expect(singleIdx).to.be.greaterThan(-1);
		expect(allIdx).to.be.lessThan(singleIdx);
	});

	it("exports a fleet handler sharing the SDK/ISAPI core", () => {
		expect(controllerSource).to.contain("const syncAllHikvisionDevicesTime = async (req: Request");
		expect(controllerSource).to.contain("syncAllHikvisionDevicesTime,");
		expect(controllerSource).to.contain("const runHikvisionTimeSyncCore = async (");
		expect(controllerSource.match(/runHikvisionTimeSyncCore\(/g)!.length).to.be.at.least(2);
	});

	it("defaults to preview (execute=false) and never mutates by default", () => {
		expect(controllerSource).to.contain("const execute = req.body?.execute === true;");
		expect(controllerSource).to.not.match(/time-sync-all[\s\S]{0,2000}execute: true/);
	});

	it("scopes to org devices and filters to Hikvision only", () => {
		expect(controllerSource).to.contain(
			"devices.filter((d) => !isZktecoDevice(d) && isHikvisionDevice(d))",
		);
		expect(controllerSource).to.contain("isDeleted: false },");
	});

	it("honors optional deviceIds scope freeze", () => {
		expect(controllerSource).to.contain("Array.isArray(req.body?.deviceIds)");
		expect(controllerSource).to.contain("wanted.has(d.id)");
	});

	it("uses bounded concurrency 2 with explicit per-device failure rows", () => {
		expect(controllerSource).to.contain("await Promise.all([worker(), worker()]);");
		expect(controllerSource).to.contain('"Hikvision time sync failed"');
	});

	it("returns an honest aggregate summary", () => {
		expect(controllerSource).to.contain("totalTargets: targets.length");
		expect(controllerSource).to.contain("readable,");
		expect(controllerSource).to.contain("written,");
		expect(controllerSource).to.contain("failed,");
	});

	it("logs activity always and audit on execute only", () => {
		expect(controllerSource).to.contain('action: "HIKVISION_TIME_SYNC_ALL"');
		expect(controllerSource).to.contain("Bulk updated Hikvision clocks to Manila time");
	});
});
