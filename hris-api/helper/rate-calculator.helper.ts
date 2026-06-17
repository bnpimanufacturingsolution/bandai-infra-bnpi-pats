/**
 * Rate Calculator Helper
 *
 * Provides detailed rate calculations for daily and hourly rates
 * with step-by-step formula display
 *
 * Usage:
 *   - Backend: Display detailed rate calculations in payroll calculations
 *   - Frontend: Show rate breakdown in compensation tabs
 */

import { formatPHP } from "./tax-calculator.helper";

export interface RateCalculation {
	monthlySalary: number;
	payFrequency: "MONTHLY" | "SEMI_MONTHLY" | "DAILY";
	workingDays: number;
	dailyWorkingHours: number;
	dailyRate: number;
	hourlyRate: number;
	minuteRate: number;
}

export interface RateCalculationBreakdown extends RateCalculation {
	applicableSalary: number;
	dailyRateFormula: string;
	dailyRateCalculation: string;
	hourlyRateFormula: string;
	hourlyRateCalculation: string;
	minuteRateFormula: string;
	minuteRateCalculation: string;
}

/**
 * Calculate daily and hourly rates with detailed breakdown
 */
export function calculateRatesWithBreakdown(
	monthlySalary: number,
	payFrequency: "MONTHLY" | "SEMI_MONTHLY" | "DAILY",
	workingDays: number,
	dailyWorkingHours: number = 8,
): RateCalculationBreakdown {
	// Determine applicable salary for rate calculation
	let applicableSalary = monthlySalary;
	if (payFrequency === "SEMI_MONTHLY") {
		applicableSalary = monthlySalary / 2;
	} else if (payFrequency === "DAILY") {
		applicableSalary = monthlySalary;
	}

	// Calculate daily rate
	const dailyRate = Math.round((applicableSalary / workingDays) * 100) / 100;

	// Calculate hourly rate
	const hourlyRate = Math.round((dailyRate / dailyWorkingHours) * 100) / 100;

	// Calculate minute rate
	const minuteRate = Math.round((hourlyRate / 60) * 100) / 100;

	// Build breakdown strings
	const salaryType = payFrequency === "SEMI_MONTHLY" ? "Semi-Monthly Salary" : "Monthly Salary";
	const dailyRateFormula = `${salaryType} ÷ Working Days`;
	const dailyRateCalculation = `${formatPHP(applicableSalary)} ÷ ${workingDays} days`;
	const hourlyRateFormula = `Daily Rate ÷ Daily Working Hours`;
	const hourlyRateCalculation = `${formatPHP(dailyRate)} ÷ ${dailyWorkingHours} hours`;
	const minuteRateFormula = `Hourly Rate ÷ 60 Minutes`;
	const minuteRateCalculation = `${formatPHP(hourlyRate)} ÷ 60 minutes`;

	return {
		monthlySalary,
		payFrequency,
		workingDays,
		dailyWorkingHours,
		applicableSalary,
		dailyRate,
		hourlyRate,
		minuteRate,
		dailyRateFormula,
		dailyRateCalculation,
		hourlyRateFormula,
		hourlyRateCalculation,
		minuteRateFormula,
		minuteRateCalculation,
	};
}

/**
 * Format rate calculation details for console output
 */
export function formatRateCalculationOutput(breakdown: RateCalculationBreakdown): void {
	console.log(`💰 Monthly Salary: ${formatPHP(breakdown.monthlySalary)}`);

	if (breakdown.payFrequency === "SEMI_MONTHLY") {
		console.log(`💰 Semi-Monthly Salary: ${formatPHP(breakdown.applicableSalary)}`);
	}

	console.log(`📊 Working Days in Period: ${breakdown.workingDays} days`);

	// Show detailed daily rate calculation
	console.log(`\n📌 DAILY RATE CALCULATION:`);
	console.log(`   Formula: ${breakdown.dailyRateFormula}`);
	console.log(`   Calculation: ${breakdown.dailyRateCalculation}`);
	console.log(`   💵 Daily Rate: ${formatPHP(breakdown.dailyRate)}`);

	// Show hourly rate calculation
	console.log(`\n📌 HOURLY RATE CALCULATION:`);
	console.log(`   Formula: ${breakdown.hourlyRateFormula}`);
	console.log(`   Calculation: ${breakdown.hourlyRateCalculation}`);
	console.log(`   ⏰ Hourly Rate: ${formatPHP(breakdown.hourlyRate)}`);

	// Show minute rate calculation
	console.log(`\n📌 MINUTE RATE CALCULATION:`);
	console.log(`   Formula: ${breakdown.minuteRateFormula}`);
	console.log(`   Calculation: ${breakdown.minuteRateCalculation}`);
	console.log(`   ⏱️  Minute Rate: ${formatPHP(breakdown.minuteRate)}`);
	console.log();
}

/**
 * Format rate calculation details for API response
 */
export function formatRateCalculationResponse(breakdown: RateCalculationBreakdown) {
	return {
		rates: {
			monthlySalary: breakdown.monthlySalary,
			applicableSalary: breakdown.applicableSalary,
			dailyRate: breakdown.dailyRate,
			hourlyRate: breakdown.hourlyRate,
			minuteRate: breakdown.minuteRate,
			payFrequency: breakdown.payFrequency,
		},
		rateCalculation: {
			daily: {
				formula: breakdown.dailyRateFormula,
				calculation: breakdown.dailyRateCalculation,
				result: breakdown.dailyRate,
			},
			hourly: {
				formula: breakdown.hourlyRateFormula,
				calculation: breakdown.hourlyRateCalculation,
				result: breakdown.hourlyRate,
			},
			minute: {
				formula: breakdown.minuteRateFormula,
				calculation: breakdown.minuteRateCalculation,
				result: breakdown.minuteRate,
			},
		},
		workingDays: breakdown.workingDays,
		dailyWorkingHours: breakdown.dailyWorkingHours,
	};
}

/**
 * Format rate calculation for frontend display
 * Returns an object suitable for React components
 */
export function formatRateCalculationForUI(breakdown: RateCalculationBreakdown) {
	return {
		salary: {
			monthly: breakdown.monthlySalary,
			applicable: breakdown.applicableSalary,
			payFrequency: breakdown.payFrequency,
		},
		rates: {
			daily: {
				value: breakdown.dailyRate,
				label: "Daily Rate",
				formula: breakdown.dailyRateFormula,
				calculation: breakdown.dailyRateCalculation,
			},
			hourly: {
				value: breakdown.hourlyRate,
				label: "Hourly Rate",
				formula: breakdown.hourlyRateFormula,
				calculation: breakdown.hourlyRateCalculation,
			},
			minute: {
				value: breakdown.minuteRate,
				label: "Minute Rate",
				formula: breakdown.minuteRateFormula,
				calculation: breakdown.minuteRateCalculation,
			},
		},
		workingDays: breakdown.workingDays,
		dailyWorkingHours: breakdown.dailyWorkingHours,
	};
}
