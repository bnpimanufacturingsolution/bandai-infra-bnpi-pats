import * as fs from "fs";
import * as path from "path";

type SourceBreakdown = {
	label: string;
	value: number;
	sourceCell?: string;
};

type ComparisonRow = {
	employeeCode: string;
	employeeName: string;
	rowNumber: number;
	sheetName: string;
	fields: Array<{
		field: string;
		workbookValue?: number | string | null;
		hrisValue?: number | string | null;
		difference?: number;
		sourceBreakdown?: SourceBreakdown[];
	}>;
};

type ComparisonFile = {
	metadata?: {
		detectedCutoff?: {
			startDate: string;
			endDate: string;
		};
	};
	rows: ComparisonRow[];
};

const repoRoot = path.resolve(__dirname, "..", "..");
const defaultComparisonPath = path.join(
	repoRoot,
	"test-results",
	"payroll-bandai-analysis",
	"payroll-comparison-results.json",
);
const outputPath = path.join(repoRoot, "data", "import", "employee-benefits-loans-import.csv");
const loanTypesOutputPath = path.join(repoRoot, "data", "import", "loan-types-import.csv");

const benefitCodeByWorkbookLabel: Record<string, string> = {
	"De Minimis Allowance": "DMA",
	"HYS Meal Allowance": "HYS",
	"Line Leader Allowance": "LLA",
	"Meal Allowance": "MLA",
	"OB Allowance": "OBA",
	"OT Meal Allowance": "OTM",
	"Overtime Meal Allownce": "OTM",
	"Other Compensation": "OAD",
	"Perfect Attendance": "PFA",
	"Adjustment OT/ND": "AON",
};

const deductionBenefitCodeByWorkbookLabel: Record<string, string> = {
	"Modified HDMF 2": "MHDMF2",
	"Uniform Deduction": "UFD",
};
const leavePayBenefitCode = "LVP";

const loanTypeByWorkbookLabel: Record<string, { name: string; category: string; description: string }> = {
	"BNPI Emergency Loan": {
		name: "BNPI Emergency Loan",
		category: "EMERGENCY_LOAN",
		description: "BNPI payroll workbook emergency loan deduction",
	},
	"BNPI Salary Loan": {
		name: "BNPI Salary Loan",
		category: "SALARY_LOAN",
		description: "BNPI payroll workbook salary loan deduction",
	},
	"RCBC Loan": {
		name: "RCBC Loan",
		category: "OTHER",
		description: "BNPI payroll workbook RCBC loan deduction",
	},
	"HDMF Calamity Loan": {
		name: "HDMF Calamity Loan",
		category: "PAGIBIG_LOAN",
		description: "Pag-IBIG/HDMF calamity loan payroll deduction",
	},
	"HDMF Salary Loan": {
		name: "HDMF Salary Loan",
		category: "PAGIBIG_LOAN",
		description: "Pag-IBIG/HDMF salary loan payroll deduction",
	},
	"SSS Calamity Loan": {
		name: "SSS Calamity Loan",
		category: "SSS_LOAN",
		description: "SSS calamity loan payroll deduction",
	},
	"SSS Emergency Loan": {
		name: "SSS Emergency Loan",
		category: "SSS_LOAN",
		description: "SSS emergency loan payroll deduction",
	},
	"SSS Salary Loan": {
		name: "SSS Salary Loan",
		category: "SSS_LOAN",
		description: "SSS salary loan payroll deduction",
	},
	"SSS Loan Restructuring Program": {
		name: "SSS Loan Restructuring Program",
		category: "SSS_LOAN",
		description: "SSS loan restructuring program payroll deduction",
	},
};

function argValue(name: string, fallback: string) {
	const prefix = `--${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
}

function csvCell(value: unknown) {
	const text = String(value ?? "");
	if (/[",\r\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

function main() {
	const comparisonPath = path.resolve(argValue("comparison", defaultComparisonPath));
	const comparison = JSON.parse(fs.readFileSync(comparisonPath, "utf8")) as ComparisonFile;
	const startDate = comparison.metadata?.detectedCutoff?.startDate || "";
	const endDate = comparison.metadata?.detectedCutoff?.endDate || "";
	const rows: string[][] = [
		["EMP_ID", "TYPE", "CODE_OR_NAME", "AMOUNT", "PAYROLL_PERIOD_CODE", "START_DATE", "END_DATE", "INSTALLMENTS", "STATUS", "NOTES"],
	];
	const seen = new Set<string>();
	let skippedUnknownLabels = 0;
	const loanTypesUsed = new Set<string>();

	for (const row of comparison.rows) {
		const allowanceField = row.fields.find((field) => field.field === "allowances");
		for (const source of allowanceField?.sourceBreakdown || []) {
			if (!source.value || source.value <= 0) continue;
			const code = benefitCodeByWorkbookLabel[source.label];
			if (!code) {
				skippedUnknownLabels += 1;
				continue;
			}
			const key = `${row.employeeCode}:${code}:${source.value}:${source.sourceCell || ""}`;
			if (seen.has(key)) continue;
			seen.add(key);
			rows.push([
				row.employeeCode,
				"BENEFIT",
				code,
				String(source.value),
				"",
				startDate,
				endDate,
				"1",
				"ACTIVE",
				[
					"BNPI payroll workbook allowance",
					source.label,
					row.sheetName,
					`row ${row.rowNumber}`,
					source.sourceCell,
				]
					.filter(Boolean)
					.join(" | "),
			]);
		}

		const loanField = row.fields.find((field) => field.field === "loanDeductions");
		for (const source of loanField?.sourceBreakdown || []) {
			if (!source.value || source.value <= 0) continue;
			const loanType = loanTypeByWorkbookLabel[source.label];
			if (!loanType) {
				skippedUnknownLabels += 1;
				continue;
			}
			loanTypesUsed.add(loanType.name);
			const key = `${row.employeeCode}:LOAN:${loanType.name}:${source.value}:${source.sourceCell || ""}`;
			if (seen.has(key)) continue;
			seen.add(key);
			rows.push([
				row.employeeCode,
				"LOAN",
				loanType.name,
				String(source.value),
				"",
				startDate,
				endDate,
				"1",
				"ACTIVE",
				[
					"BNPI payroll workbook loan deduction",
					source.label,
					row.sheetName,
					`row ${row.rowNumber}`,
					source.sourceCell,
				]
					.filter(Boolean)
					.join(" | "),
			]);
		}

		const uniformField = row.fields.find((field) => field.field === "uniformDeduction");
		const uniformAmount = Number((uniformField as any)?.workbookValue ?? 0);
		if (Number.isFinite(uniformAmount) && uniformAmount > 0) {
			const code = deductionBenefitCodeByWorkbookLabel["Uniform Deduction"];
			const key = `${row.employeeCode}:${code}:${uniformAmount}:${(uniformField as any)?.sourceCell || ""}`;
			if (!seen.has(key)) {
				seen.add(key);
				rows.push([
					row.employeeCode,
					"BENEFIT",
					code,
					String(uniformAmount),
					"",
					startDate,
					endDate,
					"1",
					"ACTIVE",
					[
						"BNPI payroll workbook deduction",
						"Uniform Deduction",
						row.sheetName,
						`row ${row.rowNumber}`,
						(uniformField as any)?.sourceCell,
					]
						.filter(Boolean)
						.join(" | "),
				]);
			}
		}

		const deductionBenefitField = row.fields.find((field) => field.field === "deductionBenefits");
		for (const source of deductionBenefitField?.sourceBreakdown || []) {
			if (!source.value || source.value <= 0) continue;
			const code = deductionBenefitCodeByWorkbookLabel[source.label];
			if (!code) {
				skippedUnknownLabels += 1;
				continue;
			}
			const key = `${row.employeeCode}:${code}:${source.value}:${source.sourceCell || ""}`;
			if (seen.has(key)) continue;
			seen.add(key);
			rows.push([
				row.employeeCode,
				"BENEFIT",
				code,
				String(source.value),
				"",
				startDate,
				endDate,
				"1",
				"ACTIVE",
				[
					"BNPI payroll workbook deduction",
					source.label,
					row.sheetName,
					`row ${row.rowNumber}`,
					source.sourceCell,
				]
					.filter(Boolean)
					.join(" | "),
			]);
		}

		const leavePayField = row.fields.find((field) => field.field === "leavePay");
		const leavePayAmount = Number((leavePayField as any)?.workbookValue ?? 0);
		if (Number.isFinite(leavePayAmount) && leavePayAmount > 0) {
			const key = `${row.employeeCode}:${leavePayBenefitCode}:${leavePayAmount}:${(leavePayField as any)?.sourceCell || ""}`;
			if (!seen.has(key)) {
				seen.add(key);
				rows.push([
					row.employeeCode,
					"BENEFIT",
					leavePayBenefitCode,
					String(leavePayAmount),
					"",
					startDate,
					endDate,
					"1",
					"ACTIVE",
					[
						"BNPI payroll workbook leave pay",
						"Leave",
						row.sheetName,
						`row ${row.rowNumber}`,
						(leavePayField as any)?.sourceCell,
					]
						.filter(Boolean)
						.join(" | "),
				]);
			}
		}
	}

	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "utf8");
	const loanTypeRows: string[][] = [
		[
			"NAME",
			"CATEGORY",
			"DESCRIPTION",
			"MIN_AMOUNT",
			"MAX_AMOUNT",
			"INTEREST_RATE",
			"MAX_TERM_MONTHS",
			"MIN_SERVICE_MONTHS",
			"IS_ACTIVE",
		],
	];
	for (const loanType of Object.values(loanTypeByWorkbookLabel)) {
		if (!loanTypesUsed.has(loanType.name)) continue;
		loanTypeRows.push([
			loanType.name,
			loanType.category,
			loanType.description,
			"",
			"",
			"0",
			"1",
			"",
			"TRUE",
		]);
	}
	fs.writeFileSync(
		loanTypesOutputPath,
		`${loanTypeRows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
		"utf8",
	);
	console.log(
		JSON.stringify(
			{
				comparisonPath,
				outputPath,
				loanTypesOutputPath,
				rowsWritten: rows.length - 1,
				loanTypeRowsWritten: loanTypeRows.length - 1,
				skippedUnknownLabels,
				startDate,
				endDate,
			},
			null,
			2,
		),
	);
}

main();
