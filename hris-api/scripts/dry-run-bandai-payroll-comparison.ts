import path from "path";
import { PrismaClient } from "../generated/prisma";
import {
	buildBandaiPayrollSourceEvidence,
	parseBandaiPayrollWorkbook,
	runBandaiPayrollComparison,
	writeBandaiPayrollSourceEvidenceMarkdown,
	writeComparisonCsv,
	writeComparisonMarkdown,
	writeWorkbookPreviewMarkdown,
	writeJson,
	writeText,
} from "../helper/payroll-reconciliation.helper";

const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.resolve(repoRoot, "test-results", "payroll-bandai-analysis");
const workbookArg = process.argv.find((arg) => arg.startsWith("--workbook="))?.split("=")[1];
const passwordArg = process.argv.find((arg) => arg.startsWith("--password="))?.split("=")[1] || "9090";
const organizationId = process.argv.find((arg) => arg.startsWith("--organizationId="))?.split("=")[1];
const sourceOnly = process.argv.includes("--source-only");
const referenceWorkbookArg = process.argv.find((arg) => arg.startsWith("--reference-workbook="))?.split("=")[1];
const compensationUploadArg = process.argv.find((arg) => arg.startsWith("--compensation-upload="))?.split("=")[1];
const deductionUploadArg = process.argv.find((arg) => arg.startsWith("--deduction-upload="))?.split("=")[1];
const overtimeWorkbookArg = process.argv.find((arg) => arg.startsWith("--overtime-workbook="))?.split("=")[1];
const dbUrl = process.env.PG_DATABASE_URL || process.env.DATABASE_URL || process.env.WRITE_DATABASE_URL || "";

const defaultReferenceWorkbook = path.join(
	repoRoot,
	"docs",
	"Bandai Payroll",
	"PAYROLL 2024-2026",
	"PAYROLL 2026",
	"2026 Reference per cutoff",
	"May 15, 2026.xlsx",
);
const defaultCompensationUpload = path.join(
	repoRoot,
	"docs",
	"Bandai Payroll",
	"PAYROLL 2024-2026",
	"PAYROLL 2026",
	"HRIS Reference for Download",
	"Compensation Mass Upload 05.15.26.xlsx",
);
const defaultDeductionUpload = path.join(
	repoRoot,
	"docs",
	"Bandai Payroll",
	"PAYROLL 2024-2026",
	"PAYROLL 2026",
	"HRIS Reference for Download",
	"Deduction Mass Upload 05.15.26.xlsx",
);
const defaultOvertimeWorkbook = path.join(
	repoRoot,
	"docs",
	"Bandai Payroll",
	"2026 rptOvertimeDetails.xlsx",
);

async function main() {
	const analysis = parseBandaiPayrollWorkbook({
		workbookPath: workbookArg,
		password: passwordArg,
		outputDir,
	});

	writeJson(path.join(outputDir, "payroll-workbook-structure.json"), analysis);
	writeText(path.join(outputDir, "payroll-workbook-preview.md"), writeWorkbookPreviewMarkdown(analysis));

	if (sourceOnly) {
		const sourceEvidence = buildBandaiPayrollSourceEvidence({
			analysis,
			password: passwordArg,
			referenceWorkbookPath: referenceWorkbookArg || defaultReferenceWorkbook,
			compensationUploadPath: compensationUploadArg || defaultCompensationUpload,
			deductionUploadPath: deductionUploadArg || defaultDeductionUpload,
			overtimeWorkbookPath: overtimeWorkbookArg || defaultOvertimeWorkbook,
		});
		writeJson(path.join(outputDir, "payroll-source-evidence.json"), sourceEvidence);
		writeText(
			path.join(outputDir, "payroll-source-evidence.md"),
			writeBandaiPayrollSourceEvidenceMarkdown(sourceEvidence),
		);
		console.log(
			JSON.stringify(
				{
					mode: "source-only",
					detectedCutoff: analysis.detectedCutoff,
					payrollRows: analysis.rows.length,
					sourceCoverage: sourceEvidence.sourceCoverage,
					artifacts: [
						path.join(outputDir, "payroll-workbook-structure.json"),
						path.join(outputDir, "payroll-workbook-preview.md"),
						path.join(outputDir, "payroll-source-evidence.json"),
						path.join(outputDir, "payroll-source-evidence.md"),
					],
				},
				null,
				2,
			),
		);
		return;
	}

	const prisma = new PrismaClient();
	try {
		const comparison = await runBandaiPayrollComparison({
			prisma,
			analysis,
			dbUrl,
			organizationId,
		});

		writeJson(path.join(outputDir, "payroll-comparison-results.json"), comparison);
		writeText(path.join(outputDir, "payroll-comparison-summary.md"), writeComparisonMarkdown(comparison));
		writeComparisonCsv(path.join(outputDir, "payroll-comparison-results.csv"), comparison);

		console.log(
			JSON.stringify(
				{
					dbName: comparison.metadata.dbName,
					detectedCutoff: comparison.metadata.detectedCutoff,
					payrollPeriod: comparison.metadata.payrollPeriod,
					summary: comparison.summary,
					nextCommands: [
						"npm run show:bandai-payroll-matches",
						"npm run show:bandai-payroll-problems",
						"npm run show:bandai-payroll-payslip-problems",
						"npm run show:bandai-payroll-repair-plan",
						"npm run dry-run:bandai-payroll-timesheet-lines",
					],
					artifacts: [
						path.join(outputDir, "payroll-workbook-structure.json"),
						path.join(outputDir, "payroll-workbook-preview.md"),
						path.join(outputDir, "payroll-comparison-results.json"),
						path.join(outputDir, "payroll-comparison-summary.md"),
						path.join(outputDir, "payroll-comparison-results.csv"),
					],
				},
				null,
				2,
			),
		);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.stack || error.message : error);
	process.exit(1);
});
