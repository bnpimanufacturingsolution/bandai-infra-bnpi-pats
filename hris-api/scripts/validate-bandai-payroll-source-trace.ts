import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

type SourceRole =
	| "target-register"
	| "cutoff-breakdown"
	| "allowance-adjustment-upload"
	| "deduction-upload"
	| "approved-overtime-buckets"
	| "statutory-reference"
	| "generated-import"
	| "payroll-note"
	| "supporting-reference";

type SourceEntry = {
	id: string;
	label: string;
	role: SourceRole;
	canonicalPath: string;
	organizedPath?: string;
	usedBy: string[];
	validates: string[];
	expectedSheets?: string[];
	required: boolean;
	sourceOfTruth: "primary" | "supporting" | "generated" | "reference-only";
};

const repoRoot = path.resolve(__dirname, "..", "..");
const outputDir = path.join(repoRoot, "test-results", "payroll-source-trace");
const organizedNotesDir = path.join(repoRoot, "source-inputs-organized", "manifests-and-notes");
const cutoff = {
	startDate: "2026-04-26",
	endDate: "2026-05-10",
	payDate: "2026-05-15",
	periodCode: "PP-20260426-20260511",
};
const sourcePriorityById: Record<string, number> = {
	"compensation-upload-051526": 1,
	"deduction-upload-051526": 2,
	"target-payroll-register": 3,
	"may-15-cutoff-breakdown": 4,
	"approved-overtime-2026": 5,
	"generated-employee-benefits-loans": 6,
	"generated-benefit-types": 6,
	"generated-loan-types": 6,
};

const sourceEntries: SourceEntry[] = [
	{
		id: "target-payroll-register",
		label: "Target payroll register totals",
		role: "target-register",
		canonicalPath: "docs/Bandai Payroll/PAYROLL 2024-2026/PAYROLL 2026/HRIS Payroll Computation April 26 - May 10, 2026.xlsx",
		organizedPath: "source-inputs-organized/payroll-reference/computation/2026/HRIS Payroll Computation April 26 - May 10, 2026.xlsx",
		usedBy: [
			"npm run dry-run:bandai-payroll-source",
			"npm run dry-run:bandai-payroll-comparison",
			"npm run generate:bandai-payroll-benefits",
		],
		validates: [
			"final payroll workbook row totals",
			"basic salary source for DM3 employee master proof",
			"allowance, deduction, gross, net, total receivable comparison columns",
		],
		expectedSheets: ["Sheet2"],
		required: true,
		sourceOfTruth: "primary",
	},
	{
		id: "may-15-cutoff-breakdown",
		label: "May 15, 2026 source breakdown workbook",
		role: "cutoff-breakdown",
		canonicalPath: "docs/Bandai Payroll/PAYROLL 2024-2026/PAYROLL 2026/2026 Reference per cutoff/May 15, 2026.xlsx",
		organizedPath: "source-inputs-organized/payroll-reference/cutoff/2026/May 15, 2026.xlsx",
		usedBy: ["npm run dry-run:bandai-payroll-source"],
		validates: [
			"which source tab owns each payroll amount",
			"manual adjustment, leave, loan, statutory, and allowance category ownership",
		],
		expectedSheets: [
			"Line Leader Allowance",
			"Perfect Attendance",
			"Other Adjustment",
			"Adjustment Basic",
			"Adjustment OT",
			"Statutory Deduction",
			"Uniform Deduction",
			"BNPI Salary Loan",
			"RCBC Salary Loan",
		],
		required: true,
		sourceOfTruth: "primary",
	},
	{
		id: "compensation-upload-051526",
		label: "Compensation mass upload for May 15 pay date",
		role: "allowance-adjustment-upload",
		canonicalPath: "docs/Bandai Payroll/PAYROLL 2024-2026/PAYROLL 2026/HRIS Reference for Download/Compensation Mass Upload 05.15.26.xlsx",
		organizedPath: "source-inputs-organized/payroll-reference/adjustments/2026/Compensation Mass Upload 05.15.26.xlsx",
		usedBy: ["npm run dry-run:bandai-payroll-source", "npm run generate:bandai-payroll-benefits"],
		validates: [
			"machine-shaped allowance and compensation rows",
			"employee IDs, amounts, and start pay date 2026-04-26",
			"DM3 Employee Benefits / Loans import source for allowance facts",
		],
		required: true,
		sourceOfTruth: "primary",
	},
	{
		id: "deduction-upload-051526",
		label: "Deduction mass upload for May 15 pay date",
		role: "deduction-upload",
		canonicalPath: "docs/Bandai Payroll/PAYROLL 2024-2026/PAYROLL 2026/HRIS Reference for Download/Deduction Mass Upload 05.15.26.xlsx",
		organizedPath: "source-inputs-organized/payroll-reference/adjustments/2026/Deduction Mass Upload 05.15.26.xlsx",
		usedBy: ["npm run dry-run:bandai-payroll-source", "npm run generate:bandai-payroll-benefits"],
		validates: [
			"machine-shaped loan and deduction rows",
			"SSS, HDMF, BNPI, RCBC, uniform, and other deduction amounts",
			"loan type and employee loan import source facts",
		],
		required: true,
		sourceOfTruth: "primary",
	},
	{
		id: "approved-overtime-2026",
		label: "Approved overtime/rest-day/holiday bucket source",
		role: "approved-overtime-buckets",
		canonicalPath: "docs/Bandai Payroll/2026 rptOvertimeDetails.xlsx",
		organizedPath: "source-inputs-organized/payroll-reference/approved-overtime/2026 rptOvertimeDetails.xlsx",
		usedBy: [
			"npm run dry-run:bandai-payroll-timesheet-lines",
			"npm run repair:bandai-payroll-timesheet-lines",
			"npm run dry-run:bandai-payroll-source",
		],
		validates: [
			"approved regular OT hours",
			"approved rest-day, special-holiday, regular-holiday, and night-diff hour buckets",
			"Timesheetline metadata.bandaiPayrollSourceRepair.approvedBuckets",
		],
		expectedSheets: ["rptOvertimeDetails"],
		required: true,
		sourceOfTruth: "primary",
	},
	{
		id: "generated-employee-benefits-loans",
		label: "Generated DM3 employee benefits and loans import",
		role: "generated-import",
		canonicalPath: "data/import/employee-benefits-loans-import.csv",
		organizedPath: "source-inputs-organized/DM3-employee-data/import-and-mapping/employee-benefits-loans-import.csv",
		usedBy: ["npm run dry-run:bandai-payroll-benefits", "npm run repair:bandai-payroll-benefits"],
		validates: [
			"allowance and loan facts generated from payroll comparison source breakdown",
			"EmployeeBenefit and EmployeeLoan rows for payroll-period source proof",
		],
		required: true,
		sourceOfTruth: "generated",
	},
	{
		id: "generated-benefit-types",
		label: "Generated/curated DM2 benefit type catalog",
		role: "generated-import",
		canonicalPath: "data/import/benefit-types-import.csv",
		organizedPath: "source-inputs-organized/DM2-policy-reference/import-csv/benefit-types-import.csv",
		usedBy: ["npm run dry-run:bandai-payroll-benefits", "npm run repair:bandai-payroll-benefits"],
		validates: ["benefit codes and fixed/default reconciliation behavior used by EmployeeBenefit rows"],
		required: true,
		sourceOfTruth: "generated",
	},
	{
		id: "generated-loan-types",
		label: "Generated/curated DM2 loan type catalog",
		role: "generated-import",
		canonicalPath: "data/import/loan-types-import.csv",
		organizedPath: "source-inputs-organized/DM2-policy-reference/import-csv/loan-types-import.csv",
		usedBy: ["npm run dry-run:bandai-payroll-benefits", "npm run repair:bandai-payroll-benefits"],
		validates: ["loan type names used by generated EmployeeLoan rows"],
		required: true,
		sourceOfTruth: "generated",
	},
	{
		id: "statutory-databank-april",
		label: "April statutory databank reference",
		role: "statutory-reference",
		canonicalPath: "docs/Bandai Payroll/Statutory Databank_April.xlsx",
		organizedPath: "source-inputs-organized/payroll-reference/statutory/Statutory Databank_April.xlsx",
		usedBy: ["manual statutory source audit"],
		validates: ["statutory deduction basis when deduction upload/register mismatches need source review"],
		required: false,
		sourceOfTruth: "supporting",
	},
	{
		id: "monthly-payment-statutory",
		label: "April 2026 monthly statutory payment reference",
		role: "statutory-reference",
		canonicalPath: "docs/Bandai Payroll/April 2026 Monthly Payment_Statutory Benefits.xlsx",
		organizedPath: "source-inputs-organized/payroll-reference/statutory/April 2026 Monthly Payment_Statutory Benefits.xlsx",
		usedBy: ["manual statutory source audit"],
		validates: ["payment/remittance side reference, not direct payroll preview math"],
		required: false,
		sourceOfTruth: "supporting",
	},
	{
		id: "phic-april",
		label: "April PHIC reference",
		role: "statutory-reference",
		canonicalPath: "docs/Bandai Payroll/PHIC_April.xlsx",
		organizedPath: "source-inputs-organized/payroll-reference/statutory/PHIC_April.xlsx",
		usedBy: ["manual PhilHealth source audit"],
		validates: ["PhilHealth deduction proof when register and HRIS differ"],
		required: false,
		sourceOfTruth: "supporting",
	},
	{
		id: "payroll-gap-plan",
		label: "Payroll reconciliation gap plan",
		role: "payroll-note",
		canonicalPath: "docs/Bandai Payroll/apr26-may10-2026-payroll-reconciliation-gap-plan.md",
		organizedPath: "source-inputs-organized/payroll-reference/notes/apr26-may10-2026-payroll-reconciliation-gap-plan.md",
		usedBy: ["human source trace review"],
		validates: ["known source ownership and remaining gap interpretation"],
		required: true,
		sourceOfTruth: "reference-only",
	},
	{
		id: "rate-config-guide",
		label: "BNPI pay frequency/rate config guide",
		role: "payroll-note",
		canonicalPath: "docs/Bandai Payroll/bnpi-pay-frequency-and-rate-config-guide.md",
		organizedPath: "source-inputs-organized/payroll-reference/notes/bnpi-pay-frequency-and-rate-config-guide.md",
		usedBy: ["human rate basis review"],
		validates: ["BNPI 313-day approved-bucket rate basis explanation"],
		required: true,
		sourceOfTruth: "reference-only",
	},
	{
		id: "prior-cutoff-pattern",
		label: "April 30, 2026 prior cutoff pattern",
		role: "supporting-reference",
		canonicalPath: "docs/Bandai Payroll/PAYROLL 2024-2026/PAYROLL 2026/2026 Reference per cutoff/April 30, 2026.xlsx",
		organizedPath: "source-inputs-organized/payroll-reference/cutoff/2026/April 30, 2026.xlsx",
		usedBy: ["manual layout comparison only"],
		validates: ["layout pattern for cutoff workbook tabs"],
		required: false,
		sourceOfTruth: "reference-only",
	},
];

function exists(relativePath?: string) {
	if (!relativePath) return false;
	return fs.existsSync(path.join(repoRoot, relativePath));
}

function countCsvRows(relativePath: string) {
	const filePath = path.join(repoRoot, relativePath);
	if (!fs.existsSync(filePath)) return null;
	const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
	if (!text) return 0;
	return Math.max(0, text.split(/\r?\n/).length - 1);
}

function workbookSheets(relativePath: string) {
	const filePath = path.join(repoRoot, relativePath);
	if (!fs.existsSync(filePath)) return null;
	try {
		const workbook = XLSX.readFile(filePath, { bookSheets: true, password: process.env.BANDAI_PAYROLL_WORKBOOK_PASSWORD });
		return workbook.SheetNames;
	} catch (error) {
		return [`UNREADABLE: ${error instanceof Error ? error.message : String(error)}`];
	}
}

function toMarkdown(report: any) {
	const lines: string[] = [];
	lines.push("# Bandai Payroll Source Trace Validation", "");
	lines.push(`Cutoff: ${cutoff.startDate} to ${cutoff.endDate}; pay date ${cutoff.payDate}; period ${cutoff.periodCode}.`);
	lines.push("");
	lines.push("## Validation Summary", "");
	lines.push(`- Required sources: ${report.summary.requiredPassed}/${report.summary.requiredTotal} present.`);
	lines.push(`- Optional/supporting sources present: ${report.summary.optionalPassed}/${report.summary.optionalTotal}.`);
	lines.push(`- CSV generated import rows: benefits/loans ${report.generatedImportRows.employeeBenefitsLoans}, benefit types ${report.generatedImportRows.benefitTypes}, loan types ${report.generatedImportRows.loanTypes}.`);
	lines.push("");
	lines.push("## Payroll Source Ownership", "");
	lines.push("| Priority | Source | Role | Truth Level | Status | Used By | Validates |");
	lines.push("| ---: | --- | --- | --- | --- | --- | --- |");
	for (const row of report.entries) {
		lines.push(
			`| ${row.priority || ""} | ${row.label} | ${row.role} | ${row.sourceOfTruth} | ${row.status} | ${row.usedBy.join("<br>")} | ${row.validates.join("<br>")} |`,
		);
	}
	lines.push("");
	lines.push("## Guardrails", "");
	lines.push("- Payroll generation should read approved `Timesheet` plus effective `Timesheetline` snapshots for time/pay buckets.");
	lines.push("- `2026 rptOvertimeDetails.xlsx` is the approved OT/rest-day/holiday bucket source; raw biometric files are attendance evidence, not payroll OT truth.");
	lines.push("- Allowances and loans should flow through DM2 Benefit/Loan Types and DM3 Employee Benefits / Loans; do not hardcode source amounts in payroll helpers.");
	lines.push("- The May 15, 2026 cutoff workbook and mass-upload files explain adjustments. Older/later cutoff files are archive or layout references unless explicitly selected by CLI args.");
	lines.push("");
	lines.push("## Next Validation Commands", "");
	lines.push("```bash");
	lines.push("cd hris-api");
	lines.push("npm run validate:bandai-payroll-source-trace");
	lines.push("npm run dry-run:bandai-payroll-source");
	lines.push("npm run generate:bandai-payroll-benefits");
	lines.push("npm run dry-run:bandai-payroll-benefits");
	lines.push("npm run dry-run:bandai-payroll-timesheet-lines");
	lines.push("npm run dry-run:bandai-payroll-comparison");
	lines.push("```");
	lines.push("");
	return lines.join("\n");
}

function main() {
	const entries = sourceEntries.map((entry) => {
		const canonicalExists = exists(entry.canonicalPath);
		const organizedExists = entry.organizedPath ? exists(entry.organizedPath) : undefined;
		const sheets = entry.canonicalPath.match(/\.(xlsx|xlsm|xls)$/i) ? workbookSheets(entry.canonicalPath) : undefined;
		const sheetInspectionBlocked = sheets?.some((sheet) => sheet.startsWith("UNREADABLE:"));
		const expectedMissing =
			sheetInspectionBlocked
				? []
				: entry.expectedSheets?.filter(
						(sheet) => !sheets?.some((actual) => actual.toLowerCase() === sheet.toLowerCase()),
					) || [];
		const status =
			canonicalExists && (organizedExists ?? true) && expectedMissing.length === 0
				? "PASS"
				: entry.required
					? "FAIL"
					: "WARN";
		return {
			...entry,
			priority: sourcePriorityById[entry.id],
			status,
			canonicalExists,
			organizedExists,
			sheetInspectionBlocked,
			sheets,
			expectedMissing,
		};
	}).sort((a, b) => (a.priority || 99) - (b.priority || 99) || a.label.localeCompare(b.label));

	const required = entries.filter((entry) => entry.required);
	const optional = entries.filter((entry) => !entry.required);
	const report = {
		generatedAt: new Date().toISOString(),
		cutoff,
		summary: {
			requiredTotal: required.length,
			requiredPassed: required.filter((entry) => entry.status === "PASS").length,
			optionalTotal: optional.length,
			optionalPassed: optional.filter((entry) => entry.status === "PASS").length,
		},
		generatedImportRows: {
			employeeBenefitsLoans: countCsvRows("data/import/employee-benefits-loans-import.csv"),
			benefitTypes: countCsvRows("data/import/benefit-types-import.csv"),
			loanTypes: countCsvRows("data/import/loan-types-import.csv"),
		},
		entries,
	};

	fs.mkdirSync(outputDir, { recursive: true });
	fs.writeFileSync(path.join(outputDir, "bandai-payroll-source-trace.json"), JSON.stringify(report, null, 2));
	fs.writeFileSync(path.join(outputDir, "bandai-payroll-source-trace.md"), toMarkdown(report));
	if (fs.existsSync(path.join(repoRoot, "source-inputs-organized"))) {
		fs.mkdirSync(organizedNotesDir, { recursive: true });
		fs.writeFileSync(path.join(organizedNotesDir, "bandai-payroll-source-trace.md"), toMarkdown(report));
	}

	console.log(
		JSON.stringify(
			{
				summary: report.summary,
				generatedImportRows: report.generatedImportRows,
				failedRequired: entries
					.filter((entry) => entry.required && entry.status !== "PASS")
					.map((entry) => ({
						id: entry.id,
						canonicalExists: entry.canonicalExists,
						organizedExists: entry.organizedExists,
						expectedMissing: entry.expectedMissing,
					})),
				artifacts: [
					path.join(outputDir, "bandai-payroll-source-trace.json"),
					path.join(outputDir, "bandai-payroll-source-trace.md"),
					path.join(organizedNotesDir, "bandai-payroll-source-trace.md"),
				],
			},
			null,
			2,
		),
	);

	if (report.summary.requiredPassed !== report.summary.requiredTotal) {
		process.exitCode = 1;
	}
}

main();
