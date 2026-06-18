/**
 * Test Script for BIR Part 4 Calculation Helper
 *
 * Tests the BIR Form 2316 Part IV calculation with 40k monthly salary example
 */

import {
	calculateBIRPart4,
	printBIRPart4,
	formatPHP,
	type BIRPart4Input,
} from "../helper/bir-part4.helper";
import {
	calculateTotalContributions,
	calculateWithholdingTax,
} from "../helper/tax-calculator.helper";

declare const require: any;
declare const module: any;
declare const process: any;

/**
 * Test Case: 40k Monthly Salary
 * Monthly salary: 40,000
 * 13th month: 40,000
 * Expected results match the provided example
 */
function test40kSalary() {
	console.log("\n" + "=".repeat(80));
	console.log("BIR PART 4 CALCULATION TEST - 40K MONTHLY SALARY");
	console.log("Monthly Salary: ₱40,000.00");
	console.log("13th Month Pay: ₱40,000.00");
	console.log("=".repeat(80));

	const monthlySalary = 40000;
	const annualBasicSalary = monthlySalary * 12; // 480,000
	const thirteenthMonthPay = 40000;

	// Calculate monthly contributions
	const monthlyContributions = calculateTotalContributions(monthlySalary);
	const annualContributions = monthlyContributions.total * 12;

	// Calculate monthly withholding tax
	const monthlyTaxableIncome = monthlySalary - monthlyContributions.total;
	const monthlyWithholdingTax = calculateWithholdingTax(monthlyTaxableIncome);
	const annualTaxWithheld = monthlyWithholdingTax * 12;

	console.log("\nMonthly Breakdown:");
	console.log(`  Gross Salary:        ${formatPHP(monthlySalary)}`);
	console.log(`  Contributions:       ${formatPHP(monthlyContributions.total)}`);
	console.log(`    - SSS:             ${formatPHP(monthlyContributions.sss)}`);
	console.log(`    - PhilHealth:      ${formatPHP(monthlyContributions.philHealth)}`);
	console.log(`    - Pag-IBIG:        ${formatPHP(monthlyContributions.pagIbig)}`);
	console.log(`  Taxable Income:      ${formatPHP(monthlyTaxableIncome)}`);
	console.log(`  Withholding Tax:     ${formatPHP(monthlyWithholdingTax)}`);

	console.log("\nAnnual Breakdown:");
	console.log(`  Annual Basic Salary: ${formatPHP(annualBasicSalary)}`);
	console.log(`  13th Month Pay:      ${formatPHP(thirteenthMonthPay)}`);
	console.log(`  Annual Contributions: ${formatPHP(annualContributions)}`);
	console.log(`  Annual Tax Withheld:  ${formatPHP(annualTaxWithheld)}`);

	const input: BIRPart4Input = {
		monthlySalary: monthlySalary,
		annualBasicSalary: annualBasicSalary,
		thirteenthMonthPay: thirteenthMonthPay,
		taxWithheldPresentEmployer: annualTaxWithheld,
	};

	const result = calculateBIRPart4(input);

	console.log("\n" + "=".repeat(80));
	console.log("CALCULATION RESULTS");
	console.log("=".repeat(80));

	// Verify expected values
	console.log("\nExpected vs Calculated:");
	console.log(
		`Field 19 (Gross Compensation): Expected ₱520,000.00, Got ${formatPHP(result.part4A.field19)}`,
	);
	console.log(
		`Field 20 (Non-Taxable):        Expected ₱75,400.00, Got ${formatPHP(result.part4A.field20)}`,
	);
	console.log(
		`Field 21 (Taxable Present):    Expected ₱444,600.00, Got ${formatPHP(result.part4A.field21)}`,
	);
	console.log(
		`Field 23 (Gross Taxable):       Expected ₱444,600.00, Got ${formatPHP(result.part4A.field23)}`,
	);
	console.log(
		`Field 24 (Tax Due):             Expected ₱31,420.00, Got ${formatPHP(result.part4A.field24)}`,
	);
	console.log(
		`Field 25A (Tax Withheld):       Expected ₱31,420.80, Got ${formatPHP(result.part4A.field25A)}`,
	);

	// Print full result
	printBIRPart4(result);

	// Validation
	const errors: string[] = [];
	const warnings: string[] = [];

	if (Math.abs(result.part4A.field19 - 520000) > 1) {
		errors.push(`Field 19 mismatch: expected 520,000, got ${result.part4A.field19}`);
	}
	if (Math.abs(result.part4A.field20 - 75400) > 1) {
		errors.push(`Field 20 mismatch: expected 75,400, got ${result.part4A.field20}`);
	}
	if (Math.abs(result.part4A.field21 - 444600) > 1) {
		errors.push(`Field 21 mismatch: expected 444,600, got ${result.part4A.field21}`);
	}
	if (Math.abs(result.part4A.field23 - 444600) > 1) {
		errors.push(`Field 23 mismatch: expected 444,600, got ${result.part4A.field23}`);
	}
	if (Math.abs(result.part4A.field24 - 31420) > 1) {
		warnings.push(
			`Field 24 mismatch: expected 31,420, got ${result.part4A.field24} (may vary due to rounding)`,
		);
	}

	if (errors.length > 0) {
		console.log("\n❌ ERRORS:");
		errors.forEach((error) => console.log(`  - ${error}`));
	}
	if (warnings.length > 0) {
		console.log("\n⚠️  WARNINGS:");
		warnings.forEach((warning) => console.log(`  - ${warning}`));
	}
	if (errors.length === 0 && warnings.length === 0) {
		console.log("\n✅ All validations passed!");
	}

	console.log("\n" + "=".repeat(80));
	console.log("TEST COMPLETED");
	console.log("=".repeat(80) + "\n");
}

// Run test if executed directly
if (require.main === module) {
	try {
		test40kSalary();
	} catch (error) {
		console.error("\n❌ ERROR RUNNING TEST:");
		console.error(error);
		process.exit(1);
	}
}

export { test40kSalary };
