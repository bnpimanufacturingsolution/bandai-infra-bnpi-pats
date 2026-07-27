import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
	isDm4ApprovedOvertimeWorkbookPath,
	parseApprovedOvertimeWorkbookDateRange,
	resolveMigrationDm4SourceFiles,
} from "../app/migration/migration-dry-run.service";

describe("DM4 source resolve contract", () => {
	const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dm4-source-resolve-"));
	const biometricsPath = path.join(tempRoot, "Biometrics Data_Jun 26 - Jul 10.xlsx");
	const oddOtNamePath = path.join(
		tempRoot,
		"2rptOvertimeDetails - June 26 - July 10, 2026.xlsx",
	);
	const confidentialOtPath = path.resolve(
		__dirname,
		"..",
		"..",
		"confidential-files",
		"2rptOvertimeDetails - June 26 - July 10, 2026.xlsx",
	);

	before(() => {
		// Minimal xlsx zip stubs so collectWorkbookFiles accepts them as files.
		fs.writeFileSync(biometricsPath, "stub");
		fs.writeFileSync(oddOtNamePath, "stub");
	});

	after(() => {
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	it("detects OT by rptOvertimeDetails basename regardless of prefix/suffix", () => {
		expect(isDm4ApprovedOvertimeWorkbookPath(oddOtNamePath)).to.equal(true);
		expect(isDm4ApprovedOvertimeWorkbookPath(biometricsPath)).to.equal(false);
		expect(
			isDm4ApprovedOvertimeWorkbookPath("C:/tmp/2026 rptOvertimeDetails.xlsx"),
		).to.equal(true);
	});

	it("accepts explicit approvedOvertimeFiles even when filename is non-standard", () => {
		const resolution = resolveMigrationDm4SourceFiles([biometricsPath], {
			approvedOvertimeFiles: [oddOtNamePath],
			autoAppendDefaultApprovedOvertime: false,
		});
		expect(resolution.attendanceWorkbookFiles).to.deep.equal([biometricsPath]);
		expect(resolution.approvedOvertimeWorkbookFiles).to.deep.equal([oddOtNamePath]);
	});

	it("does not auto-append default OT when explicit OT option is empty", () => {
		const resolution = resolveMigrationDm4SourceFiles([biometricsPath], {
			approvedOvertimeFiles: [],
			autoAppendDefaultApprovedOvertime: false,
		});
		expect(resolution.attendanceWorkbookFiles).to.deep.equal([biometricsPath]);
		expect(resolution.approvedOvertimeWorkbookFiles).to.deep.equal([]);
	});

	it("classifies OT-only uploads with zero attendance workbooks", () => {
		const resolution = resolveMigrationDm4SourceFiles([], {
			approvedOvertimeFiles: [oddOtNamePath],
			autoAppendDefaultApprovedOvertime: false,
		});
		expect(resolution.attendanceWorkbookFiles).to.deep.equal([]);
		expect(resolution.approvedOvertimeWorkbookFiles).to.deep.equal([oddOtNamePath]);
		expect(resolution.workbookFiles).to.deep.equal([oddOtNamePath]);
	});

	it("ignores missing biometrics paths while keeping a resolved OT workbook", () => {
		const missingBiometrics = path.join(tempRoot, "missing-biometrics.xlsx");
		const resolution = resolveMigrationDm4SourceFiles([missingBiometrics], {
			approvedOvertimeFiles: [oddOtNamePath],
			autoAppendDefaultApprovedOvertime: false,
		});
		expect(resolution.missing).to.include(missingBiometrics);
		expect(resolution.attendanceWorkbookFiles).to.deep.equal([]);
		expect(resolution.approvedOvertimeWorkbookFiles).to.deep.equal([oddOtNamePath]);
	});

	it("parses date range from confidential OT workbook header when present", function () {
		if (!fs.existsSync(confidentialOtPath)) {
			this.skip();
		}
		const range = parseApprovedOvertimeWorkbookDateRange(confidentialOtPath);
		expect(range).to.deep.equal({
			startDate: "2026-06-26",
			endDate: "2026-07-10",
		});
	});

	it("falls back to filename dates for OT workbooks without a readable header", () => {
		const range = parseApprovedOvertimeWorkbookDateRange(oddOtNamePath);
		expect(range).to.deep.equal({
			startDate: "2026-06-26",
			endDate: "2026-07-10",
		});
	});
});
