/**
 * Contract tests: overtime metrics Agency/Direct split (spec gap M1.5).
 */
import { expect } from "chai";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "mocha";

const helperSource = readFileSync(
	join(__dirname, "..", "helper", "overtime-metrics.helper.ts"),
	"utf8",
);
const controllerSource = readFileSync(
	join(__dirname, "..", "app", "metrics", "metrics.controller.ts"),
	"utf8",
);

describe("overtime metrics labor split contract", () => {
	it("computes an always-present direct/agency split over the unfiltered set", () => {
		expect(helperSource).to.contain("split: {");
		expect(helperSource).to.contain('direct: roundSplit(overtimeStats.filter((s) => s.workforceSource === "DIRECT"))');
		expect(helperSource).to.contain('agency: roundSplit(overtimeStats.filter((s) => s.workforceSource === "AGENCY"))');
	});

	it("treats DIRECT as not-AGENCY (missing source counts as Direct)", () => {
		expect(helperSource).to.contain('String(value || "").trim().toUpperCase() === "AGENCY" ? "AGENCY" : "DIRECT"');
	});

	it("supports an optional workforceSource filter without breaking the default", () => {
		expect(helperSource).to.contain("workforceSource?: string");
		expect(helperSource).to.match(/workforceSource === "AGENCY"\s*\?\s*overtimeStats\.filter/);
		expect(helperSource).to.contain("employees: filteredStats");
	});

	it("controller forwards the workforceSource filter and returns a split on empty org", () => {
		expect(controllerSource).to.contain("whereFilter.workforceSource");
		expect(controllerSource).to.contain("split: {");
	});
});
