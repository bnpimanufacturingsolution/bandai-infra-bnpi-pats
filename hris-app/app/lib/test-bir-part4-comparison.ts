/**
 * Test script to compare BIR Part 4 calculations
 * Compares frontend (employee-to-bir2316.ts) with backend (bir-part4.helper.ts) output
 */

import { convertEmployeeToBIR2316 } from "./employee-to-bir2316";
import type { BIRForm2316 } from "~/types/bir-2316";

/**
 * Format amount to PHP currency
 */
function formatPHP(amount: number): string {
	return new Intl.NumberFormat("en-PH", {
		style: "currency",
		currency: "PHP",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
}

/**
 * Compare two values and return match status
 */
function compareField(
	fieldName: string,
	frontendValue: number,
	backendValue: number,
	tolerance: number = 0.01,
): { match: boolean; difference: number } {
	const difference = Math.abs(frontendValue - backendValue);
	const match = difference <= tolerance;
	return { match, difference };
}

/**
 * Test employee data matching the backend test case
 */
const testEmployee = {
	id: "test-001",
	employeeId: "EMP001",
	employmentHireDate: new Date("2024-01-01"),
	employmentTerminationDate: undefined,
	employmentStatus: "ACTIVE",
	basicSalary: 40000, // Monthly salary
	employer: {
		name: "Test Company Inc.",
		tin: "123-456-789-000",
		rdoCode: "055",
		branchCode: "000",
		address: "123 Test Street, Manila 1000",
	},
	person: {
		personalInfo: {
			firstName: "Juan",
			lastName: "Dela Cruz",
			middleName: "Santos",
			dateOfBirth: "1990-01-15",
		},
		contactInfo: {
			phone: "+639123456789",
			address: "456 Home Street, Quezon City 1100",
		},
	},
	employeePayrolls: [
		// Simulate 12 months of payroll data
		...Array.from({ length: 12 }, (_, i) => ({
			basicPay: 40000,
			overtimePay: 0,
			nightDiffPay: 0,
			holidayPay: 0,
			allowances: 0,
			bonuses: 0,
			taxAmount: 2643.4, // Approximate monthly tax
			sssContribution: 1125, // Will be recalculated from monthly salary
			philHealthContribution: 1000, // Will be recalculated from monthly salary
			pagibigContribution: 200, // Will be recalculated from monthly salary
			grossPay: 40000,
			createdAt: new Date(2024, i, 15),
		})),
	],
	documents: [
		{
			type: "TIN",
			number: "123-456-789-000",
			issueDate: new Date("2020-01-01"),
		},
	],
};

/**
 * Expected backend output (from bir-part4.helper.ts test)
 * Based on:
 * - Monthly salary: 40,000
 * - Annual basic salary: 480,000 (40,000 * 12)
 * - 13th month: 40,000
 * - Bonuses: 0
 * - Contributions: calculated from monthly salary
 */
const expectedBackendOutput = {
	// Part IV-A: Summary
	field19: 520000, // Gross Compensation (480,000 + 40,000)
	field20: 75400, // Total Non-Taxable
	field21: 444600, // Taxable Compensation
	field22: 0, // Previous Employer
	field23: 444600, // Gross Taxable
	field24: 31420, // Tax Due (calculated from tax table)
	field25A: 31720.8, // Taxes Withheld Present
	field25B: 0, // Taxes Withheld Previous
	field26: 31420, // Adjusted Taxes Withheld
	field27: 0, // PERA Credit
	field28: 31420, // Total Taxes Withheld

	// Part IV-B A: Non-Taxable
	field29: 0, // Basic Salary MWE
	field30: 0, // Holiday Pay MWE
	field31: 0, // Overtime Pay MWE
	field32: 0, // Night Shift Differential MWE
	field33: 0, // Hazard Pay MWE
	field34: 40000, // 13th Month Non-Taxable (40,000 < 90,000)
	field35: 0, // De Minimis Benefits
	field36: 35400, // Contributions (SSS + PhilHealth + Pag-IBIG) * 12
	field37: 0, // Other Non-Taxable
	field38: 75400, // Total Non-Taxable

	// Part IV-B B: Taxable Regular
	field39: 444600, // Taxable Basic Salary (480,000 - 35,400)
	field40: 0, // Representation
	field41: 0, // Transportation
	field42: 0, // COLA
	field43: 0, // Housing Allowance
	field44: 0, // Others Regular

	// Part IV-B B: Taxable Supplementary
	field45: 0, // Commission
	field46: 0, // Profit Sharing
	field47: 0, // Fees
	field48: 0, // Taxable 13th Month (0, since 40,000 < 90,000)
	field49: 0, // Hazard Pay Taxable
	field50: 0, // Overtime Pay Taxable
	field51: 0, // Others Supplementary
	field52: 444600, // Total Taxable Compensation
};

/**
 * Calculate expected contributions for monthly salary of 40,000
 */
function calculateExpectedContributions(monthlySalary: number) {
	// SSS: From table, 40,000 falls in the last bracket (30,000-35,000) = 1,750
	// But wait, let me check the table... 40,000 is above 35,000, so it should use 1,750
	const sssMonthly = 1750; // Maximum for salary >= 30,000

	// PhilHealth: 2.5% of 40,000 = 1,000, but max is 2,500, min is 250
	const philHealthMonthly = Math.min(Math.max(40000 * 0.025, 250), 2500); // 1,000

	// Pag-IBIG: 2% of 40,000 = 800, but max is 200
	const pagIbigMonthly = Math.min(40000 * 0.02, 200); // 200

	const monthlyTotal = sssMonthly + philHealthMonthly + pagIbigMonthly; // 2,950
	const annualTotal = monthlyTotal * 12; // 35,400

	return {
		sssMonthly,
		philHealthMonthly,
		pagIbigMonthly,
		monthlyTotal,
		annualTotal,
	};
}

/**
 * Run comparison test
 */
export function testBIRPart4Comparison() {
	console.log("\n" + "=".repeat(80));
	console.log("BIR PART 4 COMPARISON TEST");
	console.log("=".repeat(80));

	const year = 2024;
	const frontendResult = convertEmployeeToBIR2316(testEmployee, year) as BIRForm2316;

	// Calculate expected contributions
	const contributions = calculateExpectedContributions(40000);
	console.log("\nExpected Monthly Contributions:");
	console.log(`  SSS: ${formatPHP(contributions.sssMonthly)}`);
	console.log(`  PhilHealth: ${formatPHP(contributions.philHealthMonthly)}`);
	console.log(`  Pag-IBIG: ${formatPHP(contributions.pagIbigMonthly)}`);
	console.log(`  Monthly Total: ${formatPHP(contributions.monthlyTotal)}`);
	console.log(`  Annual Total: ${formatPHP(contributions.annualTotal)}`);

	console.log("\n" + "-".repeat(80));
	console.log("PART IV-A: SUMMARY COMPARISON");
	console.log("-".repeat(80));

	const part4AFields = [
		{ name: "Field 19: Gross Compensation", key: "grossCompensationPresentEmployer" },
		{ name: "Field 20: Total Non-Taxable", key: "totalNonTaxablePresentEmployer" },
		{ name: "Field 21: Taxable Compensation", key: "taxableCompensationPresentEmployer" },
		{ name: "Field 22: Previous Employer Taxable", key: "taxableCompensationPreviousEmployer" },
		{ name: "Field 23: Gross Taxable", key: "grossTaxableCompensation" },
		{ name: "Field 24: Tax Due", key: "taxDue" },
		{ name: "Field 25A: Taxes Withheld Present", key: "taxesWithheldPresentEmployer" },
		{ name: "Field 25B: Taxes Withheld Previous", key: "taxesWithheldPreviousEmployer" },
		{ name: "Field 26: Adjusted Taxes Withheld", key: "totalTaxesWithheldAdjusted" },
		{ name: "Field 27: PERA Credit", key: "taxCreditPERA" },
		{ name: "Field 28: Total Taxes Withheld", key: "totalTaxesWithheld" },
	];

	let part4AMatches = 0;
	let part4AMismatches = 0;

	for (const field of part4AFields) {
		const frontendValue = frontendResult[field.key as keyof BIRForm2316] as number;
		const backendValue =
			expectedBackendOutput[
				field.name
					.split(":")[0]
					.toLowerCase()
					.replace("field ", "field") as keyof typeof expectedBackendOutput
			] ||
			expectedBackendOutput[
				field.name
					.split(":")[0]
					.replace("Field ", "field") as keyof typeof expectedBackendOutput
			] ||
			0;

		const comparison = compareField(field.name, frontendValue || 0, backendValue || 0);
		const status = comparison.match ? "✓" : "✗";
		const statusColor = comparison.match ? "\x1b[32m" : "\x1b[31m";

		console.log(
			`${statusColor}${status}\x1b[0m ${field.name.padEnd(45)} Frontend: ${formatPHP(frontendValue || 0).padStart(15)} | Backend: ${formatPHP(backendValue || 0).padStart(15)} | Diff: ${formatPHP(comparison.difference).padStart(10)}`,
		);

		if (comparison.match) {
			part4AMatches++;
		} else {
			part4AMismatches++;
		}
	}

	console.log("\n" + "-".repeat(80));
	console.log("PART IV-B A: NON-TAXABLE COMPARISON");
	console.log("-".repeat(80));

	const part4BNonTaxableFields = [
		{ name: "Field 29: Basic Salary MWE", key: "basicSalaryMWENonTaxable" },
		{ name: "Field 30: Holiday Pay MWE", key: "holidayPayMWE" },
		{ name: "Field 31: Overtime Pay MWE", key: "overtimePayMWE" },
		{ name: "Field 32: Night Shift Diff MWE", key: "nightShiftDifferentialMWE" },
		{ name: "Field 33: Hazard Pay MWE", key: "hazardPayMWE" },
		{ name: "Field 34: 13th Month Non-Taxable", key: "thirteenthMonthPayNonTaxable" },
		{ name: "Field 35: De Minimis Benefits", key: "deMinimisBenefits" },
		{ name: "Field 36: Contributions", key: "contributionsUnionDues" },
		{ name: "Field 37: Other Non-Taxable", key: "otherNonTaxableCompensation" },
		{ name: "Field 38: Total Non-Taxable", key: "totalNonTaxableCompensation" },
	];

	let part4BNonTaxableMatches = 0;
	let part4BNonTaxableMismatches = 0;

	for (const field of part4BNonTaxableFields) {
		const frontendValue = frontendResult[field.key as keyof BIRForm2316] as number;
		const fieldNum = field.name.split(":")[0].replace("Field ", "field");
		const backendValue =
			expectedBackendOutput[fieldNum as keyof typeof expectedBackendOutput] || 0;

		const comparison = compareField(field.name, frontendValue || 0, backendValue || 0);
		const status = comparison.match ? "✓" : "✗";
		const statusColor = comparison.match ? "\x1b[32m" : "\x1b[31m";

		console.log(
			`${statusColor}${status}\x1b[0m ${field.name.padEnd(45)} Frontend: ${formatPHP(frontendValue || 0).padStart(15)} | Backend: ${formatPHP(backendValue || 0).padStart(15)} | Diff: ${formatPHP(comparison.difference).padStart(10)}`,
		);

		if (comparison.match) {
			part4BNonTaxableMatches++;
		} else {
			part4BNonTaxableMismatches++;
		}
	}

	console.log("\n" + "-".repeat(80));
	console.log("PART IV-B B: TAXABLE COMPARISON");
	console.log("-".repeat(80));

	const part4BTaxableFields = [
		{ name: "Field 39: Basic Salary Taxable", key: "basicSalaryTaxable" },
		{ name: "Field 40: Representation", key: "representation" },
		{ name: "Field 41: Transportation", key: "transportation" },
		{ name: "Field 42: COLA", key: "cola" },
		{ name: "Field 43: Housing Allowance", key: "housingAllowance" },
		{ name: "Field 44: Others Regular", key: "othersAmountA" },
		{ name: "Field 45: Commission", key: "commission" },
		{ name: "Field 46: Profit Sharing", key: "profitSharing" },
		{ name: "Field 47: Fees", key: "fees" },
		{ name: "Field 48: 13th Month Taxable", key: "thirteenthMonthPayTaxable" },
		{ name: "Field 49: Hazard Pay Taxable", key: "hazardPayTaxable" },
		{ name: "Field 50: Overtime Pay Taxable", key: "overtimePayTaxable" },
		{ name: "Field 51: Others Supplementary", key: "supplementaryOthersAmountA" },
		{ name: "Field 52: Total Taxable", key: "totalTaxableCompensation" },
	];

	let part4BTaxableMatches = 0;
	let part4BTaxableMismatches = 0;

	for (const field of part4BTaxableFields) {
		const frontendValue = frontendResult[field.key as keyof BIRForm2316] as number;
		const fieldNum = field.name.split(":")[0].replace("Field ", "field");
		const backendValue =
			expectedBackendOutput[fieldNum as keyof typeof expectedBackendOutput] || 0;

		const comparison = compareField(field.name, frontendValue || 0, backendValue || 0);
		const status = comparison.match ? "✓" : "✗";
		const statusColor = comparison.match ? "\x1b[32m" : "\x1b[31m";

		console.log(
			`${statusColor}${status}\x1b[0m ${field.name.padEnd(45)} Frontend: ${formatPHP(frontendValue || 0).padStart(15)} | Backend: ${formatPHP(backendValue || 0).padStart(15)} | Diff: ${formatPHP(comparison.difference).padStart(10)}`,
		);

		if (comparison.match) {
			part4BTaxableMatches++;
		} else {
			part4BTaxableMismatches++;
		}
	}

	// Summary
	console.log("\n" + "=".repeat(80));
	console.log("SUMMARY");
	console.log("=".repeat(80));
	console.log(`Part IV-A: ${part4AMatches} matches, ${part4AMismatches} mismatches`);
	console.log(
		`Part IV-B A: ${part4BNonTaxableMatches} matches, ${part4BNonTaxableMismatches} mismatches`,
	);
	console.log(
		`Part IV-B B: ${part4BTaxableMatches} matches, ${part4BTaxableMismatches} mismatches`,
	);
	const totalMatches = part4AMatches + part4BNonTaxableMatches + part4BTaxableMatches;
	const totalMismatches = part4AMismatches + part4BNonTaxableMismatches + part4BTaxableMismatches;
	console.log(`\nTotal: ${totalMatches} matches, ${totalMismatches} mismatches`);

	if (totalMismatches === 0) {
		console.log("\n\x1b[32m✓ All fields match!\x1b[0m");
	} else {
		console.log(`\n\x1b[31m✗ ${totalMismatches} field(s) need attention\x1b[0m`);
	}

	console.log("\n" + "=".repeat(80) + "\n");

	return {
		part4A: { matches: part4AMatches, mismatches: part4AMismatches },
		part4BNonTaxable: {
			matches: part4BNonTaxableMatches,
			mismatches: part4BNonTaxableMismatches,
		},
		part4BTaxable: { matches: part4BTaxableMatches, mismatches: part4BTaxableMismatches },
		total: { matches: totalMatches, mismatches: totalMismatches },
	};
}

// Export for use in browser console or test runner
if (typeof window !== "undefined") {
	(window as any).testBIRPart4Comparison = testBIRPart4Comparison;
}
