/**
 * Payroll Calculator with Attendance Integration
 *
 * Calculates employee payroll based on:
 * - Monthly base salary
 * - Attendance records (PRESENT/ABSENT)
 * - Working days in the period
 * - Philippine tax and contributions
 */

import {
	calculatePayroll,
	type PayrollCalculation,
	type TotalContributions,
} from "./tax-calculator.helper";

/**
 * Attendance Summary Interface
 */
export interface AttendanceSummary {
	totalWorkingDays: number;
	presentDays: number;
	absentDays: number;
	attendanceRate: number; // Percentage
}

/**
 * Payroll with Attendance Result
 */
export interface PayrollWithAttendance extends PayrollCalculation {
	baseMonthlySalary: number;
	dailyRate: number;
	attendance: AttendanceSummary;
	deductions: {
		absences: number;
		contributions: TotalContributions;
		tax: number;
		total: number;
	};
	adjustedGrossIncome: number; // After absence deductions
}

/**
 * Calculate daily rate from monthly salary
 *
 * @param monthlySalary - Base monthly salary
 * @param workingDaysPerMonth - Number of working days in the month (default: 22)
 * @returns Daily rate
 */
export function calculateDailyRate(
	monthlySalary: number,
	workingDaysPerMonth: number = 22,
): number {
	return Math.round((monthlySalary / workingDaysPerMonth) * 100) / 100;
}

/**
 * Calculate attendance summary
 *
 * @param totalWorkingDays - Total working days in the period
 * @param presentDays - Number of days employee was present
 * @returns Attendance summary
 */
export function calculateAttendanceSummary(
	totalWorkingDays: number,
	presentDays: number,
): AttendanceSummary {
	const absentDays = totalWorkingDays - presentDays;
	const attendanceRate = totalWorkingDays > 0 ? (presentDays / totalWorkingDays) * 100 : 0;

	return {
		totalWorkingDays,
		presentDays,
		absentDays,
		attendanceRate: Math.round(attendanceRate * 100) / 100,
	};
}

/**
 * Calculate deduction for absences
 *
 * @param dailyRate - Daily rate
 * @param absentDays - Number of absent days
 * @returns Total deduction for absences
 */
export function calculateAbsenceDeduction(dailyRate: number, absentDays: number): number {
	return Math.round(dailyRate * absentDays * 100) / 100;
}

/**
 * Calculate payroll with attendance consideration
 *
 * @param baseMonthlySalary - Base monthly salary
 * @param presentDays - Number of days employee was present
 * @param totalWorkingDays - Total working days in the month (default: 22)
 * @returns Complete payroll calculation with attendance
 */
export function calculatePayrollWithAttendance(
	baseMonthlySalary: number,
	presentDays: number,
	totalWorkingDays: number = 22,
): PayrollWithAttendance {
	// Calculate daily rate
	const dailyRate = calculateDailyRate(baseMonthlySalary, totalWorkingDays);

	// Calculate attendance summary
	const attendance = calculateAttendanceSummary(totalWorkingDays, presentDays);

	// Calculate absence deduction
	const absenceDeduction = calculateAbsenceDeduction(dailyRate, attendance.absentDays);

	// Calculate adjusted gross income (after absence deductions)
	const adjustedGrossIncome = baseMonthlySalary - absenceDeduction;

	// Calculate tax and contributions on adjusted gross income
	const payrollCalc = calculatePayroll(adjustedGrossIncome);

	// Build comprehensive result
	return {
		baseMonthlySalary: Math.round(baseMonthlySalary * 100) / 100,
		dailyRate,
		attendance,
		adjustedGrossIncome: Math.round(adjustedGrossIncome * 100) / 100,
		grossIncome: payrollCalc.grossIncome,
		contributions: payrollCalc.contributions,
		taxableIncome: payrollCalc.taxableIncome,
		withholdingTax: payrollCalc.withholdingTax,
		deductions: {
			absences: Math.round(absenceDeduction * 100) / 100,
			contributions: payrollCalc.contributions,
			tax: payrollCalc.withholdingTax,
			total: Math.round((absenceDeduction + payrollCalc.totalDeductions) * 100) / 100,
		},
		totalDeductions: Math.round((absenceDeduction + payrollCalc.totalDeductions) * 100) / 100,
		netPay: payrollCalc.netPay,
	};
}

/**
 * Calculate payroll from attendance records
 *
 * @param baseMonthlySalary - Base monthly salary
 * @param attendanceRecords - Array of attendance statuses ("PRESENT" | "ABSENT")
 * @returns Complete payroll calculation
 */
export function calculatePayrollFromAttendance(
	baseMonthlySalary: number,
	attendanceRecords: Array<"PRESENT" | "ABSENT">,
): PayrollWithAttendance {
	const totalWorkingDays = attendanceRecords.length;
	const presentDays = attendanceRecords.filter((status) => status === "PRESENT").length;

	return calculatePayrollWithAttendance(baseMonthlySalary, presentDays, totalWorkingDays);
}

/**
 * Format payroll summary for display
 *
 * @param payroll - Payroll calculation result
 * @returns Formatted string
 */
export function formatPayrollSummary(payroll: PayrollWithAttendance): string {
	const formatCurrency = (amount: number) =>
		new Intl.NumberFormat("en-PH", {
			style: "currency",
			currency: "PHP",
			minimumFractionDigits: 2,
		}).format(amount);

	return `
=== PAYROLL SUMMARY ===
Base Monthly Salary: ${formatCurrency(payroll.baseMonthlySalary)}
Daily Rate: ${formatCurrency(payroll.dailyRate)}

ATTENDANCE:
  Working Days: ${payroll.attendance.totalWorkingDays}
  Present: ${payroll.attendance.presentDays} days
  Absent: ${payroll.attendance.absentDays} days
  Attendance Rate: ${payroll.attendance.attendanceRate}%

DEDUCTIONS:
  Absences: ${formatCurrency(payroll.deductions.absences)}
  SSS: ${formatCurrency(payroll.deductions.contributions.sss)}
  PhilHealth: ${formatCurrency(payroll.deductions.contributions.philHealth)}
  PAG-IBIG: ${formatCurrency(payroll.deductions.contributions.pagIbig)}
  Withholding Tax: ${formatCurrency(payroll.deductions.tax)}
  ────────────────────────
  Total Deductions: ${formatCurrency(payroll.deductions.total)}

INCOME:
  Adjusted Gross: ${formatCurrency(payroll.adjustedGrossIncome)}
  Taxable Income: ${formatCurrency(payroll.taxableIncome)}
  ────────────────────────
  NET PAY: ${formatCurrency(payroll.netPay)}
`;
}

/**
 * Calculate impact of absences on net pay
 *
 * @param baseMonthlySalary - Base monthly salary
 * @param absentDays - Number of absent days
 * @param totalWorkingDays - Total working days
 * @returns Object showing payroll with and without absences
 */
export function comparePayrollWithAbsences(
	baseMonthlySalary: number,
	absentDays: number,
	totalWorkingDays: number = 22,
) {
	const withPerfectAttendance = calculatePayrollWithAttendance(
		baseMonthlySalary,
		totalWorkingDays,
		totalWorkingDays,
	);

	const withAbsences = calculatePayrollWithAttendance(
		baseMonthlySalary,
		totalWorkingDays - absentDays,
		totalWorkingDays,
	);

	const netPayDifference = withPerfectAttendance.netPay - withAbsences.netPay;

	return {
		perfectAttendance: withPerfectAttendance,
		withAbsences: withAbsences,
		impact: {
			absentDays,
			netPayLoss: Math.round(netPayDifference * 100) / 100,
			percentageLoss:
				Math.round((netPayDifference / withPerfectAttendance.netPay) * 10000) / 100,
		},
	};
}
