/**
 * Convert Employee data to BIR Form 2316 format (Frontend)
 * Uses the new employee fields (employer, employmentHistory, etc.)
 * Based on backend helper: bir-part4.helper.ts
 */

import type { BIRForm2316 } from "~/types/bir-2316";

/**
 * SSS Contribution Table 2025
 * Based on backend config: payroll.config.ts
 */
const SSS_CONTRIBUTION_TABLE = [
	{ min: 0, max: 4249.99, employeeShare: 180 },
	{ min: 4250, max: 4749.99, employeeShare: 202.5 },
	{ min: 4750, max: 5249.99, employeeShare: 225 },
	{ min: 5250, max: 5749.99, employeeShare: 247.5 },
	{ min: 5750, max: 6249.99, employeeShare: 270 },
	{ min: 6250, max: 6749.99, employeeShare: 292.5 },
	{ min: 6750, max: 7249.99, employeeShare: 315 },
	{ min: 7250, max: 7749.99, employeeShare: 337.5 },
	{ min: 7750, max: 8249.99, employeeShare: 360 },
	{ min: 8250, max: 8749.99, employeeShare: 382.5 },
	{ min: 8750, max: 9249.99, employeeShare: 405 },
	{ min: 9250, max: 9749.99, employeeShare: 427.5 },
	{ min: 9750, max: 10249.99, employeeShare: 450 },
	{ min: 10250, max: 10749.99, employeeShare: 472.5 },
	{ min: 10750, max: 11249.99, employeeShare: 495 },
	{ min: 11250, max: 11749.99, employeeShare: 517.5 },
	{ min: 11750, max: 12249.99, employeeShare: 540 },
	{ min: 12250, max: 12749.99, employeeShare: 562.5 },
	{ min: 12750, max: 13249.99, employeeShare: 585 },
	{ min: 13250, max: 13749.99, employeeShare: 607.5 },
	{ min: 13750, max: 14249.99, employeeShare: 630 },
	{ min: 14250, max: 14749.99, employeeShare: 652.5 },
	{ min: 14750, max: 15249.99, employeeShare: 675 },
	{ min: 15250, max: 15749.99, employeeShare: 697.5 },
	{ min: 15750, max: 16249.99, employeeShare: 720 },
	{ min: 16250, max: 16749.99, employeeShare: 742.5 },
	{ min: 16750, max: 17249.99, employeeShare: 765 },
	{ min: 17250, max: 17749.99, employeeShare: 787.5 },
	{ min: 17750, max: 18249.99, employeeShare: 810 },
	{ min: 18250, max: 18749.99, employeeShare: 832.5 },
	{ min: 18750, max: 19249.99, employeeShare: 855 },
	{ min: 19250, max: 19749.99, employeeShare: 877.5 },
	{ min: 19750, max: 20249.99, employeeShare: 900 },
	{ min: 20250, max: 20749.99, employeeShare: 922.5 },
	{ min: 20750, max: 21249.99, employeeShare: 945 },
	{ min: 21250, max: 21749.99, employeeShare: 967.5 },
	{ min: 21750, max: 22249.99, employeeShare: 990 },
	{ min: 22250, max: 22749.99, employeeShare: 1012.5 },
	{ min: 22750, max: 23249.99, employeeShare: 1035 },
	{ min: 23250, max: 23749.99, employeeShare: 1057.5 },
	{ min: 23750, max: 24249.99, employeeShare: 1080 },
	{ min: 24250, max: 24749.99, employeeShare: 1102.5 },
	{ min: 24750, max: 29999.99, employeeShare: 1125 },
	{ min: 30000, max: 35000, employeeShare: 1750 },
];

/**
 * PhilHealth Configuration
 * Based on backend config: payroll.config.ts
 */
const PHILHEALTH_CONFIG = {
	employeeRate: 0.025, // 2.5%
	minimumSalary: 10000,
	maximumSalary: 100000,
	minimumEmployeeShare: 250,
	maximumEmployeeShare: 2500,
} as const;

/**
 * Pag-IBIG Configuration
 * Based on backend config: payroll.config.ts
 */
const PAGIBIG_CONFIG = {
	rateLowIncome: 0.01, // 1% for monthly income ≤ 1,500
	rateHighIncome: 0.02, // 2% for monthly income > 1,500
	incomeThreshold: 1500,
	maximumEmployeeShare: 200, // Actual maximum per BIR requirements (not 100!)
} as const;

/**
 * Withholding Tax Table (TRAIN Law)
 * Based on backend helper: tax-calculator.helper.ts
 */
interface TaxBracket {
	annualBase: number;
	annualCap: number | null; // null represents infinity
	annualFixedTax: number;
	monthlyBase: number;
	monthlyCap: number | null; // null represents infinity
	monthlyFixedTax: number;
	rate: number; // Percentage as decimal (e.g., 0.15 for 15%)
}

const WITHHOLDING_TAX_TABLE: TaxBracket[] = [
	{
		annualBase: 0,
		annualCap: 250000,
		annualFixedTax: 0,
		monthlyBase: 0,
		monthlyCap: 20833,
		monthlyFixedTax: 0,
		rate: 0,
	},
	{
		annualBase: 250000,
		annualCap: 400000,
		annualFixedTax: 0,
		monthlyBase: 20833,
		monthlyCap: 33332,
		monthlyFixedTax: 0,
		rate: 0.15,
	},
	{
		annualBase: 400000,
		annualCap: 800000,
		annualFixedTax: 22500,
		monthlyBase: 33333,
		monthlyCap: 66666,
		monthlyFixedTax: 1875,
		rate: 0.2,
	},
	{
		annualBase: 800000,
		annualCap: 2000000,
		annualFixedTax: 102500,
		monthlyBase: 66667,
		monthlyCap: 166666,
		monthlyFixedTax: 8542,
		rate: 0.25,
	},
	{
		annualBase: 2000000,
		annualCap: 8000000,
		annualFixedTax: 402500,
		monthlyBase: 166667,
		monthlyCap: 666666,
		monthlyFixedTax: 33542,
		rate: 0.3,
	},
	{
		annualBase: 8000000,
		annualCap: null, // Infinity
		annualFixedTax: 2202500,
		monthlyBase: 666667,
		monthlyCap: null, // Infinity
		monthlyFixedTax: 183542,
		rate: 0.35,
	},
];

/**
 * Calculate SSS contribution using table
 * Based on backend helper: bir-part4.helper.ts
 */
function calculateSSSFromTable(monthlySalary: number): number {
	for (const bracket of SSS_CONTRIBUTION_TABLE) {
		if (monthlySalary >= bracket.min && monthlySalary <= bracket.max) {
			return bracket.employeeShare;
		}
	}

	// Default to maximum for salaries above table
	const lastBracket = SSS_CONTRIBUTION_TABLE[SSS_CONTRIBUTION_TABLE.length - 1];
	return lastBracket.employeeShare;
}

/**
 * Calculate PhilHealth contribution using config
 * Based on backend helper: bir-part4.helper.ts
 */
function calculatePhilHealthFromConfig(monthlySalary: number): number {
	const {
		employeeRate,
		minimumSalary,
		maximumSalary,
		minimumEmployeeShare,
		maximumEmployeeShare,
	} = PHILHEALTH_CONFIG;

	const cappedSalary = Math.min(Math.max(monthlySalary, minimumSalary), maximumSalary);
	const employeeShare = Math.min(
		Math.max(cappedSalary * employeeRate, minimumEmployeeShare),
		maximumEmployeeShare,
	);

	return roundAmount(employeeShare);
}

/**
 * Calculate Pag-IBIG contribution using config
 * Note: Maximum is 200 (not 100 from config) based on actual BIR requirements
 * Based on backend helper: bir-part4.helper.ts
 */
function calculatePagIBIGFromConfig(monthlySalary: number): number {
	const { rateLowIncome, rateHighIncome, incomeThreshold, maximumEmployeeShare } = PAGIBIG_CONFIG;

	const rate = monthlySalary <= incomeThreshold ? rateLowIncome : rateHighIncome;
	const employeeShare = Math.min(monthlySalary * rate, maximumEmployeeShare);

	return roundAmount(employeeShare);
}

/**
 * Calculate annual contributions based on monthly salary using table-based calculations
 * Based on backend helper: bir-part4.helper.ts
 */
function calculateAnnualContributions(monthlySalary: number): number {
	const sss = calculateSSSFromTable(monthlySalary);
	const philHealth = calculatePhilHealthFromConfig(monthlySalary);
	const pagIbig = calculatePagIBIGFromConfig(monthlySalary);
	const monthlyTotal = sss + philHealth + pagIbig;

	return roundAmount(monthlyTotal * 12);
}

/**
 * Calculate annual tax due based on taxable compensation income
 * Uses the annual withholding tax table
 * Based on backend helper: bir-part4.helper.ts
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
			return roundAmount(totalTax);
		}
	}

	// Default to 0 if no bracket matches
	return 0;
}

interface EmployeeData {
	id: string;
	employeeId: string;
	employmentHireDate: string | Date;
	employmentTerminationDate?: string | Date;
	employmentStatus?: string;
	basicSalary: number;
	employer?: {
		name: string;
		tin: string;
		rdoCode: string;
		branchCode: string;
		address: string;
	};
	person?: {
		personalInfo?: {
			firstName?: string;
			lastName?: string;
			middleName?: string;
			dateOfBirth?: string;
		};
		contactInfo?: {
			email?: string;
			phone?: string;
			phones?: Array<{
				type?: string;
				number?: string;
				isPrimary?: boolean;
			}>;
			address?:
				| string
				| Array<{
						street?: string;
						city?: string;
						state?: string;
						country?: string;
						zipCode?: string;
						postalCode?: string;
				  }>;
		};
	};
	employmentHistory?: Array<{
		employer: {
			name: string;
			tin: string;
			rdoCode: string;
			branchCode: string;
			address: string;
		};
		startDate: string | Date;
		endDate?: string | Date;
		salary?: number;
	}>;
	employeePayrolls?: Array<{
		basicPay: number;
		overtimePay: number;
		nightDiffPay: number;
		holidayPay: number;
		allowances: number;
		bonuses: number;
		taxAmount: number;
		sssContribution: number;
		philHealthContribution: number;
		pagibigContribution: number;
		grossPay: number;
		createdAt: string | Date;
	}>;
	documents?: Array<{
		type: string;
		number: string;
		issueDate?: string | Date;
		expiryDate?: string | Date;
		fileUrl?: string;
	}>;
}

/**
 * Create empty/default BIR Form 2316 structure
 * Used as fallback for missing fields - all values are empty/zero, not mock data
 */
function createEmptyBIR2316Structure(year: number): Partial<BIRForm2316> {
	return {
		year,
		periodFrom: "01/01",
		periodTo: "12/31",
		employeeTin: "",
		employeeLastName: "",
		employeeFirstName: "",
		employeeMiddleName: "",
		rdoCode: "",
		registeredAddress: "",
		registeredAddressZipCode: "0000",
		localHomeAddress: "",
		localHomeAddressZipCode: "0000",
		foreignAddress: "",
		dateOfBirth: "",
		contactNumber: "",
		statutoryMinimumWagePerDay: 0,
		statutoryMinimumWagePerMonth: 0,
		isMinimumWageEarner: "X",
		presentEmployerTin: "",
		presentEmployerName: "",
		presentEmployerAddress: "",
		presentEmployerZipCode: "0000",
		employerType: "X-", // Format: "X-" for Main Employer, "-X" for Secondary Employer
		previousEmployerTin: "",
		previousEmployerName: "",
		previousEmployerAddress: "",
		previousEmployerZipCode: "",
		grossCompensationPresentEmployer: 0,
		totalNonTaxablePresentEmployer: 0,
		taxableCompensationPresentEmployer: 0,
		taxableCompensationPreviousEmployer: 0,
		grossTaxableCompensation: 0,
		taxDue: 0,
		taxesWithheldPresentEmployer: 0,
		taxesWithheldPreviousEmployer: 0,
		totalTaxesWithheldAdjusted: 0,
		taxCreditPERA: 0,
		totalTaxesWithheld: 0,
		basicSalaryMWENonTaxable: 0,
		holidayPayMWE: 0,
		overtimePayMWE: 0,
		nightShiftDifferentialMWE: 0,
		hazardPayMWE: 0,
		thirteenthMonthPayNonTaxable: 0,
		deMinimisBenefits: 0,
		contributionsUnionDues: 0,
		otherNonTaxableCompensation: 0,
		totalNonTaxableCompensation: 0,
		basicSalaryTaxable: 0,
		representation: 0,
		transportation: 0,
		cola: 0,
		housingAllowance: 0,
		othersAmountA: 0,
		othersAmountB: 0,
		commission: 0,
		profitSharing: 0,
		fees: 0,
		thirteenthMonthPayTaxable: 0,
		hazardPayTaxable: 0,
		overtimePayTaxable: 0,
		supplementaryOthersLineA: "",
		supplementaryOthersAmountA: 0,
		supplementaryOthersLineB: "",
		supplementaryOthersAmountB: 0,
		totalTaxableCompensation: 0,

		// Signatures (Boxes 53–56) - left empty by default,
		// but can be populated by conversion logic when data is available.
		employerSignatory: "",
		employerSignatoryTitle: "",
		employerSignatureDate: "",
		employeeSignatory: "",
		employeeSignatureDate: "",
		employeeCTCNo: "",
		employeeValidIDNo: "",
		employeeIDPlaceOfIssue: "",
		employeeIDDateIssued: "",
		employeeCTCAmount: 0,
		substitutedFilingSignatory: "",
		substitutedFilingDate: "",
		substitutedFilingEmployeeSignatureDate: "",
		substitutedFilingIDDateIssued: "",
	};
}

/**
 * Convert Employee data to BIR Form 2316 format
 * Returns complete structure with employee data, using empty defaults for missing fields
 */
export function convertEmployeeToBIR2316(
	employee: EmployeeData,
	year: number,
): Partial<BIRForm2316> {
	const personalInfo = employee.person?.personalInfo || {};
	const contactInfo = employee.person?.contactInfo || {};
	const currentEmployer = employee.employer;

	// Extract employee name
	const firstName = personalInfo.firstName || "";
	const lastName = personalInfo.lastName || "";
	const middleName = personalInfo.middleName || "";
	const fullName = [firstName, middleName, lastName].filter(Boolean).join(" ");

	// Extract address - handle both string and array formats
	let address = "";
	let zipCode = "0000";

	if (contactInfo.address) {
		if (typeof contactInfo.address === "string") {
			address = contactInfo.address;
			zipCode = extractZipCode(address);
		} else if (Array.isArray(contactInfo.address) && contactInfo.address.length > 0) {
			const primaryAddress = contactInfo.address[0];
			address = [
				primaryAddress.street,
				primaryAddress.city,
				primaryAddress.state,
				primaryAddress.country,
			]
				.filter(Boolean)
				.join(", ");
			zipCode = primaryAddress.zipCode || primaryAddress.postalCode || "0000";
		}
	}

	// Calculate period from hire date
	const employmentHireDate = new Date(employee.employmentHireDate);
	const periodStart =
		employmentHireDate.getFullYear() === year ? employmentHireDate : new Date(year, 0, 1);
	const periodEnd =
		employmentHireDate.getFullYear() === year && employee.employmentStatus !== "TERMINATED"
			? new Date(year, 11, 31)
			: employee.employmentTerminationDate &&
				  new Date(employee.employmentTerminationDate).getFullYear() === year
				? new Date(employee.employmentTerminationDate)
				: new Date(year, 11, 31);

	const periodFrom = formatDateMMDD(periodStart);
	const periodTo = formatDateMMDD(periodEnd);

	// Calculate months worked in the year
	const monthsWorked = calculateMonthsWorked(periodStart, periodEnd);

	// Aggregate payroll data for the year
	const payrollData = aggregatePayrollData(employee.employeePayrolls || [], year);

	// Calculate annual compensation
	const annualBasicSalary = payrollData.totalBasicPay || employee.basicSalary * monthsWorked;
	const annualOvertime = payrollData.totalOvertimePay;
	const annualHolidayPay = payrollData.totalHolidayPay;
	const annualNightDiff = payrollData.totalNightDiffPay;
	const annualAllowances = payrollData.totalAllowances;
	const annualBonuses = payrollData.totalBonuses;

	// 13th month pay (typically equal to one month's basic salary)
	const thirteenthMonthPay = employee.basicSalary;

	// Calculate non-taxable 13th month (first 90,000 is tax-free)
	// Based on backend helper logic: calculateNonTaxable13thMonth
	const nonTaxable13th = roundAmount(Math.min(thirteenthMonthPay + annualBonuses, 90000));
	const taxable13th = roundAmount(Math.max(thirteenthMonthPay + annualBonuses - 90000, 0));

	// Calculate contributions from monthly salary (matching backend helper logic)
	// Use monthly salary (basicSalary) to calculate contributions using tables/config
	const monthlySalary = employee.basicSalary;
	const totalContributions = calculateAnnualContributions(monthlySalary);

	// Calculate tax withheld from payroll (for Field 25A)
	// Field 25A should show the ACTUAL taxes withheld from payroll records
	// If payroll data is missing or doesn't have tax amounts, calculate it from monthly salary
	let annualTaxWithheld = payrollData.totalTax || 0;

	// Fallback: Always calculate tax withheld from basic salary if payroll tax is 0
	// This handles cases where:
	// 1. Payroll records don't exist yet (employeePayrolls is empty or undefined)
	// 2. Payroll records exist but taxAmount is not populated (all zeros)
	// 3. Payroll records exist but totalTax is 0
	// We base it on the employee's basicSalary and months worked
	if (annualTaxWithheld === 0) {
		// Calculate monthly taxable income: monthly salary - monthly contributions
		const monthlyContributions = calculateAnnualContributions(monthlySalary) / 12;
		const monthlyTaxableIncome = monthlySalary - monthlyContributions;

		// Calculate monthly tax using monthly tax table
		let monthlyTax = 0;
		for (const bracket of WITHHOLDING_TAX_TABLE) {
			const withinBracket =
				monthlyTaxableIncome >= bracket.monthlyBase &&
				(bracket.monthlyCap === null || monthlyTaxableIncome < bracket.monthlyCap);

			if (withinBracket) {
				const excessIncome = monthlyTaxableIncome - bracket.monthlyBase;
				const taxOnExcess = excessIncome * bracket.rate;
				monthlyTax = bracket.monthlyFixedTax + taxOnExcess;
				break;
			}
		}

		// Annual tax withheld = monthly tax * months worked
		// This represents the estimated taxes that would have been withheld
		// based on the employee's monthly salary and months worked in the year
		annualTaxWithheld = roundAmount(monthlyTax * monthsWorked);
	}

	// Get previous employer from employment history
	// DISABLED: Not showing previous employer for now, even if employment history exists
	// const previousEmployer = getPreviousEmployerForYear(employee.employmentHistory || [], year);
	const previousEmployer = null; // Temporarily disabled

	// Format date of birth
	const dateOfBirth = personalInfo.dateOfBirth
		? formatDateMMDDYYYY(new Date(personalInfo.dateOfBirth))
		: "";

	// Start with empty structure (not mock data)
	const birData = createEmptyBIR2316Structure(year);

	// Override with actual employee data
	birData.year = year;
	birData.periodFrom = periodFrom;
	birData.periodTo = periodTo;

	// Employee info - from actual employee data
	birData.employeeTin = extractTinFromDocuments(employee.documents);
	birData.employeeLastName = lastName.toUpperCase();
	birData.employeeFirstName = firstName.toUpperCase();
	birData.employeeMiddleName = middleName ? middleName.toUpperCase() : "";
	birData.rdoCode = currentEmployer?.rdoCode || "";
	birData.registeredAddress = address;
	birData.registeredAddressZipCode = zipCode;
	birData.localHomeAddress = address;
	birData.localHomeAddressZipCode = zipCode;
	birData.dateOfBirth = dateOfBirth;
	birData.contactNumber =
		contactInfo.phone ||
		(contactInfo.phones && contactInfo.phones.length > 0
			? contactInfo.phones.find((p) => p.isPrimary)?.number ||
				contactInfo.phones[0]?.number ||
				""
			: "");
	birData.isMinimumWageEarner = employee.basicSalary <= 25000 ? "X" : ""; // Approximate minimum wage threshold

	// Present employer - from actual employee data
	birData.presentEmployerTin = currentEmployer?.tin || "";
	birData.presentEmployerName = currentEmployer?.name.toUpperCase() || "";
	birData.presentEmployerAddress = currentEmployer?.address || "";
	birData.presentEmployerZipCode = extractZipCode(currentEmployer?.address || "");
	birData.employerType = "X-"; // Format: "X-" for Main Employer, "-X" for Secondary Employer

	// Signatures / printed names (Boxes 53 & 54)
	// Format: MMDDYYYY (to match mock data like "01152025")
	const today = new Date();
	const todayStr = formatDateMMDDYYYY(today);

	// 53: Employer/Authorized Agent – signature over printed name
	birData.employerSignatory = currentEmployer?.name ? currentEmployer.name.toUpperCase() : "";
	birData.employerSignatoryTitle = "AUTHORIZED REPRESENTATIVE";
	birData.employerSignatureDate = todayStr;

	// 54: Employee signature over printed name
	birData.employeeSignatory = fullName ? fullName.toUpperCase() : "";
	birData.employeeSignatureDate = todayStr;

	// Previous employer (if applicable) - DISABLED for now
	// Even if employment history exists, we're not showing previous employer
	// if (previousEmployer) {
	// 	birData.previousEmployerTin = previousEmployer.employer.tin;
	// 	birData.previousEmployerName = previousEmployer.employer.name.toUpperCase();
	// 	birData.previousEmployerAddress = previousEmployer.employer.address;
	// 	birData.previousEmployerZipCode = extractZipCode(previousEmployer.employer.address || "");
	// }

	// ========================================
	// PART IV-B A: Non-Taxable/Exempt Compensation
	// Based on backend helper: bir-part4.helper.ts
	// ========================================

	// Check if employee is Minimum Wage Earner (MWE)
	const isMWE = employee.basicSalary <= 25000;

	// MWE non-taxable items (if applicable)
	birData.basicSalaryMWENonTaxable = isMWE ? roundAmount(annualBasicSalary) : 0;
	birData.holidayPayMWE = isMWE ? roundAmount(annualHolidayPay) : 0;
	birData.overtimePayMWE = isMWE ? roundAmount(annualOvertime) : 0;
	birData.nightShiftDifferentialMWE = isMWE ? roundAmount(annualNightDiff) : 0;
	birData.hazardPayMWE = 0; // TODO: Map from payroll if available

	// Non-taxable general items
	birData.thirteenthMonthPayNonTaxable = nonTaxable13th;
	birData.deMinimisBenefits = 0; // TODO: Calculate from benefits data
	birData.contributionsUnionDues = totalContributions;
	birData.otherNonTaxableCompensation = 0; // TODO: Map from payroll if available

	// Calculate total non-taxable compensation (Field 38)
	birData.totalNonTaxableCompensation = roundAmount(
		birData.basicSalaryMWENonTaxable +
			birData.holidayPayMWE +
			birData.overtimePayMWE +
			birData.nightShiftDifferentialMWE +
			birData.hazardPayMWE +
			birData.thirteenthMonthPayNonTaxable +
			birData.deMinimisBenefits +
			birData.contributionsUnionDues +
			birData.otherNonTaxableCompensation,
	);

	// ========================================
	// PART IV-B B: Taxable Compensation Income - Regular
	// Based on backend helper: bir-part4.helper.ts
	// ========================================

	// Field 39: Taxable Basic Salary = Annual Basic Salary - Contributions
	// (Contributions are already deducted as non-taxable in Field 36)
	// For MWE, basic salary is non-taxable (already in Field 29), so taxable is 0
	// For non-MWE, subtract contributions from annual basic salary
	const taxableBasicSalary = isMWE ? 0 : roundAmount(annualBasicSalary - totalContributions);
	birData.basicSalaryTaxable = taxableBasicSalary;

	// Regular taxable items (estimated from allowances if not available in payroll)
	birData.representation = 0; // TODO: Map from payroll if available
	birData.transportation = roundAmount(annualAllowances * 0.3); // Estimate
	birData.cola = roundAmount(annualAllowances * 0.2); // Estimate
	birData.housingAllowance = roundAmount(annualAllowances * 0.5); // Estimate
	birData.othersAmountA = 0; // TODO: Map from payroll if available
	birData.othersAmountB = 0; // TODO: Map from payroll if available

	// ========================================
	// PART IV-B B: Taxable Compensation Income - Supplementary
	// Based on backend helper: bir-part4.helper.ts
	// ========================================

	birData.commission = 0; // TODO: Map from payroll if available
	birData.profitSharing = 0; // TODO: Map from payroll if available
	birData.fees = 0; // TODO: Map from payroll if available
	birData.thirteenthMonthPayTaxable = taxable13th;

	// For non-MWE, overtime and night diff are taxable
	birData.hazardPayTaxable = isMWE ? 0 : roundAmount(annualNightDiff);
	birData.overtimePayTaxable = isMWE ? 0 : roundAmount(annualOvertime);

	birData.supplementaryOthersAmountA = 0; // TODO: Map from payroll if available
	birData.supplementaryOthersAmountB = 0; // TODO: Map from payroll if available

	// Calculate totals for "others" fields (matching backend helper structure)
	const othersRegularTotal = (birData.othersAmountA || 0) + (birData.othersAmountB || 0);
	const othersSupplementaryTotal =
		(birData.supplementaryOthersAmountA || 0) + (birData.supplementaryOthersAmountB || 0);

	// Calculate total taxable compensation income (Field 52)
	// Sum of all taxable regular and supplementary items (matching backend helper exactly)
	birData.totalTaxableCompensation = roundAmount(
		birData.basicSalaryTaxable + // Field 39
			birData.representation + // Field 40
			birData.transportation + // Field 41
			birData.cola + // Field 42
			birData.housingAllowance + // Field 43
			othersRegularTotal + // Field 44 (total of others regular)
			birData.commission + // Field 45
			birData.profitSharing + // Field 46
			birData.fees + // Field 47
			birData.thirteenthMonthPayTaxable + // Field 48
			birData.hazardPayTaxable + // Field 49
			birData.overtimePayTaxable + // Field 50
			othersSupplementaryTotal, // Field 51 (total of others supplementary)
	);

	// ========================================
	// PART IV-A: Summary
	// Based on backend helper: bir-part4.helper.ts
	// ========================================

	// Field 19: Gross Compensation Income from Present Employer
	// Sum of Items 38 (Total Non-Taxable) and 52 (Total Taxable)
	birData.grossCompensationPresentEmployer = roundAmount(
		birData.totalNonTaxableCompensation + birData.totalTaxableCompensation,
	);

	// Field 20: Total Non-Taxable/Exempt Compensation (Present Employer)
	birData.totalNonTaxablePresentEmployer = birData.totalNonTaxableCompensation;

	// Field 21: Taxable Compensation Income from Present Employer
	birData.taxableCompensationPresentEmployer = birData.totalTaxableCompensation;

	// Field 22: Taxable Compensation Income from Previous Employer
	birData.taxableCompensationPreviousEmployer = 0; // DISABLED for now

	// Field 23: Gross Taxable Compensation Income
	birData.grossTaxableCompensation = roundAmount(
		birData.taxableCompensationPresentEmployer + birData.taxableCompensationPreviousEmployer,
	);

	// Field 24: Tax Due (calculated using annual tax table from gross taxable compensation income)
	// Based on backend helper: bir-part4.helper.ts line 394
	birData.taxDue = calculateAnnualTaxDue(birData.grossTaxableCompensation);

	// Field 25A: Amount of Taxes Withheld – Present Employer
	// This should show the ACTUAL taxes withheld from payroll records (e.g., ₱31,720.80)
	// NOT the tax due - this is the sum of all monthly tax withholdings from payroll
	birData.taxesWithheldPresentEmployer = roundAmount(annualTaxWithheld);

	// Field 25B: Amount of Taxes Withheld – Previous Employer
	birData.taxesWithheldPreviousEmployer = 0; // DISABLED for now

	// Field 25: Amount of Taxes Withheld (sum of 25A and 25B)
	// Based on backend helper: bir-part4.helper.ts line 400
	// Note: This field is not directly stored in BIRForm2316, but calculated as sum of 25A and 25B
	// Field 25 = Field 25A + Field 25B (e.g., ₱31,720.80 + ₱0.00 = ₱31,720.80)

	// Field 26: Total Amount of Taxes Withheld as adjusted
	// IMPORTANT: Despite the form label saying "Sum of Items 25A and 25B",
	// Field 26 is ADJUSTED to match the tax due (Field 24), NOT the sum of 25A and 25B.
	// This accounts for rounding differences and ensures the final amount matches the annual tax due.
	// Based on backend helper: bir-part4.helper.ts line 405
	// Example: If Field 25 = ₱31,720.80 but Field 24 (Tax Due) = ₱31,420.00,
	// then Field 26 = ₱31,420.00 (adjusted to match tax due, not the sum)
	birData.totalTaxesWithheldAdjusted = roundAmount(birData.taxDue);

	// Field 27: 5% Tax Credit (PERA Act of 2008)
	birData.taxCreditPERA = 0; // TODO: Calculate if applicable

	// Field 28: Total Taxes Withheld
	birData.totalTaxesWithheld = roundAmount(
		birData.totalTaxesWithheldAdjusted + birData.taxCreditPERA,
	);

	return birData;
}

/**
 * Helper functions
 */

/**
 * Extract TIN number from employee documents
 * Returns empty string if TIN document not found
 */
function extractTinFromDocuments(
	documents?: Array<{
		type: string;
		number: string;
		issueDate?: string | Date;
		expiryDate?: string | Date;
		fileUrl?: string;
	}>,
): string {
	if (!documents || !Array.isArray(documents)) return "";

	const tinDoc = documents.find(
		(doc) => doc.type === "TIN" || doc.type === "tin_id" || doc.type?.toLowerCase() === "tin",
	);

	return tinDoc?.number || "";
}

function formatDateMMDD(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${month}${day}`;
}

function formatDateMMDDYYYY(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const year = date.getFullYear();
	return `${month}${day}${year}`;
}

function extractZipCode(address: string): string {
	// Simple extraction - looks for 4-digit zip code pattern
	const zipMatch = address.match(/\b\d{4}\b/);
	return zipMatch ? zipMatch[0] : "0000";
}

function calculateMonthsWorked(startDate: Date, endDate: Date): number {
	const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
	const end = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
	const months =
		(end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
	return Math.max(1, months);
}

function aggregatePayrollData(
	payrolls: EmployeeData["employeePayrolls"],
	year: number,
): {
	totalBasicPay: number;
	totalOvertimePay: number;
	totalHolidayPay: number;
	totalNightDiffPay: number;
	totalAllowances: number;
	totalBonuses: number;
	totalTax: number;
	totalSSS: number;
	totalPhilHealth: number;
	totalPagIBIG: number;
} {
	const yearPayrolls =
		payrolls?.filter((p) => {
			const payrollYear = new Date(p.createdAt).getFullYear();
			return payrollYear === year;
		}) || [];

	return {
		totalBasicPay: yearPayrolls.reduce((sum, p) => sum + (p.basicPay || 0), 0),
		totalOvertimePay: yearPayrolls.reduce((sum, p) => sum + (p.overtimePay || 0), 0),
		totalHolidayPay: yearPayrolls.reduce((sum, p) => sum + (p.holidayPay || 0), 0),
		totalNightDiffPay: yearPayrolls.reduce((sum, p) => sum + (p.nightDiffPay || 0), 0),
		totalAllowances: yearPayrolls.reduce((sum, p) => sum + (p.allowances || 0), 0),
		totalBonuses: yearPayrolls.reduce((sum, p) => sum + (p.bonuses || 0), 0),
		totalTax: yearPayrolls.reduce((sum, p) => sum + (p.taxAmount || 0), 0),
		totalSSS: yearPayrolls.reduce((sum, p) => sum + (p.sssContribution || 0), 0),
		totalPhilHealth: yearPayrolls.reduce((sum, p) => sum + (p.philHealthContribution || 0), 0),
		totalPagIBIG: yearPayrolls.reduce((sum, p) => sum + (p.pagibigContribution || 0), 0),
	};
}

function getPreviousEmployerForYear(
	employmentHistory: EmployeeData["employmentHistory"],
	year: number,
): NonNullable<EmployeeData["employmentHistory"]>[0] | null {
	if (!employmentHistory || employmentHistory.length === 0) return null;

	// Find the most recent previous employer that ended before or during the year
	const previousEmployers = employmentHistory
		.filter((eh) => {
			if (!eh.endDate) return false;
			const endYear = new Date(eh.endDate).getFullYear();
			return endYear <= year;
		})
		.sort((a, b) => {
			const dateA = a.endDate ? new Date(a.endDate).getTime() : 0;
			const dateB = b.endDate ? new Date(b.endDate).getTime() : 0;
			return dateB - dateA; // Most recent first
		});

	return previousEmployers.length > 0 ? previousEmployers[0] : null;
}

function roundAmount(amount: number): number {
	return Math.round(amount * 100) / 100;
}
