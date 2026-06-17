/**
 * Test Script for Tax Calculator
 * Validates calculations against expected values from tax-rates.png
 */

import {
	calculatePayroll,
	calculateWithholdingTax,
	calculateSSSContribution,
	calculatePhilHealthContribution,
	calculatePagIbigContribution,
	calculateTotalContributions,
	getTaxBracket,
	formatPHP,
} from "../helper/tax-calculator";

// ANSI color codes for terminal output
const colors = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	bold: "\x1b[1m",
};

interface TestCase {
	description: string;
	grossIncome: number;
	expected: {
		sss?: number;
		philHealth?: number;
		pagIbig?: number;
		totalContributions?: number;
		taxableIncome?: number;
		withholdingTax?: number;
		totalDeductions?: number;
		netPay?: number;
	};
}

/**
 * Test cases based on the tax-rates.png image
 */
const testCases: TestCase[] = [
	{
		description: "35,000 Monthly Salary (from tax-rates.png)",
		grossIncome: 35000,
		expected: {
			sss: 1750,
			philHealth: 875,
			pagIbig: 200,
			totalContributions: 2825,
			taxableIncome: 32175,
			withholdingTax: 1701.3,
			totalDeductions: 4526.3,
			netPay: 30473.7,
		},
	},
	{
		description: "Minimum Wage - Tax Exempt",
		grossIncome: 15000,
		expected: {
			sss: 750,
			philHealth: 375,
			pagIbig: 200, // Capped at maximum 200
			totalContributions: 1325,
			taxableIncome: 13675,
			withholdingTax: 0, // Tax-exempt
		},
	},
	{
		description: "50,000 Monthly Salary",
		grossIncome: 50000,
		expected: {
			sss: 1750, // Capped at maximum
			philHealth: 875, // Capped at maximum
			pagIbig: 200, // Capped at maximum
		},
	},
	{
		description: "100,000 Monthly Salary - Higher Tax Bracket",
		grossIncome: 100000,
		expected: {
			sss: 1750, // Capped
			philHealth: 875, // Capped
			pagIbig: 200, // Capped
		},
	},
	{
		description: "Low Income - Below PAG-IBIG Threshold",
		grossIncome: 1200,
		expected: {
			pagIbig: 12, // 1% of 1200
		},
	},
	{
		description: "At PAG-IBIG Threshold",
		grossIncome: 1500,
		expected: {
			pagIbig: 15, // 1% of 1500
		},
	},
	{
		description: "Above PAG-IBIG Threshold",
		grossIncome: 2000,
		expected: {
			pagIbig: 40, // 2% of 2000
		},
	},
];

/**
 * Compare actual vs expected value with tolerance
 */
function compareValues(actual: number, expected: number, tolerance: number = 0.5): boolean {
	return Math.abs(actual - expected) <= tolerance;
}

/**
 * Run a single test case
 */
function runTestCase(testCase: TestCase): { passed: number; failed: number; total: number } {
	console.log(`\n${colors.cyan}${colors.bold}TEST: ${testCase.description}${colors.reset}`);
	console.log(`${colors.blue}Gross Income: ${formatPHP(testCase.grossIncome)}${colors.reset}`);

	const payroll = calculatePayroll(testCase.grossIncome);
	let passed = 0;
	let failed = 0;
	let total = 0;

	// Helper function to test a value
	const testValue = (
		name: string,
		actual: number,
		expected: number | undefined,
		tolerance: number = 0.5,
	) => {
		if (expected === undefined) return;
		total++;

		const isPass = compareValues(actual, expected, tolerance);
		const status = isPass
			? `${colors.green}✓ PASS${colors.reset}`
			: `${colors.red}✗ FAIL${colors.reset}`;
		const diff = isPass ? "" : ` (diff: ${(actual - expected).toFixed(2)})`;

		console.log(
			`  ${status} ${name.padEnd(25)} Expected: ${formatPHP(expected).padEnd(15)} Got: ${formatPHP(actual)}${diff}`,
		);

		if (isPass) passed++;
		else failed++;
	};

	// Test individual values
	testValue("SSS Contribution", payroll.contributions.sss, testCase.expected.sss);
	testValue(
		"PhilHealth Contribution",
		payroll.contributions.philHealth,
		testCase.expected.philHealth,
	);
	testValue("PAG-IBIG Contribution", payroll.contributions.pagIbig, testCase.expected.pagIbig);
	testValue(
		"Total Contributions",
		payroll.contributions.total,
		testCase.expected.totalContributions,
	);
	testValue("Taxable Income", payroll.taxableIncome, testCase.expected.taxableIncome);
	testValue("Withholding Tax", payroll.withholdingTax, testCase.expected.withholdingTax, 1);
	testValue("Total Deductions", payroll.totalDeductions, testCase.expected.totalDeductions, 1);
	testValue("Net Pay", payroll.netPay, testCase.expected.netPay, 1);

	return { passed, failed, total };
}

/**
 * Test all tax brackets
 */
function testTaxBrackets() {
	console.log(`\n${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}TAX BRACKET VERIFICATION${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);

	const testSalaries = [
		{ salary: 10000, expectedRate: 0, bracket: "0% - Tax Exempt" },
		{ salary: 20833, expectedRate: 0, bracket: "0% - At threshold" },
		{ salary: 25000, expectedRate: 0.15, bracket: "15%" },
		{ salary: 33333, expectedRate: 0.15, bracket: "15% - At threshold" },
		{ salary: 40000, expectedRate: 0.2, bracket: "20%" },
		{ salary: 66667, expectedRate: 0.2, bracket: "20% - At threshold" },
		{ salary: 100000, expectedRate: 0.25, bracket: "25%" },
		{ salary: 166667, expectedRate: 0.25, bracket: "25% - At threshold" },
		{ salary: 300000, expectedRate: 0.3, bracket: "30%" },
		{ salary: 666667, expectedRate: 0.3, bracket: "30% - At threshold" },
		{ salary: 700000, expectedRate: 0.35, bracket: "35%" },
	];

	let passed = 0;
	let failed = 0;

	testSalaries.forEach(({ salary, expectedRate, bracket }) => {
		const taxBracket = getTaxBracket(salary);
		const actualRate = taxBracket?.rate || 0;
		const isPass = actualRate === expectedRate;

		const status = isPass ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;

		console.log(
			`${status} Salary: ${formatPHP(salary).padEnd(20)} Expected: ${(expectedRate * 100).toFixed(0)}% (${bracket.padEnd(25)}) Got: ${(actualRate * 100).toFixed(0)}%`,
		);

		if (isPass) passed++;
		else failed++;
	});

	console.log(
		`\n${colors.bold}Tax Bracket Tests: ${passed} passed, ${failed} failed${colors.reset}`,
	);
	return { passed, failed };
}

/**
 * Display sample calculation table
 */
function displaySampleCalculations() {
	console.log(`\n${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);
	console.log(
		`${colors.cyan}${colors.bold}SAMPLE CALCULATIONS - MULTIPLE SALARIES${colors.reset}`,
	);
	console.log(`${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);

	const salaries = [15000, 20000, 25000, 30000, 35000, 40000, 50000, 75000, 100000];

	console.log(
		`\n${"Salary".padEnd(12)} | ${"SSS".padEnd(10)} | ${"PhilHealth".padEnd(12)} | ${"PAG-IBIG".padEnd(10)} | ${"Tax".padEnd(10)} | ${"Net Pay".padEnd(12)}`,
	);
	console.log("-".repeat(90));

	salaries.forEach((salary) => {
		const payroll = calculatePayroll(salary);
		console.log(
			`${formatPHP(salary).padEnd(12)} | ` +
				`${formatPHP(payroll.contributions.sss).padEnd(10)} | ` +
				`${formatPHP(payroll.contributions.philHealth).padEnd(12)} | ` +
				`${formatPHP(payroll.contributions.pagIbig).padEnd(10)} | ` +
				`${formatPHP(payroll.withholdingTax).padEnd(10)} | ` +
				`${formatPHP(payroll.netPay).padEnd(12)}`,
		);
	});
}

/**
 * Test edge cases
 */
function testEdgeCases() {
	console.log(`\n${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}EDGE CASES${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);

	const edgeCases = [
		{ description: "Zero salary", salary: 0 },
		{ description: "Very low salary (₱100)", salary: 100 },
		{ description: "SSS minimum (₱250)", salary: 250 },
		{ description: "Exactly at tax threshold (₱20,833)", salary: 20833 },
		{ description: "One peso above threshold (₱20,834)", salary: 20834 },
		{ description: "Very high salary (₱1,000,000)", salary: 1000000 },
	];

	edgeCases.forEach(({ description, salary }) => {
		console.log(`\n${colors.yellow}${description}:${colors.reset}`);
		const payroll = calculatePayroll(salary);

		console.log(`  Gross Income:    ${formatPHP(payroll.grossIncome)}`);
		console.log(`  SSS:             ${formatPHP(payroll.contributions.sss)}`);
		console.log(`  PhilHealth:      ${formatPHP(payroll.contributions.philHealth)}`);
		console.log(`  PAG-IBIG:        ${formatPHP(payroll.contributions.pagIbig)}`);
		console.log(`  Total Contrib:   ${formatPHP(payroll.contributions.total)}`);
		console.log(`  Taxable Income:  ${formatPHP(payroll.taxableIncome)}`);
		console.log(`  Withholding Tax: ${formatPHP(payroll.withholdingTax)}`);
		console.log(`  Net Pay:         ${formatPHP(payroll.netPay)}`);
	});
}

/**
 * Main test runner
 */
function runAllTests() {
	console.clear();
	console.log(`${colors.cyan}${colors.bold}${"*".repeat(80)}${colors.reset}`);
	console.log(
		`${colors.cyan}${colors.bold}PHILIPPINE TAX CALCULATOR - TEST SUITE${colors.reset}`,
	);
	console.log(`${colors.cyan}${colors.bold}${"*".repeat(80)}${colors.reset}`);

	let totalPassed = 0;
	let totalFailed = 0;
	let totalTests = 0;

	// Run main test cases
	console.log(`\n${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}MAIN TEST CASES${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);

	testCases.forEach((testCase) => {
		const result = runTestCase(testCase);
		totalPassed += result.passed;
		totalFailed += result.failed;
		totalTests += result.total;
	});

	// Test tax brackets
	const bracketResults = testTaxBrackets();
	totalPassed += bracketResults.passed;
	totalFailed += bracketResults.failed;
	totalTests += bracketResults.passed + bracketResults.failed;

	// Display sample calculations
	displaySampleCalculations();

	// Test edge cases
	testEdgeCases();

	// Final summary
	console.log(`\n${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}TEST SUMMARY${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}${"=".repeat(80)}${colors.reset}`);

	const passRate = ((totalPassed / totalTests) * 100).toFixed(2);
	const statusColor = totalFailed === 0 ? colors.green : colors.yellow;

	console.log(`\nTotal Tests:  ${totalTests}`);
	console.log(`${colors.green}Passed:       ${totalPassed}${colors.reset}`);
	console.log(`${colors.red}Failed:       ${totalFailed}${colors.reset}`);
	console.log(`${statusColor}Pass Rate:    ${passRate}%${colors.reset}`);

	if (totalFailed === 0) {
		console.log(`\n${colors.green}${colors.bold}✓ ALL TESTS PASSED!${colors.reset}`);
	} else {
		console.log(
			`\n${colors.yellow}${colors.bold}⚠ SOME TESTS FAILED - Please review${colors.reset}`,
		);
	}

	console.log(`\n${colors.cyan}${colors.bold}${"*".repeat(80)}${colors.reset}\n`);

	// Return exit code
	return totalFailed === 0 ? 0 : 1;
}

// Run tests if executed directly
if (require.main === module) {
	const exitCode = runAllTests();
	process.exit(exitCode);
}

export { runAllTests, testCases };
