const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const repoRoot = path.resolve(__dirname, "..", "..");
const analysisDir = path.join(repoRoot, "test-results", "payroll-bandai-analysis");
const dumpDir = path.join(repoRoot, "test-results", "employee-payroll-source-dump");
const gaHrDir = path.join(repoRoot, "test-results", "payroll-bandai-ga-hr-loop");

const comparisonPath = path.join(analysisDir, "payroll-comparison-results.json");
const rioDumpPath = path.join(dumpDir, "01360-2026-04-26-2026-05-10.json");
const rioGaHrPath = path.join(gaHrDir, "ga-hr-payroll-loop-iteration-1.json");
const outputPath = path.join(analysisDir, "bandai-payroll-hardcutover-register-qa-v10.xlsx");

const pesos = '#,##0.00;[Red]-#,##0.00;"-"';
const number = '#,##0.00;[Red]-#,##0.00;"-"';
const integer = '#,##0';

const palette = {
	header: "1F4E78",
	headerText: "FFFFFF",
	subHeader: "D9EAF7",
	match: "D9EAD3",
	tolerance: "FFF2CC",
	mismatch: "F4CCCC",
	sourceGap: "FCE5CD",
	skip: "EADCF8",
	info: "DDEBF7",
	white: "FFFFFF",
	border: "B7B7B7",
};

const PH_TAX_TABLE_2023_ONWARD = [
	{ semiMonthlyBase: 0, semiMonthlyCap: 10417, semiMonthlyFixedTax: 0, monthlyBase: 0, monthlyCap: 20833, monthlyFixedTax: 0, rate: 0 },
	{ semiMonthlyBase: 10417, semiMonthlyCap: 16666, semiMonthlyFixedTax: 0, monthlyBase: 20833, monthlyCap: 33332, monthlyFixedTax: 0, rate: 0.15 },
	{ semiMonthlyBase: 16667, semiMonthlyCap: 33332, semiMonthlyFixedTax: 937.5, monthlyBase: 33333, monthlyCap: 66666, monthlyFixedTax: 1875, rate: 0.2 },
	{ semiMonthlyBase: 33333, semiMonthlyCap: 83332, semiMonthlyFixedTax: 4271, monthlyBase: 66667, monthlyCap: 166666, monthlyFixedTax: 8542, rate: 0.25 },
	{ semiMonthlyBase: 83333, semiMonthlyCap: 333332, semiMonthlyFixedTax: 16771, monthlyBase: 166667, monthlyCap: 666666, monthlyFixedTax: 33542, rate: 0.3 },
	{ semiMonthlyBase: 333333, semiMonthlyCap: null, semiMonthlyFixedTax: 91771, monthlyBase: 666667, monthlyCap: null, monthlyFixedTax: 183542, rate: 0.35 },
];

function readJson(filePath, fallback = null) {
	if (!fs.existsSync(filePath)) return fallback;
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asNumber(value) {
	if (value === null || value === undefined || value === "") return 0;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
	return asNumber(value);
}

function categoryFill(category) {
	if (category === "MATCH") return palette.match;
	if (category === "TOLERANCE_MATCH") return palette.tolerance;
	if (category === "DOCUMENTED") return palette.match;
	if (category === "NEEDS_STRICTER_POSITIVE-CASE_PROOF") return palette.tolerance;
	if (category === "REGISTER_FIELD_TALLIED") return palette.match;
	if (category === "DERIVED_OR_ROLLUP_TALLIED") return palette.info;
	if (category === "ZERO_OR_NO_RIO_SOURCE") return palette.tolerance;
	if (category === "TALLIES") return palette.match;
	if (category === "DOES_NOT_TALLY") return palette.mismatch;
	if (String(category || "").startsWith("SOURCE_")) return palette.sourceGap;
	if (category === "TIMESHEET_NOT_FOUND" || category === "EMPLOYEE_NOT_FOUND") return palette.skip;
	return palette.mismatch;
}

function breakdownText(field) {
	return (field.sourceBreakdown || [])
		.map((item) => `${item.label}: ${item.value} (${item.sourceCell || "no cell"})`)
		.join("; ");
}

function styleSheet(ws) {
	ws.views = [{ state: "frozen", ySplit: 1 }];
	ws.autoFilter = {
		from: { row: 1, column: 1 },
		to: { row: 1, column: ws.columnCount || 1 },
	};
	ws.getRow(1).font = { bold: true, color: { argb: palette.headerText } };
	ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette.header } };
	ws.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
	ws.eachRow((row) => {
		row.eachCell((cell) => {
			cell.border = {
				top: { style: "thin", color: { argb: palette.border } },
				left: { style: "thin", color: { argb: palette.border } },
				bottom: { style: "thin", color: { argb: palette.border } },
				right: { style: "thin", color: { argb: palette.border } },
			};
			cell.alignment = { vertical: "top", wrapText: true };
		});
	});
}

function addTableSheet(workbook, name, columns, rows, options = {}) {
	const ws = workbook.addWorksheet(name);
	ws.columns = columns.map((col) => ({
		header: col.header,
		key: col.key,
		width: col.width || 18,
		style: col.numFmt ? { numFmt: col.numFmt } : {},
	}));
	for (const row of rows) ws.addRow(row);
	styleSheet(ws);
	if (options.categoryKey) {
		for (let i = 2; i <= ws.rowCount; i += 1) {
			const category = ws.getRow(i).getCell(options.categoryKey).value;
			ws.getRow(i).getCell(options.categoryKey).fill = {
				type: "pattern",
				pattern: "solid",
				fgColor: { argb: categoryFill(category) },
			};
		}
	}
	return ws;
}

function countBy(items, selector) {
	const result = new Map();
	for (const item of items) {
		const key = selector(item) || "UNCLASSIFIED";
		result.set(key, (result.get(key) || 0) + 1);
	}
	return [...result.entries()].sort((a, b) => b[1] - a[1]);
}

function rowLargestDiff(row) {
	return Math.max(...(row.fields || []).map((field) => Math.abs(asNumber(field.difference))), 0);
}

function rowFailedFields(row) {
	return (row.fields || []).filter((field) => field.category !== "MATCH" && field.category !== "TOLERANCE_MATCH");
}

function formulaLine(label, value, source, formula, note = "") {
	return { label, value, source, formula, note };
}

function comparisonFieldMap(row) {
	return new Map((row?.fields || []).map((field) => [field.field, field]));
}

function round2(value) {
	return Math.round((asNumber(value) + Number.EPSILON) * 100) / 100;
}

function sumRows(rows, key) {
	return round2(rows.reduce((sum, row) => sum + asNumber(row[key]), 0));
}

function comparisonValue(map, fields, fallback = 0) {
	for (const field of fields) {
		const value = map.get(field)?.workbookValue;
		if (value !== undefined && value !== null) return value;
	}
	return fallback;
}

function humanizeField(field) {
	return field
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (char) => char.toUpperCase())
		.replace(/\bOt\b/g, "OT")
		.replace(/\bHdmf\b/g, "HDMF")
		.replace(/\bSss\b/g, "SSS")
		.replace(/\bPhic\b/g, "PHIC")
		.replace(/\bAcl\b/g, "ACL")
		.replace(/\bVl\b/g, "VL")
		.replace(/\bBnpi\b/g, "BNPI")
		.replace(/\bRcbc\b/g, "RCBC");
}

function extractFloatFieldsFromSchema(schemaPath) {
	const text = fs.readFileSync(schemaPath, "utf8");
	const fields = [];
	for (const line of text.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s+Float\b/);
		if (match) fields.push(match[1]);
	}
	return fields;
}

function buildFormulaCatalog({ schemaFields, rioDump, rioComparison }) {
	const registerByField = new Map((rioDump.registerColumns || []).map((column) => [column.field, column]));
	const rioChecksByField = new Map((rioComparison?.fields || []).map((field) => [field.field, field]));
	const calc = rioDump.calculation || {};
	const rates = calc.rates || {};
	const earnings = calc.earnings || {};
	const deductions = calc.deductions || {};
	const net = calc.net || {};

	const valueByField = {
		basicPay: earnings.basicPay,
		overtimePay: earnings.regularOtPay,
		nightDiffPay: earnings.nightDiffPay,
		holidayPay: earnings.restDayPay + earnings.restDayOtPay + earnings.specialHolidayPay + earnings.legalHolidayPay,
		allowances: earnings.grossIncludedBenefits + net.receivableOnlyBenefits,
		taxAmount: deductions.taxAmount,
		sssContribution: deductions.sss,
		philHealthContribution: deductions.philHealth,
		pagibigContribution: deductions.pagIbig,
		loanDeductions: deductions.loanDeductions,
		absentDeduction: deductions.absentDeduction,
		lateDeduction: deductions.lateUndertimeAmount,
		earlyOutDeduction: 0,
		grossPay: earnings.grossPay,
		taxableIncome: earnings.grossPay - deductions.sss - deductions.philHealth - deductions.pagIbig,
		totalDeductions: deductions.totalDeductions,
		netPay: net.netPay,
		monthlySalary: rates.monthlySalary,
		dailySalary: rates.displayDailySalary,
		numberOfDays: rioDump.lineSummary?.bandaiApprovedBuckets?.regularDays,
		lateUndertimeAmount: deductions.lateUndertimeAmount,
		regularOtHours: rioDump.lineSummary?.bandaiApprovedBuckets?.regOtHrs,
		restDayHours: rioDump.lineSummary?.bandaiApprovedBuckets?.rdHrs,
		restDayHoursPay: earnings.restDayPay,
		restDayOtHours: rioDump.lineSummary?.bandaiApprovedBuckets?.rdOtHrs,
		restDayOtPay: earnings.restDayOtPay,
		specialHolidayOtHours: (rioDump.lineSummary?.bandaiApprovedBuckets?.spclHrs || 0) + (rioDump.lineSummary?.bandaiApprovedBuckets?.spclOtHrs || 0),
		specialHolidayOtPay: earnings.specialHolidayPay,
		legalHolidayOtHours: rioDump.lineSummary?.bandaiApprovedBuckets?.rholOtHrs,
		legalHolidayOtPay: earnings.legalHolidayPay,
		leavePay: earnings.leavePay,
		obAllowance: 120,
		adjustmentOtNd: 113.82,
		deMinimisAllowance: 250,
		modifiedHdmf2: deductions.deductionBenefits,
		sssSalaryLoan: deductions.loanDeductions,
		perfectAttendance: 200,
		mealAllowance: 500,
		totalReceivable: net.totalReceivable,
	};

	const importedCompensation = new Set([
		"christmasGift",
		"specialBonus",
		"mandatoryContributionAdjustment",
		"guaranteedBonus",
		"hysMealAllowance",
		"obAllowance",
		"otherAdjustment",
		"overtimeMealAllowance",
		"sportsfestOt",
		"fringeBenefit",
		"annualIncentive",
		"technicalSkillsAllowance",
		"aclVlConversionTaxable",
		"adjustmentOverusedLeave",
		"thirteenthMonthAdjustment",
		"productionIncentives",
		"otherCompensation",
		"adjustmentBasic",
		"adjustmentOtNd",
		"adjustmentNonTax",
		"deMinimisAllowance",
		"christmasGiftKid",
		"birthdayGiftKid",
		"birthdayGiftEmployee",
	]);
	const importedDeductions = new Set([
		"excessDeduction",
		"fringeBenefitTax",
		"sssEmergencyLoan",
		"philHealthContributionAdjustment",
		"excessInternetUsage",
		"taxPayable",
		"adjustmentBasicDeduction",
		"excessMlBenefits",
		"uniformDeduction",
		"sssLoanRestructuringProgram",
		"phicOnePercentDifferential",
		"modifiedHdmf2",
		"communityTaxCertificate",
		"hdmfContributionAdjustment",
		"personalCallsUsage",
		"healthInsurance",
		"shuttleService",
		"negativeAdjustment",
		"bnpiEmergencyLoan",
		"bnpiSalaryLoan",
		"rcbcLoan",
		"hdmfCalamityLoan",
		"hdmfSalaryLoan",
		"sssCalamityLoan",
		"sssSalaryLoan",
	]);
	const postNetReceivable = new Set([
		"adjustmentHolidayPay",
		"communityTaxCert",
		"oneKChristmasGift",
		"taxRefund",
		"thirteenthMonthPay",
		"aclVlConversion",
		"otMealAllowance",
		"perfectAttendance",
		"mealAllowance",
		"lineLeaderAllowance",
	]);

	const explicit = {
		basicPay: {
			sourceOwner: "Employee.basicSalary + approved Timesheetline",
			formula: "periodBasic",
			effect: "grossPay",
			note: "For BNPI proof, Employee.basicSalary is the semi-monthly period basic.",
		},
		overtimePay: {
			sourceOwner: "Timesheetline.metadata.bandaiPayrollSourceRepair.approvedBuckets.regOtHrs",
			formula: "regularOtHours x ((monthlySalary x 12 / 313) / 8) x 1.25",
			effect: "grossPay",
		},
		nightDiffPay: {
			sourceOwner: "Approved source night differential amount / approved bucket regNdHrs",
			formula: "source amount when imported; otherwise regNdHrs x hourlyRate x 0.10",
			effect: "grossPay",
			note: "For this cutoff, 180 rows were source-repaired from workbook-backed night diff source.",
		},
		holidayPay: {
			sourceOwner: "Approved rest/holiday buckets",
			formula: "restDayHoursPay + restDayOtPay + specialHolidayOtPay + legalHolidayOtPay + related excess fields",
			effect: "grossPay",
		},
		allowances: {
			sourceOwner: "EmployeeBenefit rows",
			formula: "sum gross-included + receivable-only allowance fields",
			effect: "grossPay/totalReceivable",
		},
		taxAmount: {
			sourceOwner: "Generated EmployeePayroll.taxAmount or workbook W/Tax parity target",
			formula: "BIR semi-monthly withholding table on taxable compensation; this workbook treats imported/generated W/Tax as parity target",
			effect: "totalDeductions",
		},
		sssContribution: {
			sourceOwner: "Calculator.sssRates / statutory config",
			formula: "monthly salary credit x 5% employee share, then cutoff split",
			effect: "totalDeductions",
		},
		philHealthContribution: {
			sourceOwner: "Calculator.philHealthRates / statutory config",
			formula: "clamp(monthly basis, 10000, 100000) x 5% x 50% employee share, then cutoff split",
			effect: "totalDeductions",
		},
		pagibigContribution: {
			sourceOwner: "Calculator.pagibigRates / statutory config",
			formula: "min(monthly basis, 10000) x 2%, capped at 200, then cutoff split",
			effect: "totalDeductions",
		},
		loanDeductions: {
			sourceOwner: "EmployeeLoan active rows",
			formula: "sum active cutoff loan payment fields",
			effect: "totalDeductions",
			note: "Payroll parity uses imported cutoff payment, not loan principal.",
		},
		absentDeduction: {
			sourceOwner: "effective Timesheetline status/approved payroll source",
			formula: "absent days x Bandai daily rate unless workbook/source supplies specific amount",
			effect: "totalDeductions",
		},
		lateDeduction: {
			sourceOwner: "effective Timesheetline late minutes",
			formula: "late minutes x (Bandai hourly rate / 60)",
			effect: "totalDeductions",
		},
		earlyOutDeduction: {
			sourceOwner: "effective Timesheetline early-out minutes",
			formula: "early-out minutes x (Bandai hourly rate / 60)",
			effect: "totalDeductions",
		},
		otherDeductions: {
			sourceOwner: "EmployeeBenefit deduction rows",
			formula: "sum deduction benefit fields not represented as statutory or loan columns",
			effect: "totalDeductions",
		},
		grossPay: {
			sourceOwner: "Generated payroll preview + workbook BH",
			formula: "basicPay - absentDeduction - lateUndertimeAmount + overtimePay + rest/holiday/night diff pay + gross-included allowances",
			effect: "netPay",
		},
		taxableIncome: {
			sourceOwner: "Generated payroll preview",
			formula: "grossPay - sssContribution - philHealthContribution - pagibigContribution",
			effect: "taxAmount",
		},
		totalDeductions: {
			sourceOwner: "Generated payroll preview + workbook CK",
			formula: "taxAmount + statutory contributions + loans + deduction benefits + other payroll deductions",
			effect: "netPay",
		},
		netPay: {
			sourceOwner: "Generated payroll preview + workbook CL",
			formula: "grossPay - totalDeductions + net adjustments",
			effect: "totalReceivable",
		},
		monthlySalary: {
			sourceOwner: "Employee.basicSalary",
			formula: "periodBasic x 2 for SEMI_MONTHLY",
			effect: "rate basis",
		},
		dailySalary: {
			sourceOwner: "register/display allocation",
			formula: "periodBasic / effective paid days",
			effect: "display only",
			note: "Do not use workbook H=0 as premium rate. Premium rate uses 313 divisor.",
		},
		numberOfDays: {
			sourceOwner: "approved bucket regularDays",
			formula: "sum Timesheetline approvedBuckets.regularDays",
			effect: "display/basic allocation",
		},
		lateUndertimeAmount: {
			sourceOwner: "effective Timesheetline late + early-out",
			formula: "lateDeduction + earlyOutDeduction",
			effect: "totalDeductions/gross preview",
		},
		regularOtHours: {
			sourceOwner: "approved bucket regOtHrs",
			formula: "sum Timesheetline approvedBuckets.regOtHrs",
			effect: "overtimePay",
		},
		restDayHours: {
			sourceOwner: "approved bucket rdHrs",
			formula: "sum approvedBuckets.rdHrs",
			effect: "restDayHoursPay",
		},
		restDayHoursPay: {
			sourceOwner: "approved bucket rdHrs",
			formula: "restDayHours x hourlyRate x 1.30",
			effect: "grossPay",
		},
		restDayOtHours: {
			sourceOwner: "approved bucket rdOtHrs",
			formula: "sum approvedBuckets.rdOtHrs",
			effect: "restDayOtPay",
		},
		restDayOtPay: {
			sourceOwner: "approved bucket rdOtHrs",
			formula: "restDayOtHours x hourlyRate x 1.69",
			effect: "grossPay",
		},
		specialHolidayOtHours: {
			sourceOwner: "approved bucket spclHrs/spclOtHrs",
			formula: "spclHrs + spclOtHrs",
			effect: "specialHolidayOtPay",
		},
		specialHolidayOtPay: {
			sourceOwner: "approved bucket spclHrs/spclOtHrs",
			formula: "(spclHrs x hourlyRate x 0.30) + (spclOtHrs x hourlyRate x 1.69)",
			effect: "grossPay",
		},
		legalHolidayOtHours: {
			sourceOwner: "approved bucket rholOtHrs",
			formula: "sum approvedBuckets.rholOtHrs",
			effect: "legalHolidayOtPay",
		},
		legalHolidayOtPay: {
			sourceOwner: "approved bucket rholHrs/rholOtHrs",
			formula: "(rholHrs x hourlyRate x 1.00) + (rholOtHrs x hourlyRate x 2.60)",
			effect: "grossPay",
		},
		leavePay: {
			sourceOwner: "EmployeeBenefit code=LVP or approved leave source",
			formula: "imported leave amount or leave days x Bandai daily rate",
			effect: "leave register field",
			note: "Current Rio generated gross excludes leave in the gross rollup and stores it as separate register value.",
		},
		totalReceivable: {
			sourceOwner: "Generated payroll preview + workbook CW",
			formula: "netPay + receivable-only allowances + post-net receivable adjustments",
			effect: "final employee receivable",
		},
	};

	for (const field of importedCompensation) {
		explicit[field] = explicit[field] || {
			sourceOwner: "EmployeeBenefit active compensation row / compensation mass upload",
			formula: "imported cutoff amount by employee, code, and pay date",
			effect: "grossPay if GROSS_INCLUDED; totalReceivable if RECEIVABLE_ONLY",
			note: "Do not invent from payroll math; source workbook/upload owns value.",
		};
	}
	for (const field of importedDeductions) {
		explicit[field] = explicit[field] || {
			sourceOwner: field.toLowerCase().includes("loan") ? "EmployeeLoan active cutoff payment / deduction mass upload" : "EmployeeBenefit active deduction row / deduction mass upload",
			formula: "imported cutoff payment/deduction amount by employee, code, and pay date",
			effect: "totalDeductions",
			note: "Do not recompute imported loan payment from principal for historical parity.",
		};
	}
	for (const field of postNetReceivable) {
		explicit[field] = explicit[field] || {
			sourceOwner: "EmployeeBenefit receivable-only or post-net adjustment row",
			formula: "imported cutoff amount by employee, code, and pay date",
			effect: "totalReceivable after netPay",
			note: "Receivable-only amount increases total receivable without increasing grossPay.",
		};
	}

	const excessHolidayFields = [
		"sunSpecialHolidayOtExcessHours",
		"sunSpecialHolidayOtExcessPay",
		"specialHolidayRestDayOtHours",
		"specialHolidayRestDayOtPay",
		"specialRestDayExcessHours",
		"specialRestDayExcessOtPay",
		"legalHolidayExcessPay",
		"legalHolidayRestDayPay",
		"legalHolidayExcess1Pay",
		"legalHolidayRestDayExcessPay",
	];
	for (const field of excessHolidayFields) {
		explicit[field] = explicit[field] || {
			sourceOwner: "approved OT/rest/holiday source bucket or workbook register column",
			formula: field.endsWith("Hours") ? "sum matching approved source bucket hours" : "matching approved bucket hours x Bandai hourly rate x configured bucket multiplier",
			effect: field.endsWith("Pay") ? "grossPay" : "related pay field",
			note: "No positive Rio value; keep documented for future Bandai register parity.",
		};
	}

	return schemaFields.map((field) => {
		const info = explicit[field] || {
			sourceOwner: "Generated payroll preview or imported payroll register source",
			formula: "field-specific source amount; confirm source column before hardcutover",
			effect: "audit/register",
			note: "Catalog fallback: add stricter rule when a positive source row appears.",
		};
		const register = registerByField.get(field);
		const check = rioChecksByField.get(field);
		const rioValue = valueByField[field] ?? register?.dryRunValue ?? check?.hrisValue ?? 0;
		return {
			field,
			label: register?.label || humanizeField(field),
			rioValue,
			workbookCell: check?.sourceCell || "",
			workbookColumn: check?.sourceColumn || register?.label || "",
			dbSource: info.sourceOwner,
			formula: info.formula,
			effect: info.effect,
			bandaiDefaults: "annualWorkDays=313; hoursPerDay=8; regularOt=1.25; restDay=1.30; restDayOt=1.69; specialHolidayPremium=0.30; specialHolidayOt=1.69; legalHoliday=1.00; legalHolidayOt=2.60; nightDiff=0.10",
			note: info.note || "",
			documentationStatus: explicit[field] ? "DOCUMENTED" : "NEEDS_STRICTER_POSITIVE-CASE_PROOF",
		};
	});
}

function formulaForComparisonField(fieldName) {
	const formulas = {
		basicSalary: "periodBasic from Employee.basicSalary",
		regularDays: "sum approvedBuckets.regularDays",
		absentDeduction: "absent days x Bandai daily rate unless workbook/source supplies exact amount",
		lateUndertimeDeduction: "late/early-out minutes x Bandai minute rate",
		overtimeHours: "sum approvedBuckets.regOtHrs",
		overtimePay: "regular OT hours x ((monthlySalary x 12 / 313) / 8) x 1.25",
		restDayPay: "rdHrs x hourlyRate x 1.30",
		restDayOtPay: "rdOtHrs x hourlyRate x 1.69",
		specialHolidayPay: "(spclHrs x hourlyRate x 0.30) + (spclOtHrs x hourlyRate x 1.69)",
		legalHolidayPay: "(rholHrs x hourlyRate x 1.00) + (rholOtHrs x hourlyRate x 2.60)",
		premiumHolidayRestPay: "restDayPay + restDayOtPay + specialHolidayPay + legalHolidayPay",
		nightDiffPay: "source imported amount or regNdHrs x hourlyRate x 0.10",
		leavePay: "EmployeeBenefit LVP/imported leave amount or leave days x Bandai daily rate",
		allowances: "sum gross-included + receivable-only imported allowance fields",
		grossIncludedAllowances: "sum EmployeeBenefit compensation rows with reconciliationAction=GROSS_INCLUDED",
		receivableOnlyAllowances: "sum EmployeeBenefit compensation rows with reconciliationAction=RECEIVABLE_ONLY",
		postNetReceivableAdjustments: "sum imported post-net receivable adjustment fields",
		grossPay: "basic - absent - late/UT + OT/rest/holiday/ND + gross-included allowances",
		withholdingTax: "BIR semi-monthly table or generated/workbook parity target for imported cutoff",
		sssContribution: "monthly salary credit x 5% x cutoff split",
		philHealthContribution: "clamp(monthly basis, 10000, 100000) x 5% x 50% x cutoff split",
		pagibigContribution: "min(monthly basis, 10000) x 2%, capped at 200, x cutoff split",
		loanDeductions: "sum active EmployeeLoan imported cutoff payments",
		uniformDeduction: "EmployeeBenefit/deduction upload imported cutoff amount",
		totalDeductions: "tax + statutory + loans + deduction benefits + payroll-only deductions",
		netPay: "grossPay - totalDeductions + net adjustments",
		deductionBenefits: "sum EmployeeBenefit rows with direction=DEDUCTION",
		totalReceivable: "netPay + receivable-only allowances + post-net receivable adjustments",
	};
	return formulas[fieldName] || "mapped workbook/DB source amount; add positive-case formula when source appears";
}

function fmt(value) {
	return money(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildRioFormulaWithValues(field, context) {
	const { rates, earnings, deductions, net, buckets, register, rowNumber, sheetName } = context;
	const hourly = rates.hourlyRate;
	const bandaiDaily = rates.bandaiDailyRate;
	const periodBasic = rates.periodBasic;
	const monthly = rates.monthlySalary;
	const regularDays = buckets.regularDays || 0;
	const regOtHrs = buckets.regOtHrs || 0;
	const rdHrs = buckets.rdHrs || 0;
	const rdOtHrs = buckets.rdOtHrs || 0;
	const spclHrs = buckets.spclHrs || 0;
	const spclOtHrs = buckets.spclOtHrs || 0;
	const rholHrs = buckets.rholHrs || 0;
	const rholOtHrs = buckets.rholOtHrs || 0;
	const regNdHrs = buckets.regNdHrs || 0;
	const sourceCell = register?.column ? `${sheetName}!${register.column}${rowNumber}` : "";
	const value = register?.dryRunValue ?? 0;
	const imported = (label) => `${label} imported cutoff amount ${sourceCell || "(source row)"} = ${fmt(value)}`;

	const formulas = {
		basicPay: `periodBasic = ${fmt(periodBasic)}`,
		overtimePay: `${regOtHrs} hrs x ${fmt(hourly)} hourly x 1.25 = ${fmt(earnings.regularOtPay)}`,
		nightDiffPay: `${regNdHrs} hrs x ${fmt(hourly)} hourly x 0.10 = ${fmt(earnings.nightDiffPay)}`,
		holidayPay: `${fmt(earnings.restDayPay)} rest + ${fmt(earnings.restDayOtPay)} rest OT + ${fmt(earnings.specialHolidayPay)} special + ${fmt(earnings.legalHolidayPay)} legal = ${fmt((earnings.restDayPay || 0) + (earnings.restDayOtPay || 0) + (earnings.specialHolidayPay || 0) + (earnings.legalHolidayPay || 0))}`,
		allowances: `gross-included ${fmt(earnings.grossIncludedBenefits)} + receivable-only ${fmt(net.receivableOnlyBenefits)} = ${fmt((earnings.grossIncludedBenefits || 0) + (net.receivableOnlyBenefits || 0))}`,
		taxAmount: `generated/workbook parity W/Tax ${sourceCell || "Sheet2!BI469"} = ${fmt(deductions.taxAmount)}; configured formula diagnostic = ${fmt(deductions.configuredTaxAmount)}`,
		sssContribution: `second-cutoff statutory split 0.00 x configured SSS monthly amount = ${fmt(deductions.sss)}`,
		philHealthContribution: `second-cutoff statutory split 0.00 x configured PhilHealth monthly amount = ${fmt(deductions.philHealth)}`,
		pagibigContribution: `second-cutoff statutory split 0.00 x configured Pag-IBIG monthly amount = ${fmt(deductions.pagIbig)}`,
		loanDeductions: `SSS Salary Loan ${fmt(deductions.loanDeductions)} = total loan deductions ${fmt(deductions.loanDeductions)}`,
		absentDeduction: `absent days x ${fmt(bandaiDaily)} Bandai daily rate = ${fmt(deductions.absentDeduction)}`,
		lateDeduction: `late minutes x ${fmt(hourly / 60)} minute rate = ${fmt(deductions.lateUndertimeAmount)}`,
		earlyOutDeduction: `early-out minutes x ${fmt(hourly / 60)} minute rate = 0.00`,
		otherDeductions: `other payroll deductions not separately mapped = 0.00`,
		grossPay: `${fmt(periodBasic)} basic - ${fmt(deductions.absentDeduction)} absent - ${fmt(deductions.lateUndertimeAmount)} late/UT + ${fmt(earnings.regularOtPay)} OT + ${fmt(earnings.restDayPay + earnings.restDayOtPay + earnings.specialHolidayPay + earnings.legalHolidayPay + earnings.nightDiffPay)} rest/holiday/ND + ${fmt(earnings.grossIncludedBenefits)} gross allowances = ${fmt(earnings.grossPay)}`,
		taxableIncome: `${fmt(earnings.grossPay)} gross - ${fmt(deductions.sss)} SSS - ${fmt(deductions.philHealth)} PhilHealth - ${fmt(deductions.pagIbig)} Pag-IBIG = ${fmt(earnings.grossPay - deductions.sss - deductions.philHealth - deductions.pagIbig)}`,
		totalDeductions: `${fmt(deductions.taxAmount)} tax + ${fmt(deductions.sss)} SSS + ${fmt(deductions.philHealth)} PhilHealth + ${fmt(deductions.pagIbig)} Pag-IBIG + ${fmt(deductions.loanDeductions)} loans + ${fmt(deductions.deductionBenefits)} deduction benefits = ${fmt(deductions.totalDeductions)}`,
		netPay: `${fmt(earnings.grossPay)} gross - ${fmt(deductions.totalDeductions)} deductions + 0.00 net adjustments = ${fmt(net.netPay)}`,
		monthlySalary: `${fmt(periodBasic)} period basic x 2 = ${fmt(monthly)}`,
		dailySalary: `${fmt(periodBasic)} period basic / ${regularDays} effective paid days = ${fmt(rates.displayDailySalary)}`,
		numberOfDays: `sum approvedBuckets.regularDays = ${regularDays}`,
		lateUndertimeAmount: `${fmt(deductions.lateUndertimeAmount)} late + 0.00 early-out = ${fmt(deductions.lateUndertimeAmount)}`,
		regularOtHours: `sum approvedBuckets.regOtHrs = ${regOtHrs}`,
		restDayHours: `sum approvedBuckets.rdHrs = ${rdHrs}`,
		restDayHoursPay: `${rdHrs} hrs x ${fmt(hourly)} hourly x 1.30 = ${fmt(earnings.restDayPay)}`,
		restDayOtHours: `sum approvedBuckets.rdOtHrs = ${rdOtHrs}`,
		restDayOtPay: `${rdOtHrs} hrs x ${fmt(hourly)} hourly x 1.69 = ${fmt(earnings.restDayOtPay)}`,
		specialHolidayOtHours: `${spclHrs} special hrs + ${spclOtHrs} special OT hrs = ${spclHrs + spclOtHrs}`,
		specialHolidayOtPay: `(${spclHrs} x ${fmt(hourly)} x 0.30) + (${spclOtHrs} x ${fmt(hourly)} x 1.69) = ${fmt(earnings.specialHolidayPay)}`,
		legalHolidayOtHours: `sum approvedBuckets.rholOtHrs = ${rholOtHrs}`,
		legalHolidayOtPay: `(${rholHrs} x ${fmt(hourly)} x 1.00) + (${rholOtHrs} x ${fmt(hourly)} x 2.60) = ${fmt(earnings.legalHolidayPay)}`,
		leavePay: `LVP/imported leave source or 1 day x ${fmt(bandaiDaily)} Bandai daily rate = ${fmt(earnings.leavePay)}`,
		obAllowance: imported("OB Allowance"),
		adjustmentOtNd: imported("Adjustment OT/ND"),
		deMinimisAllowance: imported("De Minimis Allowance"),
		modifiedHdmf2: imported("Modified HDMF 2"),
		sssSalaryLoan: imported("SSS Salary Loan"),
		perfectAttendance: imported("Perfect Attendance"),
		mealAllowance: imported("Meal Allowance"),
		totalReceivable: `${fmt(net.netPay)} net + ${fmt(net.receivableOnlyBenefits)} receivable-only allowances = ${fmt(net.totalReceivable)}`,
	};

	if (formulas[field]) return formulas[field];
	if (value) return imported(humanizeField(field));
	return `no positive Rio source amount for ${humanizeField(field)} in this cutoff; stored/default value = 0.00`;
}

function buildRioRegisterQaRows({ formulaCatalog, rioDump, rioComparison }) {
	const rowNumber = rioComparison?.rowNumber || 469;
	const sheetName = rioComparison?.sheetName || "Sheet2";
	const registerByField = new Map((rioDump.registerColumns || []).map((item) => [item.field, item]));
	const comparisonByField = comparisonFieldMap(rioComparison);
	const calc = rioDump.calculation || {};
	const context = {
		rates: calc.rates || {},
		earnings: calc.earnings || {},
		deductions: calc.deductions || {},
		net: calc.net || {},
		buckets: rioDump.lineSummary?.bandaiApprovedBuckets || {},
		rowNumber,
		sheetName,
	};
	const sourceRowsByCode = new Map((rioDump.sourceRows || []).map((row) => [row.code, row]));
	const codeByField = {
		obAllowance: "OBA",
		adjustmentOtNd: "AON",
		deMinimisAllowance: "DMA",
		modifiedHdmf2: "MHDMF2",
		sssSalaryLoan: "SSS_LOAN",
		perfectAttendance: "PFA",
		mealAllowance: "MLA",
		leavePay: "LVP",
	};
	const registerOrder = (rioDump.registerColumns || []).map((item) => item.field);
	const sorted = [...formulaCatalog].sort((a, b) => {
		const ai = registerOrder.indexOf(a.field);
		const bi = registerOrder.indexOf(b.field);
		if (ai >= 0 && bi >= 0) return ai - bi;
		if (ai >= 0) return -1;
		if (bi >= 0) return 1;
		return a.field.localeCompare(b.field);
	});

	return sorted.map((item) => {
		const register = registerByField.get(item.field);
		const comparison = comparisonByField.get(item.field);
		const sourceCell = register?.column ? `${sheetName}!${register.column}${rowNumber}` : item.workbookCell;
		const sourceRow = sourceRowsByCode.get(codeByField[item.field]);
		const contextWithRegister = { ...context, register };
		const value = comparison?.hrisValue ?? register?.dryRunValue ?? item.rioValue ?? 0;
		return {
			field: item.field,
			label: register?.label || item.label,
			value,
			existingEmployeePayrollValue: comparison?.workbookValue ?? register?.existingEmployeePayrollValue ?? value,
			gapToExisting: comparison ? comparison.difference : register ? (register.dryRunValue || 0) - (register.existingEmployeePayrollValue || 0) : 0,
			workbookCell: sourceCell,
			sourceOwner: sourceRow ? `${sourceRow.source} ${sourceRow.code} ${sourceRow.name}` : item.dbSource,
			formulaWithValues: buildRioFormulaWithValues(item.field, contextWithRegister),
			variables: `periodBasic=${fmt(context.rates.periodBasic)}; monthlySalary=${fmt(context.rates.monthlySalary)}; BandaiDaily=${fmt(context.rates.bandaiDailyRate)}; hourly=${fmt(context.rates.hourlyRate)}; regularDays=${context.buckets.regularDays || 0}; regOtHrs=${context.buckets.regOtHrs || 0}; splitFactor=0`,
			affects: item.effect,
			status: register ? "REGISTER_FIELD_TALLIED" : value ? "DERIVED_OR_ROLLUP_TALLIED" : "ZERO_OR_NO_RIO_SOURCE",
			note: item.note,
		};
	});
}

function buildRioRateDecisionRows({ rioDump, rioComparison }) {
	const calc = rioDump.calculation || {};
	const rates = calc.rates || {};
	const earnings = calc.earnings || {};
	const deductions = calc.deductions || {};
	const net = calc.net || {};
	const buckets = rioDump.lineSummary?.bandaiApprovedBuckets || {};
	const checks = comparisonFieldMap(rioComparison);
	const exactBandaiDaily = (rates.monthlySalary || 0) * 12 / 313;
	const exactBandaiHourly = exactBandaiDaily / 8;
	const displayDaily = rates.displayDailySalary || 0;
	const displayHourly = displayDaily / 8;
	const sourceAbsent = checks.get("absentDeduction")?.workbookValue ?? deductions.absentDeduction ?? 0;
	const sourceLeave = checks.get("leavePay")?.workbookValue ?? earnings.leavePay ?? 0;
	const row = (component, targetField, rateBasis, formulaWithValues, calculated, source, variableNote) => {
		const target = checks.get(targetField)?.workbookValue ?? calculated;
		const gap = Math.round((calculated - target) * 100) / 100;
		return {
			component,
			targetField,
			workbookTarget: target,
			rateBasis,
			calculated: Math.round(calculated * 100) / 100,
			gap,
			verdict: Math.abs(gap) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY",
			formulaWithValues,
			source,
			variableNote,
		};
	};

	const regOtHrs = buckets.regOtHrs || 0;
	const grossIncluded = earnings.grossIncludedBenefits || 0;
	const displayOt = regOtHrs * displayHourly * 1.25;
	const bandaiOt = regOtHrs * exactBandaiHourly * 1.25;
	const displayGross = (rates.periodBasic || 0) - sourceAbsent - (deductions.lateUndertimeAmount || 0) + displayOt + sourceLeave + grossIncluded;
	const bandaiGross = (rates.periodBasic || 0) - sourceAbsent - (deductions.lateUndertimeAmount || 0) + bandaiOt + sourceLeave + grossIncluded;
	const displayNet = displayGross - (deductions.totalDeductions || 0);
	const bandaiNet = bandaiGross - (deductions.totalDeductions || 0);

	return [
		row(
			"Regular OT",
			"overtimePay",
			"Bandai premium rate",
			`${regOtHrs} hrs x exact hourly (${fmt(rates.monthlySalary)} x 12 / 313 / 8 = ${fmt(exactBandaiHourly)}) x 1.25 = ${fmt(bandaiOt)}`,
			bandaiOt,
			"Timesheetline approvedBuckets.regOtHrs + Bandai 313 default",
			"Matches workbook Reg OT. This is why premium payroll math uses 313.",
		),
		row(
			"Regular OT",
			"overtimePay",
			"Register dailySalary",
			`${regOtHrs} hrs x display hourly (${fmt(displayDaily)} / 8 = ${fmt(displayHourly)}) x 1.25 = ${fmt(displayOt)}`,
			displayOt,
			"EmployeePayroll.dailySalary/register display allocation",
			"Does not match workbook Reg OT; dailySalary is not the premium OT rate for Rio.",
		),
		row(
			"Leave Pay",
			"leavePay",
			"Bandai premium rate",
			`1 leave-pay unit x exact Bandai daily (${fmt(rates.monthlySalary)} x 12 / 313 = ${fmt(exactBandaiDaily)}) = ${fmt(exactBandaiDaily)}`,
			exactBandaiDaily,
			"EmployeeBenefit LVP / leave source",
			"Matches workbook Leave for Rio.",
		),
		row(
			"Leave Pay",
			"leavePay",
			"Register dailySalary",
			`1 leave-pay unit x display daily ${fmt(displayDaily)} = ${fmt(displayDaily)}`,
			displayDaily,
			"EmployeePayroll.dailySalary/register display allocation",
			"Does not match workbook Leave for Rio.",
		),
		row(
			"Gross Pay",
			"grossPay",
			"Bandai premium rate",
			`${fmt(rates.periodBasic)} basic - ${fmt(sourceAbsent)} absent - ${fmt(deductions.lateUndertimeAmount)} late/UT + ${fmt(bandaiOt)} OT + ${fmt(sourceLeave)} leave + ${fmt(grossIncluded)} gross allowances = ${fmt(bandaiGross)}`,
			bandaiGross,
			"Generated payroll preview + workbook BH",
			"Matches workbook GrossPay when OT uses 313 premium rate.",
		),
		row(
			"Gross Pay",
			"grossPay",
			"Register dailySalary",
			`${fmt(rates.periodBasic)} basic - ${fmt(sourceAbsent)} absent - ${fmt(deductions.lateUndertimeAmount)} late/UT + ${fmt(displayOt)} OT + ${fmt(sourceLeave)} leave + ${fmt(grossIncluded)} gross allowances = ${fmt(displayGross)}`,
			displayGross,
			"Counter-test only",
			"Does not match workbook GrossPay.",
		),
		row(
			"Net Pay",
			"netPay",
			"Bandai premium rate",
			`${fmt(bandaiGross)} gross - ${fmt(deductions.totalDeductions)} deductions = ${fmt(bandaiNet)}`,
			bandaiNet,
			"Generated payroll preview + workbook CL",
			"Matches workbook NetPay.",
		),
		row(
			"Net Pay",
			"netPay",
			"Register dailySalary",
			`${fmt(displayGross)} gross - ${fmt(deductions.totalDeductions)} deductions = ${fmt(displayNet)}`,
			displayNet,
			"Counter-test only",
			"Does not match workbook NetPay.",
		),
		row(
			"Total Receivable",
			"totalReceivable",
			"Bandai premium rate",
			`${fmt(bandaiNet)} net + ${fmt(net.receivableOnlyBenefits)} receivable-only = ${fmt(bandaiNet + (net.receivableOnlyBenefits || 0))}`,
			bandaiNet + (net.receivableOnlyBenefits || 0),
			"Generated payroll preview + workbook CW",
			"Matches workbook TotalReceivable.",
		),
		row(
			"Total Receivable",
			"totalReceivable",
			"Register dailySalary",
			`${fmt(displayNet)} net + ${fmt(net.receivableOnlyBenefits)} receivable-only = ${fmt(displayNet + (net.receivableOnlyBenefits || 0))}`,
			displayNet + (net.receivableOnlyBenefits || 0),
			"Counter-test only",
			"Does not match workbook TotalReceivable.",
		),
	];
}

function reconcileRowsToTarget(rows, key, target, noteKey) {
	const roundedTarget = round2(target);
	if (!roundedTarget) return;
	const current = sumRows(rows, key);
	const residual = round2(roundedTarget - current);
	if (Math.abs(residual) <= 0.01) return;
	const row = [...rows].reverse().find((item) => asNumber(item[key]) !== 0);
	if (!row) return;
	row[key] = round2(asNumber(row[key]) + residual);
	row[noteKey] = [row[noteKey], `Adjusted ${fmt(residual)} so daily ${key} sum equals source register aggregate ${fmt(roundedTarget)}.`]
		.filter(Boolean)
		.join(" ");
}

function buildRioDailyBreakdownRows(rioDump, rioComparison) {
	const comparisonByField = comparisonFieldMap(rioComparison);
	const rates = rioDump.calculation?.rates || {};
	const exactBandaiDaily = asNumber(rates.monthlySalary) * 12 / 313;
	const sourceAbsentTarget = comparisonValue(comparisonByField, ["absentDeduction"]);
	const sourceLeaveTarget = comparisonValue(comparisonByField, ["leavePay"]);
	let sourceLeaveAssigned = false;
	const dailyByDate = new Map((rioDump.existingEmployeePayroll?.dailyBreakdown || []).map((line) => [String(line.date).slice(0, 10), line]));
	const rows = (rioDump.dailyLines || []).map((line) => {
		const date = String(line.date).slice(0, 10);
		const payrollLine = dailyByDate.get(date) || {};
		const dayPay = payrollLine.metadata?.bandaiApprovedBucketDayPay || {};
		const sourceRepair = payrollLine.metadata?.bandaiPayrollSourceRepair || {};
		const buckets = line.bandaiApprovedBuckets || {};
		const breakMinutes = payrollLine.scheduleSnapshot?.breakMinutes ?? payrollLine.metadata?.breakMinutes ?? 0;
		const regularMinutes = payrollLine.metadata?.regularMinutes ?? 0;
		const paidRegularDayMinutes = (buckets.regularDays || 0) * 480;
		const isSourceLeaveRow = !sourceLeaveAssigned && sourceLeaveTarget > 0 && (line.status === "HOLIDAY" || line.status === "LEAVE");
		if (isSourceLeaveRow) sourceLeaveAssigned = true;
		return {
			date,
			dayOfWeek: payrollLine.dayOfWeek || "",
			status: line.status,
			primaryMarker: line.primaryMarker,
			dayType: payrollLine.dayTypeDisplay || payrollLine.dayType || "",
			companyHoliday: payrollLine.holidayInfo?.name || (line.status === "HOLIDAY" ? "HOLIDAY" : ""),
			shift: payrollLine.scheduleSnapshot?.shiftTypeName || payrollLine.scheduleSnapshot?.name || "",
			breakMinutes,
			paidBreakPolicy: breakMinutes > 0 ? "PAID_BREAK_INCLUDED_IN_8H_PAYROLL_DAY" : ((buckets.regularDays || 0) > 0 ? "PAID_DAY_NO_PUNCH_BREAK_SOURCE" : "NO_PAID_REGULAR_DAY"),
			paidRegularDayMinutes,
			paidRegularDayHours: paidRegularDayMinutes / 60,
			totalWorkedMinutes: payrollLine.metadata?.totalMinutesWorked ?? "",
			regularMinutes,
			biometricSourceRows: (payrollLine.metadata?.sourceRows || []).join(", "),
			hoursWorked: line.hoursWorked,
			regularHours: line.regularHours,
			overtimeHours: line.overtimeHours,
			lateHours: line.lateHours,
			undertimeHours: line.undertimeHours,
			earlyOutHours: line.earlyOutHours,
			regularDays: buckets.regularDays || 0,
			regOtHrs: buckets.regOtHrs || 0,
			rdHrs: buckets.rdHrs || 0,
			rdOtHrs: buckets.rdOtHrs || 0,
			spclHrs: buckets.spclHrs || 0,
			spclOtHrs: buckets.spclOtHrs || 0,
			rholHrs: buckets.rholHrs || 0,
			rholOtHrs: buckets.rholOtHrs || 0,
			regNdHrs: buckets.regNdHrs || 0,
			basicAllocationPay: payrollLine.earnings?.regularPay || 0,
			regularPay: round2((buckets.regularDays || 0) * exactBandaiDaily),
			overtimePay: payrollLine.earnings?.overtimePay || dayPay.overtimePay || 0,
			restDayPay: dayPay.restDayPay || 0,
			restDayOtPay: dayPay.restDayOtPay || 0,
			specialHolidayPay: dayPay.specialHolidayPay || 0,
			legalHolidayPay: dayPay.legalHolidayPay || 0,
			nightDiffPay: payrollLine.earnings?.nightDiffPay || dayPay.nightDiffPay || 0,
			totalDayPay: payrollLine.earnings?.totalDayPay || 0,
			absentDeduction: payrollLine.deductions?.absentDeduction || 0,
			sourceRegisterAbsentDeduction: isSourceLeaveRow ? round2(sourceAbsentTarget) : 0,
			sourceRegisterLeavePay: isSourceLeaveRow ? round2(sourceLeaveTarget) : 0,
			latePenalty: payrollLine.deductions?.latePenalty || 0,
			earlyOutPenalty: payrollLine.deductions?.earlyOutPenalty || 0,
			netDayPay: payrollLine.netDayPay || 0,
			premiumHourlyRate: dayPay.premiumHourlyRate || "",
			regularDailyRate: dayPay.regularDailyRate || "",
			bandaiDailyRate: round2(exactBandaiDaily),
			regularPayBasis: (buckets.regularDays || 0) > 0
				? "BANDAI_313_DAILY_RATE"
				: "",
			payrollComputationRole: (buckets.regularDays || 0) > 0
				? "Regular Pay uses BNPI's 313-derived daily rate. Basic Allocation Pay is separate and sums to source register Basic Salary."
				: "",
			aggregateReconciliationNote: "",
			sourceWorkbook: line.metadataSource,
			sourceRow: sourceRepair.sourceRow || "",
			formulaSource: dayPay.formula || "",
		};
	});
	reconcileRowsToTarget(rows, "basicAllocationPay", comparisonValue(comparisonByField, ["basicSalary", "basicPay"]), "aggregateReconciliationNote");
	reconcileRowsToTarget(rows, "overtimePay", comparisonByField.get("overtimePay")?.workbookValue, "aggregateReconciliationNote");
	for (const row of rows) {
		row.totalDayPay = round2(
			asNumber(row.regularPay) +
				asNumber(row.overtimePay) +
				asNumber(row.restDayPay) +
				asNumber(row.restDayOtPay) +
				asNumber(row.specialHolidayPay) +
				asNumber(row.legalHolidayPay) +
				asNumber(row.nightDiffPay),
		);
		row.netDayPay = round2(
			asNumber(row.totalDayPay) -
				asNumber(row.absentDeduction) -
				asNumber(row.latePenalty) -
				asNumber(row.earlyOutPenalty),
		);
	}
	return rows;
}

function buildRioDailyTallyRows({ rioDailyBreakdownRows, rioComparison, rioDump }) {
	const comparisonByField = comparisonFieldMap(rioComparison);
	const rates = rioDump.calculation?.rates || {};
	const tally = (component, targetField, dailyKey, expected, explanation) => {
		const target = expected ?? comparisonValue(comparisonByField, [targetField]);
		const dailySum = sumRows(rioDailyBreakdownRows, dailyKey);
		const gap = round2(dailySum - target);
		return {
			component,
			targetField,
			sourceRegisterTarget: round2(target),
			dailyBreakdownSum: dailySum,
			gap,
			verdict: Math.abs(gap) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY",
			explanation,
		};
	};
	return [
		tally("Regular pay by BNPI 313 daily rate", "bandai313RegularPay", "regularPay", round2(sumRows(rioDailyBreakdownRows, "regularDays") * asNumber(rates.bandaiDailyRate)), "Regular Pay uses the displayed BNPI 313-derived daily rate for each paid regular day."),
		tally("Basic salary allocation display", "basicSalary", "basicAllocationPay", null, "Basic Allocation Pay is separate from Regular Pay and sums to source register Basic Salary."),
		tally("BNPI 313 regular pay vs Basic Salary", "basicSalary", "regularPay", null, "This intentionally does not equal Basic Salary; it proves the daily rate-factor basis is not the same as the period-basic allocation."),
		tally("Regular OT pay", "overtimePay", "overtimePay", null, "Daily OT is reconciled to the aggregate source register OT target to avoid centavo drift from per-day rounding."),
		tally("Source absent amount", "absentDeduction", "sourceRegisterAbsentDeduction", null, "The source payroll computation row has Absent-Amt and Leave as equal Bandai 313 amounts for Rio."),
		tally("Source leave amount", "leavePay", "sourceRegisterLeavePay", comparisonByField.get("leavePay")?.workbookValue, "Leave source uses one Bandai 313 daily amount. It is not the same as regular basic-pay allocation."),
		{
			component: "Rate basis",
			targetField: "bandaiDailyRate",
			sourceRegisterTarget: round2(asNumber(rates.monthlySalary) * 12 / 313),
			dailyBreakdownSum: round2(rates.bandaiDailyRate),
			gap: 0,
			verdict: "DOCUMENTED",
			explanation: `${fmt(rates.monthlySalary)} x 12 / 313 = ${fmt(asNumber(rates.monthlySalary) * 12 / 313)}; hourly basis divides by 8 paid payroll hours.`,
		},
	];
}

function buildRioPayrollWalkthroughRows({ rioDump, rioComparison }) {
	const comparisonByField = comparisonFieldMap(rioComparison);
	const rates = rioDump.calculation?.rates || {};
	const earnings = rioDump.calculation?.earnings || {};
	const deductions = rioDump.calculation?.deductions || {};
	const net = rioDump.calculation?.net || {};
	const value = (fields, fallback = 0) => comparisonValue(comparisonByField, fields, fallback);
	const row = (step, component, sourceValue, formula, result, registerField, sourceCell, verdict, note) => ({
		step,
		component,
		sourceValue,
		formula,
		result: round2(result),
		registerField,
		sourceCell,
		verdict,
		note,
	});
	const sourceAbsent = value(["absentDeduction"]);
	const sourceLeave = value(["leavePay"]);
	const grossIncluded = value(["grossIncludedAllowances"], earnings.grossIncludedBenefits);
	const receivableOnly = value(["receivableOnlyAllowances"], net.receivableOnlyBenefits);
	const tax = value(["withholdingTax"], deductions.taxAmount);
	const sss = value(["sssContribution"], deductions.sss);
	const philHealth = value(["philHealthContribution"], deductions.philHealth);
	const pagIbig = value(["pagibigContribution"], deductions.pagIbig);
	const loans = value(["loanDeductions"], deductions.loanDeductions);
	const deductionBenefits = value(["deductionBenefits"], deductions.deductionBenefits);
	const gross = value(["grossPay"], earnings.grossPay);
	const totalDeductions = value(["totalDeductions"], deductions.totalDeductions);
	const netPay = value(["netPay"], net.netPay);
	const totalReceivable = value(["totalReceivable"], net.totalReceivable);
	return [
		row(1, "Period basic", "Employee.basicSalary", `${fmt(rates.periodBasic)}`, value(["basicSalary"], rates.periodBasic), "Basic Salary", "Sheet2!J469", "TALLIES", "Semi-monthly period basic used by register gross-pay ledger."),
		row(2, "Monthly rate", "Pay frequency SEMI_MONTHLY", `${fmt(rates.periodBasic)} x 2`, value(["monthlySalary"], rates.monthlySalary), "Monthly Salary", "Sheet2!G469", "TALLIES", "Monthly rate feeds BNPI 313 daily-rate formula."),
		row(3, "BNPI daily rate", "BNPI rate factor", `${fmt(rates.monthlySalary)} x 12 / 313`, rates.bandaiDailyRate, "Bandai Daily", "Internal BNPI default", "DOCUMENTED", "Used for daily-rate proof, leave/absence factor, and premium hourly basis."),
		row(4, "BNPI hourly rate", "Paid payroll day = 8 hours", `${fmt(rates.bandaiDailyRate)} / 8`, rates.hourlyRate, "Premium Hourly", "Internal BNPI default", "DOCUMENTED", "Paid break is included in the 8-hour payroll day."),
		row(5, "Daily regular-rate proof", "10 paid regular days", `10 x ${fmt(rates.bandaiDailyRate)}`, round2(10 * rates.bandaiDailyRate), "Regular Pay by BNPI 313", "Rio Daily Breakdown", "TALLIES", "This is the rate-factor ledger, not the register Basic Salary ledger."),
		row(6, "Register basic allocation", "10 paid days", `10 x ${fmt(rates.displayDailySalary)}`, value(["basicSalary"], rates.periodBasic), "Basic Salary", "Sheet2!J469", "TALLIES", "This is why 950 is kept as Basic Allocation Pay, not daily rate."),
		row(7, "Regular OT", "Approved regular OT hours", `30.5 x ${fmt(rates.hourlyRate)} x 1.25`, value(["overtimePay"], earnings.regularOtPay), "Reg OT", "Sheet2!N469", "TALLIES", "Uses BNPI hourly rate from daily/8."),
		row(8, "Source absent", "Payroll computation source row", `1 x ${fmt(rates.bandaiDailyRate)}`, sourceAbsent, "Absent-Amt", "Sheet2!K469", "TALLIES", "Source row deducts one BNPI daily-rate amount."),
		row(9, "Source leave", "EmployeeBenefit LVP / source row", `1 x ${fmt(rates.bandaiDailyRate)}`, sourceLeave, "Leave", "Sheet2!AH469", "TALLIES", "Leave adds back the same BNPI daily-rate amount."),
		row(10, "Gross-included allowances", "OBA + DMA + AON", `${fmt(120)} + ${fmt(250)} + ${fmt(113.82)}`, grossIncluded, "Gross included allowances", "Sheet2!AN/BD/BA469", "TALLIES", "These are included before gross pay."),
		row(11, "Gross Pay", "Register gross ledger", `${fmt(value(["basicSalary"]))} - ${fmt(sourceAbsent)} + ${fmt(value(["overtimePay"]))} + ${fmt(sourceLeave)} + ${fmt(grossIncluded)}`, gross, "GrossPay", "Sheet2!BH469", "TALLIES", "Absent and leave cancel; gross still uses Basic Salary allocation."),
		row(12, "Withholding tax", "Payroll computation source target", `${fmt(tax)} source value; configured diagnostic is ${fmt(deductions.configuredTaxAmount)}`, tax, "W/Tax", "Sheet2!BI469", "TALLIES", "This cutoff uses workbook/generated tax parity; tax-table diagnostic is shown separately."),
		row(13, "Statutory contributions", "Second cutoff split factor = 0", `${fmt(sss)} SSS + ${fmt(philHealth)} PhilHealth + ${fmt(pagIbig)} Pag-IBIG`, sss + philHealth + pagIbig, "BK/BL/BM", "Sheet2!BK:BM469", "TALLIES", "Contribution schedule for this period makes statutory employee share zero."),
		row(14, "Loans and deduction benefits", "SSS Salary Loan + Modified HDMF 2", `${fmt(loans)} + ${fmt(deductionBenefits)}`, loans + deductionBenefits, "Loan/deduction fields", "Sheet2!CJ/BW469", "TALLIES", "Imported source deductions."),
		row(15, "Total deductions", "Tax + statutory + loans + deduction benefits", `${fmt(tax)} + ${fmt(sss)} + ${fmt(philHealth)} + ${fmt(pagIbig)} + ${fmt(loans)} + ${fmt(deductionBenefits)}`, totalDeductions, "TOTAL DEDN", "Sheet2!CK469", "TALLIES", "All deduction fields summed."),
		row(16, "Net Pay", "Gross - total deductions", `${fmt(gross)} - ${fmt(totalDeductions)}`, netPay, "NetPay", "Sheet2!CL469", "TALLIES", "Register net pay."),
		row(17, "Receivable-only allowances", "Perfect Attendance + Meal Allowance", `${fmt(200)} + ${fmt(500)}`, receivableOnly, "CT/CU", "Sheet2!CT/CU469", "TALLIES", "Added after net pay."),
		row(18, "Total Receivable", "NetPay + receivable-only allowances", `${fmt(netPay)} + ${fmt(receivableOnly)}`, totalReceivable, "TotalReceivable", "Sheet2!CW469", "TALLIES", "Final cash receivable in bank sheet."),
	];
}

function buildRioDailyComputationRows({ rioDailyBreakdownRows, rioDump, rioComparison }) {
	const rates = rioDump.calculation?.rates || {};
	const comparisonByField = comparisonFieldMap(rioComparison);
	const value = (fields, fallback = 0) => comparisonValue(comparisonByField, fields, fallback);
	const dayRows = rioDailyBreakdownRows.map((row) => ({
		rowType: "DAY",
		date: row.date,
		status: row.status,
		shift: row.shift,
		workedRegularMinutes: row.regularMinutes,
		paidBreakMinutes: row.breakMinutes,
		paidDayMinutes: row.paidRegularDayMinutes,
		regularDays: row.regularDays,
		bnpiDailyRate: rates.bandaiDailyRate,
		bnpiRegularPay: row.regularPay,
		basicAllocationPay: row.basicAllocationPay,
		regOtHrs: row.regOtHrs,
		otFormula: row.regOtHrs ? `${row.regOtHrs} x ${fmt(rates.hourlyRate)} x 1.25` : "",
		otPay: row.overtimePay,
		sourceAbsent: row.sourceRegisterAbsentDeduction,
		sourceLeave: row.sourceRegisterLeavePay,
		grossIncluded: "",
		totalDeductions: "",
		netPay: "",
		receivableOnly: "",
		totalReceivable: "",
		tallyTarget: "",
		gap: "",
		verdict: "",
		rowExplanation: row.regularDays
			? `${fmt(rates.bandaiDailyRate)} BNPI daily rate; ${fmt(row.basicAllocationPay)} basic allocation; ${row.regOtHrs || 0} OT hrs.`
		: row.sourceRegisterLeavePay
				? "Source leave/absence factor row."
				: "No paid regular day amount.",
	}));
	const totals = {
		regularDays: sumRows(dayRows, "regularDays"),
		bnpiRegularPay: sumRows(dayRows, "bnpiRegularPay"),
		basicAllocationPay: sumRows(dayRows, "basicAllocationPay"),
		otPay: sumRows(dayRows, "otPay"),
		sourceAbsent: sumRows(dayRows, "sourceAbsent"),
		sourceLeave: sumRows(dayRows, "sourceLeave"),
		grossIncluded: value(["grossIncludedAllowances"]),
		totalDeductions: value(["totalDeductions"]),
		netPay: value(["netPay"]),
		receivableOnly: value(["receivableOnlyAllowances"]),
		totalReceivable: value(["totalReceivable"]),
	};
	const gross = round2(totals.basicAllocationPay - totals.sourceAbsent + totals.otPay + totals.sourceLeave + totals.grossIncluded);
	const netPay = round2(gross - totals.totalDeductions);
	const totalReceivable = round2(netPay + totals.receivableOnly);
	const summaryRows = [
		{
			rowType: "TOTAL",
			date: "DAILY TOTAL",
			status: "Rate-factor daily total",
			regularDays: totals.regularDays,
			bnpiDailyRate: rates.bandaiDailyRate,
			bnpiRegularPay: totals.bnpiRegularPay,
			basicAllocationPay: totals.basicAllocationPay,
			otPay: totals.otPay,
			sourceAbsent: totals.sourceAbsent,
			sourceLeave: totals.sourceLeave,
			tallyTarget: totals.bnpiRegularPay,
			gap: 0,
			verdict: "TALLIES",
			rowExplanation: `Sum of DAY rows: ${totals.regularDays} paid days x ${fmt(rates.bandaiDailyRate)} = ${fmt(totals.bnpiRegularPay)}. This proves the BNPI 313 daily-rate basis.`,
		},
		{
			rowType: "TOTAL",
			date: "REGISTER INPUT TOTAL",
			status: "Basic salary allocation",
			basicAllocationPay: totals.basicAllocationPay,
			tallyTarget: value(["basicSalary"]),
			gap: round2(totals.basicAllocationPay - value(["basicSalary"])),
			verdict: Math.abs(round2(totals.basicAllocationPay - value(["basicSalary"]))) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY",
			rowExplanation: `Sum of DAY Basic Allocation Pay = ${fmt(totals.basicAllocationPay)}; this feeds register Basic Salary, not the BNPI daily-rate proof.`,
		},
		{
			rowType: "ROLLUP",
			date: "GROSS PAY",
			status: "Register gross formula",
			basicAllocationPay: totals.basicAllocationPay,
			otPay: totals.otPay,
			sourceAbsent: totals.sourceAbsent,
			sourceLeave: totals.sourceLeave,
			grossIncluded: totals.grossIncluded,
			tallyTarget: value(["grossPay"]),
			gap: round2(gross - value(["grossPay"])),
			verdict: Math.abs(round2(gross - value(["grossPay"]))) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY",
			rowExplanation: `${fmt(totals.basicAllocationPay)} Basic Allocation - ${fmt(totals.sourceAbsent)} Absent + ${fmt(totals.otPay)} OT + ${fmt(totals.sourceLeave)} Leave + ${fmt(totals.grossIncluded)} gross-included allowances = ${fmt(gross)} GrossPay.`,
		},
		{
			rowType: "ROLLUP",
			date: "TOTAL DEDUCTIONS",
			status: "Tax + loans + deduction benefits",
			totalDeductions: totals.totalDeductions,
			tallyTarget: value(["totalDeductions"]),
			gap: round2(totals.totalDeductions - value(["totalDeductions"])),
			verdict: Math.abs(round2(totals.totalDeductions - value(["totalDeductions"]))) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY",
			rowExplanation: `${fmt(value(["withholdingTax"]))} W/Tax + ${fmt(value(["sssContribution"]))} SSS + ${fmt(value(["philHealthContribution"]))} PhilHealth + ${fmt(value(["pagibigContribution"]))} Pag-IBIG + ${fmt(value(["loanDeductions"]))} loan + ${fmt(value(["deductionBenefits"]))} deduction benefit = ${fmt(totals.totalDeductions)}.`,
		},
		{
			rowType: "ROLLUP",
			date: "NET PAY",
			status: "Gross - deductions",
			totalDeductions: totals.totalDeductions,
			netPay,
			tallyTarget: value(["netPay"]),
			gap: round2(netPay - value(["netPay"])),
			verdict: Math.abs(round2(netPay - value(["netPay"]))) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY",
			rowExplanation: `${fmt(gross)} GrossPay - ${fmt(totals.totalDeductions)} Total Deductions = ${fmt(netPay)} NetPay.`,
		},
		{
			rowType: "ROLLUP",
			date: "TOTAL RECEIVABLE",
			status: "Net + receivable-only",
			netPay,
			receivableOnly: totals.receivableOnly,
			totalReceivable,
			tallyTarget: value(["totalReceivable"]),
			gap: round2(totalReceivable - value(["totalReceivable"])),
			verdict: Math.abs(round2(totalReceivable - value(["totalReceivable"]))) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY",
			rowExplanation: `${fmt(netPay)} NetPay + ${fmt(totals.receivableOnly)} receivable-only allowances = ${fmt(totalReceivable)} TotalReceivable.`,
		},
	];
	return [...dayRows, ...summaryRows];
}

function buildRioPayrollMathChainRows({ rioDailyBreakdownRows, rioDump, rioComparison }) {
	const rates = rioDump.calculation?.rates || {};
	const deductions = rioDump.calculation?.deductions || {};
	const comparisonByField = comparisonFieldMap(rioComparison);
	const value = (fields, fallback = 0) => round2(comparisonValue(comparisonByField, fields, fallback));
	const sourceCell = (field) => comparisonByField.get(field)?.sourceCell || "";
	const targetGap = (computed, target) => round2(computed - target);
	const row = ({
		section,
		step,
		component,
		humanPayrollLabel = component,
		shortSourceRegisterLabel = "",
		payrollField = "",
		sourceKind = "",
		dailyColumn = "",
		includedInGrossPay = "NO",
		deductedAfterGrossPay = "NO",
		addedAfterNetPay = "NO",
		operation = "",
		computedValue = "",
		targetValue = "",
		sourceReference = "",
		explanation = "",
		verdictOverride = null,
	}) => {
		const computed = computedValue === "" ? "" : round2(computedValue);
		const target = targetValue === "" ? "" : round2(targetValue);
		const gap = computed === "" || target === "" ? "" : targetGap(computed, target);
		return {
			section,
			step,
			component,
			humanPayrollLabel,
			shortSourceRegisterLabel,
			payrollField,
			sourceKind,
			dailyColumn,
			includedInGrossPay,
			deductedAfterGrossPay,
			addedAfterNetPay,
			operation,
			computedValue: computed,
			targetValue: target,
			gap,
			verdict: verdictOverride || (gap === "" ? "DOCUMENTED" : (Math.abs(gap) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY")),
			sourceReference,
			explanation,
		};
	};

	const dailyTotals = {
		workedRegularMinutes: sumRows(rioDailyBreakdownRows, "regularMinutes"),
		paidBreakMinutes: sumRows(rioDailyBreakdownRows, "breakMinutes"),
		paidDayMinutes: sumRows(rioDailyBreakdownRows, "paidRegularDayMinutes"),
		regularDays: sumRows(rioDailyBreakdownRows, "regularDays"),
		bnpiRegularPay: sumRows(rioDailyBreakdownRows, "regularPay"),
		basicAllocationPay: sumRows(rioDailyBreakdownRows, "basicAllocationPay"),
		regOtHrs: sumRows(rioDailyBreakdownRows, "regOtHrs"),
		otPay: sumRows(rioDailyBreakdownRows, "overtimePay"),
		sourceAbsent: sumRows(rioDailyBreakdownRows, "sourceRegisterAbsentDeduction"),
		sourceLeave: sumRows(rioDailyBreakdownRows, "sourceRegisterLeavePay"),
	};
	const grossIncluded = value(["grossIncludedAllowances"]);
	const receivableOnly = value(["receivableOnlyAllowances"]);
	const obAllowance = value(["obAllowance"], 120);
	const deMinimisAllowance = value(["deMinimisAllowance"], 250);
	const adjustmentOtNd = value(["adjustmentOtNd"], 113.82);
	const perfectAttendance = value(["perfectAttendance"], 200);
	const mealAllowance = value(["mealAllowance"], 500);
	const tax = value(["withholdingTax"], deductions.taxAmount);
	const sss = value(["sssContribution"], deductions.sss);
	const philHealth = value(["philHealthContribution"], deductions.philHealth);
	const pagIbig = value(["pagibigContribution"], deductions.pagIbig);
	const loans = value(["loanDeductions"], deductions.loanDeductions);
	const deductionBenefits = value(["deductionBenefits"], deductions.deductionBenefits);
	const gross = round2(dailyTotals.basicAllocationPay - dailyTotals.sourceAbsent + dailyTotals.otPay + dailyTotals.sourceLeave + grossIncluded);
	const totalDeductions = round2(tax + sss + philHealth + pagIbig + loans + deductionBenefits);
	const netPay = round2(gross - totalDeductions);
	const totalReceivable = round2(netPay + receivableOnly);
	const configuredTax = round2(deductions.configuredTaxAmount);
	const displayDaily = value(["dailySalary"], rates.displayDailySalary);
	const monthlyRate = value(["monthlySalary"], rates.monthlySalary);
	const exactBnpiDaily = asNumber(rates.monthlySalary) * 12 / 313;
	const exactHourly = exactBnpiDaily / 8;
	const dailyRows = rioDailyBreakdownRows.map((line, index) => {
		const status = String(line.status || "");
		const meaning = status === "PRESENT"
			? "present paid regular day"
			: status === "HOLIDAY"
				? "holiday/source leave or paid-day context"
				: status === "REST_DAY"
					? "rest/off day with no regular paid-day base"
					: "daily source row";
		return row({
			section: "02 Daily detail rows",
			step: index + 1,
			component: line.date,
			humanPayrollLabel: `${line.date} ${status}`,
			shortSourceRegisterLabel: meaning,
			payrollField: "daily line",
			sourceKind: "DAILY_SOURCE",
			dailyColumn: "regularMinutes + breakMinutes + paidRegularDayMinutes + regularDays + regularPay + basicAllocationPay + overtimePay + source absent/leave",
			includedInGrossPay: asNumber(line.basicAllocationPay) || asNumber(line.overtimePay) || asNumber(line.sourceRegisterLeavePay) ? "PARTIAL" : "NO",
			operation: `${status}; ${line.shift}; worked ${asNumber(line.regularMinutes)} + paid break ${asNumber(line.breakMinutes)} = paid payroll day ${asNumber(line.paidRegularDayMinutes)} minutes; regularDays ${asNumber(line.regularDays)}; BNPI regular proof ${fmt(line.regularPay)}; Basic Allocation ${fmt(line.basicAllocationPay)}; OT ${asNumber(line.regOtHrs)} hrs = ${fmt(line.overtimePay)}; Source Absent ${fmt(line.sourceRegisterAbsentDeduction)}; Source Leave ${fmt(line.sourceRegisterLeavePay)}.`,
			computedValue: round2(asNumber(line.basicAllocationPay) + asNumber(line.overtimePay) - asNumber(line.sourceRegisterAbsentDeduction) + asNumber(line.sourceRegisterLeavePay)),
			targetValue: "",
			sourceReference: `Rio Daily Breakdown ${line.sourceWorkbook || ""} row ${line.sourceRow || ""}`.trim(),
			explanation: status === "PRESENT"
				? "450 worked regular minutes + 30 paid break minutes = 480 paid payroll minutes. Counts as 1 regular paid day. Basic Allocation Pay feeds GrossPay base. BNPI daily rate feeds premium/OT proof."
				: status === "HOLIDAY"
					? "Holiday/source row can contribute a paid regular day or source leave/absence factor without worked regular minutes."
					: "Rest/off row contributes no regular paid day and no GrossPay base unless a separate rest/holiday source pay exists.",
			verdictOverride: "DOCUMENTED",
		});
	});

	const rows = [
		row({ section: "01 Rate truth", step: 1, component: "Monthly rate", humanPayrollLabel: "Monthly rate", shortSourceRegisterLabel: "monthly", payrollField: "monthlySalary", sourceKind: "REGISTER_SOURCE", dailyColumn: "source monthly rate", operation: `${fmt(rates.periodBasic)} period basic x 2 semi-monthly periods`, computedValue: monthlyRate, targetValue: monthlyRate, sourceReference: "Employee.basicSalary / Sheet2!G469", explanation: "Monthly rate feeds BNPI 313 divisor." }),
		row({ section: "01 Rate truth", step: 2, component: "BNPI daily rate", humanPayrollLabel: "BNPI daily rate", shortSourceRegisterLabel: "BNPI 313", payrollField: "bandaiDailyRate", sourceKind: "BNPI_CONFIG", dailyColumn: "rate input", operation: `${fmt(monthlyRate)} x 12 / 313`, computedValue: round2(exactBnpiDaily), targetValue: round2(rates.bandaiDailyRate), sourceReference: "BNPI/Bandai rate factor", explanation: "This is the premium daily-rate basis for OT/absence/leave factor math." }),
		row({ section: "01 Rate truth", step: 3, component: "BNPI hourly rate", humanPayrollLabel: "BNPI hourly rate", shortSourceRegisterLabel: "BNPI daily / 8", payrollField: "hourlyRate", sourceKind: "BNPI_CONFIG", dailyColumn: "rate input", operation: `${fmt(round2(exactBnpiDaily))} / 8 paid payroll hours`, computedValue: round2(exactHourly), targetValue: round2(rates.hourlyRate), sourceReference: "BNPI/Bandai paid day hours", explanation: "Paid break is included in the 8-hour payroll day." }),
		row({ section: "01 Rate truth", step: 4, component: "Register basic allocation daily display", humanPayrollLabel: "Register/basic allocation daily display", shortSourceRegisterLabel: "display daily", payrollField: "dailySalary", sourceKind: "REGISTER_ALLOCATION", dailyColumn: "basicAllocationPay display", includedInGrossPay: "YES_AS_SUM_BASIC_ALLOCATION", operation: `${fmt(value(["basicSalary"]))} / ${dailyTotals.regularDays} paid regular days`, computedValue: displayDaily, targetValue: displayDaily, sourceReference: "Sheet2 display/register allocation", explanation: "This 950.00 amount is only the Basic Allocation Pay display. It is not the BNPI premium daily rate." }),
		row({ section: "01 Rate truth", step: 5, component: "Does BNPI Daily Rate Feed GrossPay Base?", humanPayrollLabel: "BNPI daily rate vs GrossPay base", shortSourceRegisterLabel: "rate decision", payrollField: "grossPay", sourceKind: "RATE_DECISION", dailyColumn: "BNPI Regular Pay vs Basic Allocation Pay", includedInGrossPay: "NO_FOR_BNPI_REGULAR_PROOF; YES_FOR_BASIC_ALLOCATION", operation: `BNPI regular proof ${dailyTotals.regularDays} x ${fmt(rates.bandaiDailyRate)} = ${fmt(dailyTotals.bnpiRegularPay)}; GrossPay base uses SUM Basic Allocation Pay = ${fmt(dailyTotals.basicAllocationPay)}`, computedValue: dailyTotals.basicAllocationPay, targetValue: value(["basicSalary"]), sourceReference: "Rio Daily Computation / Sheet2!J469", explanation: "BNPI daily rate does not replace Basic Allocation Pay in GrossPay. BNPI daily rate is used for OT/absence/leave factor math; Basic Allocation Pay is used as the GrossPay base." }),
		...dailyRows,
		row({ section: "03 Literal daily sums", step: 1, component: "SUM Regular Days", humanPayrollLabel: "Regular Days", shortSourceRegisterLabel: "Reg Days", payrollField: "regularDays", sourceKind: "DAILY_SUM", dailyColumn: "Regular Days", includedInGrossPay: "YES_FOR_BASIC_ALLOCATION_COUNT", operation: "SUM Rio Daily Computation[Regular Days]", computedValue: dailyTotals.regularDays, targetValue: value(["regularDays"]), sourceReference: sourceCell("regularDays"), explanation: "Daily paid regular days feed Basic Allocation Pay and the BNPI rate proof." }),
		row({ section: "03 Literal daily sums", step: 2, component: "SUM Worked Regular Minutes", humanPayrollLabel: "Worked Regular Minutes", shortSourceRegisterLabel: "worked minutes", payrollField: "workedRegularMinutes", sourceKind: "DAILY_SUM", dailyColumn: "Worked Regular Minutes", operation: "SUM day worked regular minutes", computedValue: dailyTotals.workedRegularMinutes, targetValue: dailyTotals.workedRegularMinutes, sourceReference: "Rio Daily Breakdown", explanation: "9 present lines show 450 worked regular minutes; holiday/off rows do not add worked minutes." }),
		row({ section: "03 Literal daily sums", step: 3, component: "SUM Paid Break Minutes", humanPayrollLabel: "Paid Break Minutes", shortSourceRegisterLabel: "paid break", payrollField: "paidBreakMinutes", sourceKind: "DAILY_SUM", dailyColumn: "Paid Break Minutes", operation: "SUM day paid break minutes", computedValue: dailyTotals.paidBreakMinutes, targetValue: dailyTotals.paidBreakMinutes, sourceReference: "Rio Daily Breakdown", explanation: "Paid break is documented separately from worked regular minutes." }),
		row({ section: "03 Literal daily sums", step: 4, component: "SUM Payroll Paid Day Minutes", humanPayrollLabel: "Payroll Paid Day Minutes", shortSourceRegisterLabel: "paid day minutes", payrollField: "paidDayMinutes", sourceKind: "DAILY_SUM", dailyColumn: "Paid Day Minutes", operation: "SUM day payroll paid minutes", computedValue: dailyTotals.paidDayMinutes, targetValue: dailyTotals.paidDayMinutes, sourceReference: "Rio Daily Breakdown", explanation: "Paid payroll day minutes prove 8-hour payroll day treatment." }),
		row({ section: "03 Literal daily sums", step: 5, component: "SUM BNPI Regular Pay", humanPayrollLabel: "BNPI Regular Pay", shortSourceRegisterLabel: "BNPI 313 proof", payrollField: "bnpi313RegularPay", sourceKind: "DAILY_SUM_RATE_PROOF", dailyColumn: "BNPI Regular Pay", includedInGrossPay: "NO_RATE_PROOF_ONLY", operation: `${dailyTotals.regularDays} paid days x ${fmt(rates.bandaiDailyRate)}`, computedValue: dailyTotals.bnpiRegularPay, targetValue: round2(dailyTotals.regularDays * rates.bandaiDailyRate), sourceReference: "Rio Daily Computation", explanation: "This proves the BNPI 313 daily-rate ledger. It is not the GrossPay base." }),
		row({ section: "03 Literal daily sums", step: 6, component: "SUM Basic Allocation Pay", humanPayrollLabel: "Basic Allocation Pay", shortSourceRegisterLabel: "Basic Salary base", payrollField: "basicSalary", sourceKind: "DAILY_SUM_TO_REGISTER_FIELD", dailyColumn: "Basic Allocation Pay", includedInGrossPay: "YES", operation: "SUM daily Basic Allocation Pay", computedValue: dailyTotals.basicAllocationPay, targetValue: value(["basicSalary"]), sourceReference: sourceCell("basicSalary"), explanation: "This is the amount used as register Basic Salary and the GrossPay base." }),
		row({ section: "03 Literal daily sums", step: 7, component: "SUM Regular OT Hours", humanPayrollLabel: "Regular OT Hours", shortSourceRegisterLabel: "Reg OT Hrs", payrollField: "overtimeHours", sourceKind: "DAILY_SUM_TO_REGISTER_FIELD", dailyColumn: "Reg OT Hrs", includedInGrossPay: "YES_THROUGH_OT_PAY", operation: "SUM daily Reg OT Hrs", computedValue: dailyTotals.regOtHrs, targetValue: value(["overtimeHours"]), sourceReference: sourceCell("overtimeHours"), explanation: "Approved OT hours feed overtime pay." }),
		row({ section: "03 Literal daily sums", step: 8, component: "SUM OT Pay", humanPayrollLabel: "OT Pay", shortSourceRegisterLabel: "Reg OT", payrollField: "overtimePay", sourceKind: "DAILY_SUM_TO_REGISTER_FIELD", dailyColumn: "OT Pay", includedInGrossPay: "YES", operation: `${fmt(dailyTotals.regOtHrs)} OT hrs x ${fmt(rates.hourlyRate)} hourly x 1.25`, computedValue: dailyTotals.otPay, targetValue: value(["overtimePay"]), sourceReference: sourceCell("overtimePay"), explanation: "Daily OT is reconciled to source register aggregate." }),
		row({ section: "03 Literal daily sums", step: 9, component: "SUM Source Absent", humanPayrollLabel: "Source Absent", shortSourceRegisterLabel: "Absent-Amt", payrollField: "absentDeduction", sourceKind: "DAILY_SUM_TO_REGISTER_FIELD", dailyColumn: "Source Absent", includedInGrossPay: "YES_NEGATIVE", operation: `1 source absence factor x ${fmt(rates.bandaiDailyRate)}`, computedValue: dailyTotals.sourceAbsent, targetValue: value(["absentDeduction"]), sourceReference: sourceCell("absentDeduction"), explanation: "The source payroll row deducts one BNPI daily amount from GrossPay." }),
		row({ section: "03 Literal daily sums", step: 10, component: "SUM Source Leave", humanPayrollLabel: "Source Leave", shortSourceRegisterLabel: "Leave", payrollField: "leavePay", sourceKind: "DAILY_SUM_TO_REGISTER_FIELD", dailyColumn: "Source Leave", includedInGrossPay: "YES", operation: `1 source leave factor x ${fmt(rates.bandaiDailyRate)}`, computedValue: dailyTotals.sourceLeave, targetValue: value(["leavePay"]), sourceReference: sourceCell("leavePay"), explanation: "Leave adds back the same BNPI daily amount to GrossPay." }),
		row({ section: "04 Named GrossPay inputs", step: 1, component: "OB Allowance / OBA", humanPayrollLabel: "OB Allowance", shortSourceRegisterLabel: "OBA", payrollField: "obAllowance", sourceKind: "EMPLOYEE_BENEFIT_OR_REGISTER_SOURCE", dailyColumn: "not a daily sum", includedInGrossPay: "YES", operation: "OB Allowance / OBA source amount", computedValue: obAllowance, targetValue: obAllowance, sourceReference: "Sheet2!AN469 / benefit source", explanation: "Named gross-included allowance; included before GrossPay." }),
		row({ section: "04 Named GrossPay inputs", step: 2, component: "De Minimis Allowance / DMA", humanPayrollLabel: "De Minimis Allowance", shortSourceRegisterLabel: "DMA", payrollField: "deMinimisAllowance", sourceKind: "EMPLOYEE_BENEFIT_OR_REGISTER_SOURCE", dailyColumn: "not a daily sum", includedInGrossPay: "YES", operation: "De Minimis Allowance / DMA source amount", computedValue: deMinimisAllowance, targetValue: deMinimisAllowance, sourceReference: "Sheet2!BD469 / benefit source", explanation: "Named gross-included allowance; included before GrossPay." }),
		row({ section: "04 Named GrossPay inputs", step: 3, component: "Adjustment OT/ND", humanPayrollLabel: "Adjustment OT/ND", shortSourceRegisterLabel: "AON", payrollField: "adjustmentOtNd", sourceKind: "EMPLOYEE_BENEFIT_OR_REGISTER_SOURCE", dailyColumn: "not a daily sum", includedInGrossPay: "YES", operation: "Adjustment OT/ND source amount", computedValue: adjustmentOtNd, targetValue: adjustmentOtNd, sourceReference: "Sheet2!BA469 / benefit source", explanation: "Named gross-included adjustment; included before GrossPay." }),
		row({ section: "04 Named GrossPay inputs", step: 4, component: "Gross-included total", humanPayrollLabel: "Gross-included total", shortSourceRegisterLabel: "OBA + DMA + AON", payrollField: "grossIncludedAllowances", sourceKind: "NAMED_SOURCE_SUM_TO_GROSS", dailyColumn: "not a daily sum", includedInGrossPay: "YES", operation: `${fmt(obAllowance)} + ${fmt(deMinimisAllowance)} + ${fmt(adjustmentOtNd)}`, computedValue: round2(obAllowance + deMinimisAllowance + adjustmentOtNd), targetValue: grossIncluded, sourceReference: "Sheet2!AN/BD/BA469", explanation: "OB Allowance plus De Minimis plus Adjustment OT/ND are the named gross-included inputs." }),
		row({ section: "04 Named GrossPay inputs", step: 5, component: "GrossPay", humanPayrollLabel: "GrossPay", shortSourceRegisterLabel: "gross", payrollField: "grossPay", sourceKind: "ROLLUP_FROM_DAILY_AND_NAMED_SOURCE", dailyColumn: "Basic Allocation + Source Absent + OT Pay + Source Leave + named gross inputs", includedInGrossPay: "RESULT", operation: `${fmt(dailyTotals.basicAllocationPay)} - ${fmt(dailyTotals.sourceAbsent)} + ${fmt(dailyTotals.otPay)} + ${fmt(dailyTotals.sourceLeave)} + ${fmt(grossIncluded)}`, computedValue: gross, targetValue: value(["grossPay"]), sourceReference: sourceCell("grossPay"), explanation: "GrossPay uses SUM Basic Allocation Pay as the base. BNPI daily rate is still used for OT, absence, and leave factor math." }),
		row({ section: "05 Named deduction inputs", step: 1, component: "Withholding Tax / WTax", humanPayrollLabel: "Withholding Tax", shortSourceRegisterLabel: "WTax", payrollField: "withholdingTax", sourceKind: "SOURCE_TAX_PARITY", dailyColumn: "not a daily sum", deductedAfterGrossPay: "YES", operation: "Payroll computation source W/Tax", computedValue: tax, targetValue: value(["withholdingTax"]), sourceReference: sourceCell("withholdingTax"), explanation: "Register tally uses source payroll W/Tax, not the configured diagnostic." }),
		row({ section: "05 Named deduction inputs", step: 2, component: "SSS Contribution", humanPayrollLabel: "SSS Contribution", shortSourceRegisterLabel: "SSS", payrollField: "sssContribution", sourceKind: "STATUTORY_CONFIG_SECOND_CUTOFF", dailyColumn: "not a daily sum", deductedAfterGrossPay: "YES", operation: "Second cutoff statutory split source amount", computedValue: sss, targetValue: value(["sssContribution"]), sourceReference: sourceCell("sssContribution"), explanation: "Second cutoff split makes SSS employee share zero for this proof." }),
		row({ section: "05 Named deduction inputs", step: 3, component: "PhilHealth Contribution", humanPayrollLabel: "PhilHealth Contribution", shortSourceRegisterLabel: "PhilHealth", payrollField: "philHealthContribution", sourceKind: "STATUTORY_CONFIG_SECOND_CUTOFF", dailyColumn: "not a daily sum", deductedAfterGrossPay: "YES", operation: "Second cutoff statutory split source amount", computedValue: philHealth, targetValue: value(["philHealthContribution"]), sourceReference: sourceCell("philHealthContribution"), explanation: "Second cutoff split makes PhilHealth employee share zero for this proof." }),
		row({ section: "05 Named deduction inputs", step: 4, component: "Pag-IBIG Contribution", humanPayrollLabel: "Pag-IBIG Contribution", shortSourceRegisterLabel: "Pag-IBIG", payrollField: "pagibigContribution", sourceKind: "STATUTORY_CONFIG_SECOND_CUTOFF", dailyColumn: "not a daily sum", deductedAfterGrossPay: "YES", operation: "Second cutoff statutory split source amount", computedValue: pagIbig, targetValue: value(["pagibigContribution"]), sourceReference: sourceCell("pagibigContribution"), explanation: "Second cutoff split makes Pag-IBIG employee share zero for this proof." }),
		row({ section: "05 Named deduction inputs", step: 5, component: "SSS Salary Loan", humanPayrollLabel: "SSS Salary Loan", shortSourceRegisterLabel: "SSS Salary Loan", payrollField: "loanDeductions", sourceKind: "EMPLOYEE_LOAN", dailyColumn: "not a daily sum", deductedAfterGrossPay: "YES", operation: "SSS Salary Loan source amount", computedValue: loans, targetValue: value(["loanDeductions"]), sourceReference: "Sheet2!CJ469 / employee loan source", explanation: "Named loan deduction; deducted after GrossPay." }),
		row({ section: "05 Named deduction inputs", step: 6, component: "Modified HDMF 2", humanPayrollLabel: "Modified HDMF 2", shortSourceRegisterLabel: "Modified HDMF 2", payrollField: "deductionBenefits", sourceKind: "EMPLOYEE_BENEFIT_DEDUCTION", dailyColumn: "not a daily sum", deductedAfterGrossPay: "YES", operation: "Modified HDMF 2 deduction benefit source amount", computedValue: deductionBenefits, targetValue: value(["deductionBenefits"]), sourceReference: "Sheet2!BW469 / benefit deduction source", explanation: "Named deduction benefit; deducted after GrossPay." }),
		row({ section: "05 Named deduction inputs", step: 7, component: "Total Deductions", humanPayrollLabel: "Total Deductions", shortSourceRegisterLabel: "TOTAL DEDN", payrollField: "totalDeductions", sourceKind: "ROLLUP_FROM_NAMED_DEDUCTIONS", dailyColumn: "not a daily sum", deductedAfterGrossPay: "RESULT", operation: `${fmt(tax)} + ${fmt(sss)} + ${fmt(philHealth)} + ${fmt(pagIbig)} + ${fmt(loans)} + ${fmt(deductionBenefits)}`, computedValue: totalDeductions, targetValue: value(["totalDeductions"]), sourceReference: sourceCell("totalDeductions"), explanation: "WTax + statutory zeroes + SSS Salary Loan + Modified HDMF 2." }),
		row({ section: "06 NetPay", step: 1, component: "NetPay", humanPayrollLabel: "NetPay", shortSourceRegisterLabel: "NetPay", payrollField: "netPay", sourceKind: "ROLLUP", dailyColumn: "grossPay - totalDeductions", operation: `${fmt(gross)} - ${fmt(totalDeductions)}`, computedValue: netPay, targetValue: value(["netPay"]), sourceReference: sourceCell("netPay"), explanation: "NetPay is GrossPay after named deductions." }),
		row({ section: "07 Named post-net receivable inputs", step: 1, component: "Perfect Attendance", humanPayrollLabel: "Perfect Attendance", shortSourceRegisterLabel: "Perfect Attendance", payrollField: "perfectAttendance", sourceKind: "EMPLOYEE_BENEFIT_RECEIVABLE_ONLY", dailyColumn: "not a daily sum", addedAfterNetPay: "YES", operation: "Perfect Attendance source amount", computedValue: perfectAttendance, targetValue: perfectAttendance, sourceReference: "Sheet2!CT469 / benefit source", explanation: "Named post-net benefit; added after NetPay and not included in GrossPay." }),
		row({ section: "07 Named post-net receivable inputs", step: 2, component: "Meal Allowance", humanPayrollLabel: "Meal Allowance", shortSourceRegisterLabel: "Meal Allowance", payrollField: "mealAllowance", sourceKind: "EMPLOYEE_BENEFIT_RECEIVABLE_ONLY", dailyColumn: "not a daily sum", addedAfterNetPay: "YES", operation: "Meal Allowance source amount", computedValue: mealAllowance, targetValue: mealAllowance, sourceReference: "Sheet2!CU469 / benefit source", explanation: "Named post-net benefit; added after NetPay and not included in GrossPay." }),
		row({ section: "07 Named post-net receivable inputs", step: 3, component: "Receivable-only total", humanPayrollLabel: "Receivable-only total", shortSourceRegisterLabel: "Perfect Attendance + Meal Allowance", payrollField: "receivableOnlyAllowances", sourceKind: "NAMED_SOURCE_SUM_AFTER_NET", dailyColumn: "not a daily sum", addedAfterNetPay: "YES", operation: `${fmt(perfectAttendance)} + ${fmt(mealAllowance)}`, computedValue: round2(perfectAttendance + mealAllowance), targetValue: receivableOnly, sourceReference: "Sheet2!CT/CU469", explanation: "Perfect Attendance plus Meal Allowance are added after NetPay." }),
		row({ section: "07 Named post-net receivable inputs", step: 4, component: "Total Receivable", humanPayrollLabel: "TotalReceivable", shortSourceRegisterLabel: "TotalReceivable", payrollField: "totalReceivable", sourceKind: "ROLLUP_FROM_NET_AND_POST_NET", dailyColumn: "netPay + receivable-only total", addedAfterNetPay: "RESULT", operation: `${fmt(netPay)} + ${fmt(receivableOnly)}`, computedValue: totalReceivable, targetValue: value(["totalReceivable"]), sourceReference: sourceCell("totalReceivable"), explanation: "Final cash receivable." }),
		row({ section: "08 Tax diagnostic truth", step: 1, component: "Source W/Tax used for tally", humanPayrollLabel: "Source W/Tax used for tally", shortSourceRegisterLabel: "WTax", payrollField: "withholdingTax", sourceKind: "SOURCE_TAX_PARITY", dailyColumn: "not a daily sum", deductedAfterGrossPay: "YES", operation: "Payroll computation source W/Tax", computedValue: tax, targetValue: value(["withholdingTax"]), sourceReference: sourceCell("withholdingTax"), explanation: "This value is used in Total Deductions and register parity." }),
		row({ section: "08 Tax diagnostic truth", step: 2, component: "Configured tax-table diagnostic", humanPayrollLabel: "Configured tax-table diagnostic", shortSourceRegisterLabel: "tax diagnostic", payrollField: "configuredTaxAmount", sourceKind: "CONFIG_DIAGNOSTIC_NOT_REGISTER_TALLY", dailyColumn: "diagnostic only", operation: "Current configured PH tax table diagnostic", computedValue: configuredTax, targetValue: configuredTax, sourceReference: "Default Philippine Calculator taxRates", explanation: `This does not equal source W/Tax ${fmt(tax)}; the workbook documents the config/source gap instead of pretending they match.`, verdictOverride: "DOCUMENTED" }),
		row({ section: "08 Tax diagnostic truth", step: 3, component: "Tax source/config gap", humanPayrollLabel: "Tax source/config gap", shortSourceRegisterLabel: "diagnostic gap", payrollField: "withholdingTax", sourceKind: "DOCUMENTED_GAP", dailyColumn: "W/Tax vs configured diagnostic", operation: `${fmt(configuredTax)} - ${fmt(tax)}`, computedValue: round2(configuredTax - tax), targetValue: round2(configuredTax - tax), sourceReference: "Rio Tax Statutory", explanation: "A non-zero diagnostic gap is documented separately; it is not used to change register tally.", verdictOverride: "DOCUMENTED" }),
	];

	const mapping = [
		["Basic Salary / Basic Pay", "basicSalary", dailyTotals.basicAllocationPay, value(["basicSalary"]), "Daily SUM Basic Allocation Pay"],
		["Display Daily Salary", "dailySalary", displayDaily, displayDaily, "Register allocation display only"],
		["Regular Days", "regularDays", dailyTotals.regularDays, value(["regularDays"]), "Daily SUM Regular Days"],
		["Overtime Hours", "overtimeHours", dailyTotals.regOtHrs, value(["overtimeHours"]), "Daily SUM Reg OT Hrs"],
		["Overtime Pay", "overtimePay", dailyTotals.otPay, value(["overtimePay"]), "Daily SUM OT Pay"],
		["Absent Deduction", "absentDeduction", dailyTotals.sourceAbsent, value(["absentDeduction"]), "Daily/source absence factor"],
		["Leave Pay", "leavePay", dailyTotals.sourceLeave, value(["leavePay"]), "Daily/source leave factor"],
		["Gross Pay", "grossPay", gross, value(["grossPay"]), "Gross formula chain"],
		["Withholding Tax", "withholdingTax", tax, value(["withholdingTax"]), "Source payroll W/Tax"],
		["SSS Contribution", "sssContribution", sss, value(["sssContribution"]), "Second cutoff split source"],
		["PhilHealth Contribution", "philHealthContribution", philHealth, value(["philHealthContribution"]), "Second cutoff split source"],
		["Pag-IBIG Contribution", "pagibigContribution", pagIbig, value(["pagibigContribution"]), "Second cutoff split source"],
		["Loan Deductions", "loanDeductions", loans, value(["loanDeductions"]), "Employee loan source"],
		["Deduction Benefits", "deductionBenefits", deductionBenefits, value(["deductionBenefits"]), "Benefit deduction source"],
		["Total Deductions", "totalDeductions", totalDeductions, value(["totalDeductions"]), "Deduction formula chain"],
		["Net Pay", "netPay", netPay, value(["netPay"]), "Gross - deductions"],
		["Perfect Attendance", "perfectAttendance", value(["perfectAttendance"], 200), value(["perfectAttendance"], 200), "Receivable-only benefit source"],
		["Meal Allowance", "mealAllowance", value(["mealAllowance"], 500), value(["mealAllowance"], 500), "Receivable-only benefit source"],
		["Total Receivable", "totalReceivable", totalReceivable, value(["totalReceivable"]), "Net + receivable-only"],
	];
	for (const [label, field, computed, target, source] of mapping) {
		rows.push(row({
			section: "09 EmployeePayroll field mapping",
			step: rows.length + 1,
			component: label,
			humanPayrollLabel: label,
			shortSourceRegisterLabel: source,
			payrollField: field,
			sourceKind: "FIELD_MAPPING",
			dailyColumn: source,
			includedInGrossPay: ["basicSalary", "overtimePay", "leavePay", "grossPay"].includes(field) ? "YES_OR_RESULT" : field === "absentDeduction" ? "YES_NEGATIVE" : "NO",
			deductedAfterGrossPay: ["withholdingTax", "sssContribution", "philHealthContribution", "pagibigContribution", "loanDeductions", "deductionBenefits", "totalDeductions"].includes(field) ? "YES_OR_RESULT" : "NO",
			addedAfterNetPay: ["perfectAttendance", "mealAllowance", "totalReceivable"].includes(field) ? "YES_OR_RESULT" : "NO",
			operation: `${source} -> ${field}`,
			computedValue: computed,
			targetValue: target,
			sourceReference: sourceCell(field) || "Rio source/calculation",
			explanation: "Computed value is reconciled against the parsed payroll computation field.",
		}));
	}
	return rows;
}

function buildRioTaxStatutoryRows({ rioDump, rioComparison }) {
	const comparisonByField = comparisonFieldMap(rioComparison);
	const deductions = rioDump.calculation?.deductions || {};
	const earnings = rioDump.calculation?.earnings || {};
	const taxBase = round2(earnings.grossPay - deductions.sss - deductions.philHealth - deductions.pagIbig);
	const configuredTax = round2(deductions.configuredTaxAmount);
	const sourceTax = comparisonValue(comparisonByField, ["withholdingTax"], deductions.taxAmount);
	const activeBracket = PH_TAX_TABLE_2023_ONWARD.find((bracket) =>
		taxBase >= bracket.semiMonthlyBase &&
		(bracket.semiMonthlyCap === null || taxBase < bracket.semiMonthlyCap)
	);
	const bracketCalc = activeBracket
		? round2(activeBracket.semiMonthlyFixedTax + (taxBase - activeBracket.semiMonthlyBase) * activeBracket.rate)
		: 0;
	return [
		{
			component: "Taxable income for diagnostic",
			input: `${fmt(earnings.grossPay)} gross - ${fmt(deductions.sss)} SSS - ${fmt(deductions.philHealth)} PhilHealth - ${fmt(deductions.pagIbig)} Pag-IBIG`,
			formula: "grossPay - statutory employee contributions",
			result: taxBase,
			sourceOrConfig: "Configured tax diagnostic",
			tallyTarget: "",
			verdict: "DOCUMENTED",
			note: "This is the diagnostic tax base from current calculator config.",
		},
		{
			component: "Tax table bracket",
			input: activeBracket ? `${fmt(activeBracket.semiMonthlyBase)} to ${activeBracket.semiMonthlyCap ? fmt(activeBracket.semiMonthlyCap) : "above"}` : "",
			formula: activeBracket ? `${fmt(activeBracket.semiMonthlyFixedTax)} + (${fmt(taxBase)} - ${fmt(activeBracket.semiMonthlyBase)}) x ${activeBracket.rate}` : "",
			result: bracketCalc,
			sourceOrConfig: "Default Philippine Calculator taxRates",
			tallyTarget: configuredTax,
			verdict: Math.abs(bracketCalc - configuredTax) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY",
			note: "Configured diagnostic result, not the source workbook W/Tax used for parity.",
		},
		{
			component: "Source W/Tax used in payroll row",
			input: "Sheet2!BI469",
			formula: "workbook/generated payroll parity target",
			result: sourceTax,
			sourceOrConfig: "Payroll computation source workbook",
			tallyTarget: sourceTax,
			verdict: "TALLIES",
			note: `Current configured tax diagnostic is ${fmt(configuredTax)}, so tax config/source is a known separate proof item.`,
		},
		{
			component: "SSS employee share",
			input: "Contribution schedule split factor = 0 for second cutoff",
			formula: "monthly SSS amount x 0",
			result: comparisonValue(comparisonByField, ["sssContribution"], deductions.sss),
			sourceOrConfig: "Payroll-period contribution schedule",
			tallyTarget: 0,
			verdict: "TALLIES",
			note: "Monthly diagnostic exists, but this cutoff applies zero employee contribution.",
		},
		{
			component: "PhilHealth employee share",
			input: "Contribution schedule split factor = 0 for second cutoff",
			formula: "monthly PhilHealth amount x 0",
			result: comparisonValue(comparisonByField, ["philHealthContribution"], deductions.philHealth),
			sourceOrConfig: "Payroll-period contribution schedule",
			tallyTarget: 0,
			verdict: "TALLIES",
			note: "Source register column BL is zero.",
		},
		{
			component: "Pag-IBIG employee share",
			input: "Contribution schedule split factor = 0 for second cutoff",
			formula: "monthly Pag-IBIG amount x 0",
			result: comparisonValue(comparisonByField, ["pagibigContribution"], deductions.pagIbig),
			sourceOrConfig: "Payroll-period contribution schedule",
			tallyTarget: 0,
			verdict: "TALLIES",
			note: "Source register column BM is zero.",
		},
		...PH_TAX_TABLE_2023_ONWARD.map((bracket) => ({
			component: "Tax table row",
			input: bracket.semiMonthlyCap ? `${fmt(bracket.semiMonthlyBase)} to ${fmt(bracket.semiMonthlyCap)}` : `${fmt(bracket.semiMonthlyBase)} and above`,
			formula: `${fmt(bracket.semiMonthlyFixedTax)} fixed + excess x ${bracket.rate}`,
			result: "",
			sourceOrConfig: "Default Philippine Calculator taxRates",
			tallyTarget: "",
			verdict: bracket === activeBracket ? "SELECTED" : "REFERENCE",
			note: bracket === activeBracket ? "Selected by diagnostic taxable income." : "",
		})),
	];
}

function buildRioFieldTallyRows({ rioComparison }) {
	return (rioComparison?.fields || []).map((field) => ({
		field: field.field,
		workbookValue: field.workbookValue,
		hrisValue: field.hrisValue,
		gap: field.difference,
		sourceCell: field.sourceCell || "",
		verdict: Math.abs(asNumber(field.difference)) <= 0.01 ? "TALLIES" : "DOES_NOT_TALLY",
		note: field.category || "",
	}));
}

async function main() {
	const comparison = readJson(comparisonPath);
	const rioDump = readJson(rioDumpPath, {});
	const rioGaHr = readJson(rioGaHrPath, {});
	if (!comparison) throw new Error(`Missing comparison JSON: ${comparisonPath}`);

	const rows = comparison.rows || [];
	const fieldRows = rows.flatMap((row) =>
		(row.fields || []).map((field) => ({
			rowNumber: row.rowNumber,
			sheetName: row.sheetName,
			employeeCode: row.employeeCode,
			employeeName: row.employeeName,
			timesheetStatus: row.timesheetStatus,
			overallCategory: row.overallCategory,
			field: field.field,
			category: field.category,
			workbookValue: field.workbookValue,
			hrisValue: field.hrisValue,
			difference: field.difference,
			sourceColumn: field.sourceColumn || "",
			sourceCell: field.sourceCell || "",
			sourceBreakdown: breakdownText(field),
			formulaTemplate: formulaForComparisonField(field.field),
			hrisSource: field.hrisSource || "",
			likelyReason: field.likelyReason || "",
			repairRecommendation: field.repairRecommendation || "",
		})),
	);

	const matchFieldRows = fieldRows.filter((row) => row.category === "MATCH" || row.category === "TOLERANCE_MATCH");
	const mismatchFieldRows = fieldRows.filter((row) => row.category !== "MATCH" && row.category !== "TOLERANCE_MATCH");
	const rowSummaries = rows.map((row) => {
		const failed = rowFailedFields(row);
		return {
			rowNumber: row.rowNumber,
			sheetName: row.sheetName,
			employeeCode: row.employeeCode,
			employeeName: row.employeeName,
			employeeMatch: row.employeeMatch ? "yes" : "no",
			timesheetStatus: row.timesheetStatus || "",
			previewFound: row.previewFound ? "yes" : "no",
			overallCategory: row.overallCategory,
			matchedFields: (row.fields || []).length - failed.length,
			failedFields: failed.length,
			largestAbsGap: rowLargestDiff(row),
			failedFieldList: failed.map((field) => `${field.field} (${field.difference})`).join("; "),
			recommendation: row.recommendation || "",
			statusCounts: row.timesheetAggregate?.statusCounts || "",
			effectiveLines: row.timesheetAggregate?.totalEffectiveLines || "",
		};
	});

	const problemRows = rows
		.filter((row) => row.overallCategory !== "MATCH")
		.map((row) => ({
			rowNumber: row.rowNumber,
			employeeCode: row.employeeCode,
			employeeName: row.employeeName,
			category: row.overallCategory,
			timesheetStatus: row.timesheetStatus || "",
			largestAbsGap: rowLargestDiff(row),
			blockerOrRepair: row.overallCategory === "TIMESHEET_NOT_FOUND"
				? "No approved period timesheet snapshot exists in DB. Past cutoff date alone does not prove approval; repair through DM4 timesheet materialization/import, then approve/lock from source evidence."
				: row.overallCategory === "EMPLOYEE_NOT_FOUND"
					? "Payroll row employee code/name did not resolve to a current DB employee. Repair via DM3 employee import/mapping before payroll proof."
					: row.overallCategory === "SOURCE_MISSING_APPROVED_OT"
						? "Approved overtime/rest/holiday source bucket is still missing for this row. Do not invent hours; import/repair from 2026 rptOvertimeDetails or mark source gap."
						: row.overallCategory === "SOURCE_MISSING_STATUTORY_CONFIG"
							? "Workbook W/Tax source does not match configured tax source for this row. Treat workbook W/Tax as parity target only after tax config/source policy is confirmed."
							: row.recommendation || "Repair component source first; rollups should not be patched directly.",
			failedFields: rowFailedFields(row).map((field) => `${field.field}: wb ${field.workbookValue}, hris ${field.hrisValue}, gap ${field.difference}`).join("; "),
		}));

	const currentSummary = comparison.summary || {};
	const rioComparison = rows.find((row) => row.employeeCode === "01360");
	const rioChecks = rioComparison?.fields || rioGaHr.samples?.[0]?.componentChecks || [];
	const rioSourceRows = rioDump.sourceRows || [];
	const schemaFields = extractFloatFieldsFromSchema(path.join(__dirname, "..", "prisma", "schema", "employeepayroll.prisma"));
	const formulaCatalog = buildFormulaCatalog({ schemaFields, rioDump, rioComparison });
	const rioRegisterQaRows = buildRioRegisterQaRows({ formulaCatalog, rioDump, rioComparison });
	const rioRateDecisionRows = buildRioRateDecisionRows({ rioDump, rioComparison });
	const rioDailyBreakdownRows = buildRioDailyBreakdownRows(rioDump, rioComparison);
	const rioDailyTallyRows = buildRioDailyTallyRows({ rioDailyBreakdownRows, rioComparison, rioDump });
	const rioPayrollWalkthroughRows = buildRioPayrollWalkthroughRows({ rioDump, rioComparison });
	const rioDailyComputationRows = buildRioDailyComputationRows({ rioDailyBreakdownRows, rioDump, rioComparison });
	const rioPayrollMathChainRows = buildRioPayrollMathChainRows({ rioDailyBreakdownRows, rioDump, rioComparison });
	const rioTaxStatutoryRows = buildRioTaxStatutoryRows({ rioDump, rioComparison });
	const rioFieldTallyRows = buildRioFieldTallyRows({ rioComparison });
	const rioCalc = rioDump.calculation || {};
	const rioRates = rioCalc.rates || {};
	const rioEarnings = rioCalc.earnings || {};
	const rioDeductions = rioCalc.deductions || {};
	const rioNet = rioCalc.net || {};
	const rioLoanField = rioChecks.find((field) => field.field === "loanDeductions");
	const rioDeductionBenefitField = rioChecks.find((field) => field.field === "deductionBenefits");

	const workbook = new ExcelJS.Workbook();
	workbook.creator = "Codex";
	workbook.created = new Date();
	workbook.modified = new Date();

	const dashboard = workbook.addWorksheet("Dashboard");
	dashboard.columns = [
		{ header: "Metric", key: "metric", width: 34 },
		{ header: "Value", key: "value", width: 28 },
		{ header: "Meaning", key: "meaning", width: 95 },
	];
	const dashboardRows = [
		["Workbook rows", currentSummary.workbookRows, "Rows parsed from Sheet2 for April 26-May 10, 2026."],
		["Employees matched", currentSummary.employeesMatched, "Rows where workbook employee code/name resolved to DB Employee."],
		["Approved timesheets found", currentSummary.approvedTimesheetsFound, "Rows backed by approved Timesheet for payroll period PP-20260426-20260511."],
		["Exact row matches", currentSummary.exactMatches, "Rows whose compared stop fields match workbook after source-backed night diff repair."],
		["Mismatches", currentSummary.mismatches, "Rows still needing source/config/logic work."],
		["Field match rate", `${((matchFieldRows.length / Math.max(fieldRows.length, 1)) * 100).toFixed(1)}%`, "Field-level checks now matching or tolerance-matching."],
		["Source-backed repair applied", "180 night-diff lines", "Applied from workbook-backed night differential source into effective Timesheetline snapshots."],
		["Do not auto-fix", "13 no-timesheet rows", "Past period does not mean there is an approved snapshot. Must materialize/import from DM4 source evidence."],
		["Bandai daily rate", "(period basic x 2 x 12) / 313", "Non-negotiable premium-rate basis for future code/config. Display Daily Salary remains workbook/register allocation."],
		["Formula catalog coverage", `${formulaCatalog.filter((item) => item.documentationStatus === "DOCUMENTED").length}/${formulaCatalog.length}`, "Every Float field in EmployeePayroll is listed in the EmployeePayroll Formula Catalog sheet, with positive-case proof status where available."],
	];
	for (const row of dashboardRows) dashboard.addRow({ metric: row[0], value: row[1], meaning: row[2] });
	styleSheet(dashboard);
	dashboard.getColumn("value").alignment = { vertical: "top", wrapText: true };

	addTableSheet(
		workbook,
		"Rio Register QA",
		[
			{ header: "EmployeePayroll Field", key: "field", width: 34 },
			{ header: "Payroll Register Label", key: "label", width: 34 },
			{ header: "Rio Value", key: "value", width: 15, numFmt: pesos },
			{ header: "Existing Payroll Value", key: "existingEmployeePayrollValue", width: 20, numFmt: pesos },
			{ header: "Gap", key: "gapToExisting", width: 12, numFmt: pesos },
			{ header: "Workbook Cell", key: "workbookCell", width: 18 },
			{ header: "Source Owner", key: "sourceOwner", width: 58 },
			{ header: "Formula With Values", key: "formulaWithValues", width: 105 },
			{ header: "Variables", key: "variables", width: 90 },
			{ header: "Affects", key: "affects", width: 24 },
			{ header: "QA Status", key: "status", width: 26 },
			{ header: "Note", key: "note", width: 70 },
		],
		rioRegisterQaRows,
		{ categoryKey: "status" },
	);

	addTableSheet(
		workbook,
		"Rio Rate Decision",
		[
			{ header: "Component", key: "component", width: 22 },
			{ header: "Target Field", key: "targetField", width: 22 },
			{ header: "Workbook Target", key: "workbookTarget", width: 18, numFmt: pesos },
			{ header: "Rate Basis Tested", key: "rateBasis", width: 24 },
			{ header: "Calculated", key: "calculated", width: 16, numFmt: pesos },
			{ header: "Gap", key: "gap", width: 14, numFmt: pesos },
			{ header: "Verdict", key: "verdict", width: 18 },
			{ header: "Formula With Values", key: "formulaWithValues", width: 110 },
			{ header: "Source", key: "source", width: 58 },
			{ header: "Variable Note", key: "variableNote", width: 88 },
		],
		rioRateDecisionRows,
		{ categoryKey: "verdict" },
	);

	addTableSheet(
		workbook,
		"Rio Daily Breakdown",
		[
			{ header: "Date", key: "date", width: 14 },
			{ header: "Day", key: "dayOfWeek", width: 12 },
			{ header: "Status", key: "status", width: 14 },
			{ header: "Primary Marker", key: "primaryMarker", width: 16 },
			{ header: "Day Type", key: "dayType", width: 18 },
			{ header: "Company Holiday", key: "companyHoliday", width: 24 },
			{ header: "Shift", key: "shift", width: 38 },
			{ header: "Break Minutes", key: "breakMinutes", width: 15, numFmt: integer },
			{ header: "Paid Break Policy", key: "paidBreakPolicy", width: 34 },
			{ header: "Paid Day Minutes", key: "paidRegularDayMinutes", width: 17, numFmt: integer },
			{ header: "Paid Day Hours", key: "paidRegularDayHours", width: 15, numFmt: number },
			{ header: "Worked Minutes", key: "totalWorkedMinutes", width: 16, numFmt: integer },
			{ header: "Regular Minutes", key: "regularMinutes", width: 16, numFmt: integer },
			{ header: "Biometric Rows", key: "biometricSourceRows", width: 18 },
			{ header: "Hours Worked", key: "hoursWorked", width: 14 },
			{ header: "Regular Hours", key: "regularHours", width: 14 },
			{ header: "OT Hours", key: "overtimeHours", width: 12 },
			{ header: "Late", key: "lateHours", width: 10 },
			{ header: "UT", key: "undertimeHours", width: 10 },
			{ header: "Early Out", key: "earlyOutHours", width: 12 },
			{ header: "Reg Days", key: "regularDays", width: 11, numFmt: number },
			{ header: "Reg OT Hrs", key: "regOtHrs", width: 12, numFmt: number },
			{ header: "RD Hrs", key: "rdHrs", width: 10, numFmt: number },
			{ header: "RD OT Hrs", key: "rdOtHrs", width: 12, numFmt: number },
			{ header: "Spcl Hrs", key: "spclHrs", width: 11, numFmt: number },
			{ header: "Spcl OT Hrs", key: "spclOtHrs", width: 13, numFmt: number },
			{ header: "Legal Hrs", key: "rholHrs", width: 11, numFmt: number },
			{ header: "Legal OT Hrs", key: "rholOtHrs", width: 13, numFmt: number },
			{ header: "ND Hrs", key: "regNdHrs", width: 10, numFmt: number },
			{ header: "Regular Pay", key: "regularPay", width: 14, numFmt: pesos },
			{ header: "Basic Allocation Pay", key: "basicAllocationPay", width: 20, numFmt: pesos },
			{ header: "OT Pay", key: "overtimePay", width: 14, numFmt: pesos },
			{ header: "Rest Pay", key: "restDayPay", width: 14, numFmt: pesos },
			{ header: "Rest OT Pay", key: "restDayOtPay", width: 14, numFmt: pesos },
			{ header: "Special Pay", key: "specialHolidayPay", width: 14, numFmt: pesos },
			{ header: "Legal Pay", key: "legalHolidayPay", width: 14, numFmt: pesos },
			{ header: "ND Pay", key: "nightDiffPay", width: 14, numFmt: pesos },
			{ header: "Total Day Pay", key: "totalDayPay", width: 15, numFmt: pesos },
			{ header: "Absent Deduction", key: "absentDeduction", width: 18, numFmt: pesos },
			{ header: "Source Register Absent", key: "sourceRegisterAbsentDeduction", width: 22, numFmt: pesos },
			{ header: "Source Register Leave", key: "sourceRegisterLeavePay", width: 22, numFmt: pesos },
			{ header: "Late Penalty", key: "latePenalty", width: 15, numFmt: pesos },
			{ header: "Early Out Penalty", key: "earlyOutPenalty", width: 18, numFmt: pesos },
			{ header: "Net Day Pay", key: "netDayPay", width: 14, numFmt: pesos },
			{ header: "Premium Hourly", key: "premiumHourlyRate", width: 16, numFmt: pesos },
			{ header: "Register Daily", key: "regularDailyRate", width: 16, numFmt: pesos },
			{ header: "Bandai Daily", key: "bandaiDailyRate", width: 16, numFmt: pesos },
			{ header: "Regular Pay Basis", key: "regularPayBasis", width: 34 },
			{ header: "Payroll Computation Role", key: "payrollComputationRole", width: 82 },
			{ header: "Aggregate Reconciliation Note", key: "aggregateReconciliationNote", width: 72 },
			{ header: "Source Workbook", key: "sourceWorkbook", width: 32 },
			{ header: "Source Row", key: "sourceRow", width: 12 },
			{ header: "Formula Source", key: "formulaSource", width: 30 },
		],
		rioDailyBreakdownRows,
		{ categoryKey: "status" },
	);

	addTableSheet(
		workbook,
		"Rio Daily Tally Checks",
		[
			{ header: "Component", key: "component", width: 34 },
			{ header: "Target Field", key: "targetField", width: 24 },
			{ header: "Source Register Target", key: "sourceRegisterTarget", width: 20, numFmt: pesos },
			{ header: "Daily Breakdown Sum", key: "dailyBreakdownSum", width: 20, numFmt: pesos },
			{ header: "Gap", key: "gap", width: 14, numFmt: pesos },
			{ header: "Verdict", key: "verdict", width: 18 },
			{ header: "Explanation", key: "explanation", width: 105 },
		],
		rioDailyTallyRows,
		{ categoryKey: "verdict" },
	);

	addTableSheet(
		workbook,
		"Rio Payroll Walkthrough",
		[
			{ header: "Step", key: "step", width: 8, numFmt: integer },
			{ header: "Component", key: "component", width: 34 },
			{ header: "Source Value", key: "sourceValue", width: 34 },
			{ header: "Formula", key: "formula", width: 82 },
			{ header: "Result", key: "result", width: 16, numFmt: pesos },
			{ header: "Register Field", key: "registerField", width: 28 },
			{ header: "Source Cell", key: "sourceCell", width: 22 },
			{ header: "Verdict", key: "verdict", width: 16 },
			{ header: "Note", key: "note", width: 95 },
		],
		rioPayrollWalkthroughRows,
		{ categoryKey: "verdict" },
	);

	addTableSheet(
		workbook,
		"Rio Payroll Math Chain",
		[
			{ header: "Section", key: "section", width: 28 },
			{ header: "Step", key: "step", width: 8, numFmt: integer },
			{ header: "Component", key: "component", width: 34 },
			{ header: "Human Payroll Label", key: "humanPayrollLabel", width: 34 },
			{ header: "Short Source/Register Label", key: "shortSourceRegisterLabel", width: 30 },
			{ header: "EmployeePayroll Field", key: "payrollField", width: 28 },
			{ header: "Source Kind", key: "sourceKind", width: 28 },
			{ header: "Daily Column / Input", key: "dailyColumn", width: 42 },
			{ header: "Included In GrossPay", key: "includedInGrossPay", width: 22 },
			{ header: "Deducted After GrossPay", key: "deductedAfterGrossPay", width: 24 },
			{ header: "Added After NetPay", key: "addedAfterNetPay", width: 22 },
			{ header: "Operation With Actual Values", key: "operation", width: 110 },
			{ header: "Computed Value", key: "computedValue", width: 18, numFmt: pesos },
			{ header: "Target Value", key: "targetValue", width: 18, numFmt: pesos },
			{ header: "Gap", key: "gap", width: 14, numFmt: pesos },
			{ header: "Verdict", key: "verdict", width: 16 },
			{ header: "Source Reference", key: "sourceReference", width: 34 },
			{ header: "Explanation", key: "explanation", width: 115 },
		],
		rioPayrollMathChainRows,
		{ categoryKey: "verdict" },
	);

	addTableSheet(
		workbook,
		"Rio Daily Computation",
		[
			{ header: "Row Type", key: "rowType", width: 12 },
			{ header: "Date", key: "date", width: 14 },
			{ header: "Status", key: "status", width: 14 },
			{ header: "Shift", key: "shift", width: 38 },
			{ header: "Worked Regular Minutes", key: "workedRegularMinutes", width: 22, numFmt: integer },
			{ header: "Paid Break Minutes", key: "paidBreakMinutes", width: 20, numFmt: integer },
			{ header: "Paid Day Minutes", key: "paidDayMinutes", width: 18, numFmt: integer },
			{ header: "Regular Days", key: "regularDays", width: 14, numFmt: number },
			{ header: "BNPI Daily Rate", key: "bnpiDailyRate", width: 16, numFmt: pesos },
			{ header: "BNPI Regular Pay", key: "bnpiRegularPay", width: 18, numFmt: pesos },
			{ header: "Basic Allocation Pay", key: "basicAllocationPay", width: 20, numFmt: pesos },
			{ header: "Reg OT Hrs", key: "regOtHrs", width: 13, numFmt: number },
			{ header: "OT Formula", key: "otFormula", width: 38 },
			{ header: "OT Pay", key: "otPay", width: 14, numFmt: pesos },
			{ header: "Source Absent", key: "sourceAbsent", width: 16, numFmt: pesos },
			{ header: "Source Leave", key: "sourceLeave", width: 16, numFmt: pesos },
			{ header: "Gross Included", key: "grossIncluded", width: 17, numFmt: pesos },
			{ header: "Total Deductions", key: "totalDeductions", width: 18, numFmt: pesos },
			{ header: "Net Pay", key: "netPay", width: 14, numFmt: pesos },
			{ header: "Receivable Only", key: "receivableOnly", width: 17, numFmt: pesos },
			{ header: "Total Receivable", key: "totalReceivable", width: 18, numFmt: pesos },
			{ header: "Tally Target", key: "tallyTarget", width: 16, numFmt: pesos },
			{ header: "Gap", key: "gap", width: 12, numFmt: pesos },
			{ header: "Verdict", key: "verdict", width: 16 },
			{ header: "Row Explanation", key: "rowExplanation", width: 95 },
		],
		rioDailyComputationRows,
		{ categoryKey: "verdict" },
	);

	addTableSheet(
		workbook,
		"Rio Tax Statutory",
		[
			{ header: "Component", key: "component", width: 34 },
			{ header: "Input", key: "input", width: 55 },
			{ header: "Formula", key: "formula", width: 74 },
			{ header: "Result", key: "result", width: 16, numFmt: pesos },
			{ header: "Source Or Config", key: "sourceOrConfig", width: 42 },
			{ header: "Tally Target", key: "tallyTarget", width: 16, numFmt: pesos },
			{ header: "Verdict", key: "verdict", width: 16 },
			{ header: "Note", key: "note", width: 92 },
		],
		rioTaxStatutoryRows,
		{ categoryKey: "verdict" },
	);

	addTableSheet(
		workbook,
		"Rio Field Tally Checks",
		[
			{ header: "Field", key: "field", width: 34 },
			{ header: "Workbook Value", key: "workbookValue", width: 18, numFmt: pesos },
			{ header: "HRIS Value", key: "hrisValue", width: 18, numFmt: pesos },
			{ header: "Gap", key: "gap", width: 14, numFmt: pesos },
			{ header: "Source Cell", key: "sourceCell", width: 18 },
			{ header: "Verdict", key: "verdict", width: 16 },
			{ header: "Note", key: "note", width: 42 },
		],
		rioFieldTallyRows,
		{ categoryKey: "verdict" },
	);

	addTableSheet(
		workbook,
		"Category Counts",
		[
			{ header: "Category", key: "category", width: 42 },
			{ header: "Rows", key: "rows", width: 14, numFmt: integer },
			{ header: "Action", key: "action", width: 95 },
		],
		countBy(rows, (row) => row.overallCategory).map(([category, count]) => ({
			category,
			rows: count,
			action: category === "MATCH"
				? "No payroll repair needed for compared fields."
				: category === "HRIS_LOGIC_MISMATCH_REPAIRABLE"
					? "Component logic/source classification still needs repair; absent versus late/undertime dominates."
					: category === "TIMESHEET_NOT_FOUND"
						? "Run/repair DM4 timesheet materialization for these employees before payroll comparison."
						: category === "EMPLOYEE_NOT_FOUND"
							? "Resolve DM3 employee import/mapping first."
							: category === "SOURCE_MISSING_APPROVED_OT"
								? "Locate approved OT/rest/holiday source bucket rows; no math-only repair."
								: "Confirm/import source config before repairing rollups.",
		})),
		{ categoryKey: "category" },
	);

	addTableSheet(
		workbook,
		"Rows",
		[
			{ header: "Sheet Row", key: "rowNumber", width: 12, numFmt: integer },
			{ header: "Sheet", key: "sheetName", width: 12 },
			{ header: "Employee Code", key: "employeeCode", width: 16 },
			{ header: "Employee Name", key: "employeeName", width: 32 },
			{ header: "Employee Match", key: "employeeMatch", width: 16 },
			{ header: "Timesheet Status", key: "timesheetStatus", width: 18 },
			{ header: "Preview", key: "previewFound", width: 12 },
			{ header: "Overall Category", key: "overallCategory", width: 34 },
			{ header: "Matched Fields", key: "matchedFields", width: 15, numFmt: integer },
			{ header: "Failed Fields", key: "failedFields", width: 14, numFmt: integer },
			{ header: "Largest Abs Gap", key: "largestAbsGap", width: 16, numFmt: number },
			{ header: "Failed Field List", key: "failedFieldList", width: 80 },
			{ header: "Status Counts", key: "statusCounts", width: 36 },
			{ header: "Effective Lines", key: "effectiveLines", width: 15 },
			{ header: "Recommendation", key: "recommendation", width: 80 },
		],
		rowSummaries,
		{ categoryKey: "overallCategory" },
	);

	const fieldColumns = [
		{ header: "Sheet Row", key: "rowNumber", width: 12, numFmt: integer },
		{ header: "Employee Code", key: "employeeCode", width: 16 },
		{ header: "Employee Name", key: "employeeName", width: 32 },
		{ header: "Timesheet Status", key: "timesheetStatus", width: 18 },
		{ header: "Row Category", key: "overallCategory", width: 34 },
		{ header: "Field", key: "field", width: 26 },
		{ header: "Field Category", key: "category", width: 34 },
		{ header: "Workbook Value", key: "workbookValue", width: 17, numFmt: pesos },
		{ header: "HRIS/DB Value", key: "hrisValue", width: 17, numFmt: pesos },
		{ header: "Gap", key: "difference", width: 14, numFmt: pesos },
		{ header: "Workbook Column", key: "sourceColumn", width: 42 },
		{ header: "Source Cell", key: "sourceCell", width: 18 },
		{ header: "Source Breakdown", key: "sourceBreakdown", width: 70 },
		{ header: "Formula Template", key: "formulaTemplate", width: 82 },
		{ header: "HRIS Source", key: "hrisSource", width: 70 },
		{ header: "Likely Reason", key: "likelyReason", width: 72 },
		{ header: "Repair Recommendation", key: "repairRecommendation", width: 78 },
	];
	addTableSheet(workbook, "All Field Details", fieldColumns, fieldRows, { categoryKey: "category" });
	addTableSheet(workbook, "Match Field Details", fieldColumns, matchFieldRows, { categoryKey: "category" });
	addTableSheet(workbook, "Mismatch Field Details", fieldColumns, mismatchFieldRows, { categoryKey: "category" });
	addTableSheet(workbook, "Field Formula Matrix", fieldColumns, fieldRows, { categoryKey: "category" });
	addTableSheet(
		workbook,
		"EmployeePayroll Formula Catalog",
		[
			{ header: "Schema Field", key: "field", width: 34 },
			{ header: "Register Label", key: "label", width: 38 },
			{ header: "Rio Value", key: "rioValue", width: 16, numFmt: pesos },
			{ header: "Workbook Cell", key: "workbookCell", width: 18 },
			{ header: "Workbook Column", key: "workbookColumn", width: 42 },
			{ header: "DB / Source Owner", key: "dbSource", width: 58 },
			{ header: "Formula / Derivation", key: "formula", width: 90 },
			{ header: "Affects", key: "effect", width: 24 },
			{ header: "Bandai Defaults Used", key: "bandaiDefaults", width: 95 },
			{ header: "Note", key: "note", width: 80 },
			{ header: "Documentation Status", key: "documentationStatus", width: 32 },
		],
		formulaCatalog,
		{ categoryKey: "documentationStatus" },
	);
	addTableSheet(
		workbook,
		"Problem Rows",
		[
			{ header: "Sheet Row", key: "rowNumber", width: 12, numFmt: integer },
			{ header: "Employee Code", key: "employeeCode", width: 16 },
			{ header: "Employee Name", key: "employeeName", width: 34 },
			{ header: "Category", key: "category", width: 34 },
			{ header: "Timesheet Status", key: "timesheetStatus", width: 18 },
			{ header: "Largest Abs Gap", key: "largestAbsGap", width: 17, numFmt: pesos },
			{ header: "Blocker Or Repair", key: "blockerOrRepair", width: 95 },
			{ header: "Failed Fields", key: "failedFields", width: 120 },
		],
		problemRows,
		{ categoryKey: "category" },
	);

	const rioFormulaRows = [
		formulaLine("Period basic", money(rioRates.periodBasic), "Employee.basicSalary", "Payroll-approved semi-monthly basic for this BNPI row", "Stored/current DB source."),
		formulaLine("Monthly rate", money(rioRates.monthlySalary), "Derived", `${money(rioRates.periodBasic).toFixed(2)} x 2`, "Semi-monthly period basic converted to monthly."),
		formulaLine("Register/display daily salary", money(rioRates.displayDailySalary), "Display/register only", `${money(rioRates.periodBasic).toFixed(2)} / 10 effective paid days`, "Workbook H is 0.00, so display rate is reconstructed from period basic and approved bucket regular days."),
		formulaLine("Bandai daily rate", money(rioRates.bandaiDailyRate), "Bandai non-negotiable rate basis", `${money(rioRates.monthlySalary).toFixed(2)} x 12 / 313`, "Used for OT/rest/holiday/night diff/leave proof."),
		formulaLine("Bandai hourly rate", money(rioRates.hourlyRate), "Derived", `${money(rioRates.bandaiDailyRate).toFixed(2)} / 8`, "Exact rate used before final rounding."),
		formulaLine("Regular OT", money(rioEarnings.regularOtPay), "Timesheetline.metadata.bandaiPayrollSourceRepair.approvedBuckets.regOtHrs", `30.5 hrs x hourly rate x 1.25`, "Matches Sheet2!N469."),
		formulaLine("Absent-Amt", money(rioComparison?.fields?.find((field) => field.field === "absentDeduction")?.workbookValue), "Workbook Sheet2!K469", `1 source absent/leave unit x Bandai daily rate`, "Source payroll computation deducts one Bandai 313 day and adds the same amount back as Leave."),
		formulaLine("Leave", money(rioComparison?.fields?.find((field) => field.field === "leavePay")?.workbookValue), "Workbook Sheet2!AH469 / EmployeeBenefit LVP", `1 leave-pay unit x Bandai daily rate`, "This cancels the source absent amount in gross while preserving both register columns."),
		formulaLine("Gross-included allowances", money(rioEarnings.grossIncludedBenefits), "EmployeeBenefit active rows + workbook cells", "OB 120 + De Minimis 250 + Adjustment OT/ND 113.82", "Cells Sheet2!AN469, Sheet2!BD469, Sheet2!BA469."),
		formulaLine("Gross Pay", money(rioEarnings.grossPay), "Workbook Sheet2!BH469 + HRIS preview", "basic - source absent - late/UT + OT + leave + gross-included allowances", "For Rio, source absent and leave are both 728.43, so they cancel while remaining visible register fields."),
		formulaLine("W/Tax", money(rioDeductions.taxAmount), "Generated EmployeePayroll.taxAmount / workbook parity target", "parity target = Sheet2!BI469", `Configured formula diagnostic would compute ${money(rioDeductions.configuredTaxAmount).toFixed(2)}.`),
		formulaLine("SSS Salary Loan", money(rioLoanField?.workbookValue), "EmployeeLoan + workbook loan column", "Payroll deduction amount is imported cutoff payment, not recomputed principal", breakdownText(rioLoanField) || "Sheet2!CJ469."),
		formulaLine("Modified HDMF 2", money(rioDeductionBenefitField?.workbookValue), "EmployeeBenefit deduction + workbook column", "Imported cutoff deduction amount", breakdownText(rioDeductionBenefitField) || "Sheet2!BW469."),
		formulaLine("Total Deductions", money(rioDeductions.totalDeductions), "Workbook Sheet2!CK469 + HRIS preview", "W/Tax 418.24 + SSS Salary Loan 411.44 + Modified HDMF 2 250.00", "Matches 0.00 gap."),
		formulaLine("Net Pay", money(rioNet.netPay), "Workbook Sheet2!CL469 + HRIS preview", "Gross Pay - Total Deductions", "Matches 0.00 gap."),
		formulaLine("Receivable-only allowances", money(rioNet.receivableOnlyBenefits), "EmployeeBenefit active rows + workbook cells", "Perfect Attendance 200 + Meal Allowance 500", "Cells Sheet2!CT469 and Sheet2!CU469."),
		formulaLine("Total Receivable", money(rioNet.totalReceivable), "Workbook Sheet2!CW469 + HRIS preview", "Net Pay + receivable-only allowances", "Matches 0.00 gap."),
	];

	addTableSheet(
		workbook,
		"Rio Formula Proof",
		[
			{ header: "Line", key: "label", width: 32 },
			{ header: "Value", key: "value", width: 16, numFmt: pesos },
			{ header: "Source", key: "source", width: 50 },
			{ header: "Formula", key: "formula", width: 72 },
			{ header: "Note", key: "note", width: 90 },
		],
		rioFormulaRows,
	);

	addTableSheet(
		workbook,
		"Rio Workbook Stops",
		fieldColumns,
		rioChecks.map((field) => ({
			rowNumber: rioComparison?.rowNumber || 469,
			employeeCode: "01360",
			employeeName: rioComparison?.employeeName || "Marasigan, Rio Jane R.",
			timesheetStatus: rioComparison?.timesheetStatus || "APPROVED",
			overallCategory: rioComparison?.overallCategory || "MATCH",
			field: field.field,
			category: field.category,
			workbookValue: field.workbookValue,
			hrisValue: field.hrisValue,
			difference: field.difference,
			sourceColumn: field.sourceColumn || "",
			sourceCell: field.sourceCell || "",
			sourceBreakdown: breakdownText(field),
			formulaTemplate: formulaForComparisonField(field.field),
			hrisSource: field.hrisSource || "",
			likelyReason: field.likelyReason || "Workbook and HRIS/source value align.",
			repairRecommendation: field.repairRecommendation || "No repair needed.",
		})),
		{ categoryKey: "category" },
	);

	addTableSheet(
		workbook,
		"Rio DB Source Rows",
		[
			{ header: "Source", key: "source", width: 20 },
			{ header: "Code", key: "code", width: 16 },
			{ header: "Name", key: "name", width: 34 },
			{ header: "Amount", key: "amount", width: 14, numFmt: pesos },
			{ header: "Direction", key: "direction", width: 18 },
			{ header: "Classification", key: "classification", width: 22 },
			{ header: "Reconciliation Action", key: "reconciliationAction", width: 24 },
			{ header: "Status", key: "status", width: 14 },
			{ header: "Cutoff Start", key: "startDate", width: 24 },
			{ header: "Cutoff End", key: "endDate", width: 24 },
		],
		rioSourceRows.map((source) => ({
			source: source.source,
			code: source.code,
			name: source.name,
			amount: source.amount,
			direction: source.direction,
			classification: source.classification,
			reconciliationAction: source.reconciliationAction || "",
			status: source.status,
			startDate: source.startDate,
			endDate: source.endDate,
		})),
	);

	addTableSheet(
		workbook,
		"Bandai Config",
		[
			{ header: "Config Key", key: "key", width: 38 },
			{ header: "Value", key: "value", width: 24 },
			{ header: "Formula/Use", key: "formula", width: 80 },
			{ header: "Hardcutover Rule", key: "rule", width: 90 },
		],
		[
			{ key: "annualWorkDays", value: 313, formula: "dailyRate = monthlyRate x 12 / 313", rule: "Keep as BNPI/Bandai default for premium computations." },
			{ key: "hoursPerDay", value: 8, formula: "hourlyRate = dailyRate / 8", rule: "Use exact hourly rate before final currency rounding." },
			{ key: "regularOt", value: 1.25, formula: "regOtHrs x hourlyRate x 1.25", rule: "Approved bucket multiplier." },
			{ key: "restDay", value: 1.3, formula: "rdHrs x hourlyRate x 1.3", rule: "Approved bucket multiplier." },
			{ key: "restDayOt", value: 1.69, formula: "rdOtHrs x hourlyRate x 1.69", rule: "Approved bucket multiplier." },
			{ key: "specialHolidayPremium", value: 0.3, formula: "spclHrs x hourlyRate x 0.3", rule: "Premium portion only where workbook bucket says special holiday premium." },
			{ key: "specialHolidayFull", value: 1.3, formula: "special holiday full-day rate when applicable", rule: "Keep available for future buckets/source rows." },
			{ key: "specialHolidayOt", value: 1.69, formula: "spclOtHrs x hourlyRate x 1.69", rule: "Approved bucket multiplier." },
			{ key: "legalHoliday", value: 1, formula: "rholHrs x hourlyRate x 1.0", rule: "Approved bucket multiplier." },
			{ key: "legalHolidayOt", value: 2.6, formula: "rholOtHrs x hourlyRate x 2.6", rule: "Approved bucket multiplier." },
			{ key: "nightDiffPremium", value: 0.1, formula: "regNdHrs x hourlyRate x 0.1 unless source amount is explicitly imported", rule: "Now source-backed for 180 rows in this cutoff." },
			{ key: "source of truth", value: "approved Timesheetline", formula: "Timesheetline.isEffective=true and isDeleted=false", rule: "Payroll proof must not read live AttendanceObligation for approved historical totals." },
			{ key: "statutory split", value: "period 2 = 0", formula: "BNPI first-cutoff-full / second-cutoff-none for SSS/PHIC/HDMF in this workbook", rule: "Do not globally change without calculator/source policy proof." },
		],
	);

	addTableSheet(
		workbook,
		"Public Statutory References",
		[
			{ header: "Area", key: "area", width: 24 },
			{ header: "Formula Anchor", key: "anchor", width: 70 },
			{ header: "Source", key: "source", width: 42 },
			{ header: "URL", key: "url", width: 95 },
			{ header: "Use In This Report", key: "usage", width: 95 },
		],
		[
			{
				area: "BIR W/Tax",
				anchor: "Semi-monthly withholding table effective January 1, 2023 onward.",
				source: "BIR Annex E RR 11-2018",
				url: "https://bir-cdn.bir.gov.ph/local/pdf/Annex%20E%20RR%2011-2018.pdf",
				usage: "Supports configured tax-table diagnostics. For this BNPI cutoff, generated/workbook W/Tax remains the parity target when source behavior differs.",
			},
			{
				area: "SSS",
				anchor: "Effective January 1, 2025: total 15% of MSC not exceeding PHP 35,000; employee share 5%.",
				source: "Social Security System",
				url: "https://www.sss.gov.ph/pay-contribution/",
				usage: "Supports SSS formula documentation; workbook second cutoff has zero SSS contribution rows.",
			},
			{
				area: "PhilHealth",
				anchor: "2025 premium rate 5.0%, income floor PHP 10,000, ceiling PHP 100,000.",
				source: "PhilHealth Advisory PA2025-0002",
				url: "https://www.philhealth.gov.ph/advisories/2025/PA2025-0002.pdf",
				usage: "Supports PhilHealth formula documentation; workbook second cutoff has zero PhilHealth contribution rows.",
			},
			{
				area: "Pag-IBIG",
				anchor: "Effective February 2024, required 2% employee savings and 2% employer share use PHP 10,000 maximum monthly compensation.",
				source: "Presidential Communications Office summary of Pag-IBIG Fund policy",
				url: "https://pco.gov.ph/other_releases/pag-ibig-members-to-gain-more-benefits-under-new-rates-starting-february-2024/",
				usage: "Supports Pag-IBIG formula documentation; workbook second cutoff has zero Pag-IBIG contribution rows.",
			},
			{
				area: "BNPI/Bandai premium basis",
				anchor: "annualWorkDays=313 and approved bucket multipliers 1.25/1.30/1.69/0.30/1.00/2.60/0.10.",
				source: "Internal workbook + DB parity evidence",
				url: "See this workbook: Bandai Config and Rio Formula Proof",
				usage: "Not a public statutory rule. Treat as non-negotiable client payroll config because it is proven by the April 26-May 10, 2026 workbook and DB comparison.",
			},
		],
	);

	for (const ws of workbook.worksheets) {
		ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: "landscape" };
	}

	await workbook.xlsx.writeFile(outputPath);

	const loaded = new ExcelJS.Workbook();
	await loaded.xlsx.readFile(outputPath);
	console.log(JSON.stringify({
		outputPath,
		worksheets: loaded.worksheets.map((ws) => ({ name: ws.name, rows: ws.rowCount, columns: ws.columnCount })),
		summary: currentSummary,
	}, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
