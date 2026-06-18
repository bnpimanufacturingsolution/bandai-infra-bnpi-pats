/**
 * Payroll Configuration
 * Central configuration for Philippine payroll calculations
 */

/**
 * Tax Configuration
 */
export const TAX_CONFIG = {
	// Tax computation period
	period: "monthly" as const,

	// Exemption amounts (per dependent)
	dependentExemption: 25000, // Annual exemption per dependent

	// Maximum number of dependents allowed
	maxDependents: 4,

	// Minimum wage threshold (tax-exempt threshold)
	minimumWageThreshold: 20833, // Monthly equivalent of 250,000 annual

	// Tax year
	taxYear: 2025,
} as const;

/**
 * SSS Configuration
 * Social Security System
 */
export const SSS_CONFIG = {
	enabled: true,
	employeeRate: 0.05, // 5%
	employerRate: 0.1, // 10%
	ecRate: 0.0, // EC is table-based and employer-only
	minimumSalary: 4250,
	maximumSalary: 35000,
	minimumContribution: 250,
	maximumContribution: 1750,

	// SSS Contribution Table 2025
	contributionTable: [
		{ min: 0, max: 4249.99, employeeShare: 180, employerShare: 400, ec: 10, total: 590 },
		{ min: 4250, max: 4749.99, employeeShare: 202.5, employerShare: 427.5, ec: 10, total: 640 },
		{ min: 4750, max: 5249.99, employeeShare: 225, employerShare: 455, ec: 10, total: 690 },
		{ min: 5250, max: 5749.99, employeeShare: 247.5, employerShare: 482.5, ec: 10, total: 740 },
		{ min: 5750, max: 6249.99, employeeShare: 270, employerShare: 510, ec: 10, total: 790 },
		{ min: 6250, max: 6749.99, employeeShare: 292.5, employerShare: 537.5, ec: 10, total: 840 },
		{ min: 6750, max: 7249.99, employeeShare: 315, employerShare: 565, ec: 10, total: 890 },
		{ min: 7250, max: 7749.99, employeeShare: 337.5, employerShare: 592.5, ec: 10, total: 940 },
		{ min: 7750, max: 8249.99, employeeShare: 360, employerShare: 620, ec: 10, total: 990 },
		{ min: 8250, max: 8749.99, employeeShare: 382.5, employerShare: 647.5, ec: 10, total: 1040 },
		{ min: 8750, max: 9249.99, employeeShare: 405, employerShare: 675, ec: 10, total: 1090 },
		{ min: 9250, max: 9749.99, employeeShare: 427.5, employerShare: 702.5, ec: 10, total: 1140 },
		{ min: 9750, max: 10249.99, employeeShare: 450, employerShare: 730, ec: 10, total: 1190 },
		{ min: 10250, max: 10749.99, employeeShare: 472.5, employerShare: 757.5, ec: 10, total: 1240 },
		{ min: 10750, max: 11249.99, employeeShare: 495, employerShare: 785, ec: 10, total: 1290 },
		{ min: 11250, max: 11749.99, employeeShare: 517.5, employerShare: 812.5, ec: 10, total: 1340 },
		{ min: 11750, max: 12249.99, employeeShare: 540, employerShare: 840, ec: 10, total: 1390 },
		{ min: 12250, max: 12749.99, employeeShare: 562.5, employerShare: 867.5, ec: 10, total: 1440 },
		{ min: 12750, max: 13249.99, employeeShare: 585, employerShare: 895, ec: 10, total: 1490 },
		{ min: 13250, max: 13749.99, employeeShare: 607.5, employerShare: 922.5, ec: 10, total: 1540 },
		{ min: 13750, max: 14249.99, employeeShare: 630, employerShare: 950, ec: 10, total: 1590 },
		{ min: 14250, max: 14749.99, employeeShare: 652.5, employerShare: 977.5, ec: 10, total: 1640 },
		{ min: 14750, max: 15249.99, employeeShare: 675, employerShare: 1005, ec: 10, total: 1690 },
		{ min: 15250, max: 15749.99, employeeShare: 697.5, employerShare: 1032.5, ec: 10, total: 1740 },
		{ min: 15750, max: 16249.99, employeeShare: 720, employerShare: 1060, ec: 10, total: 1790 },
		{ min: 16250, max: 16749.99, employeeShare: 742.5, employerShare: 1087.5, ec: 10, total: 1840 },
		{ min: 16750, max: 17249.99, employeeShare: 765, employerShare: 1115, ec: 10, total: 1890 },
		{ min: 17250, max: 17749.99, employeeShare: 787.5, employerShare: 1142.5, ec: 10, total: 1940 },
		{ min: 17750, max: 18249.99, employeeShare: 810, employerShare: 1170, ec: 10, total: 1990 },
		{ min: 18250, max: 18749.99, employeeShare: 832.5, employerShare: 1197.5, ec: 10, total: 2040 },
		{ min: 18750, max: 19249.99, employeeShare: 855, employerShare: 1225, ec: 10, total: 2090 },
		{ min: 19250, max: 19749.99, employeeShare: 877.5, employerShare: 1252.5, ec: 10, total: 2140 },
		{ min: 19750, max: 20249.99, employeeShare: 900, employerShare: 1280, ec: 10, total: 2190 },
		{ min: 20250, max: 20749.99, employeeShare: 922.5, employerShare: 1307.5, ec: 10, total: 2240 },
		{ min: 20750, max: 21249.99, employeeShare: 945, employerShare: 1335, ec: 10, total: 2290 },
		{ min: 21250, max: 21749.99, employeeShare: 967.5, employerShare: 1362.5, ec: 10, total: 2340 },
		{ min: 21750, max: 22249.99, employeeShare: 990, employerShare: 1390, ec: 10, total: 2390 },
		{ min: 22250, max: 22749.99, employeeShare: 1012.5, employerShare: 1417.5, ec: 10, total: 2440 },
		{ min: 22750, max: 23249.99, employeeShare: 1035, employerShare: 1445, ec: 10, total: 2490 },
		{ min: 23250, max: 23749.99, employeeShare: 1057.5, employerShare: 1472.5, ec: 10, total: 2540 },
		{ min: 23750, max: 24249.99, employeeShare: 1080, employerShare: 1500, ec: 10, total: 2590 },
		{ min: 24250, max: 24749.99, employeeShare: 1102.5, employerShare: 1527.5, ec: 10, total: 2640 },
		{ min: 24750, max: 29999.99, employeeShare: 1125, employerShare: 1555, ec: 10, total: 2690 },
		{ min: 30000, max: 35000, employeeShare: 1750, employerShare: 3325, ec: 30, total: 5105 },
	],
} as const;

/**
 * PhilHealth Configuration
 * Philippine Health Insurance Corporation
 */
export const PHILHEALTH_CONFIG = {
	enabled: true,
	premiumRate: 0.05, // 5% total (2.5% employee, 2.5% employer)
	employeeRate: 0.025, // 2.5%
	employerRate: 0.025, // 2.5%
	minimumSalary: 10000,
	maximumSalary: 100000,
	minimumContribution: 500, // Total contribution (250 employee + 250 employer)
	maximumContribution: 5000, // Total contribution (2500 employee + 2500 employer)
	minimumEmployeeShare: 250,
	maximumEmployeeShare: 2500,
} as const;

/**
 * PAG-IBIG Configuration
 * Home Development Mutual Fund
 */
export const PAGIBIG_CONFIG = {
	enabled: true,
	rateLowIncome: 0.01, // 1% for monthly income ≤ 1,500
	rateHighIncome: 0.02, // 2% for monthly income > 1,500
	incomeThreshold: 1500,
	minimumContribution: 100, // Total (employee + employer)
	maximumEmployeeShare: 200,
	maximumEmployerShare: 200,
	maximumMonthlySalary: 10000, // Maximum salary bracket for contribution computation
} as const;

/**
 * Deduction Configuration
 */
export const DEDUCTION_CONFIG = {
	// Late deduction per minute
	lateDeductionPerMinute: 0,

	// Early out deduction per minute
	earlyOutDeductionPerMinute: 0,

	// Absent deduction (full day)
	absentDeductionFullDay: true,

	// Half-day threshold (in hours)
	halfDayThreshold: 4,
} as const;

/**
 * Overtime Configuration
 */
export const OVERTIME_CONFIG = {
	// Regular overtime rate (125% of hourly rate)
	regularOvertimeRate: 1.25,

	// Rest day overtime rate (130% of hourly rate)
	restDayOvertimeRate: 1.30,

	// Special holiday overtime rate (130% of hourly rate)
	specialHolidayOvertimeRate: 1.30,

	// Regular holiday overtime rate (200% of hourly rate)
	regularHolidayOvertimeRate: 2.0,

	// Night differential rate (110% of hourly rate, 10pm - 6am)
	nightDifferentialRate: 1.10,

	// Night differential start time
	nightDifferentialStart: 22, // 10 PM

	// Night differential end time
	nightDifferentialEnd: 6, // 6 AM
} as const;

/**
 * Payroll Frequency
 */
export enum PayrollFrequency {
	WEEKLY = "weekly",
	BI_WEEKLY = "bi-weekly",
	SEMI_MONTHLY = "semi-monthly",
	MONTHLY = "monthly",
}

/**
 * Get divisor for annualizing income based on payroll frequency
 */
export function getAnnualizationDivisor(frequency: PayrollFrequency): number {
	switch (frequency) {
		case PayrollFrequency.WEEKLY:
			return 52;
		case PayrollFrequency.BI_WEEKLY:
			return 26;
		case PayrollFrequency.SEMI_MONTHLY:
			return 24;
		case PayrollFrequency.MONTHLY:
			return 12;
		default:
			return 12;
	}
}

/**
 * Default Payroll Settings
 */
export const PAYROLL_SETTINGS = {
	frequency: PayrollFrequency.SEMI_MONTHLY,
	roundingMethod: "round" as "round" | "ceil" | "floor",
	minimumWage: 610, // NCR minimum wage (2024)
	currency: "PHP",
	locale: "en-PH",
} as const;

/**
 * Export all configurations
 */
export const PAYROLL_CONFIG = {
	tax: TAX_CONFIG,
	sss: SSS_CONFIG,
	philHealth: PHILHEALTH_CONFIG,
	pagIbig: PAGIBIG_CONFIG,
	deduction: DEDUCTION_CONFIG,
	overtime: OVERTIME_CONFIG,
	settings: PAYROLL_SETTINGS,
} as const;

export default PAYROLL_CONFIG;
