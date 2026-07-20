import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";

const controllerSource = readFileSync(
	path.join(process.cwd(), "app/timesheet/timesheet.controller.ts"),
	"utf8",
);

const getSummaryBlock = () => {
	const start = controllerSource.indexOf("const getApprovedEditedDaysSummary = async");
	const end = controllerSource.indexOf("const invalidateTimesheetCaches = async");
	return controllerSource.slice(start, end);
};

const getRevisionEnrichmentBlock = () => {
	const start = controllerSource.indexOf(
		"const enrichTimesheetBreakdownWithRevisionSummary = async",
	);
	const end = controllerSource.indexOf("const getApprovedEditedDaysSummary = async");
	return controllerSource.slice(start, end);
};

describe("timesheet edited days summary contract", () => {
	it("builds approved edited day items from effective revision pairs", () => {
		const block = getSummaryBlock();

		expect(block).to.include("isEffective: true");
		expect(block).to.include("supersedesLineId: { not: null }");
		expect(block).to.include("normalizeLedgerDayPreview(after)");
		expect(block).to.include("buildRevisionFieldChanges(before, after)");
		expect(block).to.include("detectChangeType(before, after)");
	});

	it("dedupes historical ineffective rows without duplicating effective revision dates", () => {
		const block = getSummaryBlock();

		expect(block).to.include("isEffective: false");
		expect(block).to.include("orphanedHistoricalRows");
		expect(block).to.include("supersedingLineByPreviousId");
		expect(block).to.include("itemsByDate.has(dayKey)");
	});

	it("uses business day keys when enriching breakdown revision summaries", () => {
		const block = getRevisionEnrichmentBlock();

		expect(block).to.include("resolveLineBusinessDayKey(currentLine)");
		expect(block).to.include("resolveBreakdownBusinessDayKey(day)");
	});

	it("includes changedFields on approved edited day summary items", () => {
		const block = getSummaryBlock();

		expect(block).to.include("changedFields,");
		expect(block).to.include("buildRevisionFieldChanges(before, after)");
	});
});