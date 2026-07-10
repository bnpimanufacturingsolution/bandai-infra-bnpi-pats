import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";

describe("Device events API contract", () => {
	const controllerSource = fs.readFileSync(
		path.resolve(__dirname, "../app/device/device.controller.ts"),
		"utf8",
	);

	it("accepts event category and action filters as the primary event contract", () => {
		expect(controllerSource).to.contain('req.query.eventCategory');
		expect(controllerSource).to.contain('req.query.eventAction');
		expect(controllerSource).to.contain('de."eventCategory" = ${eventCategory}::"DeviceEventCategory"');
		expect(controllerSource).to.contain('de."eventAction" = ${eventAction}::"DeviceEventAction"');
	});

	it("returns event-first summaries while keeping raw source/status aliases compatible", () => {
		expect(controllerSource).to.contain("byCategory");
		expect(controllerSource).to.contain("byAction");
		expect(controllerSource).to.contain("byProcessingResult");
		expect(controllerSource).to.contain("byRuntimePath");
		expect(controllerSource).to.contain("byStatus: byProcessingResult");
		expect(controllerSource).to.contain("bySource: byRuntimePath");
	});
});
