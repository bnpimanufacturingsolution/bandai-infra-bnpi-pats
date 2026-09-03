/**
 * BIR Form 2316 Generator
 * Certificate of Compensation Payment/Tax Withheld
 *
 * Uses existing payroll.config.ts and tax-calculator.ts
 */

import { PAYROLL_CONFIG, SSS_CONFIG } from "../config/payroll.config";
import {
	calculateWithholdingTax,
	calculateTotalContributions,
	formatPHP,
	WITHHOLDING_TAX_TABLE,
} from "../helper/tax-calculator";

/**
 * Employee Data Interface
 */
export interface EmployeeData {
	// Personal Info
	firstName: string;
	lastName: string;
	middleName?: string;
	tin: string;
	address: string;
	birthDate: string;
	zipCode: string;

	// Compensation
	monthlySalary: number;
	monthsWorked?: number; // Default 12
	thirteenthMonthPay?: number; // Default monthlySalary
	bonuses?: number;
	allowances?: number;

	// Employer Info
	employerName: string;
	employerTin: string;
	employerAddress: string;

	// Tax Year
	year?: number;
}

/**
 * Monthly Payroll Breakdown
 */
export interface MonthlyPayroll {
	month: number;
	grossSalary: number;
	deductions: {
		sss: number;
		philhealth: number;
		pagibig: number;
		withholdingTax: number;
		total: number;
	};
	netPay: number;
}

/**
 * BIR Form 2316 Data
 */
export interface BIR2316 {
	form: string;
	year: number;

	employee: {
		name: string;
		tin: string;
		address: string;
		birthDate: string;
		zipCode: string;
	};

	employer: {
		name: string;
		tin: string;
		address: string;
	};

	compensation: {
		grossCompensation: number;
		basicSalary: number;
		thirteenthMonthPay: number;
		bonuses: number;
		allowances: number;
		nonTaxable13th: number;
		taxable13th: number;
	};

	deductions: {
		sss: number;
		philhealth: number;
		pagibig: number;
		total: number;
	};

	taxInfo: {
		taxableCompensation: number;
		taxDue: number;
		taxWithheld: number;
		taxBracket: string;
		effectiveTaxRate: number;
		amountRefundable: number;
	};
}

/**
 * Calculate SSS using contribution table from config
 */
function calculateSSSFromTable(monthlySalary: number): {
	employee: number;
	employer: number;
	ec: number;
} {
	const table = SSS_CONFIG.contributionTable;

	for (const bracket of table) {
		if (monthlySalary >= bracket.min && monthlySalary <= bracket.max) {
			return {
				employee: bracket.employeeShare,
				employer: bracket.employerShare,
				ec: bracket.ec,
			};
		}
	}

	// Default to maximum
	const lastBracket = table[table.length - 1];
	return {
		employee: lastBracket.employeeShare,
		employer: lastBracket.employerShare,
		ec: lastBracket.ec,
	};
}

/**
 * Calculate PhilHealth using config
 */
function calculatePhilHealth(monthlySalary: number): { employee: number; employer: number } {
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

	return {
		employee: Math.round(employeeShare * 100) / 100,
		employer: Math.round(employeeShare * 100) / 100,
	};
}

/**
 * Calculate Pag-IBIG using config
 */
function calculatePagIBIG(monthlySalary: number): { employee: number; employer: number } {
	const { rateLowIncome, rateHighIncome, incomeThreshold, maximumEmployeeShare } =
		PAYROLL_CONFIG.pagIbig;

	const rate = monthlySalary <= incomeThreshold ? rateLowIncome : rateHighIncome;
	const employeeShare = Math.min(monthlySalary * rate, maximumEmployeeShare);

	return {
		employee: Math.round(employeeShare * 100) / 100,
		employer: Math.round(employeeShare * 100) / 100,
	};
}

/**
 * Calculate monthly payroll
 */
export function calculateMonthlyPayroll(monthlySalary: number): MonthlyPayroll {
	// Calculate contributions using config
	const sss = calculateSSSFromTable(monthlySalary);
	const philhealth = calculatePhilHealth(monthlySalary);
	const pagibig = calculatePagIBIG(monthlySalary);

	// Total contributions
	const totalContributions = sss.employee + philhealth.employee + pagibig.employee;

	// Taxable income
	const taxableIncome = monthlySalary - totalContributions;

	// Calculate tax using existing tax calculator
	const withholdingTax = calculateWithholdingTax(taxableIncome);

	// Total deductions and net pay
	const totalDeductions = totalContributions + withholdingTax;
	const netPay = monthlySalary - totalDeductions;

	return {
		month: 1,
		grossSalary: monthlySalary,
		deductions: {
			sss: sss.employee,
			philhealth: philhealth.employee,
			pagibig: pagibig.employee,
			withholdingTax,
			total: totalDeductions,
		},
		netPay,
	};
}

/**
 * Generate BIR Form 2316
 */
export function generateBIR2316(employeeData: EmployeeData): BIR2316 {
	const monthsWorked = employeeData.monthsWorked || 12;
	const thirteenthMonthPay = employeeData.thirteenthMonthPay || employeeData.monthlySalary;
	const bonuses = employeeData.bonuses || 0;
	const allowances = employeeData.allowances || 0;
	const year = employeeData.year || new Date().getFullYear();

	// Calculate annual totals
	const annualBasicSalary = employeeData.monthlySalary * monthsWorked;

	// 13th month pay - first 90,000 is non-taxable
	const nonTaxable13th = Math.min(thirteenthMonthPay + bonuses, 90000);
	const taxable13th = Math.max(thirteenthMonthPay + bonuses - 90000, 0);

	// Gross compensation
	const grossCompensation = annualBasicSalary + thirteenthMonthPay + bonuses + allowances;

	// Calculate annual contributions
	const monthlyPayroll = calculateMonthlyPayroll(employeeData.monthlySalary);
	const annualSSS = monthlyPayroll.deductions.sss * monthsWorked;
	const annualPhilHealth = monthlyPayroll.deductions.philhealth * monthsWorked;
	const annualPagIBIG = monthlyPayroll.deductions.pagibig * monthsWorked;
	const totalAnnualContributions = annualSSS + annualPhilHealth + annualPagIBIG;

	// Taxable compensation
	const taxableCompensation =
		annualBasicSalary + allowances + taxable13th - totalAnnualContributions;

	// Calculate annual tax
	const monthlyTaxableIncome = taxableCompensation / 12;
	const monthlyTax = calculateWithholdingTax(monthlyTaxableIncome);
	const annualTaxDue = monthlyTax * 12;
	const annualTaxWithheld = monthlyPayroll.deductions.withholdingTax * monthsWorked;

	// Get tax bracket info
	const taxBracket = getTaxBracketInfo(monthlyTaxableIncome);
	const effectiveTaxRate =
		taxableCompensation > 0 ? (annualTaxDue / taxableCompensation) * 100 : 0;

	// Amount refundable or due
	const amountRefundable = annualTaxWithheld - annualTaxDue;

	const fullName =
		`${employeeData.lastName}, ${employeeData.firstName}${employeeData.middleName ? " " + employeeData.middleName : ""}`.toUpperCase();

	return {
		form: "BIR Form 2316",
		year,
		employee: {
			name: fullName,
			tin: employeeData.tin,
			address: employeeData.address,
			birthDate: employeeData.birthDate,
			zipCode: employeeData.zipCode,
		},
		employer: {
			name: employeeData.employerName,
			tin: employeeData.employerTin,
			address: employeeData.employerAddress,
		},
		compensation: {
			grossCompensation: Math.round(grossCompensation * 100) / 100,
			basicSalary: Math.round(annualBasicSalary * 100) / 100,
			thirteenthMonthPay: Math.round(thirteenthMonthPay * 100) / 100,
			bonuses: Math.round(bonuses * 100) / 100,
			allowances: Math.round(allowances * 100) / 100,
			nonTaxable13th: Math.round(nonTaxable13th * 100) / 100,
			taxable13th: Math.round(taxable13th * 100) / 100,
		},
		deductions: {
			sss: Math.round(annualSSS * 100) / 100,
			philhealth: Math.round(annualPhilHealth * 100) / 100,
			pagibig: Math.round(annualPagIBIG * 100) / 100,
			total: Math.round(totalAnnualContributions * 100) / 100,
		},
		taxInfo: {
			taxableCompensation: Math.round(taxableCompensation * 100) / 100,
			taxDue: Math.round(annualTaxDue * 100) / 100,
			taxWithheld: Math.round(annualTaxWithheld * 100) / 100,
			taxBracket,
			effectiveTaxRate: Math.round(effectiveTaxRate * 100) / 100,
			amountRefundable: Math.round(amountRefundable * 100) / 100,
		},
	};
}

/**
 * Get tax bracket description
 */
function getTaxBracketInfo(monthlyIncome: number): string {
	for (const bracket of WITHHOLDING_TAX_TABLE) {
		const withinBracket =
			monthlyIncome > bracket.monthlyBase &&
			(bracket.monthlyCap === null || monthlyIncome <= bracket.monthlyCap);

		if (withinBracket) {
			const rate = (bracket.rate * 100).toFixed(0);
			if (bracket.monthlyCap === null) {
				return `Over ${formatPHP(bracket.monthlyBase)} - ${rate}%`;
			}
			return `${formatPHP(bracket.monthlyBase)} - ${formatPHP(bracket.monthlyCap)} (${rate}%)`;
		}
	}
	return "Tax Exempt";
}

/**
 * Print BIR 2316 to console
 */
export function printBIR2316(bir: BIR2316): void {
	console.log("\n" + "=".repeat(80));
	console.log("BIR FORM 2316");
	console.log("CERTIFICATE OF COMPENSATION PAYMENT/TAX WITHHELD");
	console.log(`For the Year ${bir.year}`);
	console.log("=".repeat(80));

	console.log("\nEMPLOYEE INFORMATION:");
	console.log(`  Name:       ${bir.employee.name}`);
	console.log(`  TIN:        ${bir.employee.tin}`);
	console.log(`  Address:    ${bir.employee.address}`);
	console.log(`  Birth Date: ${bir.employee.birthDate}`);
	console.log(`  ZIP Code:   ${bir.employee.zipCode}`);

	console.log("\nEMPLOYER INFORMATION:");
	console.log(`  Name:       ${bir.employer.name}`);
	console.log(`  TIN:        ${bir.employer.tin}`);
	console.log(`  Address:    ${bir.employer.address}`);

	console.log("\n" + "-".repeat(80));
	console.log("COMPENSATION INCOME");
	console.log("-".repeat(80));
	console.log(
		`Gross Compensation Income:        ${formatPHP(bir.compensation.grossCompensation).padStart(20)}`,
	);
	console.log(
		`  Basic Salary (Annual):          ${formatPHP(bir.compensation.basicSalary).padStart(20)}`,
	);
	console.log(
		`  13th Month Pay:                 ${formatPHP(bir.compensation.thirteenthMonthPay).padStart(20)}`,
	);
	if (bir.compensation.bonuses > 0) {
		console.log(
			`  Bonuses:                        ${formatPHP(bir.compensation.bonuses).padStart(20)}`,
		);
	}
	if (bir.compensation.allowances > 0) {
		console.log(
			`  Allowances:                     ${formatPHP(bir.compensation.allowances).padStart(20)}`,
		);
	}
	console.log(
		`    Non-Taxable (13th & Bonus):   ${formatPHP(bir.compensation.nonTaxable13th).padStart(20)}`,
	);
	console.log(
		`    Taxable (13th & Bonus):       ${formatPHP(bir.compensation.taxable13th).padStart(20)}`,
	);

	console.log("\n" + "-".repeat(80));
	console.log("MANDATORY DEDUCTIONS");
	console.log("-".repeat(80));
	console.log(`SSS Contributions:                ${formatPHP(bir.deductions.sss).padStart(20)}`);
	console.log(
		`PhilHealth Contributions:         ${formatPHP(bir.deductions.philhealth).padStart(20)}`,
	);
	console.log(
		`Pag-IBIG Contributions:           ${formatPHP(bir.deductions.pagibig).padStart(20)}`,
	);
	console.log(`${"─".repeat(55)}${" ".repeat(25)}`);
	console.log(
		`Total Deductions:                 ${formatPHP(bir.deductions.total).padStart(20)}`,
	);

	console.log("\n" + "-".repeat(80));
	console.log("TAX INFORMATION");
	console.log("-".repeat(80));
	console.log(
		`Taxable Compensation Income:      ${formatPHP(bir.taxInfo.taxableCompensation).padStart(20)}`,
	);
	console.log(`Tax Bracket:                      ${bir.taxInfo.taxBracket.padStart(20)}`);
	console.log(
		`Effective Tax Rate:               ${bir.taxInfo.effectiveTaxRate.toFixed(2)}%`.padStart(
			55,
		),
	);
	console.log(`Tax Due:                          ${formatPHP(bir.taxInfo.taxDue).padStart(20)}`);
	console.log(
		`Tax Withheld:                     ${formatPHP(bir.taxInfo.taxWithheld).padStart(20)}`,
	);
	console.log(`${"─".repeat(55)}${" ".repeat(25)}`);

	if (bir.taxInfo.amountRefundable >= 0) {
		console.log(
			`Amount Refundable:                ${formatPHP(bir.taxInfo.amountRefundable).padStart(20)}`,
		);
	} else {
		console.log(
			`Amount Still Due:                 ${formatPHP(Math.abs(bir.taxInfo.amountRefundable)).padStart(20)}`,
		);
	}

	console.log("=".repeat(80) + "\n");
}

/**
 * Print monthly payroll summary
 */
export function printMonthlyPayroll(payroll: MonthlyPayroll): void {
	console.log("\n" + "=".repeat(80));
	console.log("MONTHLY PAYROLL SUMMARY");
	console.log("=".repeat(80));
	console.log(`Gross Salary:                     ${formatPHP(payroll.grossSalary).padStart(20)}`);
	console.log("\nDeductions:");
	console.log(
		`  SSS:                            ${formatPHP(payroll.deductions.sss).padStart(20)}`,
	);
	console.log(
		`  PhilHealth:                     ${formatPHP(payroll.deductions.philhealth).padStart(20)}`,
	);
	console.log(
		`  Pag-IBIG:                       ${formatPHP(payroll.deductions.pagibig).padStart(20)}`,
	);
	console.log(
		`  Withholding Tax:                ${formatPHP(payroll.deductions.withholdingTax).padStart(20)}`,
	);
	console.log(`  ${"─".repeat(50)}${" ".repeat(30)}`);
	console.log(
		`  Total Deductions:               ${formatPHP(payroll.deductions.total).padStart(20)}`,
	);
	console.log("\n" + "=".repeat(80));
	console.log(`NET PAY:                          ${formatPHP(payroll.netPay).padStart(20)}`);
	console.log("=".repeat(80) + "\n");
}

/**
 * Example: Generate sample BIR 2316
 */
export function generateSampleReport(): void {
	const sampleEmployee: EmployeeData = {
		firstName: "Juan",
		lastName: "Dela Cruz",
		middleName: "Santos",
		tin: "123-456-789-000",
		address: "123 Sample Street, Makati City",
		birthDate: "1990-05-15",
		zipCode: "1200",
		monthlySalary: 35000,
		thirteenthMonthPay: 35000,
		bonuses: 10000,
		allowances: 2000,
		monthsWorked: 12,
		employerName: "ABC CORPORATION",
		employerTin: "000-111-222-000",
		employerAddress: "456 Business Avenue, Makati City, Metro Manila",
		year: 2025,
	};

	// Generate monthly payroll
	const monthlyPayroll = calculateMonthlyPayroll(sampleEmployee.monthlySalary);
	printMonthlyPayroll(monthlyPayroll);

	// Generate BIR 2316
	const bir2316 = generateBIR2316(sampleEmployee);
	printBIR2316(bir2316);
}

// Run sample if executed directly
if (require.main === module) {
	generateSampleReport();
}
