import * as fs from "fs";
import * as path from "path";

type ComparisonField = {
	field: string;
	category: string;
	workbookValue: number | string | null;
	hrisValue: number | string | null;
	difference?: number;
	sourceCell?: string;
	sourceColumn?: string;
	sourceBreakdown?: Array<{ label: string; value: number; sourceCell?: string; formula?: string }>;
	hrisSource?: string;
	likelyReason: string;
	repairRecommendation: string;
};

type ComparisonRow = {
	employeeCode: string;
	employeeName: string;
	rowNumber: number;
	sheetName: string;
	employeeMatch?: boolean;
	timesheetStatus?: string | null;
	previewFound: boolean;
	overallCategory: string;
	fields: ComparisonField[];
	rateAnalysis?: {
		formulaSource: string;
		basicSalary: number;
		workbookWorkDays: number;
		hrisWorkDays: number;
		workbookDailyRate: number;
		hrisDailyRate: number;
		bnpi313DailyRateFromPeriodBasic: number;
		bnpi313MonthlyRateFromWorkbookDaily: number;
		workbookDailyRateMatchesBnpi313: boolean;
		hrisHourlyRate: number;
		hrisMinuteRate: number;
		workbookAbsentDaysImplied: number;
		hrisAbsentDays: number;
		workbookLateMinutesImplied: number;
		hrisLateMinutes: number;
		workbookGrossFormula: number;
		hrisGrossFormula: number;
		grossFormulaDelta: number;
		grossResidualAfterComparedComponents: number;
	};
	recommendation: string;
};

type ComparisonFile = {
	metadata: {
		dbName?: string | null;
		detectedCutoff?: { startDate: string; endDate: string; payDate?: string };
		payrollPeriod?: { code?: string | null; status: string } | null;
		dryRunOnly: boolean;
	};
	summary: {
		workbookRows: number;
		employeesMatched: number;
		approvedTimesheetsFound: number;
		exactMatches: number;
		toleranceMatches: number;
		mismatches: number;
		skippedRows: number;
		byCategory: Record<string, number>;
	};
	rows: ComparisonRow[];
};

type FieldSummary = {
	totalFields: number;
	matchedFields: number;
	mismatchedFields: number;
	fullMatchRows: number;
	partialMatchRows: number;
	skippedRows: number;
	byFieldCategory: Record<string, number>;
	byField: Record<string, { matches: number; mismatches: number; total: number }>;
	byTimesheetStatus: Record<string, number>;
};

const repoRoot = path.resolve(__dirname, "..", "..");
const defaultResultsPath = path.resolve(
	repoRoot,
	"test-results",
	"payroll-bandai-analysis",
	"payroll-comparison-results.json",
);

const colors = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
};

function color(text: string, code: keyof typeof colors) {
	return `${colors[code]}${text}${colors.reset}`;
}

function argValue(name: string, fallback = "") {
	const prefix = `--${name}=`;
	return process.argv.filter((arg) => arg.startsWith(prefix)).pop()?.slice(prefix.length) || fallback;
}

function hasFlag(name: string) {
	return process.argv.includes(`--${name}`);
}

function help() {
	console.log(`
${color("Bandai Payroll Comparison CLI", "bold")}

Usage:
  npx tsx scripts/show-bandai-payroll-comparison.ts [options]

Options:
  --file=<path>          Comparison JSON path. Defaults to latest payroll-bandai-analysis output.
  --category=<text>      Filter row or field category, e.g. SOURCE_MISSING_APPROVED_OT.
  --field=<text>         Filter field name, e.g. basicSalary, netPay, regularDays.
  --employee=<text>      Filter employee code or name.
  --show=<mode>          mismatches | matches | all | rows | full-matches | partial. Default: mismatches.
  --limit=<n>            Max rows to print. Default: 30.
  --summary-only         Show only counts.
  --repair-plan          Show source-of-truth repair order and top source columns to import.
  --top=<n>              Rows/items to show in repair plan. Default: 5.
  --payslip-only         Show only payslip-style repair details for the top rows.
  --help                 Show this help.
`);
}

function categoryColor(category: string): keyof typeof colors {
	if (category === "MATCH" || category === "TOLERANCE_MATCH") return "green";
	if (category.includes("MISSING")) return "yellow";
	if (category.includes("REPAIRABLE")) return "red";
	if (category.includes("NOT_FOUND") || category.includes("SKIP")) return "magenta";
	if (category.includes("CUTOFF")) return "cyan";
	return "blue";
}

function formatValue(value: unknown) {
	if (value === null || value === undefined || value === "") return color("blank", "gray");
	if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
	return String(value);
}

function numberValue(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const parsed = Number(String(value ?? "").replace(/,/g, ""));
	return Number.isFinite(parsed) ? parsed : 0;
}

function signedAmount(value: number) {
	const rounded = Number(value.toFixed(2));
	const text = `${rounded >= 0 ? "+" : ""}${formatValue(rounded)}`;
	if (rounded === 0) return color(text, "green");
	return color(text, rounded > 0 ? "yellow" : "red");
}

function isMatch(category: string) {
	return category === "MATCH" || category === "TOLERANCE_MATCH";
}

function rowMatchCounts(row: ComparisonRow) {
	const matched = row.fields.filter((field) => isMatch(field.category)).length;
	return {
		matched,
		mismatched: row.fields.length - matched,
	};
}

function isFullMatchRow(row: ComparisonRow) {
	return row.fields.length > 0 && rowMatchCounts(row).mismatched === 0;
}

function isPartialMatchRow(row: ComparisonRow) {
	const counts = rowMatchCounts(row);
	return counts.matched > 0 && counts.mismatched > 0;
}

function buildFieldSummary(comparison: ComparisonFile): FieldSummary {
	const summary: FieldSummary = {
		totalFields: 0,
		matchedFields: 0,
		mismatchedFields: 0,
		fullMatchRows: 0,
		partialMatchRows: 0,
		skippedRows: 0,
		byFieldCategory: {},
		byField: {},
		byTimesheetStatus: {},
	};

	for (const row of comparison.rows) {
		const timesheetStatus = row.employeeMatch === false ? "NO_EMPLOYEE" : row.timesheetStatus || "NO_TIMESHEET";
		summary.byTimesheetStatus[timesheetStatus] = (summary.byTimesheetStatus[timesheetStatus] || 0) + 1;
		if (!row.fields.length) {
			summary.skippedRows += 1;
			continue;
		}

		let rowMatchCount = 0;
		for (const field of row.fields) {
			const fieldMatched = isMatch(field.category);
			summary.totalFields += 1;
			summary.byFieldCategory[field.category] = (summary.byFieldCategory[field.category] || 0) + 1;
			summary.byField[field.field] ||= { matches: 0, mismatches: 0, total: 0 };
			summary.byField[field.field].total += 1;

			if (fieldMatched) {
				summary.matchedFields += 1;
				summary.byField[field.field].matches += 1;
				rowMatchCount += 1;
			} else {
				summary.mismatchedFields += 1;
				summary.byField[field.field].mismatches += 1;
			}
		}

		if (rowMatchCount === row.fields.length) {
			summary.fullMatchRows += 1;
		} else if (rowMatchCount > 0) {
			summary.partialMatchRows += 1;
		}
	}

	return summary;
}

function summarizeBreakdown(comparison: ComparisonFile, fieldName: string, category: string) {
	const totals = new Map<string, { rows: number; total: number; examples: string[] }>();
	for (const row of comparison.rows) {
		const field = row.fields.find((entry) => entry.field === fieldName && entry.category === category);
		if (!field?.sourceBreakdown?.length) continue;
		for (const source of field.sourceBreakdown) {
			const entry = totals.get(source.label) || { rows: 0, total: 0, examples: [] };
			entry.rows += 1;
			entry.total = Number((entry.total + source.value).toFixed(2));
			if (entry.examples.length < 3) {
				entry.examples.push(`${row.employeeCode} ${source.sourceCell || ""}`.trim());
			}
			totals.set(source.label, entry);
		}
	}
	return Array.from(totals.entries())
		.map(([label, value]) => ({ label, ...value }))
		.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

function printStatutoryBreakdown(comparison: ComparisonFile) {
	const statutoryRows = comparison.rows.filter((row) => row.overallCategory === "SOURCE_MISSING_STATUTORY_CONFIG");
	const fieldCounts = new Map<string, number>();
	const rootCounts = {
		withholdingOnly: 0,
		withholdingPlusNonStatutory: 0,
		sss: 0,
		philHealth: 0,
		pagibig: 0,
	};
	const examples: string[] = [];

	for (const row of statutoryRows) {
		const mismatches = row.fields.filter((field) => !isMatch(field.category));
		for (const field of mismatches) {
			fieldCounts.set(field.field, (fieldCounts.get(field.field) || 0) + 1);
		}
		const withholding = mismatches.find((field) => field.field === "withholdingTax");
		const nonStatutoryRoot = mismatches.some(
			(field) =>
				!["withholdingTax", "sssContribution", "philHealthContribution", "pagibigContribution", "totalDeductions", "netPay", "totalReceivable"].includes(field.field),
		);
		if (withholding && nonStatutoryRoot) rootCounts.withholdingPlusNonStatutory += 1;
		if (withholding && !nonStatutoryRoot) rootCounts.withholdingOnly += 1;
		if (mismatches.some((field) => field.field === "sssContribution")) rootCounts.sss += 1;
		if (mismatches.some((field) => field.field === "philHealthContribution")) rootCounts.philHealth += 1;
		if (mismatches.some((field) => field.field === "pagibigContribution")) rootCounts.pagibig += 1;
		if (examples.length < 8) {
			examples.push(`${row.employeeCode} ${row.employeeName} row ${row.rowNumber}`);
		}
	}

	console.log(color("Statutory Config/Source Breakdown", "bold"));
	console.log(`  rows ${color(String(statutoryRows.length), statutoryRows.length < 100 ? "green" : "yellow")}`);
	console.log(`  withholding tax only             ${rootCounts.withholdingOnly}`);
	console.log(`  withholding plus payroll drift   ${rootCounts.withholdingPlusNonStatutory}`);
	console.log(`  SSS contribution rows            ${rootCounts.sss}`);
	console.log(`  PhilHealth contribution rows     ${rootCounts.philHealth}`);
	console.log(`  Pag-IBIG contribution rows       ${rootCounts.pagibig}`);
	console.log(color("  field counts", "gray"));
	for (const [field, count] of Array.from(fieldCounts.entries()).sort((a, b) => b[1] - a[1])) {
		console.log(`    ${field.padEnd(28)} ${count}`);
	}
	if (examples.length) {
		console.log(color(`  examples: ${examples.join("; ")}`, "gray"));
	}
	console.log("");
}

function topPartialRows(comparison: ComparisonFile, limit: number) {
	return comparison.rows
		.map((row) => {
			const matched = row.fields.filter((field) => isMatch(field.category)).length;
			const mismatched = row.fields.length - matched;
			return { row, matched, mismatched };
		})
		.filter((entry) => entry.matched > 0 && entry.mismatched > 0)
		.sort((a, b) => b.matched - a.matched || a.mismatched - b.mismatched)
		.slice(0, limit);
}

function fieldByName(row: ComparisonRow, fieldName: string) {
	return row.fields.find((field) => field.field === fieldName);
}

function neededValue(field?: ComparisonField) {
	if (!field) return 0;
	return numberValue(field.workbookValue) - numberValue(field.hrisValue);
}

function printPayslipLine(label: string, field: ComparisonField | undefined, options?: { rollup?: boolean }) {
	if (!field) return;
	const needed = neededValue(field);
	const statusColor = isMatch(field.category) ? "green" : categoryColor(field.category);
	const marker = options?.rollup ? color("rollup", "gray") : color(field.category, statusColor);
	console.log(
		`  ${label.padEnd(25)} workbook ${String(formatValue(field.workbookValue)).padStart(10)} | hris ${String(formatValue(field.hrisValue)).padStart(10)} | needed ${signedAmount(needed)} | ${marker}`,
	);
	if (field.sourceBreakdown?.length) {
		for (const source of field.sourceBreakdown.slice(0, 6)) {
			console.log(
				`    ${color(source.label.padEnd(24), "gray")} workbook ${formatValue(source.value)} ${color(source.sourceCell || "", "gray")}`,
			);
		}
	}
	if (!isMatch(field.category) && !options?.rollup) {
		console.log(`    ${color("repair", "gray")} ${field.repairRecommendation}`);
	}
}

function printResidualLine(label: string, value: number) {
	const rounded = Number(value.toFixed(2));
	if (Math.abs(rounded) <= 0.05) return;
	console.log(
		`  ${label.padEnd(25)} ${color("residual", "gray")} needed ${signedAmount(rounded)} ${color("not explained by the explicit compared components above", "gray")}`,
	);
}

function printRateAnalysis(row: ComparisonRow) {
	const rate = row.rateAnalysis;
	if (!rate) return;
	console.log(color("  Rate Basis", "bold"));
	console.log(`  ${color("source", "gray")} ${rate.formulaSource}`);
	console.log(
		`  ${"Daily rate".padEnd(25)} workbook ${formatValue(rate.basicSalary)} / ${formatValue(rate.workbookWorkDays)} = ${color(formatValue(rate.workbookDailyRate), "cyan")} | hris ${formatValue(rate.basicSalary)} / ${formatValue(rate.hrisWorkDays)} = ${color(formatValue(rate.hrisDailyRate), "cyan")}`,
	);
	console.log(
		`  ${"BNPI 313 basis".padEnd(25)} (${formatValue(rate.basicSalary)} x 2 x 12) / 313 = ${color(formatValue(rate.bnpi313DailyRateFromPeriodBasic), rate.workbookDailyRateMatchesBnpi313 ? "green" : "yellow")} | implied monthly from workbook daily ${formatValue(rate.bnpi313MonthlyRateFromWorkbookDaily)}`,
	);
	console.log(
		`  ${"Hourly/minute".padEnd(25)} hris hourly ${formatValue(rate.hrisHourlyRate)} | hris minute ${formatValue(rate.hrisMinuteRate)}`,
	);
	console.log(
		`  ${"Absence basis".padEnd(25)} workbook implied days ${formatValue(rate.workbookAbsentDaysImplied)} | hris days ${formatValue(rate.hrisAbsentDays)}`,
	);
	console.log(
		`  ${"Late basis".padEnd(25)} workbook implied minutes ${formatValue(rate.workbookLateMinutesImplied)} | hris minutes ${formatValue(rate.hrisLateMinutes)}`,
	);
	console.log(
		`  ${"Gross formula".padEnd(25)} workbook ${formatValue(rate.workbookGrossFormula)} | hris ${formatValue(rate.hrisGrossFormula)} | formula delta ${signedAmount(rate.grossFormulaDelta)}`,
	);
	if (Math.abs(rate.grossResidualAfterComparedComponents) > 0.05) {
		console.log(
			`  ${"Gross rollup gap".padEnd(25)} ${signedAmount(rate.grossResidualAfterComparedComponents)} ${color("after basic + OT + premium/rest/holiday + gross-included allowance components", "gray")}`,
		);
	}
}

function printPayslipRepairDetails(comparison: ComparisonFile, top: number) {
	const rows = topPartialRows(comparison, top);
	console.log(color(`Payslip-Style Repair Details (${rows.length})`, "bold"));
	console.log(color("needed = workbook target - current HRIS dry-run", "gray"));
	console.log("");
	for (const entry of rows) {
		const row = entry.row;
		console.log(
			`${color(row.employeeCode, "bold")} ${row.employeeName} ${color(row.overallCategory, categoryColor(row.overallCategory))} ${color(`sheet ${row.sheetName} row ${row.rowNumber}`, "gray")}`,
		);
		if (row.timesheetStatus) console.log(`  timesheet: ${row.timesheetStatus}`);
		printRateAnalysis(row);
		const basic = fieldByName(row, "basicSalary");
		const overtime = fieldByName(row, "overtimePay");
		const restDayPay = fieldByName(row, "restDayPay");
		const restDayOtPay = fieldByName(row, "restDayOtPay");
		const specialHolidayPay = fieldByName(row, "specialHolidayPay");
		const legalHolidayPay = fieldByName(row, "legalHolidayPay");
		const premiumHolidayRestPay = fieldByName(row, "premiumHolidayRestPay");
		const nightDiffPay = fieldByName(row, "nightDiffPay");
		const leavePay = fieldByName(row, "leavePay");
		const allowances = fieldByName(row, "allowances");
		const grossIncludedAllowances = fieldByName(row, "grossIncludedAllowances");
		const receivableOnlyAllowances = fieldByName(row, "receivableOnlyAllowances");
		const postNetReceivableAdjustments = fieldByName(row, "postNetReceivableAdjustments");
		const gross = fieldByName(row, "grossPay");
		const absent = fieldByName(row, "absentDeduction");
		const late = fieldByName(row, "lateUndertimeDeduction");
		const tax = fieldByName(row, "withholdingTax");
		const sss = fieldByName(row, "sssContribution");
		const philHealth = fieldByName(row, "philHealthContribution");
		const pagibig = fieldByName(row, "pagibigContribution");
		const loans = fieldByName(row, "loanDeductions");
		const uniformDeduction = fieldByName(row, "uniformDeduction");
		const totalDeductions = fieldByName(row, "totalDeductions");
		const net = fieldByName(row, "netPay");
		const totalReceivable = fieldByName(row, "totalReceivable");
		console.log(color("  Earnings", "bold"));
		printPayslipLine("Basic salary", basic);
		printPayslipLine("Overtime pay", overtime);
		printPayslipLine("Rest day pay", restDayPay);
		printPayslipLine("Rest day OT", restDayOtPay);
		printPayslipLine("Special holiday", specialHolidayPay);
		printPayslipLine("Legal holiday", legalHolidayPay);
		printPayslipLine("Premium/holiday total", premiumHolidayRestPay);
		printPayslipLine("Night differential", nightDiffPay);
		printPayslipLine("Leave pay", leavePay);
		printPayslipLine("Allowances", allowances);
		printPayslipLine("Gross-incl allowances", grossIncludedAllowances);
		printPayslipLine("Receivable allowances", receivableOnlyAllowances);
		printPayslipLine("Post-net adjustments", postNetReceivableAdjustments);
		printPayslipLine("Gross pay", gross, { rollup: true });
		printResidualLine(
			"Gross residual",
			neededValue(gross) -
				neededValue(basic) -
				neededValue(overtime) -
				neededValue(premiumHolidayRestPay) -
				neededValue(nightDiffPay) -
				neededValue(leavePay) -
				neededValue(grossIncludedAllowances),
		);
		console.log(color("  Deductions", "bold"));
		printPayslipLine("Absent deduction", absent);
		printPayslipLine("Late/undertime", late);
		printPayslipLine("Withholding tax", tax);
		printPayslipLine("SSS", sss);
		printPayslipLine("PhilHealth", philHealth);
		printPayslipLine("Pag-IBIG", pagibig);
		printPayslipLine("Loans/deductions", loans);
		printPayslipLine("Uniform deduction", uniformDeduction);
		printPayslipLine("Total deductions", totalDeductions, { rollup: true });
		printResidualLine(
			"Deduction residual",
			neededValue(totalDeductions) -
				neededValue(absent) -
				neededValue(late) -
				neededValue(tax) -
				neededValue(sss) -
				neededValue(philHealth) -
				neededValue(pagibig) -
				neededValue(loans) -
				neededValue(uniformDeduction),
		);
		console.log(color("  Take-home", "bold"));
		printPayslipLine("Net pay", net, { rollup: true });
		printResidualLine(
			"Net residual",
			neededValue(net) - (neededValue(gross) - neededValue(totalDeductions)),
		);
		printPayslipLine("Total receivable", totalReceivable, { rollup: true });
		printResidualLine(
			"Receivable residual",
			neededValue(totalReceivable) -
				neededValue(net) -
				neededValue(receivableOnlyAllowances) -
				neededValue(postNetReceivableAdjustments),
		);
		console.log("");
	}
}

function printRepairPlan(comparison: ComparisonFile, top: number) {
	const allowanceSources = summarizeBreakdown(comparison, "allowances", "SOURCE_MISSING_ALLOWANCE");
	const loanSources = summarizeBreakdown(comparison, "loanDeductions", "SOURCE_MISSING_DEDUCTION_OR_LOAN");
	console.log(color("Reconciliation Repair Plan", "bold"));
	console.log(
		`${color("1.", "cyan")} Keep payroll preview source-of-truth: approved Timesheet + effective Timesheetline snapshots.`,
	);
	console.log(
		`${color("2.", "cyan")} Import/source missing components first: approved OT/OTR, allowances, loans/deductions, statutory source/config, missing approved timesheets.`,
	);
	console.log(
		`${color("3.", "cyan")} Repair HRIS logic only after source gaps are present; grossPay, totalDeductions, and netPay are downstream rollups.`,
	);
	console.log("");
	console.log(color(`Top ${top} partial matches`, "bold"));
	for (const entry of topPartialRows(comparison, top)) {
		console.log(
			`  ${color(entry.row.employeeCode, "bold")} ${entry.row.employeeName} ${color(`${entry.matched} match`, "green")} ${color(`${entry.mismatched} fail`, "yellow")} ${color(entry.row.overallCategory, categoryColor(entry.row.overallCategory))}`,
		);
	}
	console.log("");
	console.log(color("Allowance columns to add/import", "bold"));
	if (!allowanceSources.length) {
		console.log(color("  No per-column breakdown found. Re-run dry-run-bandai-payroll-comparison.ts after this helper update.", "yellow"));
	} else {
		for (const source of allowanceSources.slice(0, top)) {
			console.log(
				`  ${source.label.padEnd(28)} rows ${String(source.rows).padStart(4)} | workbook total ${formatValue(source.total)} | examples ${color(source.examples.join(", "), "gray")}`,
			);
		}
	}
	console.log("");
	console.log(color("Loan/deduction columns to add/import", "bold"));
	if (!loanSources.length) {
		console.log(color("  No per-column breakdown found. Re-run dry-run-bandai-payroll-comparison.ts after this helper update.", "yellow"));
	} else {
		for (const source of loanSources.slice(0, top)) {
			console.log(
				`  ${source.label.padEnd(28)} rows ${String(source.rows).padStart(4)} | workbook total ${formatValue(source.total)} | examples ${color(source.examples.join(", "), "gray")}`,
			);
		}
	}
	console.log("");
	printPayslipRepairDetails(comparison, top);
}

function rowMatchesFilter(row: ComparisonRow, params: { category: string; field: string; employee: string }) {
	const employeeFilter = params.employee.toLowerCase();
	const categoryFilter = params.category.toUpperCase();
	const fieldFilter = params.field.toLowerCase();
	if (
		employeeFilter &&
		!`${row.employeeCode} ${row.employeeName}`.toLowerCase().includes(employeeFilter)
	) {
		return false;
	}
	if (categoryFilter) {
		const rowHasCategory =
			row.overallCategory.toUpperCase().includes(categoryFilter) ||
			row.fields.some((field) => field.category.toUpperCase().includes(categoryFilter));
		if (!rowHasCategory) return false;
	}
	if (fieldFilter && !row.fields.some((field) => field.field.toLowerCase().includes(fieldFilter))) {
		return false;
	}
	return true;
}

function visibleFields(row: ComparisonRow, params: { show: string; category: string; field: string }) {
	const categoryFilter = params.category.toUpperCase();
	const fieldFilter = params.field.toLowerCase();
	if (params.show === "full-matches" || params.show === "partial") {
		return row.fields.filter((field) => {
			if (categoryFilter && !field.category.toUpperCase().includes(categoryFilter)) return false;
			if (fieldFilter && !field.field.toLowerCase().includes(fieldFilter)) return false;
			return true;
		});
	}
	return row.fields.filter((field) => {
		if (params.show === "matches" && !isMatch(field.category)) return false;
		if (params.show === "mismatches" && isMatch(field.category)) return false;
		if (categoryFilter && !field.category.toUpperCase().includes(categoryFilter)) return false;
		if (fieldFilter && !field.field.toLowerCase().includes(fieldFilter)) return false;
		return true;
	});
}

function printSummary(comparison: ComparisonFile) {
	const cutoff = comparison.metadata.detectedCutoff;
	const fieldSummary = buildFieldSummary(comparison);
	const matchRate = fieldSummary.totalFields
		? ((fieldSummary.matchedFields / fieldSummary.totalFields) * 100).toFixed(1)
		: "0.0";

	console.log(color("Bandai Payroll Dry-Run Comparison", "bold"));
	console.log(
		[
			`DB ${color(comparison.metadata.dbName || "unknown", "cyan")}`,
			cutoff ? `cutoff ${color(`${cutoff.startDate} to ${cutoff.endDate}`, "cyan")}` : "",
			comparison.metadata.payrollPeriod
				? `period ${color(comparison.metadata.payrollPeriod.code || "unknown", "cyan")} (${comparison.metadata.payrollPeriod.status})`
				: "period not found",
			`dry-run ${comparison.metadata.dryRunOnly ? color("yes", "green") : color("no", "red")}`,
		]
			.filter(Boolean)
			.join(" | "),
	);
	console.log("");
	console.log(
		[
			`rows ${comparison.summary.workbookRows}`,
			`matched employees ${comparison.summary.employeesMatched}`,
			`approved timesheets ${comparison.summary.approvedTimesheetsFound}`,
			`full row matches ${color(String(fieldSummary.fullMatchRows), "green")}`,
			`partial rows ${color(String(fieldSummary.partialMatchRows), "yellow")}`,
			`skipped rows ${color(String(fieldSummary.skippedRows), "magenta")}`,
		].join(" | "),
	);
	console.log("");
	console.log(color("Field verdicts", "bold"));
	console.log(
		[
			`checks ${fieldSummary.totalFields}`,
			`match ${color(String(fieldSummary.matchedFields), "green")}`,
			`fail/source gap ${color(String(fieldSummary.mismatchedFields), "yellow")}`,
			`match rate ${color(`${matchRate}%`, Number(matchRate) >= 80 ? "green" : Number(matchRate) >= 50 ? "yellow" : "red")}`,
		].join(" | "),
	);
	console.log("");
	console.log(color("Field categories", "bold"));
	for (const [category, count] of Object.entries(fieldSummary.byFieldCategory).sort()) {
		console.log(`  ${color(category.padEnd(36), categoryColor(category))} ${count}`);
	}
	console.log("");
	console.log(color("Component pass/fail", "bold"));
	for (const [field, counts] of Object.entries(fieldSummary.byField).sort()) {
		const label = field.padEnd(26);
		const matches = color(String(counts.matches).padStart(4), "green");
		const mismatches = color(String(counts.mismatches).padStart(4), counts.mismatches ? "yellow" : "green");
		console.log(`  ${label} match ${matches} | fail ${mismatches} | total ${counts.total}`);
	}
	console.log("");
	console.log(color("Overall row categories", "bold"));
	for (const [category, count] of Object.entries(comparison.summary.byCategory).sort()) {
		console.log(`  ${color(category.padEnd(36), categoryColor(category))} ${count}`);
	}
	console.log("");
	printStatutoryBreakdown(comparison);
	console.log(color("Timesheet coverage", "bold"));
	for (const [status, count] of Object.entries(fieldSummary.byTimesheetStatus).sort()) {
		console.log(`  ${color(status.padEnd(20), status === "APPROVED" ? "green" : status === "NO_TIMESHEET" ? "magenta" : "yellow")} ${count}`);
	}
	console.log("");
}

function main() {
	if (hasFlag("help")) {
		help();
		return;
	}

	const filePath = path.resolve(argValue("file", defaultResultsPath));
	const show = argValue("show", "mismatches").toLowerCase();
	const limit = Number(argValue("limit", "30")) || 30;
	const top = Number(argValue("top", "5")) || 5;
	const params = {
		category: argValue("category"),
		field: argValue("field"),
		employee: argValue("employee"),
		show,
	};

	const comparison = JSON.parse(fs.readFileSync(filePath, "utf8")) as ComparisonFile;
	printSummary(comparison);
	if (hasFlag("payslip-only")) {
		printPayslipRepairDetails(comparison, top);
		return;
	}
	if (hasFlag("repair-plan")) {
		printRepairPlan(comparison, top);
		return;
	}
	if (hasFlag("summary-only")) return;

	const rows = comparison.rows
		.filter((row) => rowMatchesFilter(row, params))
		.filter((row) => {
			if (params.show === "full-matches") return isFullMatchRow(row);
			if (params.show === "partial") return isPartialMatchRow(row);
			return true;
		})
		.map((row) => ({ row, fields: visibleFields(row, params) }))
		.filter(({ row, fields }) => params.show === "rows" || fields.length || row.fields.length === 0)
		.slice(0, limit);

	console.log(color(`Showing ${rows.length} row(s)`, "bold"));
	console.log(color(`Source: ${filePath}`, "gray"));
	console.log("");

	for (const { row, fields } of rows) {
		console.log(
			`${color(row.employeeCode, "bold")} ${row.employeeName} ${color(row.overallCategory, categoryColor(row.overallCategory))} ${color(`sheet ${row.sheetName} row ${row.rowNumber}`, "gray")}`,
		);
		if (row.timesheetStatus) console.log(`  timesheet: ${row.timesheetStatus}`);
		if (!fields.length) {
			console.log(`  ${color(row.recommendation, "yellow")}`);
			console.log("");
			continue;
		}
		for (const field of fields) {
			const diff =
				field.difference === undefined ? "" : ` diff=${color(formatValue(field.difference), field.difference === 0 ? "green" : "yellow")}`;
			const source = field.sourceCell || field.sourceColumn || "";
			console.log(
				`  ${field.field.padEnd(26)} ${color(field.category.padEnd(34), categoryColor(field.category))} workbook=${formatValue(field.workbookValue)} hris=${formatValue(field.hrisValue)}${diff}`,
			);
			console.log(`    ${color("problem", "gray")} ${field.likelyReason}`);
			if (source) {
				console.log(`    ${color("source", "gray")} ${source}`);
			}
			if (field.hrisSource) {
				console.log(`    ${color("hris source", "gray")} ${field.hrisSource}`);
			}
			if (!isMatch(field.category)) {
				console.log(`    ${color("repair", "gray")} ${field.repairRecommendation}`);
			}
			if (field.sourceBreakdown?.length) {
				console.log(
					`    ${color("breakdown", "gray")} ${field.sourceBreakdown
						.map((entry) => `${entry.label}=${formatValue(entry.value)}`)
						.join("; ")}`,
				);
			}
		}
		console.log("");
	}
}

main();
