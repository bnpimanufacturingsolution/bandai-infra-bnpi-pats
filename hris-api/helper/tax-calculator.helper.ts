/**
 * Philippine Tax and Contribution Calculator
 *
 * This helper provides utilities for calculating:
 * - Withholding Tax based on TRAIN Law
 * - SSS (Social Security System) contributions
 * - PhilHealth contributions
 * - PAG-IBIG (HDMF) contributions
 */

/**
 * Withholding Tax Bracket Interface
 */
export interface TaxBracket {
	annualBase: number;
	annualCap: number | null; // null represents infinity
	annualFixedTax: number;
	monthlyBase: number;
	monthlyCap: number | null; // null represents infinity
	monthlyFixedTax: number;
	semiMonthlyBase: number;
	semiMonthlyCap: number | null; // null represents infinity
	semiMonthlyFixedTax: number;
	rate: number; // Percentage as decimal (e.g., 0.15 for 15%)
}

/**
 * Withholding Tax Table (TRAIN Law)
 * Based on the tax table image provided
 *
 * ⚠️ IMPORTANT: This is ONLY used for seeding initial Calculator data.
 * The actual payroll calculation uses tax rates from the Calculator model in the backend.
 * See: payroll-period.helper.ts line 147 (const taxRates = calculator.taxRates)
 */
export const WITHHOLDING_TAX_TABLE: TaxBracket[] = [
	{
		annualBase: 0,
		annualCap: 250000,
		annualFixedTax: 0,
		monthlyBase: 0,
		monthlyCap: 20833,
		monthlyFixedTax: 0,
		semiMonthlyBase: 0,
		semiMonthlyCap: 10417,
		semiMonthlyFixedTax: 0,
		rate: 0,
	},
	{
		annualBase: 250000,
		annualCap: 400000,
		annualFixedTax: 0,
		monthlyBase: 20833,
		monthlyCap: 33332,
		monthlyFixedTax: 0,
		semiMonthlyBase: 10417,
		semiMonthlyCap: 16666,
		semiMonthlyFixedTax: 0,
		rate: 0.15,
	},
	{
		annualBase: 400000,
		annualCap: 800000,
		annualFixedTax: 22500,
		monthlyBase: 33333,
		monthlyCap: 66666,
		monthlyFixedTax: 1875,
		semiMonthlyBase: 16667,
		semiMonthlyCap: 33332,
		semiMonthlyFixedTax: 937.5,
		rate: 0.2,
	},
	{
		annualBase: 800000,
		annualCap: 2000000,
		annualFixedTax: 102500,
		monthlyBase: 66667,
		monthlyCap: 166666,
		monthlyFixedTax: 8542,
		semiMonthlyBase: 33333,
		semiMonthlyCap: 83332,
		semiMonthlyFixedTax: 4271,
		rate: 0.25,
	},
	{
		annualBase: 2000000,
		annualCap: 8000000,
		annualFixedTax: 402500,
		monthlyBase: 166667,
		monthlyCap: 666666,
		monthlyFixedTax: 33542,
		semiMonthlyBase: 83333,
		semiMonthlyCap: 333332,
		semiMonthlyFixedTax: 16771,
		rate: 0.3,
	},
	{
		annualBase: 8000000,
		annualCap: null, // Infinity
		annualFixedTax: 2202500,
		monthlyBase: 666667,
		monthlyCap: null, // Infinity
		monthlyFixedTax: 183542,
		semiMonthlyBase: 333333,
		semiMonthlyCap: null, // Infinity
		semiMonthlyFixedTax: 91771,
		rate: 0.35,
	},
];

/**
 * SSS Contribution Configuration
 */
export interface SSSContribution {
	employeeRate: number;
	employerRate: number;
	totalRate: number;
	minimumBase: number;
	maximumCeiling: number;
}

/**
 * ⚠️ IMPORTANT: This is ONLY used for seeding initial Calculator data.
 * The actual payroll calculation uses SSS rates from the Calculator model in the backend.
 * See: payroll-period.helper.ts line 148 (const sssRates = calculator.sssRates)
 */
export const SSS_CONFIG: SSSContribution = {
	employeeRate: 0.05, // 5%
	employerRate: 0.1, // 10%
	totalRate: 0.15, // 15%
	minimumBase: 250,
	maximumCeiling: 1750,
};

/**
 * PhilHealth Contribution Configuration
 */
export interface PhilHealthContribution {
	employeeRate: number;
	employerRate: number;
	totalRate: number;
	minimumBase: number;
	maximumCeiling: number;
}

/**
 * ⚠️ IMPORTANT: This is ONLY used for seeding initial Calculator data.
 * The actual payroll calculation uses PhilHealth rates from the Calculator model in the backend.
 * See: payroll-period.helper.ts line 149 (const philHealthRates = calculator.philHealthRates)
 */
export const PHILHEALTH_CONFIG: PhilHealthContribution = {
	employeeRate: 0.025, // 2.5%
	employerRate: 0.025, // 2.5%
	totalRate: 0.05, // 5%
	minimumBase: 250,
	maximumCeiling: 2500, // SRPOUT: 2500 ceiling for now
};

/**
 * PAG-IBIG Contribution Configuration
 */
export interface PagIbigContribution {
	rateBelowThreshold: number;
	rateAboveThreshold: number;
	threshold: number;
	maximumCeiling: number;
}

/**
 * ⚠️ IMPORTANT: This is ONLY used for seeding initial Calculator data.
 * The actual payroll calculation uses PAG-IBIG rates from the Calculator model in the backend.
 * See: payroll-period.helper.ts line 150 (const pagibigRates = calculator.pagibigRates)
 */
export const PAGIBIG_CONFIG: PagIbigContribution = {
	rateBelowThreshold: 0.01, // 1% for monthly income 1500 and below
	rateAboveThreshold: 0.02, // 2% for monthly income above 1500
	threshold: 1500,
	maximumCeiling: 200,
};

/**
 * Total Contributions Interface
 */
export interface TotalContributions {
	sss: number;
	philHealth: number;
	pagIbig: number;
	total: number;
}

/**
 * Payroll Calculation Result Interface
 */
export interface PayrollCalculation {
	grossIncome: number;
	contributions: TotalContributions;
	taxableIncome: number;
	withholdingTax: number;
	totalDeductions: number;
	netPay: number;
}

/**
 * Calculate Withholding Tax based on income
 * @param income - Gross income for the period
 * @param taxRates - Tax brackets from Calculator model (optional, uses default if not provided)
 * @param isSemiMonthly - Whether to use semi-monthly brackets (default: false for monthly)
 * @returns Calculated withholding tax
 */
export function calculateWithholdingTax(
	income: number,
	taxRates?: TaxBracket[],
	isSemiMonthly: boolean = false,
): number {
	if (!taxRates || taxRates.length === 0) {
		return 0;
	}

	// Find the appropriate tax bracket
	for (const bracket of taxRates) {
		let withinBracket: boolean;
		let baseIncome: number;
		let fixedTax: number;

		if (isSemiMonthly) {
			// Use semi-monthly brackets
			withinBracket =
				income >= bracket.semiMonthlyBase &&
				(bracket.semiMonthlyCap === null || income < bracket.semiMonthlyCap);
			baseIncome = bracket.semiMonthlyBase;
			fixedTax = bracket.semiMonthlyFixedTax;
		} else {
			// Use monthly brackets
			withinBracket =
				income >= bracket.monthlyBase &&
				(bracket.monthlyCap === null || income < bracket.monthlyCap);
			baseIncome = bracket.monthlyBase;
			fixedTax = bracket.monthlyFixedTax;
		}

		if (withinBracket) {
			const excessIncome = income - baseIncome;
			const taxOnExcess = excessIncome * bracket.rate;
			const totalTax = fixedTax + taxOnExcess;
			return Math.round(totalTax * 100) / 100; // Round to 2 decimal places
		}
	}

	// Default to 0 if no bracket matches
	return 0;
}

/**
 * Calculate SSS Contribution (Employee Share)
 * @param monthlyIncome - Gross monthly income
 * @param sssConfig - SSS configuration from Calculator model
 * @returns SSS contribution amount
 */
export function calculateSSSContribution(
	monthlyIncome: number,
	sssConfig?: SSSContribution,
): number {
	if (!sssConfig) {
		return 0;
	}
	if (monthlyIncome <= 0) {
		return 0;
	}

	// 1. Determine Monthly Salary Credit (MSC)
	// Round to nearest 500 to simulate SSS salary brackets
	let msc = Math.round(monthlyIncome / 500) * 500;

	// 2. Enforce Min/Max on MSC
	const maxMSC = sssConfig.maximumCeiling / sssConfig.employeeRate;
	const minMSC =
		sssConfig.minimumBase < 1000
			? sssConfig.minimumBase / sssConfig.employeeRate
			: sssConfig.minimumBase;

	const effectiveMSC = Math.max(minMSC, Math.min(msc, maxMSC));

	// 3. Calculate Contribution based on Effective MSC
	const contribution = effectiveMSC * sssConfig.employeeRate;

	return Math.round(contribution * 100) / 100;
}

/**
 * Calculate PhilHealth Contribution (Employee Share)
 * @param monthlyIncome - Gross monthly income
 * @param philHealthConfig - PhilHealth configuration from Calculator model
 * @returns PhilHealth contribution amount
 */
export function calculatePhilHealthContribution(
	monthlyIncome: number,
	philHealthConfig?: PhilHealthContribution,
): number {
	if (!philHealthConfig || monthlyIncome <= 0) {
		return 0;
	}
	const salaryFloor =
		philHealthConfig.minimumBase >= 10000 ? philHealthConfig.minimumBase : 10000;
	const contributionBase = Math.max(monthlyIncome, salaryFloor);

	// Compute contribution and cap the employee share at the PhilHealth ceiling.
	// Legacy Calculator rows store minimumBase as the employee-share minimum (250),
	// while current PhilHealth rules use a PHP 10,000 salary floor.
	const contribution = contributionBase * philHealthConfig.employeeRate;
	const cappedContribution = Math.min(contribution, philHealthConfig.maximumCeiling);
	return Math.round(cappedContribution * 100) / 100;
}

/**
 * Calculate PAG-IBIG Contribution (Employee Share)
 * @param monthlyIncome - Gross monthly income
 * @param pagibigConfig - PAG-IBIG configuration from Calculator model
 * @returns PAG-IBIG contribution amount
 */
export function calculatePagIbigContribution(
	monthlyIncome: number,
	pagibigConfig?: PagIbigContribution,
): number {
	if (!pagibigConfig) {
		return 0;
	}

	let rate: number;

	if (monthlyIncome <= pagibigConfig.threshold) {
		rate = pagibigConfig.rateBelowThreshold;
	} else {
		rate = pagibigConfig.rateAboveThreshold;
	}

	const contribution = monthlyIncome * rate;
	const cappedContribution = Math.min(contribution, pagibigConfig.maximumCeiling);

	return Math.round(cappedContribution * 100) / 100;
}

/**
 * Calculate Total Contributions
 * @param monthlyIncome - Gross monthly income
 * @param sssConfig - SSS configuration from Calculator model
 * @param philHealthConfig - PhilHealth configuration from Calculator model
 * @param pagibigConfig - PAG-IBIG configuration from Calculator model
 * @returns Object containing all contribution amounts
 */
export function calculateTotalContributions(
	monthlyIncome: number,
	sssConfig?: SSSContribution,
	philHealthConfig?: PhilHealthContribution,
	pagibigConfig?: PagIbigContribution,
): TotalContributions {
	const sss = calculateSSSContribution(monthlyIncome, sssConfig);
	const philHealth = calculatePhilHealthContribution(monthlyIncome, philHealthConfig);
	const pagIbig = calculatePagIbigContribution(monthlyIncome, pagibigConfig);
	const total = sss + philHealth + pagIbig;

	return {
		sss: Math.round(sss * 100) / 100,
		philHealth: Math.round(philHealth * 100) / 100,
		pagIbig: Math.round(pagIbig * 100) / 100,
		total: Math.round(total * 100) / 100,
	};
}

/**
 * Calculate Complete Payroll
 * @param grossIncome - Gross monthly income
 * @param taxRates - Tax brackets from Calculator model
 * @param sssConfig - SSS configuration from Calculator model
 * @param philHealthConfig - PhilHealth configuration from Calculator model
 * @param pagibigConfig - PAG-IBIG configuration from Calculator model
 * @returns Complete payroll calculation breakdown
 */
export function calculatePayroll(
	grossIncome: number,
	taxRates?: TaxBracket[],
	sssConfig?: SSSContribution,
	philHealthConfig?: PhilHealthContribution,
	pagibigConfig?: PagIbigContribution,
): PayrollCalculation {
	// Calculate contributions
	const contributions = calculateTotalContributions(
		grossIncome,
		sssConfig,
		philHealthConfig,
		pagibigConfig,
	);

	// Calculate taxable income (Gross - Contributions)
	const taxableIncome = grossIncome - contributions.total;

	// Calculate withholding tax based on taxable income
	const withholdingTax = calculateWithholdingTax(taxableIncome, taxRates);

	// Calculate total deductions
	const totalDeductions = contributions.total + withholdingTax;

	// Calculate net pay
	const netPay = grossIncome - totalDeductions;

	return {
		grossIncome: Math.round(grossIncome * 100) / 100,
		contributions: contributions,
		taxableIncome: Math.round(taxableIncome * 100) / 100,
		withholdingTax: Math.round(withholdingTax * 100) / 100,
		totalDeductions: Math.round(totalDeductions * 100) / 100,
		netPay: Math.round(netPay * 100) / 100,
	};
}

/**
 * Example calculation with 35000 monthly income (as shown in the tax-rates image)
 * NOTE: Commented out - now requires calculator config parameters
 */
// export function exampleCalculation(): PayrollCalculation {
// 	const grossMonthlyIncome = 35000;
// 	return calculatePayroll(grossMonthlyIncome);
// }

/**
 * Get Tax Bracket Information for a given monthly income
 * @param monthlyIncome - Gross monthly income
 * @param taxRates - Tax brackets from Calculator model
 * @returns Tax bracket information
 */
export function getTaxBracket(monthlyIncome: number, taxRates?: TaxBracket[]): TaxBracket | null {
	if (!taxRates || taxRates.length === 0) {
		return null;
	}

	for (const bracket of taxRates) {
		const withinBracket =
			monthlyIncome >= bracket.monthlyBase &&
			(bracket.monthlyCap === null || monthlyIncome < bracket.monthlyCap);

		if (withinBracket) {
			return bracket;
		}
	}

	return null;
}

/**
 * Format currency to Philippine Peso
 * @param amount - Amount to format
 * @returns Formatted currency string
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
 * Round to nearest centavo (0.01)
 * @param amount - Amount to round
 * @returns Rounded amount
 */
export function roundToCentavo(amount: number): number {
	return Math.round(amount * 100) / 100;
}

/**
 * Round up to nearest peso (used for final net pay in some payroll systems)
 * @param amount - Amount to round
 * @returns Rounded amount
 */
export function roundUpToPeso(amount: number): number {
	return Math.ceil(amount);
}

/**
 * Calculate year-to-date withholding tax
 * @param monthlyIncomes - Array of monthly incomes for the year
 * @returns Total withholding tax for the year
 */
export function calculateYTDWithholdingTax(monthlyIncomes: number[]): number {
	const totalTax = monthlyIncomes.reduce((sum, income) => {
		const contributions = calculateTotalContributions(income);
		const taxableIncome = income - contributions.total;
		const tax = calculateWithholdingTax(taxableIncome);
		return sum + tax;
	}, 0);

	return Math.round(totalTax * 100) / 100;
}

/**
 * Get contribution breakdown for display/reporting
 * @param monthlyIncome - Gross monthly income
 * @param sssConfig - SSS configuration from Calculator model
 * @param philHealthConfig - PhilHealth configuration from Calculator model
 * @param pagibigConfig - PAG-IBIG configuration from Calculator model
 * @returns Detailed contribution breakdown
 */
export function getContributionBreakdown(
	monthlyIncome: number,
	sssConfig?: SSSContribution,
	philHealthConfig?: PhilHealthContribution,
	pagibigConfig?: PagIbigContribution,
) {
	return {
		sss: {
			employeeShare: calculateSSSContribution(monthlyIncome, sssConfig),
			employerShare: sssConfig
				? Math.min(
						monthlyIncome * sssConfig.employerRate,
						sssConfig.maximumCeiling *
							(sssConfig.employerRate / sssConfig.employeeRate),
					)
				: 0,
			config: sssConfig,
		},
		philHealth: {
			employeeShare: calculatePhilHealthContribution(monthlyIncome, philHealthConfig),
			employerShare: calculatePhilHealthContribution(monthlyIncome, philHealthConfig), // Same as employee
			config: philHealthConfig,
		},
		pagIbig: {
			employeeShare: calculatePagIbigContribution(monthlyIncome, pagibigConfig),
			employerShare: calculatePagIbigContribution(monthlyIncome, pagibigConfig), // Same as employee
			config: pagibigConfig,
		},
	};
}

/**
 * Calculates payroll deductions prorated for a specific period (e.g. semi-monthly).
 * It computes the full monthly rates first (to hit correct brackets/caps) and then reduces them proportional to the actual gross pay.
 *
 * @param fullMonthlyBasic - The full monthly basic salary of the employee (used for brackets).
 * @param actualPeriodGross - The actual gross pay calculated for this specific payroll period.
 * @param splitFactor - Optional split factor for semi-monthly (0.5)
 * @param taxRates - Tax brackets from Calculator model
 * @param sssConfig - SSS configuration from Calculator model
 * @param philHealthConfig - PhilHealth configuration from Calculator model
 * @param pagibigConfig - PAG-IBIG configuration from Calculator model
 * @returns PayrollCalculation object with prorated and rounded values.
 */
export function calculateProratedPayroll(
	fullMonthlyBasic: number,
	actualPeriodGross: number,
	splitFactor?: number,
	taxRates?: TaxBracket[],
	sssConfig?: SSSContribution,
	philHealthConfig?: PhilHealthContribution,
	pagibigConfig?: PagIbigContribution,
): PayrollCalculation {
	// 1. Calculate ideal full monthly deductions to establish the "rates" and "caps"
	const monthlyPayroll = calculatePayroll(
		fullMonthlyBasic,
		taxRates,
		sssConfig,
		philHealthConfig,
		pagibigConfig,
	);

	// 2. Determine proration ratio
	// If splitFactor is explicitly provided (e.g. 0.5 for semi-monthly), use it.
	// Otherwise, calculate based on income ratio (Period Gross / Full Monthly Gross).
	const ratio =
		splitFactor !== undefined
			? splitFactor
			: fullMonthlyBasic > 0
				? actualPeriodGross / fullMonthlyBasic
				: 0;

	// 3. Prorate and Round Contributions
	const proratedSSS = roundToCentavo(monthlyPayroll.contributions.sss * ratio);
	const proratedPhilHealth = roundToCentavo(monthlyPayroll.contributions.philHealth * ratio);
	const proratedPagIbig = roundToCentavo(monthlyPayroll.contributions.pagIbig * ratio);

	// 4. Prorate and Round Tax
	const proratedTax = roundToCentavo(monthlyPayroll.withholdingTax * ratio);

	// 5. Reconstruct Totals based on rounded components
	const proratedTotalContributions = roundToCentavo(
		proratedSSS + proratedPhilHealth + proratedPagIbig,
	);

	const proratedTotalDeductions = roundToCentavo(proratedTotalContributions + proratedTax);
	const proratedTaxableIncome = roundToCentavo(actualPeriodGross - proratedTotalContributions);
	const proratedNetPay = roundToCentavo(actualPeriodGross - proratedTotalDeductions);

	return {
		grossIncome: roundToCentavo(actualPeriodGross),
		contributions: {
			sss: proratedSSS,
			philHealth: proratedPhilHealth,
			pagIbig: proratedPagIbig,
			total: proratedTotalContributions,
		},
		taxableIncome: proratedTaxableIncome,
		withholdingTax: proratedTax,
		totalDeductions: proratedTotalDeductions,
		netPay: proratedNetPay,
	};
}
