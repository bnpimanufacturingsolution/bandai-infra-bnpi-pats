/**
 * Payroll Calculation Test Script
 * Tests payroll calculation with deductions and net pay breakdown
 * Inspired by tax-calculator.example.ts
 */

import {
	calculatePayroll,
	formatPHP,
	type PayrollCalculation,
	WITHHOLDING_TAX_TABLE,
	SSS_CONFIG,
	PHILHEALTH_CONFIG,
	PAGIBIG_CONFIG,
	getTaxBracket,
	calculateWithholdingTax,
	calculateTotalContributions,
	roundToCentavo,
} from "../helper/tax-calculator.helper";

declare const require: any;
declare const module: any;

/**
 * Test semi-monthly payroll calculation
 */
function testSemiMonthlyPayroll(semiMonthlyGross: number) {
	console.log("\n" + "=".repeat(80));
	console.log("SEMI-MONTHLY PAYROLL CALCULATION");
	console.log("=".repeat(80));

	// Calculate monthly rate for contributions
	const estimatedMonthlyRate = semiMonthlyGross * 2;

	// Calculate full monthly contributions
	const monthlyContributions = calculateTotalContributions(
		estimatedMonthlyRate,
		SSS_CONFIG,
		PHILHEALTH_CONFIG,
		PAGIBIG_CONFIG,
	);

	// Split contributions for semi-monthly (50/50)
	const contributionSplitFactor = 0.5;
	const periodContributions = {
		sss: roundToCentavo(monthlyContributions.sss * contributionSplitFactor),
		philHealth: roundToCentavo(monthlyContributions.philHealth * contributionSplitFactor),
		pagIbig: roundToCentavo(monthlyContributions.pagIbig * contributionSplitFactor),
		total: 0,
	};
	periodContributions.total = roundToCentavo(
		periodContributions.sss + periodContributions.philHealth + periodContributions.pagIbig,
	);

	// Calculate taxable income
	const periodTaxableIncome = roundToCentavo(semiMonthlyGross - periodContributions.total);

	// Calculate tax using semi-monthly brackets
	const withholdingTax = calculateWithholdingTax(
		periodTaxableIncome,
		WITHHOLDING_TAX_TABLE,
		true, // isSemiMonthly = true
	);

	// Calculate totals
	const totalDeductions = roundToCentavo(periodContributions.total + withholdingTax);
	const netPay = roundToCentavo(semiMonthlyGross - totalDeductions);

	console.log("\n📊 INPUT:");
	console.log(`  Semi-Monthly Gross: ${formatPHP(semiMonthlyGross)}`);
	console.log(`  Estimated Monthly Rate: ${formatPHP(estimatedMonthlyRate)}`);

	console.log("\n💰 DEDUCTIONS (Split 50/50 per period):");
	console.log(`  SSS Contribution:        ${formatPHP(periodContributions.sss)}`);
	console.log(`  PhilHealth Contribution: ${formatPHP(periodContributions.philHealth)}`);
	console.log(`  PAG-IBIG Contribution:   ${formatPHP(periodContributions.pagIbig)}`);
	console.log(`  ─────────────────────────────────────────`);
	console.log(`  Total Contributions:      ${formatPHP(periodContributions.total)}`);

	console.log("\n📈 TAX CALCULATION (Using Semi-Monthly Brackets):");
	console.log(`  Taxable Income:          ${formatPHP(periodTaxableIncome)}`);

	// Display semi-monthly tax table
	displayTaxTable(true);

	console.log(`  Withholding Tax:         ${formatPHP(withholdingTax)}`);

	console.log("\n💵 SUMMARY:");
	console.log(`  Total Deductions:        ${formatPHP(totalDeductions)}`);
	console.log(`  ─────────────────────────────────────────`);
	console.log(`  NET PAYABLE:             ${formatPHP(netPay)}`);

	console.log("\n" + "=".repeat(80));

	return {
		grossIncome: semiMonthlyGross,
		contributions: periodContributions,
		taxableIncome: periodTaxableIncome,
		withholdingTax,
		totalDeductions,
		netPay,
	};
}

/**
 * Compare monthly vs semi-monthly payroll
 */
function compareMonthlyVsSemiMonthly(monthlyGross: number) {
	console.log("\n" + "=".repeat(80));
	console.log("MONTHLY vs SEMI-MONTHLY COMPARISON");
	console.log("=".repeat(80));

	// Calculate monthly payroll
	const monthlyPayroll = calculatePayroll(
		monthlyGross,
		WITHHOLDING_TAX_TABLE,
		SSS_CONFIG,
		PHILHEALTH_CONFIG,
		PAGIBIG_CONFIG,
	);

	// Calculate semi-monthly (split in 2)
	const semiMonthlyGross = monthlyGross / 2;
	const semiPayroll = testSemiMonthlyPayroll(semiMonthlyGross);

	// Calculate total for both periods in semi-monthly
	const totalSemiMonthlyDeductions = semiPayroll.totalDeductions * 2;
	const totalSemiMonthlyNet = semiPayroll.netPay * 2;

	console.log("\n📊 COMPARISON:");
	console.log(`\n  MONTHLY (1 period):`);
	console.log(`    Gross:       ${formatPHP(monthlyPayroll.grossIncome)}`);
	console.log(`    Deductions:  ${formatPHP(monthlyPayroll.totalDeductions)}`);
	console.log(`    Net Pay:     ${formatPHP(monthlyPayroll.netPay)}`);

	console.log(`\n  SEMI-MONTHLY (per period):`);
	console.log(`    Gross:       ${formatPHP(semiPayroll.grossIncome)}`);
	console.log(`    Deductions:  ${formatPHP(semiPayroll.totalDeductions)}`);
	console.log(`    Net Pay:     ${formatPHP(semiPayroll.netPay)}`);

	console.log(`\n  SEMI-MONTHLY (both periods combined):`);
	console.log(`    Gross:       ${formatPHP(monthlyGross)}`);
	console.log(`    Deductions:  ${formatPHP(totalSemiMonthlyDeductions)}`);
	console.log(`    Net Pay:     ${formatPHP(totalSemiMonthlyNet)}`);

	const deductionDiff = totalSemiMonthlyDeductions - monthlyPayroll.totalDeductions;
	const netPayDiff = totalSemiMonthlyNet - monthlyPayroll.netPay;

	console.log(`\n  DIFFERENCE (Semi-Monthly - Monthly):`);
	console.log(
		`    Deductions:  ${formatPHP(Math.abs(deductionDiff))} ${deductionDiff >= 0 ? "more" : "less"}`,
	);
	console.log(
		`    Net Pay:     ${formatPHP(Math.abs(netPayDiff))} ${netPayDiff >= 0 ? "more" : "less"}`,
	);

	console.log("\n" + "=".repeat(80));
}

/**
 * Test payroll calculation for a single monthly income
 */
function testPayrollCalculation(monthlyIncome: number) {
	console.log("=".repeat(80));
	console.log("PAYROLL CALCULATION TEST");
	console.log("=".repeat(80));

	const payroll = calculatePayroll(
		monthlyIncome,
		WITHHOLDING_TAX_TABLE,
		SSS_CONFIG,
		PHILHEALTH_CONFIG,
		PAGIBIG_CONFIG,
	);

	console.log("\n📊 INPUT:");
	console.log(`  Monthly Gross Income: ${formatPHP(monthlyIncome)}`);

	console.log("\n💰 DEDUCTIONS:");
	console.log(`  SSS Contribution:        ${formatPHP(payroll.contributions.sss)}`);
	console.log(`  PhilHealth Contribution: ${formatPHP(payroll.contributions.philHealth)}`);
	console.log(`  PAG-IBIG Contribution:   ${formatPHP(payroll.contributions.pagIbig)}`);
	console.log(`  ─────────────────────────────────────────`);
	console.log(`  Total Contributions:      ${formatPHP(payroll.contributions.total)}`);

	console.log("\n📈 TAX CALCULATION:");
	console.log(`  Taxable Income:          ${formatPHP(payroll.taxableIncome)}`);
	console.log(`  Withholding Tax:         ${formatPHP(payroll.withholdingTax)}`);

	console.log("\n💵 SUMMARY:");
	console.log(`  Total Deductions:        ${formatPHP(payroll.totalDeductions)}`);
	console.log(`  ─────────────────────────────────────────`);
	console.log(`  NET PAYABLE:             ${formatPHP(payroll.netPay)}`);

	console.log("\n" + "=".repeat(80));

	return payroll;
}

/**
 * Display the withholding tax table
 */
function displayTaxTable(isSemiMonthly: boolean = false) {
	console.log(
		`\n📋 WITHHOLDING TAX TABLE (TRAIN Law - ${isSemiMonthly ? "SEMI-MONTHLY" : "MONTHLY"}):`,
	);

	WITHHOLDING_TAX_TABLE.forEach((bracket) => {
		const base = isSemiMonthly
			? formatPHP(bracket.semiMonthlyBase)
			: formatPHP(bracket.monthlyBase);
		const cap = isSemiMonthly
			? bracket.semiMonthlyCap === null
				? "∞"
				: formatPHP(bracket.semiMonthlyCap)
			: bracket.monthlyCap === null
				? "∞"
				: formatPHP(bracket.monthlyCap);
		const fixedTax = isSemiMonthly
			? formatPHP(bracket.semiMonthlyFixedTax)
			: formatPHP(bracket.monthlyFixedTax);
		const rate = `${(bracket.rate * 100).toFixed(0)}%`;

		const range = (
			isSemiMonthly ? bracket.semiMonthlyCap === null : bracket.monthlyCap === null
		)
			? `${base} and above`
			: `${base} - ${cap}`;

		console.log(`  ${range.padEnd(40)} Fixed: ${fixedTax.padEnd(15)} Rate: ${rate}`);
	});
}

/**
 * Test with different salary levels - shows detailed breakdown for each
 */
function testMultipleSalaries() {
	console.log("\n" + "=".repeat(80));
	console.log("PAYROLL CALCULATION - MULTIPLE SALARY LEVELS");
	console.log("=".repeat(80));

	const salaries = [39272.72];

	salaries.forEach((salary, index) => {
		if (index > 0) {
			console.log("\n" + "-".repeat(80) + "\n");
		}

		const payroll = calculatePayroll(
			salary,
			WITHHOLDING_TAX_TABLE,
			SSS_CONFIG,
			PHILHEALTH_CONFIG,
			PAGIBIG_CONFIG,
		);

		// Calculate percentages
		const sssPercent = (payroll.contributions.sss / salary) * 100;
		const philHealthPercent = (payroll.contributions.philHealth / salary) * 100;
		const pagIbigPercent = (payroll.contributions.pagIbig / salary) * 100;
		const taxPercent = (payroll.withholdingTax / salary) * 100;
		const totalDeductPercent = (payroll.totalDeductions / salary) * 100;
		const netPayPercent = (payroll.netPay / salary) * 100;

		console.log(`\n📊 SALARY: ${formatPHP(salary)}`);

		// Display tax table before deductionsc
		displayTaxTable();

		console.log("\n💰 DEDUCTIONS:");
		console.log(
			`  SSS Contribution:        ${formatPHP(payroll.contributions.sss).padEnd(15)} (${sssPercent.toFixed(2)}%)`,
		);
		console.log(
			`  PhilHealth Contribution: ${formatPHP(payroll.contributions.philHealth).padEnd(15)} (${philHealthPercent.toFixed(2)}%)`,
		);
		console.log(
			`  PAG-IBIG Contribution:   ${formatPHP(payroll.contributions.pagIbig).padEnd(15)} (${pagIbigPercent.toFixed(2)}%)`,
		);
		console.log(`  ─────────────────────────────────────────`);
		console.log(
			`  Total Contributions:      ${formatPHP(payroll.contributions.total).padEnd(15)}`,
		);

		console.log("\n📈 TAX CALCULATION:");
		console.log(`  Taxable Income:          ${formatPHP(payroll.taxableIncome).padEnd(15)}`);

		// Show which tax bracket is applied based on taxable income
		const applicableBracket = getTaxBracket(payroll.taxableIncome, WITHHOLDING_TAX_TABLE);
		if (applicableBracket) {
			const base = formatPHP(applicableBracket.monthlyBase);
			const cap =
				applicableBracket.monthlyCap === null
					? "∞"
					: formatPHP(applicableBracket.monthlyCap);
			const fixedTax = formatPHP(applicableBracket.monthlyFixedTax);
			const ratePercent = `${(applicableBracket.rate * 100).toFixed(0)}%`;
			const range =
				applicableBracket.monthlyCap === null ? `${base} and above` : `${base} - ${cap}`;

			const excess = payroll.taxableIncome - applicableBracket.monthlyBase;

			console.log(`  ─────────────────────────────────────────`);
			console.log(`  Applicable Tax Bracket:`);
			console.log(`    Range: ${range}`);
			console.log(`    Fixed Tax: ${fixedTax} | Rate: ${ratePercent}`);
			console.log(`    Excess Value: ${formatPHP(excess)}`);
		}

		console.log(
			`  Withholding Tax:         ${formatPHP(payroll.withholdingTax).padEnd(15)} (${taxPercent.toFixed(2)}%)`,
		);

		console.log("\n💵 SUMMARY:");
		console.log(`  Gross Income:            ${formatPHP(salary).padEnd(15)}`);
		console.log(
			`  Total Deductions:        ${formatPHP(payroll.totalDeductions).padEnd(15)} (${totalDeductPercent.toFixed(2)}%)`,
		);
		console.log(`  ─────────────────────────────────────────`);
		console.log(
			`  NET PAYABLE:             ${formatPHP(payroll.netPay).padEnd(15)} (${netPayPercent.toFixed(2)}%)`,
		);
	});

	console.log("\n" + "=".repeat(80) + "\n");
}

/**
 * Detailed breakdown for a single salary
 */
function detailedBreakdown(monthlyIncome: number) {
	console.log("\n" + "=".repeat(80));
	console.log(`DETAILED PAYROLL BREAKDOWN - ${formatPHP(monthlyIncome)} Monthly`);
	console.log("=".repeat(80));

	const payroll = calculatePayroll(
		monthlyIncome,
		WITHHOLDING_TAX_TABLE,
		SSS_CONFIG,
		PHILHEALTH_CONFIG,
		PAGIBIG_CONFIG,
	);

	// Calculate percentages
	const sssPercent = (payroll.contributions.sss / monthlyIncome) * 100;
	const philHealthPercent = (payroll.contributions.philHealth / monthlyIncome) * 100;
	const pagIbigPercent = (payroll.contributions.pagIbig / monthlyIncome) * 100;
	const taxPercent = (payroll.withholdingTax / monthlyIncome) * 100;
	const totalDeductPercent = (payroll.totalDeductions / monthlyIncome) * 100;
	const netPayPercent = (payroll.netPay / monthlyIncome) * 100;

	console.log("\n📊 GROSS INCOME:");
	console.log(`  Amount: ${formatPHP(monthlyIncome)} (100.00%)`);

	console.log("\n💰 DEDUCTIONS BREAKDOWN:");
	console.log(`  SSS Contribution:`);
	console.log(`    Amount: ${formatPHP(payroll.contributions.sss)} (${sssPercent.toFixed(2)}%)`);
	console.log(`  PhilHealth Contribution:`);
	console.log(
		`    Amount: ${formatPHP(payroll.contributions.philHealth)} (${philHealthPercent.toFixed(2)}%)`,
	);
	console.log(`  PAG-IBIG Contribution:`);
	console.log(
		`    Amount: ${formatPHP(payroll.contributions.pagIbig)} (${pagIbigPercent.toFixed(2)}%)`,
	);
	console.log(`  ─────────────────────────────────────────`);
	console.log(`  Total Contributions: ${formatPHP(payroll.contributions.total)}`);

	console.log("\n📈 TAX CALCULATION:");
	console.log(`  Taxable Income: ${formatPHP(payroll.taxableIncome)}`);
	console.log(
		`  Withholding Tax: ${formatPHP(payroll.withholdingTax)} (${taxPercent.toFixed(2)}%)`,
	);

	console.log("\n💵 FINAL SUMMARY:");
	console.log(`  Gross Income:     ${formatPHP(monthlyIncome)}`);
	console.log(
		`  Total Deductions: ${formatPHP(payroll.totalDeductions)} (${totalDeductPercent.toFixed(2)}%)`,
	);
	console.log(`  ─────────────────────────────────────────`);
	console.log(`  NET PAYABLE:      ${formatPHP(payroll.netPay)} (${netPayPercent.toFixed(2)}%)`);

	console.log("\n" + "=".repeat(80) + "\n");
}

/**
 * Main test function
 */
function runTest() {
	console.log("\n");
	console.log("*".repeat(80));
	console.log("PAYROLL CALCULATION TEST SCRIPT");
	console.log("*".repeat(80));

	// Test with PHP 39,272.72 monthly income
	const testSalary = 39272.72;

	// Single calculation test
	testPayrollCalculation(testSalary);

	// Detailed breakdown
	detailedBreakdown(testSalary);

	// Semi-monthly test
	console.log("\n");
	const semiMonthlyAmount = testSalary / 2;
	testSemiMonthlyPayroll(semiMonthlyAmount);

	// Compare monthly vs semi-monthly
	compareMonthlyVsSemiMonthly(testSalary);

	// Multiple salary levels comparison
	testMultipleSalaries();

	console.log("*".repeat(80));
	console.log("TEST COMPLETE");
	console.log("*".repeat(80));
	console.log("\n");
}

// Run test if executed directly
if (require.main === module) {
	runTest();
}

export {
	testPayrollCalculation,
	detailedBreakdown,
	testMultipleSalaries,
	testSemiMonthlyPayroll,
	compareMonthlyVsSemiMonthly,
	runTest,
};
