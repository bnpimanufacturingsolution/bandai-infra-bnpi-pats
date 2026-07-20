import { expect } from "chai";
import { readFileSync } from "node:fs";
import path from "node:path";

const controllerSource = readFileSync(
	path.join(process.cwd(), "app/timesheet/timesheet.controller.ts"),
	"utf8",
);
const helperSource = readFileSync(
	path.join(process.cwd(), "helper/timesheet.helper.ts"),
	"utf8",
);
const zodSource = readFileSync(
	path.join(process.cwd(), "zod/timesheet.zod.ts"),
	"utf8",
);

const getPrepareHelperBlock = () => {
	const start = controllerSource.indexOf("const prepareSubmitBreakdownPersistence = async");
	const end = controllerSource.indexOf("const action = async");
	return controllerSource.slice(start, end);
};

const getSummaryBlock = () => {
	const start = controllerSource.indexOf("const getApprovedEditedDaysSummary = async");
	const end = controllerSource.indexOf("const TIMESHEETLINE_EFFECTIVE_READ_ORDER");
	return controllerSource.slice(start, end);
};

const getRevisionEnrichmentBlock = () => {
	const start = controllerSource.indexOf(
		"const enrichTimesheetBreakdownWithRevisionSummary = async",
	);
	const end = controllerSource.indexOf("const isRevisionWithinSubmissionWindow");
	return controllerSource.slice(start, end);
};

describe("timesheet recent modified days contract", () => {
	it("versions DRAFT employee breakdown edits when days change", () => {
		const block = getPrepareHelperBlock();
		expect(block).to.include('normalizedStatus === "DRAFT"');
		expect(block).to.include("lineVersionMode = \"version\"");
		expect(block).to.include("resolveVersionDayKeys(params.editedDayKeys, changedDays,");
	});

	it("scopes approved edited days summary to timesheet and correction revisions", () => {
		const block = getSummaryBlock();
		expect(block).to.include("timesheetId?: string");
		expect(block).to.include("submittedAt?: Date | string | null");
		expect(block).to.include('ledgerType: "CORRECTION"');
		expect(block).to.include("isRevisionWithinSubmissionWindow");
	});

	it("passes timesheetId and submittedAt from getById", () => {
		expect(controllerSource).to.include("timesheetId: String((timesheet as any).id || \"\")");
		expect(controllerSource).to.include("submittedAt: (timesheet as any).submittedAt || null");
	});

	it("filters breakdown revision enrichment to correction ledger and latest per day", () => {
		const block = getRevisionEnrichmentBlock();
		expect(block).to.include('ledgerType: "CORRECTION"');
		expect(block).to.include("revisionSummaryByDate.get(dayKey)");
		expect(block).to.include("existing.editedAt");
	});

	it("uses business day keys in buildChangedDaysFromBreakdown", () => {
		const fnStart = controllerSource.indexOf("const buildChangedDaysFromBreakdown = (");
		const fnEnd = controllerSource.indexOf("const toRecord = (value: unknown)");
		const block = controllerSource.slice(fnStart, fnEnd);
		expect(block).to.include("resolveBreakdownBusinessDayKey(day)");
	});

	it("returns versionDayKeys from prepareSubmitBreakdownPersistence for changed days", () => {
		const typeStart = controllerSource.indexOf("type SubmitBreakdownPersistenceResult = {");
		const typeEnd = controllerSource.indexOf("const prepareSubmitBreakdownPersistence = async");
		const typeBlock = controllerSource.slice(typeStart, typeEnd);
		const helperBlock = getPrepareHelperBlock();
		expect(typeBlock).to.include("versionDayKeys?: Set<string>");
		expect(helperBlock).to.include("resolveVersionDayKeys(params.editedDayKeys, changedDays,");
	});

	it("accepts editedDayKeys in update and submit schemas", () => {
		expect(zodSource).to.include("EditedDayKeysSchema");
		expect(zodSource).to.include("editedDayKeys: EditedDayKeysSchema");
		expect(zodSource).to.include("SubmitTimesheetSchema");
	});

	it("prefers editedDayKeys over detected changed days for version scope", () => {
		const fnStart = controllerSource.indexOf("const resolveVersionDayKeys = (");
		const fnEnd = controllerSource.indexOf("const buildChangedDaysFromBreakdown = (");
		const block = controllerSource.slice(fnStart, fnEnd);
		expect(block).to.include("if (Array.isArray(editedDayKeys) && editedDayKeys.length)");
		expect(block).to.include("return new Set(editedDayKeys)");
	});

	it("ignores normalization drift in buildChangedDaysFromBreakdown", () => {
		const fnStart = controllerSource.indexOf("const buildChangedDaysFromBreakdown = (");
		const fnEnd = controllerSource.indexOf("const toRecord = (value: unknown)");
		const block = controllerSource.slice(fnStart, fnEnd);
		expect(block).to.include("normalizeAuditDayForComparison");
		expect(controllerSource).to.include("normalizeStatusForComparison");
	});

	it("filters revision summaries to meaningful employee edits", () => {
		expect(controllerSource).to.include("hasEmployeeMeaningfulRevisionChange");
		expect(getRevisionEnrichmentBlock()).to.include(
			"hasEmployeeMeaningfulRevisionChange(changedFields)",
		);
		expect(getSummaryBlock()).to.include("hasEmployeeMeaningfulRevisionChange(changedFields)");
	});

	it("tags and filters employee manual edits only", () => {
		expect(controllerSource).to.include('EMPLOYEE_MANUAL_EDIT_SOURCE = "EMPLOYEE_MANUAL_EDIT"');
		expect(controllerSource).to.include("isEmployeeManualEditLine");
		expect(controllerSource).to.include("manualOnly: params.isEmployeeOwner");
		expect(controllerSource).to.include("isManualEdit: true");
		expect(helperSource).to.include("manualEditDayKeys");
		expect(helperSource).to.include('source: "EMPLOYEE_MANUAL_EDIT"');
	});

	it("passes versionDayKeys into syncTimesheetLinesFromBreakdown", () => {
		expect(controllerSource).to.include("versionDayKeys,");
		const fnStart = helperSource.indexOf("export async function syncTimesheetLinesFromBreakdown");
		const fnEnd = helperSource.indexOf("export async function generateUniqueTimesheetCode");
		const block = helperSource.slice(fnStart, fnEnd);
		expect(block).to.include("versionDayKeys?: Set<string>");
		expect(block).to.include("params.versionDayKeys.has(dateKey)");
	});
});