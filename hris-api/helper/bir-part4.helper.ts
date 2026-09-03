/**
 * BIR Form 2316 - Part IV Calculation Helper
 *
 * Calculates Part IV-A (Summary) and Part IV-B (Details of Compensation)
 * Based on Philippine BIR regulations and TRAIN Law
 */

import {
	calculateWithholdingTax,
	WITHHOLDING_TAX_TABLE,
	roundToCentavo,
} from "./tax-calculator.helper";
import { PAYROLL_CONFIG, SSS_CONFIG } from "../config/payroll.config";

/**
 * Input data for BIR Part 4 calculation
 */
export interface BIRPart4Input {
	// Annual compensation data
	annualBasicSalary: number;
	thirteenthMonthPay: number;
	bonuses?: number;
	allowances?: number;

	// Non-taxable items (MWE - Minimum Wage Earner)
	basicSalaryMWE?: number;
	holidayPayMWE?: number;
	overtimePayMWE?: number;
	nightShiftDifferentialMWE?: number;
	hazardPayMWE?: number;

	// Non-taxable items (General)
	deMinimisBenefits?: number;
	otherNonTaxableCompensation?: number;

	// Taxable Regular items
	representation?: number;
	transportation?: number;
	cola?: number;
	housingAllowance?: number;
	othersRegular?: Array<{ description: string; amount: number }>;

	// Taxable Supplementary items
	commission?: number;
	profitSharing?: number;
	fees?: number;
	hazardPayTaxable?: number;
	overtimePayTaxable?: number;
	othersSupplementary?: Array<{ description: string; amount: number }>;

	// Previous employer data (optional)
	previousEmployerTaxableIncome?: number;
	previousEmployerTaxWithheld?: number;

	// Tax withheld from present employer
	taxWithheldPresentEmployer?: number;

	// PERA tax credit
	taxCreditPERA?: number;

	// Monthly salary for contribution calculations
	monthlySalary: number;
}

/**
 * Part IV-B A: Non-Taxable/Exempt Compensation Income
 */
export interface BIRPart4BNonTaxable {
	field29: number; // Basic Salary (MWE; non-taxable)
	field30: number; // Holiday Pay (MWE)
	field31: number; // Overtime Pay (MWE)
	field32: number; // Night Shift Differential (MWE)
	field33: number; // Hazard Pay (MWE)
	field34: number; // 13th Month Pay and Other Benefits (non-taxable up to cap)
	field35: number; // De Minimis Benefits
	field36: number; // SSS, GSIS, PHIC, PAG-IBIG, Union Dues (employee share)
	field37: number; // Salaries and Other Forms of Compensation (non-taxable)
	field38: number; // Total Non-Taxable/Exempt Compensation Income
}

/**
 * Part IV-B B: Taxable Compensation Income - Regular
 */
export interface BIRPart4BTaxableRegular {
	field39: number; // Basic Salary (taxable)
	field40: number; // Representation
	field41: number; // Transportation
	field42: number; // Cost of Living Allowance (COLA)
	field43: number; // Fixed Housing Allowance
	field44: number; // Others (specify) - total
	field44A?: { description: string; amount: number }; // Others (specify) – line A
	field44B?: { description: string; amount: number }; // Others (specify) – line B
}

/**
 * Part IV-B B: Taxable Compensation Income - Supplementary
 */
export interface BIRPart4BTaxableSupplementary {
	field45: number; // Commission
	field46: number; // Profit Sharing
	field47: number; // Fees Including Director's Fees
	field48: number; // Taxable 13th Month Benefits (excess)
	field49: number; // Hazard Pay (taxable)
	field50: number; // Overtime Pay (taxable)
	field51: number; // Others (specify) - total
	field51A?: { description: string; amount: number }; // Others – amount line A
	field51B?: { description: string; amount: number }; // Others – amount line B
	field52: number; // Total Taxable Compensation Income
}

/**
 * Part IV-A: Summary
 */
export interface BIRPart4ASummary {
	field19: number; // Gross Compensation Income from Present Employer
	field20: number; // Total Non-Taxable/Exempt Compensation (Present Employer)
	field21: number; // Taxable Compensation Income from Present Employer
	field22: number; // Taxable Compensation Income from Previous Employer
	field23: number; // Gross Taxable Compensation Income
	field24: number; // Tax Due
	field25: number; // Amount of Taxes Withheld
	field25A: number; // Amount of Taxes Withheld – Present Employer
	field25B: number; // Amount of Taxes Withheld – Previous Employer
	field26: number; // Total Amount of Taxes Withheld as adjusted
	field27: number; // 5% Tax Credit (PERA Act of 2008)
	field28: number; // Total Taxes Withheld
}

/**
 * Complete BIR Part 4 Calculation Result
 */
export interface BIRPart4Result {
	part4A: BIRPart4ASummary;
	part4BNonTaxable: BIRPart4BNonTaxable;
	part4BTaxableRegular: BIRPart4BTaxableRegular;
	part4BTaxableSupplementary: BIRPart4BTaxableSupplementary;
}

/**
 * Calculate annual tax due based on taxable compensation income
 * Uses the annual withholding tax table
 */
function calculateAnnualTaxDue(annualTaxableIncome: number): number {
	// Find the appropriate tax bracket
	for (const bracket of WITHHOLDING_TAX_TABLE) {
		const withinBracket =
			annualTaxableIncome >= bracket.annualBase &&
			(bracket.annualCap === null || annualTaxableIncome < bracket.annualCap);

		if (withinBracket) {
			const excessIncome = annualTaxableIncome - bracket.annualBase;
			const taxOnExcess = excessIncome * bracket.rate;
			const totalTax = bracket.annualFixedTax + taxOnExcess;
			return roundToCentavo(totalTax);
		}
	}

	// Default to 0 if no bracket matches
	return 0;
}

/**
 * Calculate 13th month pay non-taxable portion
 * First ₱90,000 of 13th month pay and bonuses is non-taxable
 */
function calculateNonTaxable13thMonth(
	thirteenthMonthPay: number,
	bonuses: number = 0,
): { nonTaxable: number; taxable: number } {
	const total = thirteenthMonthPay + bonuses;
	const nonTaxable = Math.min(total, 90000);
	const taxable = Math.max(total - 90000, 0);

	return {
		nonTaxable: roundToCentavo(nonTaxable),
		taxable: roundToCentavo(taxable),
	};
}

/**
 * Calculate SSS contribution using table from config
 */
function calculateSSSFromTable(monthlySalary: number): number {
	const table = SSS_CONFIG.contributionTable;

	for (const bracket of table) {
		if (monthlySalary >= bracket.min && monthlySalary <= bracket.max) {
			return bracket.employeeShare;
		}
	}

	// Default to maximum for salaries above table
	const lastBracket = table[table.length - 1];
	return lastBracket.employeeShare;
}

/**
 * Calculate PhilHealth contribution using config
 */
function calculatePhilHealthFromConfig(monthlySalary: number): number {
	const {
		employeeRate,
		minimumSalary,
		maximumSalary,
		minimumEmployeeShare,
		maximumEmployeeShare,
	} = PAYROLL_CONFIG.philHealth;

	const cappedSalary = Math.min(Math.max(monthlySalary, minimumSalary), maximumSalary);
	const employeeShare = Math.min(
		Math.max(cappedSalary * employeeRate, minimumEmployeeShare),
		maximumEmployeeShare,
	);

	return roundToCentavo(employeeShare);
}

/**
 * Calculate Pag-IBIG contribution using config
 * Note: Maximum is 200 (not 100 from config) based on actual BIR requirements
 */
function calculatePagIBIGFromConfig(monthlySalary: number): number {
	const { rateLowIncome, rateHighIncome, incomeThreshold } = PAYROLL_CONFIG.pagIbig;
	const maximumEmployeeShare = 200; // Actual maximum per BIR requirements

	const rate = monthlySalary <= incomeThreshold ? rateLowIncome : rateHighIncome;
	const employeeShare = Math.min(monthlySalary * rate, maximumEmployeeShare);

	return roundToCentavo(employeeShare);
}

/**
 * Calculate annual contributions based on monthly salary using table-based calculations
 */
function calculateAnnualContributions(monthlySalary: number): number {
	const sss = calculateSSSFromTable(monthlySalary);
	const philHealth = calculatePhilHealthFromConfig(monthlySalary);
	const pagIbig = calculatePagIBIGFromConfig(monthlySalary);
	const monthlyTotal = sss + philHealth + pagIbig;

	return roundToCentavo(monthlyTotal * 12);
}

/**
 * Calculate BIR Part 4
 */
export function calculateBIRPart4(input: BIRPart4Input): BIRPart4Result {
	// Initialize optional values
	const bonuses = input.bonuses || 0;
	const allowances = input.allowances || 0;
	const previousEmployerTaxableIncome = input.previousEmployerTaxableIncome || 0;
	const previousEmployerTaxWithheld = input.previousEmployerTaxWithheld || 0;
	const taxCreditPERA = input.taxCreditPERA || 0;

	// Calculate 13th month pay breakdown
	const thirteenthMonthBreakdown = calculateNonTaxable13thMonth(
		input.thirteenthMonthPay,
		bonuses,
	);

	// Calculate annual contributions
	const annualContributions = calculateAnnualContributions(input.monthlySalary);

	// ========================================
	// PART IV-B A: Non-Taxable/Exempt Compensation
	// ========================================
	const part4BNonTaxable: BIRPart4BNonTaxable = {
		field29: roundToCentavo(input.basicSalaryMWE || 0),
		field30: roundToCentavo(input.holidayPayMWE || 0),
		field31: roundToCentavo(input.overtimePayMWE || 0),
		field32: roundToCentavo(input.nightShiftDifferentialMWE || 0),
		field33: roundToCentavo(input.hazardPayMWE || 0),
		field34: roundToCentavo(thirteenthMonthBreakdown.nonTaxable),
		field35: roundToCentavo(input.deMinimisBenefits || 0),
		field36: roundToCentavo(annualContributions),
		field37: roundToCentavo(input.otherNonTaxableCompensation || 0),
		field38: 0, // Will be calculated below
	};

	// Calculate total non-taxable
	part4BNonTaxable.field38 = roundToCentavo(
		part4BNonTaxable.field29 +
			part4BNonTaxable.field30 +
			part4BNonTaxable.field31 +
			part4BNonTaxable.field32 +
			part4BNonTaxable.field33 +
			part4BNonTaxable.field34 +
			part4BNonTaxable.field35 +
			part4BNonTaxable.field36 +
			part4BNonTaxable.field37,
	);

	// ========================================
	// PART IV-B B: Taxable Regular
	// ========================================
	const othersRegular = input.othersRegular || [];
	const othersRegularTotal = othersRegular.reduce((sum, item) => sum + item.amount, 0);

	// Field 39: Taxable Basic Salary = Annual Basic Salary - Contributions
	// (Contributions are already deducted as non-taxable in Field 36)
	const taxableBasicSalary = roundToCentavo(input.annualBasicSalary - annualContributions);

	const part4BTaxableRegular: BIRPart4BTaxableRegular = {
		field39: taxableBasicSalary,
		field40: roundToCentavo(input.representation || 0),
		field41: roundToCentavo(input.transportation || 0),
		field42: roundToCentavo(input.cola || 0),
		field43: roundToCentavo(input.housingAllowance || 0),
		field44: roundToCentavo(othersRegularTotal),
		field44A: othersRegular[0]
			? {
					description: othersRegular[0].description,
					amount: roundToCentavo(othersRegular[0].amount),
				}
			: undefined,
		field44B: othersRegular[1]
			? {
					description: othersRegular[1].description,
					amount: roundToCentavo(othersRegular[1].amount),
				}
			: undefined,
	};

	// ========================================
	// PART IV-B B: Taxable Supplementary
	// ========================================
	const othersSupplementary = input.othersSupplementary || [];
	const othersSupplementaryTotal = othersSupplementary.reduce(
		(sum, item) => sum + item.amount,
		0,
	);

	const part4BTaxableSupplementary: BIRPart4BTaxableSupplementary = {
		field45: roundToCentavo(input.commission || 0),
		field46: roundToCentavo(input.profitSharing || 0),
		field47: roundToCentavo(input.fees || 0),
		field48: roundToCentavo(thirteenthMonthBreakdown.taxable),
		field49: roundToCentavo(input.hazardPayTaxable || 0),
		field50: roundToCentavo(input.overtimePayTaxable || 0),
		field51: roundToCentavo(othersSupplementaryTotal),
		field51A: othersSupplementary[0]
			? {
					description: othersSupplementary[0].description,
					amount: roundToCentavo(othersSupplementary[0].amount),
				}
			: undefined,
		field51B: othersSupplementary[1]
			? {
					description: othersSupplementary[1].description,
					amount: roundToCentavo(othersSupplementary[1].amount),
				}
			: undefined,
		field52: 0, // Will be calculated below
	};

	// Calculate total taxable compensation income (Field 52)
	part4BTaxableSupplementary.field52 = roundToCentavo(
		part4BTaxableRegular.field39 +
			part4BTaxableRegular.field40 +
			part4BTaxableRegular.field41 +
			part4BTaxableRegular.field42 +
			part4BTaxableRegular.field43 +
			part4BTaxableRegular.field44 +
			part4BTaxableSupplementary.field45 +
			part4BTaxableSupplementary.field46 +
			part4BTaxableSupplementary.field47 +
			part4BTaxableSupplementary.field48 +
			part4BTaxableSupplementary.field49 +
			part4BTaxableSupplementary.field50 +
			part4BTaxableSupplementary.field51,
	);

	// ========================================
	// PART IV-A: Summary
	// ========================================

	// Field 19: Gross Compensation Income from Present Employer
	// Sum of Items 38 (Total Non-Taxable) and 52 (Total Taxable)
	const field19 = roundToCentavo(part4BNonTaxable.field38 + part4BTaxableSupplementary.field52);

	// Field 20: Total Non-Taxable/Exempt Compensation (Present Employer)
	const field20 = part4BNonTaxable.field38;

	// Field 21: Taxable Compensation Income from Present Employer
	const field21 = part4BTaxableSupplementary.field52;

	// Field 22: Taxable Compensation Income from Previous Employer
	const field22 = roundToCentavo(previousEmployerTaxableIncome);

	// Field 23: Gross Taxable Compensation Income
	const field23 = roundToCentavo(field21 + field22);

	// Field 24: Tax Due (calculated using annual tax table)
	const field24 = calculateAnnualTaxDue(field23);

	// Field 25: Amount of Taxes Withheld (sum of 25A and 25B)
	const taxWithheldPresent = input.taxWithheldPresentEmployer || 0;
	const field25A = roundToCentavo(taxWithheldPresent);
	const field25B = roundToCentavo(previousEmployerTaxWithheld);
	const field25 = roundToCentavo(field25A + field25B);

	// Field 26: Total Amount of Taxes Withheld as adjusted
	// This is typically adjusted to match tax due, accounting for rounding differences
	// In practice, this may be the same as field 25, or adjusted based on annualization
	const field26 = roundToCentavo(field24); // Adjusted to match tax due

	// Field 27: 5% Tax Credit (PERA Act of 2008)
	const field27 = roundToCentavo(taxCreditPERA);

	// Field 28: Total Taxes Withheld
	const field28 = roundToCentavo(field26 + field27);

	const part4A: BIRPart4ASummary = {
		field19,
		field20,
		field21,
		field22,
		field23,
		field24,
		field25,
		field25A,
		field25B,
		field26,
		field27,
		field28,
	};

	return {
		part4A,
		part4BNonTaxable,
		part4BTaxableRegular,
		part4BTaxableSupplementary,
	};
}

/**
 * Format amount to PHP currency
 */
export function formatPHP(amount: number): string {
	return new Intl.NumberFormat("en-PH", {
		style: "currency",
		currency: "PHP",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount);
}

/**
 * Print BIR Part 4 calculation result
 */
export function printBIRPart4(result: BIRPart4Result): void {
	console.log("\n" + "=".repeat(80));
	console.log("BIR FORM 2316 - PART IV CALCULATION");
	console.log("=".repeat(80));

	console.log("\n" + "-".repeat(80));
	console.log("PART IV-A: SUMMARY");
	console.log("-".repeat(80));
	console.log(`Field 19: Gross Compensation Income from Present Employer`);
	console.log(`         ${formatPHP(result.part4A.field19).padStart(20)}`);
	console.log(`Field 20: Total Non-Taxable/Exempt Compensation (Present Employer)`);
	console.log(`         ${formatPHP(result.part4A.field20).padStart(20)}`);
	console.log(`Field 21: Taxable Compensation Income from Present Employer`);
	console.log(`         ${formatPHP(result.part4A.field21).padStart(20)}`);
	console.log(`Field 22: Taxable Compensation Income from Previous Employer`);
	console.log(`         ${formatPHP(result.part4A.field22).padStart(20)}`);
	console.log(`Field 23: Gross Taxable Compensation Income`);
	console.log(`         ${formatPHP(result.part4A.field23).padStart(20)}`);
	console.log(`Field 24: Tax Due`);
	console.log(`         ${formatPHP(result.part4A.field24).padStart(20)}`);
	console.log(`Field 25: Amount of Taxes Withheld`);
	console.log(`         ${formatPHP(result.part4A.field25).padStart(20)}`);
	console.log(`Field 25A: Amount of Taxes Withheld - Present Employer`);
	console.log(`          ${formatPHP(result.part4A.field25A).padStart(20)}`);
	console.log(`Field 25B: Amount of Taxes Withheld - Previous Employer`);
	console.log(`          ${formatPHP(result.part4A.field25B).padStart(20)}`);
	console.log(`Field 26: Total Amount of Taxes Withheld as adjusted`);
	console.log(`         ${formatPHP(result.part4A.field26).padStart(20)}`);
	console.log(`Field 27: 5% Tax Credit (PERA Act of 2008)`);
	console.log(`         ${formatPHP(result.part4A.field27).padStart(20)}`);
	console.log(`Field 28: Total Taxes Withheld`);
	console.log(`         ${formatPHP(result.part4A.field28).padStart(20)}`);

	console.log("\n" + "-".repeat(80));
	console.log("PART IV-B A: NON-TAXABLE/EXEMPT COMPENSATION INCOME");
	console.log("-".repeat(80));
	console.log(`Field 29: Basic Salary (MWE; non-taxable)`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field29).padStart(20)}`);
	console.log(`Field 30: Holiday Pay (MWE)`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field30).padStart(20)}`);
	console.log(`Field 31: Overtime Pay (MWE)`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field31).padStart(20)}`);
	console.log(`Field 32: Night Shift Differential (MWE)`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field32).padStart(20)}`);
	console.log(`Field 33: Hazard Pay (MWE)`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field33).padStart(20)}`);
	console.log(`Field 34: 13th Month Pay and Other Benefits (non-taxable up to cap)`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field34).padStart(20)}`);
	console.log(`Field 35: De Minimis Benefits`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field35).padStart(20)}`);
	console.log(`Field 36: SSS, GSIS, PHIC, PAG-IBIG, Union Dues (employee share)`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field36).padStart(20)}`);
	console.log(`Field 37: Salaries and Other Forms of Compensation (non-taxable)`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field37).padStart(20)}`);
	console.log(`Field 38: Total Non-Taxable/Exempt Compensation Income`);
	console.log(`         ${formatPHP(result.part4BNonTaxable.field38).padStart(20)}`);

	console.log("\n" + "-".repeat(80));
	console.log("PART IV-B B: TAXABLE COMPENSATION INCOME - REGULAR");
	console.log("-".repeat(80));
	console.log(`Field 39: Basic Salary (taxable)`);
	console.log(`         ${formatPHP(result.part4BTaxableRegular.field39).padStart(20)}`);
	console.log(`Field 40: Representation`);
	console.log(`         ${formatPHP(result.part4BTaxableRegular.field40).padStart(20)}`);
	console.log(`Field 41: Transportation`);
	console.log(`         ${formatPHP(result.part4BTaxableRegular.field41).padStart(20)}`);
	console.log(`Field 42: Cost of Living Allowance (COLA)`);
	console.log(`         ${formatPHP(result.part4BTaxableRegular.field42).padStart(20)}`);
	console.log(`Field 43: Fixed Housing Allowance`);
	console.log(`         ${formatPHP(result.part4BTaxableRegular.field43).padStart(20)}`);
	console.log(`Field 44: Others (specify)`);
	console.log(`         ${formatPHP(result.part4BTaxableRegular.field44).padStart(20)}`);
	if (result.part4BTaxableRegular.field44A) {
		console.log(`Field 44A: ${result.part4BTaxableRegular.field44A.description}`);
		console.log(
			`          ${formatPHP(result.part4BTaxableRegular.field44A.amount).padStart(20)}`,
		);
	}
	if (result.part4BTaxableRegular.field44B) {
		console.log(`Field 44B: ${result.part4BTaxableRegular.field44B.description}`);
		console.log(
			`          ${formatPHP(result.part4BTaxableRegular.field44B.amount).padStart(20)}`,
		);
	}

	console.log("\n" + "-".repeat(80));
	console.log("PART IV-B B: TAXABLE COMPENSATION INCOME - SUPPLEMENTARY");
	console.log("-".repeat(80));
	console.log(`Field 45: Commission`);
	console.log(`         ${formatPHP(result.part4BTaxableSupplementary.field45).padStart(20)}`);
	console.log(`Field 46: Profit Sharing`);
	console.log(`         ${formatPHP(result.part4BTaxableSupplementary.field46).padStart(20)}`);
	console.log(`Field 47: Fees Including Director's Fees`);
	console.log(`         ${formatPHP(result.part4BTaxableSupplementary.field47).padStart(20)}`);
	console.log(`Field 48: Taxable 13th Month Benefits (excess)`);
	console.log(`         ${formatPHP(result.part4BTaxableSupplementary.field48).padStart(20)}`);
	console.log(`Field 49: Hazard Pay (taxable)`);
	console.log(`         ${formatPHP(result.part4BTaxableSupplementary.field49).padStart(20)}`);
	console.log(`Field 50: Overtime Pay (taxable)`);
	console.log(`         ${formatPHP(result.part4BTaxableSupplementary.field50).padStart(20)}`);
	console.log(`Field 51: Others (specify)`);
	console.log(`         ${formatPHP(result.part4BTaxableSupplementary.field51).padStart(20)}`);
	if (result.part4BTaxableSupplementary.field51A) {
		console.log(`Field 51A: ${result.part4BTaxableSupplementary.field51A.description}`);
		console.log(
			`          ${formatPHP(result.part4BTaxableSupplementary.field51A.amount).padStart(20)}`,
		);
	}
	if (result.part4BTaxableSupplementary.field51B) {
		console.log(`Field 51B: ${result.part4BTaxableSupplementary.field51B.description}`);
		console.log(
			`          ${formatPHP(result.part4BTaxableSupplementary.field51B.amount).padStart(20)}`,
		);
	}
	console.log(`Field 52: Total Taxable Compensation Income`);
	console.log(`         ${formatPHP(result.part4BTaxableSupplementary.field52).padStart(20)}`);

	console.log("\n" + "=".repeat(80) + "\n");
}
