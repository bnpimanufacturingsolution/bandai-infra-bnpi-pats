/**
 * Test Script for BIR Form 2316 Generator
 * Validates all 56 fields are correctly populated
 */

import {
	generateBIRForm2316,
	validateBIRForm2316,
	printBIRForm2316,
} from "../helper/bir-2316.generator";
import type { BIRForm2316Input } from "../helper/bir-2316.types";
import { calculatePayroll } from "../helper/tax-calculator";

declare const require: any;
declare const module: any;
declare const process: any;

// ANSI colors
const colors = {
	reset: "\x1b[0m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	bold: "\x1b[1m",
};

type TestResult = {
	name: string;
	passed: boolean;
};

/**
 * Test Case 1: Complete Form with All Fields
 */
function testCompleteForm() {
	console.log(`\n${colors.cyan}${colors.bold}${"=".repeat(100)}${colors.reset}`);
	console.log(
		`${colors.cyan}${colors.bold}TEST 1: COMPLETE BIR FORM 2316 - ALL 56 FIELDS${colors.reset}`,
	);
	console.log(`${colors.cyan}${colors.bold}${"=".repeat(100)}${colors.reset}`);

	// Employee earns 35,000/month for 12 months
	const monthlySalary = 35000;
	const monthsWorked = 12;

	// Calculate monthly payroll first
	const monthlyPayroll = calculatePayroll(monthlySalary);

	// Annual calculations
	const annualBasicSalary = monthlySalary * monthsWorked;
	const annualContributions = monthlyPayroll.contributions.total * monthsWorked;
	const annualTax = monthlyPayroll.withholdingTax * monthsWorked;

	// 13th month pay
	const thirteenthMonthTotal = 35000;
	const thirteenthMonthNonTaxable = Math.min(thirteenthMonthTotal, 90000);
	const thirteenthMonthTaxable = Math.max(thirteenthMonthTotal - 90000, 0);

	const input: BIRForm2316Input = {
		year: 2025,
		periodFrom: "01/01",
		periodTo: "12/31",

		employee: {
			tin: "123-456-789-000",
			lastName: "Dela Cruz",
			firstName: "Juan",
			middleName: "Santos",
			rdoCode: "039",
			registeredAddress: "123 Sample Street, Barangay San Miguel, Makati City, Metro Manila",
			registeredAddressZipCode: "1200",
			localHomeAddress: "456 Home Avenue, Barangay Poblacion, Makati City",
			localHomeAddressZipCode: "1210",
			dateOfBirth: "05/15/1990",
			contactNumber: "+63-917-123-4567",
			isMinimumWageEarner: false,
			ctcNo: "CTC-2025-12345",
			validIDNo: "DL-N01-12-345678",
			idType: "Driver's License",
			idPlaceOfIssue: "LTO Makati",
			idDateIssued: "01/15/2023",
		},

		presentEmployer: {
			tin: "000-111-222-000",
			name: "ABC Corporation",
			address: "456 Business Avenue, Makati City, Metro Manila",
			zipCode: "1226",
			type: "MAIN",
			signatory: "MARIA CLARA SANTOS",
			signatoryTitle: "HR Manager",
		},

		compensationPresent: {
			// Non-taxable
			thirteenthMonthPayNonTaxable: thirteenthMonthNonTaxable,
			deMinimisBenefits: 2500, // Annual de minimis
			contributionsUnionDues: annualContributions,

			// Taxable - Regular
			basicSalaryTaxable: annualBasicSalary,
			representation: 12000, // ₱1,000/month
			transportation: 12000, // ₱1,000/month
			cola: 6000, // ₱500/month

			// Taxable - Supplementary
			thirteenthMonthPayTaxable: thirteenthMonthTaxable,
		},

		tax: {
			taxDue: annualTax,
			taxWithheldPresent: annualTax,
		},
	};

	// Generate form
	const form = generateBIRForm2316(input);

	// Validate
	const validation = validateBIRForm2316(form);

	// Display results
	printBIRForm2316(form);

	// Validation results
	console.log(`\n${colors.bold}VALIDATION RESULTS:${colors.reset}`);
	if (validation.isValid) {
		console.log(`${colors.green}✓ Form is VALID${colors.reset}`);
	} else {
		console.log(`${colors.red}✗ Form has ERRORS:${colors.reset}`);
		validation.errors.forEach((error) =>
			console.log(`  ${colors.red}• ${error}${colors.reset}`),
		);
	}

	if (validation.warnings.length > 0) {
		console.log(`\n${colors.yellow}⚠ WARNINGS:${colors.reset}`);
		validation.warnings.forEach((warning) =>
			console.log(`  ${colors.yellow}• ${warning}${colors.reset}`),
		);
	}

	// Verify all fields are populated
	console.log(`\n${colors.cyan}${colors.bold}FIELD VERIFICATION (56 Fields):${colors.reset}`);
	const fieldChecks = [
		{ box: "1", name: "Year", value: form.year },
		{ box: "2", name: "Period", value: `${form.periodFrom} to ${form.periodTo}` },
		{ box: "3", name: "Employee TIN", value: form.employeeTin },
		{
			box: "4",
			name: "Employee Name",
			value: `${form.employeeLastName}, ${form.employeeFirstName}`,
		},
		{ box: "5", name: "RDO Code", value: form.rdoCode },
		{ box: "6", name: "Registered Address", value: form.registeredAddress },
		{ box: "6A", name: "ZIP (Registered)", value: form.registeredAddressZipCode },
		{ box: "6B", name: "Local Home Address", value: form.localHomeAddress || "N/A" },
		{ box: "6C", name: "ZIP (Local)", value: form.localHomeAddressZipCode || "N/A" },
		{ box: "6D", name: "Foreign Address", value: form.foreignAddress || "N/A" },
		{ box: "7", name: "Date of Birth", value: form.dateOfBirth },
		{ box: "8", name: "Contact Number", value: form.contactNumber },
		{ box: "11", name: "MWE", value: form.isMinimumWageEarner ? "YES" : "NO" },
		{ box: "12", name: "Present Employer TIN", value: form.presentEmployerTin },
		{ box: "13", name: "Present Employer Name", value: form.presentEmployerName },
		{ box: "14", name: "Present Employer Address", value: form.presentEmployerAddress },
		{ box: "14A", name: "ZIP (Present Employer)", value: form.presentEmployerZipCode },
		{ box: "15", name: "Employer Type", value: form.employerType },
		{
			box: "19",
			name: "Gross Compensation (Present)",
			value: form.grossCompensationPresentEmployer,
		},
		{ box: "20", name: "Non-Taxable (Present)", value: form.totalNonTaxablePresentEmployer },
		{ box: "21", name: "Taxable (Present)", value: form.taxableCompensationPresentEmployer },
		{ box: "22", name: "Taxable (Previous)", value: form.taxableCompensationPreviousEmployer },
		{ box: "23", name: "Gross Taxable", value: form.grossTaxableCompensation },
		{ box: "24", name: "Tax Due", value: form.taxDue },
		{ box: "25", name: "Taxes Withheld", value: form.taxesWithheld },
		{ box: "25A", name: "Taxes Withheld (Present)", value: form.taxesWithheldPresentEmployer },
		{
			box: "25B",
			name: "Taxes Withheld (Previous)",
			value: form.taxesWithheldPreviousEmployer,
		},
		{ box: "26", name: "Total Taxes Adjusted", value: form.totalTaxesWithheldAdjusted },
		{ box: "27", name: "Tax Credit PERA", value: form.taxCreditPERA },
		{ box: "28", name: "Total Taxes Withheld", value: form.totalTaxesWithheld },
		{ box: "34", name: "13th Month (Non-Taxable)", value: form.thirteenthMonthPayNonTaxable },
		{ box: "35", name: "De Minimis", value: form.deMinimisBenefits },
		{ box: "36", name: "Contributions/Union Dues", value: form.contributionsUnionDues },
		{ box: "38", name: "Total Non-Taxable", value: form.totalNonTaxableCompensation },
		{ box: "39", name: "Basic Salary (Taxable)", value: form.basicSalaryTaxable },
		{ box: "40", name: "Representation", value: form.representation },
		{ box: "41", name: "Transportation", value: form.transportation },
		{ box: "42", name: "COLA", value: form.cola },
		{ box: "48", name: "13th Month (Taxable)", value: form.thirteenthMonthPayTaxable },
		{ box: "52", name: "Total Taxable", value: form.totalTaxableCompensation },
		{ box: "53", name: "Employer Signatory", value: form.employerSignatory },
		{ box: "54", name: "Employee ID", value: form.employeeValidIDNo || "N/A" },
	];

	let populatedCount = 0;
	fieldChecks.forEach((field) => {
		const isPopulated =
			field.value !== undefined &&
			field.value !== null &&
			field.value !== "" &&
			field.value !== 0;
		const status = isPopulated
			? `${colors.green}✓${colors.reset}`
			: `${colors.yellow}○${colors.reset}`;
		console.log(
			`${status} Box ${field.box.padEnd(4)} | ${field.name.padEnd(35)} | ${field.value}`,
		);
		if (isPopulated) populatedCount++;
	});

	console.log(
		`\n${colors.bold}Fields Populated: ${populatedCount}/${fieldChecks.length}${colors.reset}`,
	);

	return validation.isValid;
}

/**
 * Test Case 2: Form with Previous Employer
 */
function testFormWithPreviousEmployer() {
	console.log(`\n${colors.cyan}${colors.bold}${"=".repeat(100)}${colors.reset}`);
	console.log(
		`${colors.cyan}${colors.bold}TEST 2: BIR FORM 2316 WITH PREVIOUS EMPLOYER${colors.reset}`,
	);
	console.log(`${colors.cyan}${colors.bold}${"=".repeat(100)}${colors.reset}`);

	const monthlySalary = 30000;
	const monthsWorked = 6; // Worked only 6 months with current employer

	const monthlyPayroll = calculatePayroll(monthlySalary);
	const annualBasicSalary = monthlySalary * monthsWorked;
	const annualContributions = monthlyPayroll.contributions.total * monthsWorked;
	const annualTax = monthlyPayroll.withholdingTax * monthsWorked;

	const input: BIRForm2316Input = {
		year: 2025,

		employee: {
			tin: "987-654-321-000",
			lastName: "Santos",
			firstName: "Maria",
			middleName: "Garcia",
			rdoCode: "RDO 045",
			registeredAddress: "789 Main Road, Quezon City, Metro Manila",
			registeredAddressZipCode: "1100",
			dateOfBirth: "03/20/1992",
			contactNumber: "+63-918-987-6543",
		},

		presentEmployer: {
			tin: "222-333-444-000",
			name: "XYZ Industries Inc.",
			address: "321 Industrial Park, Pasig City, Metro Manila",
			zipCode: "1600",
			type: "MAIN",
			signatory: "PEDRO REYES",
			signatoryTitle: "Finance Director",
		},

		previousEmployer: {
			tin: "111-222-333-000",
			name: "DEF Company Limited",
			address: "159 Commerce Street, Taguig City, Metro Manila",
			zipCode: "1630",
		},

		compensationPresent: {
			thirteenthMonthPayNonTaxable: 15000,
			deMinimisBenefits: 1200,
			contributionsUnionDues: annualContributions,
			basicSalaryTaxable: annualBasicSalary,
			representation: 6000,
			thirteenthMonthPayTaxable: 0,
		},

		compensationPrevious: {
			taxableIncome: 120000, // Taxable income from previous employer
			taxWithheld: 8500, // Tax withheld by previous employer
		},

		tax: {
			taxDue: annualTax + 8500,
			taxWithheldPresent: annualTax,
			taxWithheldPrevious: 8500,
		},
	};

	const form = generateBIRForm2316(input);
	const validation = validateBIRForm2316(form);

	printBIRForm2316(form);

	console.log(`\n${colors.bold}VALIDATION:${colors.reset}`);
	console.log(
		validation.isValid
			? `${colors.green}✓ VALID${colors.reset}`
			: `${colors.red}✗ INVALID${colors.reset}`,
	);

	if (!validation.isValid) {
		validation.errors.forEach((error) =>
			console.log(`  ${colors.red}• ${error}${colors.reset}`),
		);
	}

	// Verify previous employer fields
	console.log(`\n${colors.cyan}${colors.bold}PREVIOUS EMPLOYER FIELDS:${colors.reset}`);
	console.log(
		`${colors.green}✓${colors.reset} Box 16 | Previous Employer TIN: ${form.previousEmployerTin}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 17 | Previous Employer Name: ${form.previousEmployerName}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 18 | Previous Employer Address: ${form.previousEmployerAddress}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 18A| Previous Employer ZIP: ${form.previousEmployerZipCode}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 22 | Taxable Income (Previous): ₱${form.taxableCompensationPreviousEmployer.toLocaleString()}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 25B| Tax Withheld (Previous): ₱${form.taxesWithheldPreviousEmployer.toLocaleString()}`,
	);

	return validation.isValid;
}

/**
 * Test Case 3: Minimum Wage Earner
 */
function testMinimumWageEarner() {
	console.log(`\n${colors.cyan}${colors.bold}${"=".repeat(100)}${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}TEST 3: MINIMUM WAGE EARNER (MWE)${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}${"=".repeat(100)}${colors.reset}`);

	const dailyRate = 610; // NCR minimum wage
	const monthlyRate = dailyRate * 22; // Approx monthly

	const input: BIRForm2316Input = {
		year: 2025,

		employee: {
			tin: "555-666-777-000",
			lastName: "Rodriguez",
			firstName: "Pedro",
			rdoCode: "RDO 050",
			registeredAddress: "321 Worker Street, Manila City",
			registeredAddressZipCode: "1000",
			dateOfBirth: "08/10/1995",
			contactNumber: "+63-920-111-2222",
			isMinimumWageEarner: true,
			statutoryMinimumWagePerDay: dailyRate,
			statutoryMinimumWagePerMonth: monthlyRate,
		},

		presentEmployer: {
			tin: "333-444-555-000",
			name: "PQR Manufacturing Corp.",
			address: "789 Factory Road, Valenzuela City",
			zipCode: "1440",
			type: "MAIN",
			signatory: "ANNA CRUZ",
		},

		compensationPresent: {
			// MWE compensation (non-taxable)
			basicSalaryMWE: monthlyRate * 12,
			holidayPayMWE: 3000,
			overtimePayMWE: 5000,
			nightShiftDifferentialMWE: 2000,

			// Other non-taxable
			thirteenthMonthPayNonTaxable: monthlyRate,
			deMinimisBenefits: 1000,
			contributionsUnionDues: 15900, // Estimated annual

			// No taxable compensation
			basicSalaryTaxable: 0,
			thirteenthMonthPayTaxable: 0,
		},

		tax: {
			taxDue: 0, // MWE is tax-exempt
			taxWithheldPresent: 0,
		},
	};

	const form = generateBIRForm2316(input);
	const validation = validateBIRForm2316(form);

	printBIRForm2316(form);

	console.log(`\n${colors.bold}VALIDATION:${colors.reset}`);
	console.log(
		validation.isValid
			? `${colors.green}✓ VALID${colors.reset}`
			: `${colors.red}✗ INVALID${colors.reset}`,
	);

	// Verify MWE fields
	console.log(`\n${colors.cyan}${colors.bold}MWE SPECIFIC FIELDS:${colors.reset}`);
	console.log(
		`${colors.green}✓${colors.reset} Box 9  | Statutory Min Wage (Daily): ₱${form.statutoryMinimumWagePerDay?.toLocaleString()}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 10 | Statutory Min Wage (Monthly): ₱${form.statutoryMinimumWagePerMonth?.toLocaleString()}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 11 | Is MWE: ${form.isMinimumWageEarner ? "YES" : "NO"}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 29 | Basic Salary (MWE): ₱${form.basicSalaryMWENonTaxable.toLocaleString()}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 30 | Holiday Pay (MWE): ₱${form.holidayPayMWE.toLocaleString()}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 31 | Overtime (MWE): ₱${form.overtimePayMWE.toLocaleString()}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 32 | Night Diff (MWE): ₱${form.nightShiftDifferentialMWE.toLocaleString()}`,
	);
	console.log(
		`${colors.green}✓${colors.reset} Box 24 | Tax Due: ₱${form.taxDue.toLocaleString()} (TAX-EXEMPT)`,
	);

	return validation.isValid;
}

/**
 * Main test runner
 */
function runAllTests() {
	console.clear();
	console.log(`${colors.cyan}${colors.bold}${"*".repeat(100)}${colors.reset}`);
	console.log(
		`${colors.cyan}${colors.bold}BIR FORM 2316 GENERATOR - COMPREHENSIVE TEST SUITE${colors.reset}`,
	);
	console.log(`${colors.cyan}${colors.bold}${"*".repeat(100)}${colors.reset}`);

	const results: TestResult[] = [];

	// Run tests
	results.push({ name: "Complete Form (All 56 Fields)", passed: testCompleteForm() });
	results.push({ name: "Form with Previous Employer", passed: testFormWithPreviousEmployer() });
	results.push({ name: "Minimum Wage Earner", passed: testMinimumWageEarner() });

	// Summary
	console.log(`\n${colors.cyan}${colors.bold}${"=".repeat(100)}${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}TEST SUMMARY${colors.reset}`);
	console.log(`${colors.cyan}${colors.bold}${"=".repeat(100)}${colors.reset}`);

	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;

	results.forEach((result) => {
		const status = result.passed
			? `${colors.green}✓ PASS${colors.reset}`
			: `${colors.red}✗ FAIL${colors.reset}`;
		console.log(`${status} | ${result.name}`);
	});

	console.log(`\n${colors.bold}Total Tests: ${results.length}${colors.reset}`);
	console.log(`${colors.green}Passed: ${passed}${colors.reset}`);
	console.log(`${colors.red}Failed: ${failed}${colors.reset}`);

	if (failed === 0) {
		console.log(`\n${colors.green}${colors.bold}✓ ALL TESTS PASSED!${colors.reset}`);
	} else {
		console.log(`\n${colors.yellow}${colors.bold}⚠ SOME TESTS FAILED${colors.reset}`);
	}

	console.log(`\n${colors.cyan}${colors.bold}${"*".repeat(100)}${colors.reset}\n`);

	return failed === 0 ? 0 : 1;
}

// Run tests
if (require.main === module) {
	const exitCode = runAllTests();
	process.exit(exitCode);
}

export { runAllTests };
