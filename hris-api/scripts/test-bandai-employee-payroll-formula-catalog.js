const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");

const repoRoot = path.resolve(__dirname, "..", "..");
const schemaPath = path.join(__dirname, "..", "prisma", "schema", "employeepayroll.prisma");
const workbookPath = path.join(repoRoot, "test-results", "payroll-bandai-analysis", "bandai-payroll-hardcutover-register-qa-v10.xlsx");

function extractFloatFieldsFromSchema() {
	const text = fs.readFileSync(schemaPath, "utf8");
	const fields = [];
	for (const line of text.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s+Float\b/);
		if (match) fields.push(match[1]);
	}
	return fields;
}

async function main() {
	if (!fs.existsSync(workbookPath)) {
		throw new Error(`Missing workbook. Run node scripts/generate-bandai-payroll-analysis-workbook.js first: ${workbookPath}`);
	}

	const expectedFields = extractFloatFieldsFromSchema();
	const workbook = new ExcelJS.Workbook();
	await workbook.xlsx.readFile(workbookPath);
	const sheet = workbook.getWorksheet("EmployeePayroll Formula Catalog");
	if (!sheet) throw new Error("Missing EmployeePayroll Formula Catalog sheet.");

	const headers = {};
	sheet.getRow(1).eachCell((cell, index) => {
		headers[String(cell.value)] = index;
	});
	const fieldColumn = headers["Schema Field"];
	const formulaColumn = headers["Formula / Derivation"];
	const sourceColumn = headers["DB / Source Owner"];
	if (!fieldColumn || !formulaColumn || !sourceColumn) {
		throw new Error("Formula catalog is missing required headers.");
	}

	const seen = new Map();
	for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
		const row = sheet.getRow(rowNumber);
		const field = row.getCell(fieldColumn).value;
		if (!field) continue;
		seen.set(String(field), {
			formula: String(row.getCell(formulaColumn).value || "").trim(),
			source: String(row.getCell(sourceColumn).value || "").trim(),
		});
	}

	const missing = expectedFields.filter((field) => !seen.has(field));
	const undocumented = expectedFields.filter((field) => {
		const entry = seen.get(field);
		return !entry || !entry.formula || !entry.source;
	});

	if (missing.length || undocumented.length) {
		throw new Error(JSON.stringify({ missing, undocumented }, null, 2));
	}

	const qaSheet = workbook.getWorksheet("Rio Register QA");
	if (!qaSheet) throw new Error("Missing Rio Register QA sheet.");
	const rateSheet = workbook.getWorksheet("Rio Rate Decision");
	if (!rateSheet) throw new Error("Missing Rio Rate Decision sheet.");
	const dailySheet = workbook.getWorksheet("Rio Daily Breakdown");
	if (!dailySheet) throw new Error("Missing Rio Daily Breakdown sheet.");
	const dailyTallySheet = workbook.getWorksheet("Rio Daily Tally Checks");
	if (!dailyTallySheet) throw new Error("Missing Rio Daily Tally Checks sheet.");
	const walkthroughSheet = workbook.getWorksheet("Rio Payroll Walkthrough");
	if (!walkthroughSheet) throw new Error("Missing Rio Payroll Walkthrough sheet.");
	const dailyComputationSheet = workbook.getWorksheet("Rio Daily Computation");
	if (!dailyComputationSheet) throw new Error("Missing Rio Daily Computation sheet.");
	const mathChainSheet = workbook.getWorksheet("Rio Payroll Math Chain");
	if (!mathChainSheet) throw new Error("Missing Rio Payroll Math Chain sheet.");
	const taxSheet = workbook.getWorksheet("Rio Tax Statutory");
	if (!taxSheet) throw new Error("Missing Rio Tax Statutory sheet.");
	const fieldTallySheet = workbook.getWorksheet("Rio Field Tally Checks");
	if (!fieldTallySheet) throw new Error("Missing Rio Field Tally Checks sheet.");
	const qaHeaders = {};
	qaSheet.getRow(1).eachCell((cell, index) => {
		qaHeaders[String(cell.value)] = index;
	});
	const qaFieldColumn = qaHeaders["EmployeePayroll Field"];
	const qaFormulaColumn = qaHeaders["Formula With Values"];
	const qaValueColumn = qaHeaders["Rio Value"];
	const criticalFields = new Map([
		["mealAllowance", 500],
		["perfectAttendance", 200],
		["sssSalaryLoan", 411.44],
		["modifiedHdmf2", 250],
		["totalReceivable", 13075.59],
	]);
	const qaRows = new Map();
	for (let rowNumber = 2; rowNumber <= qaSheet.rowCount; rowNumber += 1) {
		const row = qaSheet.getRow(rowNumber);
		const field = String(row.getCell(qaFieldColumn).value || "");
		if (!field) continue;
		qaRows.set(field, {
			value: Number(row.getCell(qaValueColumn).value || 0),
			formula: String(row.getCell(qaFormulaColumn).value || ""),
		});
	}
	const criticalMissing = [];
	for (const [field, expectedValue] of criticalFields.entries()) {
		const row = qaRows.get(field);
		if (!row || Math.abs(row.value - expectedValue) > 0.01 || !row.formula.includes("=")) {
			criticalMissing.push({ field, expectedValue, actual: row });
		}
	}
	if (criticalMissing.length) {
		throw new Error(JSON.stringify({ criticalMissing }, null, 2));
	}

	const rateHeaders = {};
	rateSheet.getRow(1).eachCell((cell, index) => {
		rateHeaders[String(cell.value)] = index;
	});
	let bandaiOtTallies = false;
	let displayOtFails = false;
	for (let rowNumber = 2; rowNumber <= rateSheet.rowCount; rowNumber += 1) {
		const row = rateSheet.getRow(rowNumber);
		const component = String(row.getCell(rateHeaders["Component"]).value || "");
		const basis = String(row.getCell(rateHeaders["Rate Basis Tested"]).value || "");
		const verdict = String(row.getCell(rateHeaders["Verdict"]).value || "");
		if (component === "Regular OT" && basis === "Bandai premium rate" && verdict === "TALLIES") bandaiOtTallies = true;
		if (component === "Regular OT" && basis === "Register dailySalary" && verdict === "DOES_NOT_TALLY") displayOtFails = true;
	}
	if (!bandaiOtTallies || !displayOtFails) {
		throw new Error(JSON.stringify({ bandaiOtTallies, displayOtFails }, null, 2));
	}

	if (dailySheet.rowCount !== 16) {
		throw new Error(`Expected Rio Daily Breakdown to have 15 data rows plus header; got ${dailySheet.rowCount}.`);
	}

	const dailyHeaders = {};
	dailySheet.getRow(1).eachCell((cell, index) => {
		dailyHeaders[String(cell.value)] = index;
	});
	let presentBreakRows = 0;
	for (let rowNumber = 2; rowNumber <= dailySheet.rowCount; rowNumber += 1) {
		const row = dailySheet.getRow(rowNumber);
		const status = String(row.getCell(dailyHeaders["Status"]).value || "");
		const breakMinutes = Number(row.getCell(dailyHeaders["Break Minutes"]).value || 0);
		const regularMinutes = Number(row.getCell(dailyHeaders["Regular Minutes"]).value || 0);
		const paidDayMinutes = Number(row.getCell(dailyHeaders["Paid Day Minutes"]).value || 0);
		if (status === "PRESENT") {
			if (breakMinutes !== 30 || regularMinutes !== 450 || paidDayMinutes !== 480) {
				throw new Error(`Unexpected paid-break handling for Rio present line ${rowNumber}: break=${breakMinutes}, regular=${regularMinutes}, paidDay=${paidDayMinutes}`);
			}
			presentBreakRows += 1;
		}
	}
	if (presentBreakRows !== 9) {
		throw new Error(`Expected 9 PRESENT Rio lines with break handling; got ${presentBreakRows}.`);
	}

	const dailyTallyHeaders = {};
	dailyTallySheet.getRow(1).eachCell((cell, index) => {
		dailyTallyHeaders[String(cell.value)] = index;
	});
	const tallyRows = new Map();
	for (let rowNumber = 2; rowNumber <= dailyTallySheet.rowCount; rowNumber += 1) {
		const row = dailyTallySheet.getRow(rowNumber);
		const component = String(row.getCell(dailyTallyHeaders["Component"]).value || "");
		if (!component) continue;
		tallyRows.set(component, {
			target: Number(row.getCell(dailyTallyHeaders["Source Register Target"]).value || 0),
			sum: Number(row.getCell(dailyTallyHeaders["Daily Breakdown Sum"]).value || 0),
			gap: Number(row.getCell(dailyTallyHeaders["Gap"]).value || 0),
			verdict: String(row.getCell(dailyTallyHeaders["Verdict"]).value || ""),
		});
	}
	const expectedTallies = [
		["Regular pay by BNPI 313 daily rate", 7284.3],
		["Basic salary allocation display", 9500],
		["Regular OT pay", 3471.45],
		["Source absent amount", 728.43],
		["Source leave amount", 728.43],
	];
	for (const [component, expectedValue] of expectedTallies) {
		const row = tallyRows.get(component);
		if (!row || Math.abs(row.sum - expectedValue) > 0.01 || Math.abs(row.gap) > 0.01 || row.verdict !== "TALLIES") {
			throw new Error(`Unexpected Rio Daily Tally Checks row for ${component}: ${JSON.stringify(row)}`);
		}
	}
	const counterTest = tallyRows.get("BNPI 313 regular pay vs Basic Salary");
	if (!counterTest || counterTest.verdict !== "DOES_NOT_TALLY" || Math.abs(counterTest.sum - 7284.3) > 0.01) {
		throw new Error(`Expected BNPI 313 regular pay to differ from Basic Salary allocation: ${JSON.stringify(counterTest)}`);
	}

	const walkthroughHeaders = {};
	walkthroughSheet.getRow(1).eachCell((cell, index) => {
		walkthroughHeaders[String(cell.value)] = index;
	});
	const walkthroughRows = new Map();
	for (let rowNumber = 2; rowNumber <= walkthroughSheet.rowCount; rowNumber += 1) {
		const row = walkthroughSheet.getRow(rowNumber);
		const component = String(row.getCell(walkthroughHeaders["Component"]).value || "");
		if (!component) continue;
		walkthroughRows.set(component, {
			result: Number(row.getCell(walkthroughHeaders["Result"]).value || 0),
			verdict: String(row.getCell(walkthroughHeaders["Verdict"]).value || ""),
			formula: String(row.getCell(walkthroughHeaders["Formula"]).value || ""),
		});
	}
	for (const [component, expected] of [
		["Gross Pay", 13455.27],
		["Total deductions", 1079.68],
		["Net Pay", 12375.59],
		["Total Receivable", 13075.59],
	]) {
		const row = walkthroughRows.get(component);
		if (!row || Math.abs(row.result - expected) > 0.01 || row.verdict !== "TALLIES" || !row.formula) {
			throw new Error(`Unexpected walkthrough row for ${component}: ${JSON.stringify(row)}`);
		}
	}

	const dailyComputationHeaders = {};
	dailyComputationSheet.getRow(1).eachCell((cell, index) => {
		dailyComputationHeaders[String(cell.value)] = index;
	});
	let dailyBnpiRegular = 0;
	let dailyBasicAllocation = 0;
	let dailyOt = 0;
	const dailyComputationRollups = new Map();
	for (let rowNumber = 2; rowNumber <= dailyComputationSheet.rowCount; rowNumber += 1) {
		const row = dailyComputationSheet.getRow(rowNumber);
		const rowType = String(row.getCell(dailyComputationHeaders["Row Type"]).value || "");
		const date = String(row.getCell(dailyComputationHeaders["Date"]).value || "");
		if (rowType !== "DAY") {
			dailyComputationRollups.set(date, {
				rowType,
				bnpiRegularPay: Number(row.getCell(dailyComputationHeaders["BNPI Regular Pay"]).value || 0),
				basicAllocationPay: Number(row.getCell(dailyComputationHeaders["Basic Allocation Pay"]).value || 0),
				otPay: Number(row.getCell(dailyComputationHeaders["OT Pay"]).value || 0),
				sourceAbsent: Number(row.getCell(dailyComputationHeaders["Source Absent"]).value || 0),
				sourceLeave: Number(row.getCell(dailyComputationHeaders["Source Leave"]).value || 0),
				grossIncluded: Number(row.getCell(dailyComputationHeaders["Gross Included"]).value || 0),
				totalDeductions: Number(row.getCell(dailyComputationHeaders["Total Deductions"]).value || 0),
				netPay: Number(row.getCell(dailyComputationHeaders["Net Pay"]).value || 0),
				receivableOnly: Number(row.getCell(dailyComputationHeaders["Receivable Only"]).value || 0),
				totalReceivable: Number(row.getCell(dailyComputationHeaders["Total Receivable"]).value || 0),
				tallyTarget: Number(row.getCell(dailyComputationHeaders["Tally Target"]).value || 0),
				gap: Number(row.getCell(dailyComputationHeaders["Gap"]).value || 0),
				verdict: String(row.getCell(dailyComputationHeaders["Verdict"]).value || ""),
				explanation: String(row.getCell(dailyComputationHeaders["Row Explanation"]).value || ""),
			});
			continue;
		}
		dailyBnpiRegular += Number(row.getCell(dailyComputationHeaders["BNPI Regular Pay"]).value || 0);
		dailyBasicAllocation += Number(row.getCell(dailyComputationHeaders["Basic Allocation Pay"]).value || 0);
		dailyOt += Number(row.getCell(dailyComputationHeaders["OT Pay"]).value || 0);
	}
	if (Math.abs(dailyBnpiRegular - 7284.3) > 0.01 || Math.abs(dailyBasicAllocation - 9500) > 0.01 || Math.abs(dailyOt - 3471.45) > 0.01) {
		throw new Error(`Unexpected Rio Daily Computation totals: ${JSON.stringify({ dailyBnpiRegular, dailyBasicAllocation, dailyOt })}`);
	}
	const expectedDailyComputationRollups = new Map([
		["DAILY TOTAL", { bnpiRegularPay: 7284.3, basicAllocationPay: 9500, otPay: 3471.45, sourceAbsent: 728.43, sourceLeave: 728.43, tallyTarget: 7284.3 }],
		["REGISTER INPUT TOTAL", { basicAllocationPay: 9500, tallyTarget: 9500 }],
		["GROSS PAY", { basicAllocationPay: 9500, otPay: 3471.45, sourceAbsent: 728.43, sourceLeave: 728.43, grossIncluded: 483.82, tallyTarget: 13455.27 }],
		["TOTAL DEDUCTIONS", { totalDeductions: 1079.68, tallyTarget: 1079.68 }],
		["NET PAY", { totalDeductions: 1079.68, netPay: 12375.59, tallyTarget: 12375.59 }],
		["TOTAL RECEIVABLE", { netPay: 12375.59, receivableOnly: 700, totalReceivable: 13075.59, tallyTarget: 13075.59 }],
	]);
	for (const [label, expected] of expectedDailyComputationRollups.entries()) {
		const row = dailyComputationRollups.get(label);
		if (!row || row.verdict !== "TALLIES" || Math.abs(row.gap) > 0.01 || !row.explanation) {
			throw new Error(`Missing or failed Rio Daily Computation rollup ${label}: ${JSON.stringify(row)}`);
		}
		for (const [key, expectedValue] of Object.entries(expected)) {
			if (Math.abs((row[key] || 0) - expectedValue) > 0.01) {
				throw new Error(`Unexpected Rio Daily Computation rollup ${label}.${key}: ${JSON.stringify({ expectedValue, row })}`);
			}
		}
	}

	const mathChainHeaders = {};
	mathChainSheet.getRow(1).eachCell((cell, index) => {
		mathChainHeaders[String(cell.value)] = index;
	});
	const mathRowsByComponent = new Map();
	const mathRowsByField = new Map();
	for (let rowNumber = 2; rowNumber <= mathChainSheet.rowCount; rowNumber += 1) {
		const row = mathChainSheet.getRow(rowNumber);
		const section = String(row.getCell(mathChainHeaders["Section"]).value || "");
		const component = String(row.getCell(mathChainHeaders["Component"]).value || "");
		const field = String(row.getCell(mathChainHeaders["EmployeePayroll Field"]).value || "");
		if (!component) continue;
		const item = {
			section,
			component,
			humanPayrollLabel: String(row.getCell(mathChainHeaders["Human Payroll Label"]).value || ""),
			shortSourceRegisterLabel: String(row.getCell(mathChainHeaders["Short Source/Register Label"]).value || ""),
			field,
			sourceKind: String(row.getCell(mathChainHeaders["Source Kind"]).value || ""),
			includedInGrossPay: String(row.getCell(mathChainHeaders["Included In GrossPay"]).value || ""),
			deductedAfterGrossPay: String(row.getCell(mathChainHeaders["Deducted After GrossPay"]).value || ""),
			addedAfterNetPay: String(row.getCell(mathChainHeaders["Added After NetPay"]).value || ""),
			operation: String(row.getCell(mathChainHeaders["Operation With Actual Values"]).value || ""),
			computedValue: Number(row.getCell(mathChainHeaders["Computed Value"]).value || 0),
			targetValue: Number(row.getCell(mathChainHeaders["Target Value"]).value || 0),
			gap: Number(row.getCell(mathChainHeaders["Gap"]).value || 0),
			verdict: String(row.getCell(mathChainHeaders["Verdict"]).value || ""),
			sourceReference: String(row.getCell(mathChainHeaders["Source Reference"]).value || ""),
			explanation: String(row.getCell(mathChainHeaders["Explanation"]).value || ""),
		};
		if (!mathRowsByComponent.has(component)) mathRowsByComponent.set(component, []);
		mathRowsByComponent.get(component).push(item);
		if (section === "09 EmployeePayroll field mapping" && field) mathRowsByField.set(field, item);
	}
	const expectMathRow = (component, expected) => {
		const candidates = mathRowsByComponent.get(component) || [];
		const row = candidates.find((candidate) =>
			(expected.field ? candidate.field === expected.field : true) &&
			(expected.section ? candidate.section === expected.section : true)
		);
		if (!row) throw new Error(`Missing Rio Payroll Math Chain row ${component}: ${JSON.stringify(expected)}`);
		if (!row.operation || !row.explanation || !row.sourceKind || !row.sourceReference || !row.humanPayrollLabel) {
			throw new Error(`Math-chain row lacks audit text: ${JSON.stringify(row)}`);
		}
		if (expected.verdict) {
			if (row.verdict !== expected.verdict) throw new Error(`Unexpected verdict for ${component}: ${JSON.stringify(row)}`);
		} else if (row.verdict !== "TALLIES" || Math.abs(row.gap) > 0.01) {
			throw new Error(`Math-chain row does not tally for ${component}: ${JSON.stringify(row)}`);
		}
		for (const key of ["computedValue", "targetValue", "gap"]) {
			if (expected[key] === undefined) continue;
			if (Math.abs(row[key] - expected[key]) > 0.01) {
				throw new Error(`Unexpected ${component}.${key}: ${JSON.stringify({ expected: expected[key], row })}`);
			}
		}
		if (expected.operationIncludes && !row.operation.includes(expected.operationIncludes)) {
			throw new Error(`Math-chain row operation missing ${expected.operationIncludes}: ${JSON.stringify(row)}`);
		}
		return row;
	};
	for (const [component, expected] of [
		["Monthly rate", { computedValue: 19000, targetValue: 19000, operationIncludes: "9,500.00" }],
		["BNPI daily rate", { computedValue: 728.43, targetValue: 728.43, operationIncludes: "19,000.00 x 12 / 313" }],
		["BNPI hourly rate", { computedValue: 91.05, targetValue: 91.05, operationIncludes: "728.43 / 8" }],
		["Register basic allocation daily display", { computedValue: 950, targetValue: 950, operationIncludes: "9,500.00 / 10" }],
		["Does BNPI Daily Rate Feed GrossPay Base?", { computedValue: 9500, targetValue: 9500, operationIncludes: "10 x 728.43 = 7,284.30" }],
		["SUM Regular Days", { computedValue: 10, targetValue: 10 }],
		["SUM Worked Regular Minutes", { computedValue: 4050, targetValue: 4050 }],
		["SUM Paid Break Minutes", { computedValue: 270, targetValue: 270 }],
		["SUM Payroll Paid Day Minutes", { computedValue: 4800, targetValue: 4800 }],
		["SUM BNPI Regular Pay", { computedValue: 7284.3, targetValue: 7284.3 }],
		["SUM Basic Allocation Pay", { computedValue: 9500, targetValue: 9500 }],
		["SUM Regular OT Hours", { computedValue: 30.5, targetValue: 30.5 }],
		["SUM OT Pay", { computedValue: 3471.45, targetValue: 3471.45 }],
		["SUM Source Absent", { computedValue: 728.43, targetValue: 728.43 }],
		["SUM Source Leave", { computedValue: 728.43, targetValue: 728.43 }],
		["OB Allowance / OBA", { computedValue: 120, targetValue: 120 }],
		["De Minimis Allowance / DMA", { computedValue: 250, targetValue: 250 }],
		["Adjustment OT/ND", { computedValue: 113.82, targetValue: 113.82 }],
		["Gross-included total", { computedValue: 483.82, targetValue: 483.82, operationIncludes: "120.00 + 250.00 + 113.82" }],
		["GrossPay", { computedValue: 13455.27, targetValue: 13455.27, operationIncludes: "9,500.00 - 728.43 + 3,471.45 + 728.43 + 483.82" }],
		["Withholding Tax / WTax", { computedValue: 418.24, targetValue: 418.24 }],
		["SSS Contribution", { computedValue: 0, targetValue: 0 }],
		["PhilHealth Contribution", { computedValue: 0, targetValue: 0 }],
		["Pag-IBIG Contribution", { computedValue: 0, targetValue: 0 }],
		["SSS Salary Loan", { computedValue: 411.44, targetValue: 411.44 }],
		["Modified HDMF 2", { computedValue: 250, targetValue: 250 }],
		["Total Deductions", { computedValue: 1079.68, targetValue: 1079.68, operationIncludes: "418.24 + 0.00 + 0.00 + 0.00 + 411.44 + 250.00" }],
		["NetPay", { computedValue: 12375.59, targetValue: 12375.59, operationIncludes: "13,455.27 - 1,079.68" }],
		["Perfect Attendance", { computedValue: 200, targetValue: 200 }],
		["Meal Allowance", { computedValue: 500, targetValue: 500 }],
		["Receivable-only total", { computedValue: 700, targetValue: 700, operationIncludes: "200.00 + 500.00" }],
		["Total Receivable", { computedValue: 13075.59, targetValue: 13075.59, operationIncludes: "12,375.59 + 700.00" }],
		["Source W/Tax used for tally", { computedValue: 418.24, targetValue: 418.24 }],
		["Configured tax-table diagnostic", { computedValue: 455.74, targetValue: 455.74, verdict: "DOCUMENTED" }],
		["Tax source/config gap", { computedValue: 37.5, targetValue: 37.5, verdict: "DOCUMENTED" }],
	]) {
		expectMathRow(component, expected);
	}
	for (const [field, expectedValue] of [
		["basicSalary", 9500],
		["dailySalary", 950],
		["overtimePay", 3471.45],
		["absentDeduction", 728.43],
		["leavePay", 728.43],
		["grossPay", 13455.27],
		["withholdingTax", 418.24],
		["sssContribution", 0],
		["philHealthContribution", 0],
		["pagibigContribution", 0],
		["loanDeductions", 411.44],
		["deductionBenefits", 250],
		["totalDeductions", 1079.68],
		["netPay", 12375.59],
		["perfectAttendance", 200],
		["mealAllowance", 500],
		["totalReceivable", 13075.59],
	]) {
		const row = mathRowsByField.get(field);
		if (!row || row.verdict !== "TALLIES" || Math.abs(row.computedValue - expectedValue) > 0.01 || Math.abs(row.targetValue - expectedValue) > 0.01 || Math.abs(row.gap) > 0.01 || !row.operation || !row.explanation) {
			throw new Error(`Unexpected EmployeePayroll field mapping row ${field}: ${JSON.stringify(row)}`);
		}
	}

	const taxHeaders = {};
	taxSheet.getRow(1).eachCell((cell, index) => {
		taxHeaders[String(cell.value)] = index;
	});
	let sourceTaxTallies = false;
	let configuredTaxDocumented = false;
	for (let rowNumber = 2; rowNumber <= taxSheet.rowCount; rowNumber += 1) {
		const row = taxSheet.getRow(rowNumber);
		const component = String(row.getCell(taxHeaders["Component"]).value || "");
		const verdict = String(row.getCell(taxHeaders["Verdict"]).value || "");
		const result = Number(row.getCell(taxHeaders["Result"]).value || 0);
		if (component === "Source W/Tax used in payroll row" && verdict === "TALLIES" && Math.abs(result - 418.24) <= 0.01) {
			sourceTaxTallies = true;
		}
		if (component === "Tax table bracket" && Math.abs(result - 455.74) <= 0.01) {
			configuredTaxDocumented = true;
		}
	}
	if (!sourceTaxTallies || !configuredTaxDocumented) {
		throw new Error(JSON.stringify({ sourceTaxTallies, configuredTaxDocumented }, null, 2));
	}

	const fieldTallyHeaders = {};
	fieldTallySheet.getRow(1).eachCell((cell, index) => {
		fieldTallyHeaders[String(cell.value)] = index;
	});
	const failedFieldTallies = [];
	for (let rowNumber = 2; rowNumber <= fieldTallySheet.rowCount; rowNumber += 1) {
		const row = fieldTallySheet.getRow(rowNumber);
		const verdict = String(row.getCell(fieldTallyHeaders["Verdict"]).value || "");
		if (verdict !== "TALLIES") {
			failedFieldTallies.push(String(row.getCell(fieldTallyHeaders["Field"]).value || ""));
		}
	}
	if (failedFieldTallies.length) {
		throw new Error(`Rio field tally checks failed: ${failedFieldTallies.join(", ")}`);
	}

	console.log(JSON.stringify({
		ok: true,
		workbookPath,
		schemaFloatFields: expectedFields.length,
		catalogRows: seen.size,
		checkedSheets: ["EmployeePayroll Formula Catalog", "Rio Register QA", "Rio Rate Decision", "Rio Daily Breakdown", "Rio Daily Tally Checks", "Rio Payroll Walkthrough", "Rio Payroll Math Chain", "Rio Daily Computation", "Rio Tax Statutory", "Rio Field Tally Checks"],
	}, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
