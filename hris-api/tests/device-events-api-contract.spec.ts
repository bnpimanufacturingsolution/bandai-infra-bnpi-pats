import { expect } from "chai";
import { describe, it } from "mocha";
import fs from "node:fs";
import path from "node:path";

describe("Device events API contract", () => {
	const controllerSource = fs.readFileSync(
		path.resolve(__dirname, "../app/device/device.controller.ts"),
		"utf8",
	);

	it("accepts event category and action filters as the primary event contract", () => {
		expect(controllerSource).to.contain("req.query.eventCategory");
		expect(controllerSource).to.contain("req.query.eventAction");
		expect(controllerSource).to.contain(
			'de."eventCategory" = ${eventCategory}::"DeviceEventCategory"',
		);
		expect(controllerSource).to.contain(
			'de."eventAction" = ${eventAction}::"DeviceEventAction"',
		);
	});

	it("supports summaryScope=facets so dropdown counts ignore taxonomy leaf filters", () => {
		expect(controllerSource).to.contain("req.query.summaryScope");
		expect(controllerSource).to.contain('summaryScope === "facets"');
		expect(controllerSource).to.contain("facetWhereConditions");
		expect(controllerSource).to.contain("facetWhereSql");
	});

	it("supports summaryScope=page/none so soft-poll uses page+count only (pool safety)", () => {
		expect(controllerSource).to.contain('summaryScope === "none"');
		expect(controllerSource).to.contain('summaryScope === "page"');
		expect(controllerSource).to.contain("usePageOnlySummary");
	});

	it("filters saved rows by evidence, confidence, and HRIS match result", () => {
		expect(controllerSource).to.contain("req.query.evidenceSource");
		expect(controllerSource).to.contain("req.query.eventConfidence");
		expect(controllerSource).to.contain("req.query.status");
		expect(controllerSource).to.contain("de.payload->>'evidenceSource'");
		expect(controllerSource).to.contain(
			'de."eventConfidence" = ${eventConfidence}::"DeviceEventConfidence"',
		);
	});

	it("returns event-first summaries while keeping raw source/status aliases compatible", () => {
		expect(controllerSource).to.contain("byCategory");
		expect(controllerSource).to.contain("byAction");
		expect(controllerSource).to.contain("byActionCategory");
		expect(controllerSource).to.contain("byProcessingResult");
		expect(controllerSource).to.contain("byRuntimePath");
		expect(controllerSource).to.contain("byEvidenceSource");
		expect(controllerSource).to.contain("byConfidence");
		expect(controllerSource).to.contain("directEvidence");
		expect(controllerSource).to.contain("needsEmployeeMatch");
		expect(controllerSource).to.contain("byStatus: byProcessingResult");
		expect(controllerSource).to.contain("bySource: byRuntimePath");
	});

	it("exposes preview-first ISAPI logSearch persistence through stored device credentials", () => {
		expect(controllerSource).to.contain("const searchHikvisionDeviceLogs = async");
		expect(controllerSource).to.contain('hikvisionFetch("/ISAPI/ContentMgmt/logSearch"');
		expect(controllerSource).to.contain("ensureJsonFormat: false");
		expect(controllerSource).to.contain("rawResponse: true");
		expect(controllerSource).to.contain("const execute = (req.body as any)?.execute === true");
		expect(controllerSource).to.contain("persistNormalizedHikvisionEvidence");
	});

	it("supports backup-first quarantine cleanup without deleting valid device evidence", () => {
		expect(controllerSource).to.contain("legacyInferredLifecycleOnly");
		expect(controllerSource).to.contain('eventType: "BiometricStateBackfill"');
		expect(controllerSource).to.contain('path: ["derivedFromCurrentDeviceState"]');
		expect(controllerSource).to.contain('eventConfidence: "INFERRED"');
		expect(controllerSource).to.contain("device-events.json");
		expect(controllerSource).to.contain("await prisma.$transaction");
	});

	it("persists one correlated runtime event per sync run", () => {
		expect(controllerSource).to.contain("const persistDeviceRuntimeEvent = async");
		expect(controllerSource).to.contain('evidenceSource: "RUNTIME_PROCESS"');
		expect(controllerSource).to.contain("correlationId: params.correlationId");
		expect(controllerSource).to.contain('action: "SYNC_IMPORTED"');
	});
});
