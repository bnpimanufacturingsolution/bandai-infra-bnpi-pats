import { expect } from "chai";
import {
	buildMassUploadReportCsv,
	finalizeMassUploadSummary,
	MASS_UPLOAD_HTTP_ERROR_CAP,
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
