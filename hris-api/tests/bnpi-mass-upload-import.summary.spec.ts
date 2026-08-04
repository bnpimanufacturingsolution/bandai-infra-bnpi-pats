import { expect } from "chai";
import {
	buildDm4UploadActivityFromRunResult,
	buildMassUploadReportCsv,
	finalizeMassUploadSummary,
	MASS_UPLOAD_HTTP_ERROR_CAP,
	presentDm4MassUploadImportLog,
	resolveMassUploadImportStatus,
} from "../app/migration/bnpi-mass-upload-import.service";

describe("BNPI mass upload import summary helpers", () => {
	it("resolves completed / partial / failed statuses", () => {
		expect(
			resolveMassUploadImportStatus({ total: 2, created: 2, updated: 0, failed: 0 }),
		).to.equal("completed");
		expect(
			resolveMassUploadImportStatus({ total: 3, created: 1, updated: 1, failed: 1 }),
		).to.equal("partial");
		expect(
			resolveMassUploadImportStatus({ total: 2, created: 0, updated: 0, failed: 2 }),
		).to.equal("failed");
		expect(
			resolveMassUploadImportStatus({ total: 0, created: 0, updated: 0, failed: 0 }),
		).to.equal("failed");
	});

	it("maps COMPLETED DM4 biometrics runs to completed activity (not fake failed)", () => {
		// Mirrors the bug: only sourceWorkbookCount/attendance proof, no mass-upload created/updated.
		const activity = buildDm4UploadActivityFromRunResult({
			resultStatus: "COMPLETED",
			counts: {
				matchedEmployees: 2212,
				attendanceRowsFound: 21972,
				sourceWorkbookCount: 1,
				timesheetlineRowsFound: 20610,
				materializedMissingLines: 2740,
				approvedOvertimeWorkbookCount: 0,
			},
			proofJson: {
				guardrails: { otOnly: false },
				phase3DbProof: {
					attendanceRowsFound: 21972,
					timesheetlineRowsFound: 20610,
				},
			},
		});
		expect(activity.status).to.equal("completed");
		expect(activity.failed).to.equal(0);
		expect(activity.errors).to.deep.equal([]);
		expect(activity.created + activity.updated).to.be.greaterThan(0);
		expect(activity.total).to.be.greaterThan(0);
		expect(activity.results[0]?.action).to.not.equal("failed");
		expect(activity.otOnly).to.equal(false);
	});

	it("maps COMPLETED DM4 with explicit write counts", () => {
		const activity = buildDm4UploadActivityFromRunResult({
			resultStatus: "COMPLETED",
			counts: {
				sourceWorkbookCount: 1,
				selectedRowsTotal: 100,
				created: 40,
				updated: 60,
				failed: 0,
				attendanceRowsFound: 100,
			},
			proofJson: { guardrails: { otOnly: false } },
		});
		expect(activity.status).to.equal("completed");
		expect(activity.created).to.equal(40);
		expect(activity.updated).to.equal(60);
		expect(activity.total).to.equal(100);
		expect(activity.failed).to.equal(0);
	});

	it("maps BLOCKED DM4 runs to failed activity", () => {
		const activity = buildDm4UploadActivityFromRunResult({
			resultStatus: "BLOCKED",
			counts: { sourceWorkbookCount: 0 },
			proofJson: {},
			errorMessage: "No DM4 workbook files were found.",
		});
		expect(activity.status).to.equal("failed");
		expect(activity.failed).to.be.greaterThan(0);
		expect(activity.errors[0]?.message).to.include("No DM4 workbook");
	});

	it("maps OT-only COMPLETED runs with line updates", () => {
		const activity = buildDm4UploadActivityFromRunResult({
			resultStatus: "COMPLETED",
			counts: {
				attendanceWorkbookCount: 0,
				approvedOvertimeWorkbookCount: 1,
				approvedOvertimePlannedLineUpdates: 12,
			},
			proofJson: {
				mode: "OT_ONLY_SKIP_ATTENDANCE",
				guardrails: { otOnly: true },
				approvedOvertimeRepair: { plannedLineUpdates: 12 },
			},
		});
		expect(activity.otOnly).to.equal(true);
		expect(activity.status).to.equal("completed");
		expect(activity.updated).to.equal(12);
		expect(activity.failed).to.equal(0);
	});

	it("repairs misclassified persisted DM4 activity rows for presentation", () => {
		const repaired = presentDm4MassUploadImportLog({
			id: "log1",
			kind: "dm4-workbook",
			status: "failed",
			total: 1,
			created: 0,
			updated: 0,
			failed: 0,
			summaryJson: {
				runStatus: "COMPLETED",
				otOnly: false,
				counts: {
					sourceWorkbookCount: 1,
					attendanceRowsFound: 21972,
					timesheetlineRowsFound: 20610,
					materializedMissingLines: 2740,
				},
				attendanceRowsFound: 21972,
				timesheetlineRowsFound: 20610,
			},
			errorsJson: [{ row: 0, message: "DM4 import failed or blocked." }],
			resultsJson: [{ row: 1, code: "DM4", action: "failed", message: "0 created" }],
		});
		expect(repaired.status).to.equal("completed");
		expect(repaired.failed).to.equal(0);
		expect(repaired.created + repaired.updated).to.be.greaterThan(0);
		expect(repaired.errorsJson).to.deep.equal([]);
		expect(repaired.resultsJson[0]?.action).to.not.equal("failed");
	});

	it("does not rewrite true DM4 failures", () => {
		const kept = presentDm4MassUploadImportLog({
			id: "log2",
			kind: "dm4-workbook",
			status: "failed",
			total: 0,
			created: 0,
			updated: 0,
			failed: 1,
			summaryJson: {
				runStatus: "BLOCKED",
				counts: {},
			},
			errorsJson: [{ row: 0, message: "No DM4 workbook files were found." }],
		});
		expect(kept.status).to.equal("failed");
		expect(kept.failed).to.equal(1);
	});

	it("finalizes HTTP-capped errors and full errorTotal", () => {
		const allErrors = Array.from({ length: MASS_UPLOAD_HTTP_ERROR_CAP + 5 }, (_, i) => ({
			row: i + 2,
			employeeId: `0${1000 + i}`,
			message: `fail ${i}`,
		}));
		const allResults = [
			{
				row: 2,
				employeeId: "01001",
				code: "LLA",
				amount: 250,
				action: "created" as const,
				periodCode: "PP-TEST",
			},
		];
		const state = {
			summary: {
				kind: "compensation" as const,
				total: allErrors.length + allResults.length,
				created: 1,
				updated: 0,
				skipped: 0,
				failed: allErrors.length,
				errors: [],
				results: [],
				periodCodes: ["PP-TEST"],
			},
			allErrors,
			allResults,
		};
		const summary = finalizeMassUploadSummary(state, {
			sourceFilename: "Compensation Mass Upload.xlsx",
			startedAt: new Date("2026-08-04T01:00:00.000Z"),
			finishedAt: new Date("2026-08-04T01:00:02.000Z"),
		});
		expect(summary.status).to.equal("partial");
		expect(summary.errorTotal).to.equal(allErrors.length);
		expect(summary.errors).to.have.length(MASS_UPLOAD_HTTP_ERROR_CAP);
		expect(summary.errorsTruncated).to.equal(true);
		expect(summary.resultTotal).to.equal(1);
		expect(summary.results).to.have.length(1);
		expect(summary.results?.[0]?.employeeId).to.equal("01001");
		expect(summary.sourceFilename).to.equal("Compensation Mass Upload.xlsx");
		expect(summary.durationMs).to.equal(2000);
	});

	it("builds CSV report with failure and success sections", () => {
		const csv = buildMassUploadReportCsv({
			kind: "compensation",
			errors: [
				{
					row: 5,
					employeeId: "01466",
					code: "LLA",
					field: "EmployeeID",
					message: "Employee 01466 was not found.",
				},
			],
			results: [
				{
					row: 2,
					employeeId: "01360",
					code: "ARP",
					amount: 500,
					action: "created",
					periodCode: "PP-2026-07-11",
				},
			],
		});
		expect(csv).to.include("section,row,employeeId,code");
		expect(csv).to.include("failure,5,01466,LLA");
		expect(csv).to.include("Employee 01466 was not found.");
		expect(csv).to.include("success,2,01360,ARP,500");
		expect(csv).to.include("created");
	});
});
