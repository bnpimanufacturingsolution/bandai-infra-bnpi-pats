/**
 * Payroll Period Helper
 * Handles payroll generation from timesheets for a given payroll period
 */

import { PayFrequency, Prisma, PrismaClient } from "../generated/prisma";
import {
	calculateProratedPayroll,
	roundToCentavo,
	calculateTotalContributions,
	calculateWithholdingTax,
} from "./tax-calculator.helper";
import { getLogger } from "./logger.helper";
import { uploadToCloudinary } from "./cloudinary.helper";
import {
	getScheduleBoundaries as sharedGetScheduleBoundaries,
	getScheduleIndex as sharedGetScheduleIndex,
	calculateStrictScheduleMetrics,
} from "./schedule-work-metrics.helper";
import {
	buildPayslipDocumentNumber,
	buildPayslipFilename,
	generatePayslipPdfBuffer,
} from "./payslip-pdf.helper";
import {
	resolveEmployeeActiveSchedule,
	resolveEffectiveShiftFromEmployeeData,
} from "./employee-schedule.helper";
import { buildBreakdownFromTimesheetLines } from "./timesheet.helper";
import {
	resolvePayrollBenefitSources,
	type PayrollBenefitSourceInput,
} from "./payroll-benefit-source.helper";
import {
	ensureAttendanceBenefitInstallmentForPeriod,
	ensureRecurringBenefitInstallmentForPeriod,
} from "./employee-benefit-program.helper";
import {
	computeAttendanceBenefitAmount,
	countAttendanceBenefitDaysFromBreakdown,
	type BenefitAttendanceAmountBasis,
} from "./attendance-benefit-amount.helper";
import {
	countEligibilitySignalsFromBreakdown,
	evaluateBenefitAttendanceEligibility,
	normalizeBenefitEligibilityMode,
} from "./benefit-attendance-eligibility.helper";
import { getUtcMonthRangeContaining } from "./benefit-recurrence.helper";
import { loanTypeNameToDeductionCode } from "./bnpi-mass-upload-import.helper";
import { getMergedCycleRules } from "../app/payrollperiod/payroll-cycle.helper";
import {
	applyReadyPayrollCorrectionsToEmployeePayroll,
	buildUpdatedPayrollMoneyAfterCorrections,
} from "../app/payrollCorrection/payroll-correction.service";

const logger = getLogger();
const asRecord = (value: unknown): Record<string, any> =>
	value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
const getJsonString = (value: unknown, key: string): string => {
	const raw = asRecord(value)[key];
	return typeof raw === "string" ? raw : "";
};
const getEmployeePersonalInfo = (employee: any): Record<string, any> =>
	asRecord(employee?.person?.personalInfo);
const getEmployeeDisplayName = (employee: any): string =>
	[
		getJsonString(getEmployeePersonalInfo(employee), "firstName"),
		getJsonString(getEmployeePersonalInfo(employee), "lastName"),
	]
		.filter(Boolean)
		.join(" ")
		.trim();
const payrollLogger = logger.child({ module: "payroll-period-helper" });

export const BANDAI_DIRECT_ANNUAL_WORK_DAYS = 313;
export const BANDAI_SOURCE_DAILY_RATE_MAX = 700;
export const BANDAI_WORKING_HOURS_PER_DAY = 8;
const BANDAI_APPROVED_BUCKET_MULTIPLIERS = {
	regularOt: 1.25,
	restDay: 1.3,
	restDayOt: 1.69,
	specialHolidayPremium: 0.3,
	specialHolidayFull: 1.3,
	specialHolidayOt: 1.69,
	legalHoliday: 1,
	legalHolidayOt: 2.6,
	nightDiffPremium: 0.1,
};

const BANDAI_PAYROLL_REGISTER_COLUMNS = [
	["G", "Monthly Salary", "monthlySalary"],
	["H", "Daily Salary", "dailySalary"],
	["I", "No. of Days", "numberOfDays"],
	["J", "Basic Salary", "basicPay"],
	["K", "Absent-Amt", "absentDeduction"],
	["L", "UT/Late-Amt", "lateUndertimeAmount"],
	["M", "No. of Reg OT Hrs", "regularOtHours"],
	["N", "Reg OT", "overtimePay"],
	["O", "RD Hrs", "restDayHours"],
	["P", "RD Hrs Pay", "restDayHoursPay"],
	["Q", "RD OT", "restDayOtHours"],
	["R", "RD OT Pay", "restDayOtPay"],
	["S", "Spc Hol OT Hrs", "specialHolidayOtHours"],
	["T", "Spc Hol OT", "specialHolidayOtPay"],
	["U", "Sun/Spc Hol OT Exc Hrs", "sunSpecialHolidayOtExcessHours"],
	["V", "Sun/Spc Hol OT Exc", "sunSpecialHolidayOtExcessPay"],
	["W", "Spc Hol RD OT Hrs", "specialHolidayRestDayOtHours"],
	["X", "Spc RD OT", "specialHolidayRestDayOtPay"],
	["Y", "Spc RD Exc Hrs", "specialRestDayExcessHours"],
	["Z", "Spc RD Exc OT", "specialRestDayExcessOtPay"],
	["AA", "Leg Hol OT Hrs", "legalHolidayOtHours"],
	["AB", "Leg Hol OT", "legalHolidayOtPay"],
	["AC", "Leg Hol Exc", "legalHolidayExcessPay"],
	["AD", "Leg Hol RD", "legalHolidayRestDayPay"],
	["AE", "Leg Hol Exc1", "legalHolidayExcess1Pay"],
	["AF", "Leg Hol RD Exc", "legalHolidayRestDayExcessPay"],
	["AG", "Night Differential", "nightDiffPay"],
	["AH", "Leave", "leavePay"],
	["AI", "Christmas Gift", "christmasGift"],
	["AJ", "Special Bonus", "specialBonus"],
	["AK", "Mandatory Cont Adjustment", "mandatoryContributionAdjustment"],
	["AL", "Guaranteed Bonus", "guaranteedBonus"],
	["AM", "HYS Meal Allowance", "hysMealAllowance"],
	["AN", "OB Allowance", "obAllowance"],
	["AO", "Other Adjustment", "otherAdjustment"],
	["AP", "Overtime Meal Allownce", "overtimeMealAllowance"],
	["AQ", "Sportsfest OT", "sportsfestOt"],
	["AR", "Fringe Benefit", "fringeBenefit"],
	["AS", "Annual Incentive", "annualIncentive"],
	["AT", "Technical Skills Allowance", "technicalSkillsAllowance"],
	["AU", "ACL/VL Conversion Taxable", "aclVlConversionTaxable"],
	["AV", "Adjustment Overused Leave", "adjustmentOverusedLeave"],
	["AW", "13th Month Adjustment", "thirteenthMonthAdjustment"],
	["AX", "Production Incentives", "productionIncentives"],
	["AY", "Other Compensation", "otherCompensation"],
	["AZ", "Adjustment Basic", "adjustmentBasic"],
	["BA", "Adjustment OT/ND", "adjustmentOtNd"],
	["BB", "Adjustment Non-Tax", "adjustmentNonTax"],
	["BC", "Excess Deduction", "excessDeduction"],
	["BD", "De Minimis Allowance", "deMinimisAllowance"],
	["BE", "Christmas Gift (Kid)", "christmasGiftKid"],
	["BF", "Birthday Gift (Kid)", "birthdayGiftKid"],
	["BG", "Birthday Gift (Employee)", "birthdayGiftEmployee"],
	["BH", "GrossPay", "grossPay"],
	["BI", "W/Tax", "taxAmount"],
	["BJ", "FBTax", "fringeBenefitTax"],
	["BK", "SSS Cont", "sssContribution"],
	["BL", "PhilHealth", "philHealthContribution"],
	["BM", "Pagibig", "pagibigContribution"],
	["BN", "SSS Emergency Loan", "sssEmergencyLoan"],
	["BO", "PHEALTH CONTRI Adjustment", "philHealthContributionAdjustment"],
	["BP", "Excess Internet Usage", "excessInternetUsage"],
	["BQ", "Tax Payable", "taxPayable"],
	["BR", "Adjustment Basic Deduction", "adjustmentBasicDeduction"],
	["BS", "Excess ML Benefits", "excessMlBenefits"],
	["BT", "Uniform Deduction", "uniformDeduction"],
	["BU", "SSS Loan Restructuring Program", "sssLoanRestructuringProgram"],
	["BV", "PHIC 1% DIFFERENTIAL", "phicOnePercentDifferential"],
	["BW", "Modified HDMF 2", "modifiedHdmf2"],
	["BX", "Community Tax Certificate", "communityTaxCertificate"],
	["BY", "HDMF Contribution Adjustment", "hdmfContributionAdjustment"],
	["BZ", "Personal Calls Usage", "personalCallsUsage"],
	["CA", "Health Insurance", "healthInsurance"],
	["CB", "Shuttle Service", "shuttleService"],
	["CC", "Negative Adjustment", "negativeAdjustment"],
	["CD", "BNPI Emergency Loan", "bnpiEmergencyLoan"],
	["CE", "BNPI Salary Loan", "bnpiSalaryLoan"],
	["CF", "RCBC Loan", "rcbcLoan"],
	["CG", "HDMF Calamity Loan", "hdmfCalamityLoan"],
	["CH", "HDMF Salary Loan", "hdmfSalaryLoan"],
	["CI", "SSS Calamity Loan", "sssCalamityLoan"],
	["CJ", "SSS Salary Loan", "sssSalaryLoan"],
	["CK", "TOTAL DEDN", "totalDeductions"],
	["CL", "NetPay", "netPay"],
	["CM", "Adjustment Holiday Pay", "adjustmentHolidayPay"],
	["CN", "Community Tax Cert", "communityTaxCert"],
	["CO", "1K Christmas Gift", "oneKChristmasGift"],
	["CP", "Tax Refund", "taxRefund"],
	["CQ", "13th Month", "thirteenthMonthPay"],
	["CR", "ACL/VL Conversion", "aclVlConversion"],
	["CS", "OT Meal Allowance", "otMealAllowance"],
	["CT", "Perfect Attendance", "perfectAttendance"],
	["CU", "Meal Allowance", "mealAllowance"],
	["CV", "Line Leader Allowance", "lineLeaderAllowance"],
	["CW", "TotalReceivable", "totalReceivable"],
] as const;

export function resolveBandaiApprovedBucketRateBasis(params: {
	periodBasic: number;
	sourceRegularDays: number;
}) {
	const periodBasic = Number(params.periodBasic || 0);
	const sourceRegularDays = Number(params.sourceRegularDays || 0);
	const sourceDailyRate = sourceRegularDays > 0 ? periodBasic / sourceRegularDays : 0;
	const useSourceDailyRate =
		sourceDailyRate > 0 && sourceDailyRate <= BANDAI_SOURCE_DAILY_RATE_MAX;
	const dailyRate = useSourceDailyRate
		? sourceDailyRate
		: (periodBasic * 24) / BANDAI_DIRECT_ANNUAL_WORK_DAYS;
	const hourlyRate = dailyRate / BANDAI_WORKING_HOURS_PER_DAY;

	return {
		method: useSourceDailyRate
			? "BANDAI_SOURCE_DAILY_APPROVED_BUCKETS"
			: "BNPI_DIRECT_313_APPROVED_BUCKETS",
		sourceRegularDays: roundToCentavo(sourceRegularDays),
		sourceDailyRate: roundToCentavo(sourceDailyRate),
		useSourceDailyRate,
		annualWorkDays: BANDAI_DIRECT_ANNUAL_WORK_DAYS,
		workingHoursPerDay: BANDAI_WORKING_HOURS_PER_DAY,
		exactDailyRate: dailyRate,
		exactHourlyRate: hourlyRate,
		dailyRate: roundToCentavo(dailyRate),
		hourlyRate: roundToCentavo(hourlyRate),
	};
}

/**
 * Daily rate for absent + shortfall (late/EO) deductions.
 *
 * BNPI register prices these with monthly × 12 / 313 (not periodBasic / workdays-in-cutoff).
 * When Bandai approved OT buckets are present, use that 313 basis and 8 working hours/day
 * so UT/Late and Absent-Amt match the legacy register. Otherwise keep cutoff work-day divisor.
 */
export function resolveBnpiAttendanceDailyRate(params: {
	periodBasic: number;
	estimatedMonthlyRate: number;
	totalWorkDays: number;
	/** True when employee has Bandai approved OT/attendance buckets for the period. */
	useBnpi313: boolean;
	/** Schedule-derived hours (may be 7.5); ignored for BNPI 313 peso rates. */
	scheduleWorkingHoursPerDay?: number;
}): {
	dailyRate: number;
	hourlyRate: number;
	minuteRate: number;
	workingHoursPerDay: number;
	method: "BNPI_DIRECT_313_ATTENDANCE" | "TIMESHEET_PERIOD_WORK_DAYS" | "NONE";
} {
	const periodBasic = Number(params.periodBasic || 0);
	const estimatedMonthlyRate = Number(params.estimatedMonthlyRate || 0);
	const totalWorkDays = Number(params.totalWorkDays || 0);
	const scheduleHours = Number(params.scheduleWorkingHoursPerDay || BANDAI_WORKING_HOURS_PER_DAY);

	if (params.useBnpi313 && estimatedMonthlyRate > 0) {
		const dailyRate = (estimatedMonthlyRate * 12) / BANDAI_DIRECT_ANNUAL_WORK_DAYS;
		const workingHoursPerDay = BANDAI_WORKING_HOURS_PER_DAY;
		const hourlyRate = dailyRate / workingHoursPerDay;
		return {
			dailyRate,
			hourlyRate,
			minuteRate: hourlyRate / 60,
			workingHoursPerDay,
			method: "BNPI_DIRECT_313_ATTENDANCE",
		};
	}

	if (totalWorkDays > 0 && periodBasic > 0) {
		const workingHoursPerDay =
			scheduleHours > 0 ? scheduleHours : BANDAI_WORKING_HOURS_PER_DAY;
		const dailyRate = periodBasic / totalWorkDays;
		const hourlyRate = dailyRate / workingHoursPerDay;
		return {
			dailyRate,
			hourlyRate,
			minuteRate: hourlyRate / 60,
			workingHoursPerDay,
			method: "TIMESHEET_PERIOD_WORK_DAYS",
		};
	}

	return {
		dailyRate: 0,
		hourlyRate: 0,
		minuteRate: 0,
		workingHoursPerDay: BANDAI_WORKING_HOURS_PER_DAY,
		method: "NONE",
	};
}

type PayrollTimesheetScope = {
	departmentId?: string | null;
	sectionId?: string | null;
};

function normalizePayrollScope(options?: PayrollTimesheetScope): PayrollTimesheetScope {
	const departmentId = typeof options?.departmentId === "string" ? options.departmentId.trim() : "";
	const sectionId = typeof options?.sectionId === "string" ? options.sectionId.trim() : "";
	return {
		departmentId: departmentId && departmentId !== "all" ? departmentId : null,
		sectionId: sectionId && sectionId !== "all" ? sectionId : null,
	};
}

async function findPayrollTimesheetCandidateIds(
	prisma: PrismaClient,
	params: {
		payrollPeriodId: string;
		organizationId: string;
		payFrequency?: PayFrequency | null;
		scope?: PayrollTimesheetScope;
	},
): Promise<string[]> {
	const scope = normalizePayrollScope(params.scope);
	const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
		SELECT t.id
		FROM timesheets t
		INNER JOIN employees e ON e.id = t."employeeId"
		WHERE t."payrollPeriodId" = ${params.payrollPeriodId}
			AND t."organizationId" = ${params.organizationId}
			AND t.status = 'APPROVED'::"TimesheetStatus"
			AND t."isDeleted" = false
			AND e."isDeleted" = false
			AND e."workforceSource" = 'DIRECT'::"WorkforceSource"
			${params.payFrequency ? Prisma.sql`AND e."payFrequency" = ${params.payFrequency}::"PayFrequency"` : Prisma.empty}
			${scope.departmentId ? Prisma.sql`AND e."departmentId" = ${scope.departmentId}` : Prisma.empty}
			${scope.sectionId ? Prisma.sql`AND e."sectionId" = ${scope.sectionId}` : Prisma.empty}
		ORDER BY t."employeeId" ASC, t.id ASC
	`);
	return rows.map((row) => row.id);
}

function shouldUseOrdinaryRateFromApprovedSource(day: any): boolean {
	const repair = asRecord(day?.metadata?.bandaiPayrollSourceRepair);
	const approvedBuckets = asRecord(repair.approvedBuckets);
	if (!approvedBuckets || Object.keys(approvedBuckets).length === 0) return false;
	const regularDays = Number(approvedBuckets.regularDays || 0);
	const premiumHours =
		Number(approvedBuckets.spclHrs || 0) +
		Number(approvedBuckets.spclOtHrs || 0) +
		Number(approvedBuckets.rholHrs || 0) +
		Number(approvedBuckets.rholOtHrs || 0) +
		Number(approvedBuckets.rdHrs || 0) +
		Number(approvedBuckets.rdOtHrs || 0);
	return regularDays > 0 && premiumHours === 0;
}

function numberFromApprovedBucket(value: unknown): number {
	const parsed = Number(value || 0);
	return Number.isFinite(parsed) ? parsed : 0;
}

function getBandaiApprovedBuckets(day: any): Record<string, any> | null {
	const repair = asRecord(day?.metadata?.bandaiPayrollSourceRepair);
	const approvedBuckets = asRecord(repair.approvedBuckets);
	return Object.keys(approvedBuckets).length ? approvedBuckets : null;
}

function calculateBandaiApprovedBucketPay(days: any[], periodBasic: number) {
	if (!(periodBasic > 0)) return null;

	const totals = {
		regularDays: 0,
		regOtHrs: 0,
		rdHrs: 0,
		rdOtHrs: 0,
		spclHrs: 0,
		spclOtHrs: 0,
		rholHrs: 0,
		rholOtHrs: 0,
		regNdHrs: 0,
		nightDiffPayAmount: 0,
	};
	let sourceDayCount = 0;

	for (const day of days) {
		const bucket = getBandaiApprovedBuckets(day);
		if (!bucket) continue;
		sourceDayCount += 1;
		totals.regularDays += numberFromApprovedBucket(bucket.regularDays);
		totals.regOtHrs += numberFromApprovedBucket(bucket.regOtHrs);
		totals.rdHrs += numberFromApprovedBucket(bucket.rdHrs);
		totals.rdOtHrs += numberFromApprovedBucket(bucket.rdOtHrs);
		totals.spclHrs += numberFromApprovedBucket(bucket.spclHrs);
		totals.spclOtHrs += numberFromApprovedBucket(bucket.spclOtHrs);
		totals.rholHrs += numberFromApprovedBucket(bucket.rholHrs);
		totals.rholOtHrs += numberFromApprovedBucket(bucket.rholOtHrs);
		totals.regNdHrs += numberFromApprovedBucket(bucket.regNdHrs);
		totals.nightDiffPayAmount += numberFromApprovedBucket(bucket.nightDiffPayAmount);
	}

	if (!sourceDayCount) return null;

	const rateBasis = resolveBandaiApprovedBucketRateBasis({
		periodBasic,
		sourceRegularDays: totals.regularDays,
	});
	const dailyRate = rateBasis.exactDailyRate;
	const hourlyRate = rateBasis.exactHourlyRate;
	const specialHolidayWorkMultiplier = rateBasis.useSourceDailyRate
		? BANDAI_APPROVED_BUCKET_MULTIPLIERS.specialHolidayFull
		: BANDAI_APPROVED_BUCKET_MULTIPLIERS.specialHolidayPremium;
	const overtimePay = roundToCentavo(
		totals.regOtHrs * hourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.regularOt,
	);
	const restDayPay = roundToCentavo(
		totals.rdHrs * hourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.restDay,
	);
	const restDayOtPay = roundToCentavo(
		totals.rdOtHrs * hourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.restDayOt,
	);
	const specialHolidayPay = roundToCentavo(
		totals.spclHrs * hourlyRate * specialHolidayWorkMultiplier +
			totals.spclOtHrs * hourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.specialHolidayOt,
	);
	const legalHolidayPay = roundToCentavo(
		totals.rholHrs * hourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.legalHoliday +
			totals.rholOtHrs * hourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.legalHolidayOt,
	);
	const sourceNightDiffPay = roundToCentavo(totals.nightDiffPayAmount);
	const nightDiffPay = sourceNightDiffPay > 0
		? sourceNightDiffPay
		: roundToCentavo(
			totals.regNdHrs * hourlyRate * BANDAI_APPROVED_BUCKET_MULTIPLIERS.nightDiffPremium,
		);
	const holidayPay = roundToCentavo(
		restDayPay + restDayOtPay + specialHolidayPay + legalHolidayPay,
	);

	return {
		source: "Timesheetline.metadata.bandaiPayrollSourceRepair.approvedBuckets",
		formula: rateBasis.method,
		sourceDayCount,
		sourceRegularDays: rateBasis.sourceRegularDays,
		sourceDailyRate: rateBasis.sourceDailyRate,
		dailyRate: rateBasis.dailyRate,
		hourlyRate: rateBasis.hourlyRate,
		annualWorkDays: rateBasis.annualWorkDays,
		workingHoursPerDay: rateBasis.workingHoursPerDay,
		specialHolidayWorkMultiplier,
		hours: totals,
		overtimePay,
		restDayPay,
		restDayOtPay,
		specialHolidayPay,
		legalHolidayPay,
		nightDiffPay,
		holidayPay,
	};
}

function calculateBandaiApprovedBucketDayPay(
	day: any,
	approvedBucketPay: ReturnType<typeof calculateBandaiApprovedBucketPay>,
	periodBasic: number,
) {
	const bucket = getBandaiApprovedBuckets(day);
	if (!bucket || !approvedBucketPay) return null;

	const hourlyRate = Number(approvedBucketPay.hourlyRate || 0);
	const sourceRegularDays = Number(approvedBucketPay.sourceRegularDays || 0);
	const regularDailyRate = sourceRegularDays > 0 ? periodBasic / sourceRegularDays : 0;
	const specialHolidayWorkMultiplier = Number(
		approvedBucketPay.specialHolidayWorkMultiplier ||
			BANDAI_APPROVED_BUCKET_MULTIPLIERS.specialHolidayPremium,
	);
	const regularPay = roundToCentavo(numberFromApprovedBucket(bucket.regularDays) * regularDailyRate);
	const overtimePay = roundToCentavo(
		numberFromApprovedBucket(bucket.regOtHrs) *
			hourlyRate *
			BANDAI_APPROVED_BUCKET_MULTIPLIERS.regularOt,
	);
	const restDayPay = roundToCentavo(
		numberFromApprovedBucket(bucket.rdHrs) *
			hourlyRate *
			BANDAI_APPROVED_BUCKET_MULTIPLIERS.restDay,
	);
	const restDayOtPay = roundToCentavo(
		numberFromApprovedBucket(bucket.rdOtHrs) *
			hourlyRate *
			BANDAI_APPROVED_BUCKET_MULTIPLIERS.restDayOt,
	);
	const specialHolidayPay = roundToCentavo(
		numberFromApprovedBucket(bucket.spclHrs) * hourlyRate * specialHolidayWorkMultiplier +
			numberFromApprovedBucket(bucket.spclOtHrs) *
				hourlyRate *
				BANDAI_APPROVED_BUCKET_MULTIPLIERS.specialHolidayOt,
	);
	const legalHolidayPay = roundToCentavo(
		numberFromApprovedBucket(bucket.rholHrs) *
			hourlyRate *
			BANDAI_APPROVED_BUCKET_MULTIPLIERS.legalHoliday +
			numberFromApprovedBucket(bucket.rholOtHrs) *
				hourlyRate *
				BANDAI_APPROVED_BUCKET_MULTIPLIERS.legalHolidayOt,
	);
	const sourceNightDiffPay = roundToCentavo(numberFromApprovedBucket(bucket.nightDiffPayAmount));
	const nightDiffPay =
		sourceNightDiffPay > 0
			? sourceNightDiffPay
			: roundToCentavo(
					numberFromApprovedBucket(bucket.regNdHrs) *
						hourlyRate *
						BANDAI_APPROVED_BUCKET_MULTIPLIERS.nightDiffPremium,
				);
	const holidayPay = roundToCentavo(
		restDayPay + restDayOtPay + specialHolidayPay + legalHolidayPay,
	);

	return {
		source: approvedBucketPay.source,
		formula: approvedBucketPay.formula,
		hours: bucket,
		regularPay,
		overtimePay,
		nightDiffPay,
		holidayPay,
		restDayPay,
		restDayOtPay,
		specialHolidayPay,
		legalHolidayPay,
		regularDailyRate: roundToCentavo(regularDailyRate),
		premiumHourlyRate: roundToCentavo(hourlyRate),
	};
}

/**
 * Convert time string in "HH:MM" format to decimal hours
 * @param timeString - Time in "HH:MM" format (e.g., "8:30")
 * @returns Decimal hours (e.g., 8.5)
 */
export function convertTimeToDecimal(timeString: string | null | undefined): number {
	if (!timeString) return 0;

	const [hours, minutes] = timeString.split(":").map(Number);
	if (isNaN(hours) || isNaN(minutes)) return 0;

	return hours + minutes / 60;
}

export function applyZeroSalaryGuardrail(
	grossPayWithSources: number,
	loanDeductions: number,
	deductionBenefits: number,
): { guardedLoanDeductions: number; guardedDeductionBenefits: number; applied: boolean } {
	const applied = grossPayWithSources <= 0;
	return {
		guardedLoanDeductions: applied ? 0 : loanDeductions,
		guardedDeductionBenefits: applied ? 0 : deductionBenefits,
		applied,
	};
}

/**
 * Get date key in YYYY-MM-DD format from a Date object
 * Uses the local date components to avoid timezone issues
 * @param date - Date object
 * @returns Date string in YYYY-MM-DD format
 */
function getDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function formatMinutesAsTime(minutes: number): string {
	const safeMinutes = Math.max(0, Math.round(minutes));
	const hours = Math.floor(safeMinutes / 60);
	const mins = safeMinutes % 60;
	return `${hours}:${mins.toString().padStart(2, "0")}`;
}

function timeToMinutes(timeStr: string): number {
	if (!timeStr) return 0;
	const [hours, minutes] = timeStr.split(":").map(Number);
	return hours * 60 + minutes;
}

function parseDurationToMinutes(value?: string | null): number {
	if (!value || typeof value !== "string" || !value.includes(":")) return 0;
	const [hours, minutes] = value.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours * 60 + minutes;
}

function getTimesheetReportingBreakdown(timesheet: any): any[] {
	const lines = Array.isArray(timesheet?.timesheetlines) ? timesheet.timesheetlines : [];
	if (lines.length) {
		return buildBreakdownFromTimesheetLines(lines);
	}
	return [];
}

function resolveContributionSchedule(params: {
	payFrequency?: string | null;
	periodNumber?: number | null;
	payrollPeriodMetadata?: unknown;
}): { splitFactor: number; method: string } {
	const payFrequency = params.payFrequency || "";
	const periodNumber = params.periodNumber || 1;
	const metadata = asRecord(params.payrollPeriodMetadata);
	const schedule = asRecord(metadata.statutoryContributionSchedule || metadata.contributionSchedule);
	const configuredFactor = schedule[`period${periodNumber}`] ?? schedule[String(periodNumber)];

	if (typeof configuredFactor === "number" && configuredFactor >= 0) {
		return {
			splitFactor: configuredFactor,
			method: "PAYROLL_PERIOD_METADATA",
		};
	}

	if (payFrequency === "SEMI_MONTHLY") {
		return {
			splitFactor: periodNumber === 1 ? 1 : 0,
			method: "BNPI_FIRST_CUTOFF_FULL_SECOND_CUTOFF_NONE",
		};
	}

	return {
		splitFactor: 1,
		method: "FULL_PERIOD_CONTRIBUTION",
	};
}

/**
 * Convert JavaScript day-of-week to schedule array index
 * JavaScript: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
 * Schedule: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
 * @param jsDayOfWeek - JavaScript day of week (0-6)
 * @returns Schedule array index (0-6)
 */
function getScheduleIndex(jsDayOfWeek: number): number {
	return sharedGetScheduleIndex(jsDayOfWeek);
}

/**
 * Get schedule boundaries (earliest start and latest end time) from employee schedule
 * @param schedule - Employee schedule with shifts
 * @param dayOfWeek - Day of week (0 = Sunday, 6 = Saturday) - JavaScript format
 * @returns Schedule boundaries or null if no valid schedule
 */
function getScheduleBoundaries(
	schedule: any,
	dayOfWeek: number,
): { startTime: string; endTime: string; scheduledMinutes: number } | null {
	return sharedGetScheduleBoundaries(schedule, dayOfWeek);
}

/**
 * Determine the day type based on status and metadata
 * @param dayStatus - Day status (PRESENT, ABSENT, REST_DAY, LEAVE, etc.)
 * @param dayMetadata - Optional metadata with holiday info
 * @param isRestDay - Whether this is a scheduled rest day
 * @returns Day type for rate calculation
 */
function getDayType(
	dayStatus: string | null,
	dayMetadata: any = null,
	isRestDay: boolean = false,
): string {
	// Check if it's a holiday from metadata
	// Holiday types from CalendarItem: "regular", "special-non-working", "special-working"
	const holidayType = dayMetadata?.holidayType;

	// Check for double holiday (both regular and special)
	if (dayMetadata?.isDoubleHoliday) {
		return isRestDay ? "doubleHolidayOnRestDay" : "doubleHoliday";
	}

	// Regular holiday
	if (holidayType === "regular") {
		return isRestDay ? "regularHolidayOnRestDay" : "regularHoliday";
	}

	// Special non-working holiday
	if (holidayType === "special-non-working") {
		return isRestDay ? "specialHolidayOnRestDay" : "restDayOrSpecialHoliday";
	}

	// Special working holiday (treated as rest day rate according to DOLE)
	if (holidayType === "special-working") {
		return isRestDay ? "specialHolidayOnRestDay" : "restDayOrSpecialHoliday";
	}

	// Rest day (non-holiday)
	if (isRestDay || dayStatus === "REST_DAY") {
		return "restDayOrSpecialHoliday";
	}

	// Default to ordinary day
	return "ordinaryDay";
}

/**
 * Get rate multiplier for a specific scenario
 * @param rateMultipliers - Calculator rate multipliers
 * @param dayType - Type of day (ordinaryDay, regularHoliday, etc.)
 * @param payType - Type of pay (work, ot, nd, ndot)
 * @returns Rate multiplier or null if not configured
 */
function getRateMultiplier(
	rateMultipliers: any,
	dayType: string,
	payType: "work" | "ot" | "nd" | "ndot",
): number | null {
	if (!rateMultipliers || !rateMultipliers[dayType]) {
		return null;
	}

	return rateMultipliers[dayType][payType] || null;
}

/**
 * Calculate night differential hours from time range
 * Night shift is defined as work between 10 PM (22:00) and 6 AM (06:00)
 * @param timeIn - Clock in time (DateTime)
 * @param timeOut - Clock out time (DateTime)
 * @returns Night differential hours
 */
function calculateNightDiffHours(
	timeIn: Date | null,
	timeOut: Date | null,
	timeZone: string = "Asia/Manila",
): number {
	if (!timeIn || !timeOut) return 0;

	const NIGHT_START_HOUR = 22; // 10 PM
	const NIGHT_END_HOUR = 6; // 6 AM

	let totalNightMinutes = 0;

	// Interpret timestamps in payroll timezone (not server timezone) so UTC-stored
	// day shifts like 00:00Z-09:00Z are treated as 08:00-17:00 in Asia/Manila.
	const toTimeZoneDate = (value: Date) =>
		new Date(
			value.toLocaleString("en-US", {
				timeZone,
			}),
		);

	const start = toTimeZoneDate(new Date(timeIn));
	const end = toTimeZoneDate(new Date(timeOut));

	// Handle work spanning multiple days
	let currentCheck = new Date(start);
	while (currentCheck < end) {
		const hour = currentCheck.getHours();

		// Check if current hour falls within night shift (10 PM - 6 AM)
		const isNightShift = hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;

		if (isNightShift) {
			// Calculate minutes worked in this hour
			const nextHour = new Date(currentCheck);
			nextHour.setHours(currentCheck.getHours() + 1, 0, 0, 0);

			const periodEnd = nextHour > end ? end : nextHour;
			const minutesWorked = (periodEnd.getTime() - currentCheck.getTime()) / (1000 * 60);
			totalNightMinutes += minutesWorked;
		}

		// Move to next hour
		currentCheck.setHours(currentCheck.getHours() + 1, 0, 0, 0);
	}

	return totalNightMinutes / 60; // Convert to hours
}

function getManilaMinutes(t: string | Date): number {
	try {
		const date = new Date(t);
		const str = date.toLocaleTimeString("en-US", {
			timeZone: "Asia/Manila",
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
		});
		const [h, m] = str.split(":").map(Number);
		return h * 60 + m;
	} catch {
		return 0;
	}
}

function normalizeActualMinutesForSchedule(
	actualMinutes: number,
	scheduledStartMinutes: number,
	isOvernight: boolean,
): number {
	const HALF_DAY_MINUTES = 12 * 60;
	if (
		isOvernight &&
		actualMinutes < scheduledStartMinutes &&
		scheduledStartMinutes - actualMinutes > HALF_DAY_MINUTES
	) {
		return actualMinutes + 24 * 60;
	}
	return actualMinutes;
}

function calculateBreakMinutesFromScheduleSnapshot(schedule: any): number {
	const timeSlots = Array.isArray(schedule?.timeSlots) ? schedule.timeSlots : [];
	return timeSlots
		.filter((slot: any) => slot?.type === "break" && slot?.startTime && slot?.endTime)
		.reduce((total: number, slot: any) => {
			let startMinutes = timeToMinutes(slot.startTime);
			let endMinutes = timeToMinutes(slot.endTime);
			if (endMinutes <= startMinutes) endMinutes += 24 * 60;
			return total + (endMinutes - startMinutes);
		}, 0);
}

function isOvernightSchedule(
	schedule: any,
	scheduleBoundaries?: { startTime: string; endTime: string; scheduledMinutes: number } | null,
): boolean {
	if (Boolean(schedule?.isOvernight)) return true;
	if (!scheduleBoundaries?.startTime || !scheduleBoundaries?.endTime) return false;
	return timeToMinutes(scheduleBoundaries.endTime) <= timeToMinutes(scheduleBoundaries.startTime);
}

function buildPayrollDayTypeDisplay(params: {
	status?: string | null;
	isOvernight?: boolean;
	holidayInfo?: any;
	isRestDay: boolean;
	hoursWorked?: string | null;
}): string {
	const { status, holidayInfo, isRestDay, isOvernight } = params;
	const workedMinutes = parseDurationToMinutes(params.hoursWorked);
	const isWorkedDay = workedMinutes > 0 || status === "PRESENT";

	if (isOvernight && isWorkedDay) return "Night Shift";
	if (holidayInfo && isWorkedDay) return "Holiday";
	if (holidayInfo && (isRestDay || status === "REST_DAY")) return "Rest Day";
	if (isRestDay || status === "REST_DAY") return isWorkedDay ? "Rest Day Worked" : "Rest Day";
	if (status === "LEAVE") return "Leave";
	if (status === "ABSENT") return "Absent";
	return "Regular Work Day";
}

function getPayrollEffectiveDayStatus(day: any, holidayInfo?: any): string {
	const status = String(day?.status || "").toUpperCase();
	const primaryMarker = String(day?.primaryMarker || day?.metadata?.primaryMarker || "").toUpperCase();
	const holidayEntries = Array.isArray(day?.holidayEntries)
		? day.holidayEntries
		: Array.isArray(day?.metadata?.holidayEntries)
			? day.metadata.holidayEntries
			: [];
	const leaveEntries = Array.isArray(day?.leaveEntries)
		? day.leaveEntries
		: Array.isArray(day?.metadata?.leaveEntries)
			? day.metadata.leaveEntries
			: [];

	if (primaryMarker === "HOLIDAY" || holidayInfo || holidayEntries.length > 0) {
		return status === "PRESENT" || status === "INCOMPLETE" ? "PRESENT" : "HOLIDAY";
	}
	if (primaryMarker === "LEAVE" || status === "LEAVE" || leaveEntries.length > 0 || day?.leaveType) {
		return "LEAVE";
	}
	if (primaryMarker === "REST_DAY" || status === "REST_DAY") {
		return "REST_DAY";
	}
	if (primaryMarker === "ABSENT" || status === "ABSENT" || status === "NOT_CLOCKED_IN") {
		return "ABSENT";
	}
	return status || "PRESENT";
}

function buildPeriodScheduleWeeks(params: {
	periodStart: Date | string;
	periodEnd: Date | string;
	validatedDays: any[];
	employee: any;
}) {
	const { periodStart, periodEnd, validatedDays, employee } = params;
	const start = new Date(periodStart);
	const end = new Date(periodEnd);
	const daysByKey = new Map<string, any>();

	for (const day of validatedDays) {
		daysByKey.set(getDateKey(new Date(day.date)), day);
	}

	const weeks = new Map<
		string,
		{
			weekStart: string;
			weekEnd: string;
			totalHours: number;
			days: any[];
		}
	>();

	for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
		const current = new Date(cursor);
		const dateKey = getDateKey(current);
		const existingDay = daysByKey.get(dateKey);
		const resolvedSchedule =
			existingDay?.scheduleSnapshot ||
			resolveEffectiveShiftFromEmployeeData(employee, current, new Map()) ||
			null;
		const scheduleBoundaries = getScheduleBoundaries(resolvedSchedule, current.getDay());
		const isOvernight = isOvernightSchedule(resolvedSchedule, scheduleBoundaries);
		const isRestDay =
			existingDay?.status === "REST_DAY" || !scheduleBoundaries || Boolean(resolvedSchedule?.isOff);
		const dayTypeDisplay = buildPayrollDayTypeDisplay({
			status: existingDay?.status || (isRestDay ? "REST_DAY" : "PRESENT"),
			isOvernight,
			holidayInfo: existingDay?.holidayInfo || null,
			isRestDay,
			hoursWorked: existingDay?.hoursWorked || "0:00",
		});

		const weekStart = new Date(current);
		const dayOfWeek = current.getDay();
		const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
		weekStart.setDate(current.getDate() + diff);
		const weekEnd = new Date(weekStart);
		weekEnd.setDate(weekStart.getDate() + 6);
		const weekKey = getDateKey(weekStart);

		if (!weeks.has(weekKey)) {
			weeks.set(weekKey, {
				weekStart: getDateKey(weekStart),
				weekEnd: getDateKey(weekEnd),
				totalHours: 0,
				days: [],
			});
		}

		const week = weeks.get(weekKey)!;
		const shiftHours = scheduleBoundaries?.scheduledMinutes
			? roundToCentavo(scheduleBoundaries.scheduledMinutes / 60)
			: 0;
		const breakMinutes =
			Number(resolvedSchedule?.breakMinutes) || calculateBreakMinutesFromScheduleSnapshot(resolvedSchedule);

		week.days.push({
			date: dateKey,
			weekday: current.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
			startTime: scheduleBoundaries?.startTime || null,
			endTime: scheduleBoundaries?.endTime || null,
			hours: shiftHours,
			breakMinutes,
			isRestDay,
			isOvernight,
			shiftTypeName:
				resolvedSchedule?.shiftTypeName || resolvedSchedule?.shiftTypeCode || null,
			timeSlots: Array.isArray(resolvedSchedule?.timeSlots) ? resolvedSchedule.timeSlots : [],
			dayTypeDisplay,
		});

		if (!isRestDay) {
			week.totalHours += shiftHours;
		}
	}

	return Array.from(weeks.values()).map((week) => ({
		...week,
		totalHours: roundToCentavo(week.totalHours),
	}));
}

function validatePayrollBreakdownDays(params: {
	breakdown: any[] | null | undefined;
	employee: any;
	holidayMap: Map<string, any>;
}) {
	const { breakdown, employee, holidayMap } = params;
	let totalValidOvertimeMinutes = 0;
	let totalValidLateMinutes = 0;
	let totalValidEarlyOutMinutes = 0;
	const validatedDays: any[] = [];

	if (!breakdown || !Array.isArray(breakdown)) {
		return {
			totalValidOvertimeMinutes,
			totalValidLateMinutes,
			totalValidEarlyOutMinutes,
			validatedDays,
		};
	}

	for (const d of breakdown) {
		const day = d as any;
		const dayDate = new Date(day.date);
		const daySchedule =
			day.scheduleSnapshot ||
			resolveEffectiveShiftFromEmployeeData(employee, dayDate, new Map()) ||
			resolveEmployeeActiveSchedule(employee);
		const scheduleBoundaries = getScheduleBoundaries(daySchedule, dayDate.getDay());
		const isOvernight = isOvernightSchedule(daySchedule, scheduleBoundaries);
		const dateKey = getDateKey(dayDate);
		const holidayInfo = holidayMap.get(dateKey);
		const effectiveStatus = getPayrollEffectiveDayStatus(day, holidayInfo);
		const isRestDay = effectiveStatus === "REST_DAY" || !scheduleBoundaries;

		let dayOvertimeMinutes = 0;
		let strictLateMinutes = 0;
		let strictEarlyOutMinutes = 0;
		let rawLateMinutes = 0;
		let rawEarlyOutMinutes = 0;
		let withinGrace = false;

		const hasStoredDurationMetrics =
			typeof day.overtimeHours === "string" &&
			typeof day.lateHours === "string" &&
			typeof day.earlyOutHours === "string";

		if (hasStoredDurationMetrics) {
			dayOvertimeMinutes = parseDurationToMinutes(day.overtimeHours);
			strictLateMinutes = parseDurationToMinutes(day.lateHours);
			strictEarlyOutMinutes = parseDurationToMinutes(day.earlyOutHours);
			rawLateMinutes = Number(day.metadata?.rawLateMinutes ?? strictLateMinutes) || 0;
			rawEarlyOutMinutes =
				Number(day.metadata?.rawEarlyOutMinutes ?? strictEarlyOutMinutes) || 0;
			withinGrace = rawLateMinutes > 0 && strictLateMinutes === 0;
		} else if (day.timeIn && day.timeOut && scheduleBoundaries) {
			const [sh, sm] = scheduleBoundaries.startTime.split(":").map(Number);
			const [eh, em] = scheduleBoundaries.endTime.split(":").map(Number);
			const schStartMins = sh * 60 + sm;
			let schEndMins = eh * 60 + em;
			const overnight =
				timeToMinutes(scheduleBoundaries.endTime) <= timeToMinutes(scheduleBoundaries.startTime);
			if (overnight && schEndMins <= schStartMins) {
				schEndMins += 24 * 60;
			}

			const actualStartMins = normalizeActualMinutesForSchedule(
				getManilaMinutes(day.timeIn),
				schStartMins,
				overnight,
			);
			const actualEndMins = normalizeActualMinutesForSchedule(
				getManilaMinutes(day.timeOut),
				schStartMins,
				overnight,
			);

			const gracePeriodMinutes = Math.max(
				0,
				Number(
					daySchedule?.graceLateMinutes ??
						daySchedule?.gracePeriodMinutes ??
						day.metadata?.gracePeriodMinutes ??
						0,
				),
			);
			const graceEarlyOutMinutes = Math.max(
				0,
				Number(daySchedule?.graceEarlyOutMinutes ?? day.metadata?.graceEarlyOutMinutes ?? 0),
			);

			rawLateMinutes = Math.max(0, actualStartMins - schStartMins);
			rawEarlyOutMinutes = Math.max(0, schEndMins - actualEndMins);
			strictLateMinutes = Math.max(0, rawLateMinutes - gracePeriodMinutes);
			strictEarlyOutMinutes = Math.max(0, rawEarlyOutMinutes - graceEarlyOutMinutes);
			dayOvertimeMinutes = Math.max(0, actualEndMins - schEndMins);
			withinGrace = rawLateMinutes > 0 && strictLateMinutes === 0;
		} else if (day.timeIn && day.timeOut && daySchedule) {
			const strict = calculateStrictScheduleMetrics({
				timeIn: day.timeIn,
				timeOut: day.timeOut,
				schedule: daySchedule,
				dayDate,
			});
			dayOvertimeMinutes = strict.overtimeMinutes || 0;
			strictLateMinutes = strict.lateMinutes || 0;
			strictEarlyOutMinutes = strict.earlyOutMinutes || 0;
			rawLateMinutes = Number(day.metadata?.rawLateMinutes ?? strictLateMinutes) || 0;
			rawEarlyOutMinutes =
				Number(day.metadata?.rawEarlyOutMinutes ?? strictEarlyOutMinutes) || 0;
			withinGrace = rawLateMinutes > 0 && strictLateMinutes === 0;
		} else {
			dayOvertimeMinutes = day.metadata?.overtimeMinutes || 0;
			strictLateMinutes = day.metadata?.lateMinutes || 0;
			strictEarlyOutMinutes = day.metadata?.earlyOutMinutes || 0;
			rawLateMinutes = day.metadata?.rawLateMinutes || strictLateMinutes;
			rawEarlyOutMinutes = day.metadata?.rawEarlyOutMinutes || strictEarlyOutMinutes;
			withinGrace = Boolean(day.metadata?.withinGrace);
		}

		const dayTypeDisplay = buildPayrollDayTypeDisplay({
			status: effectiveStatus,
			isOvernight,
			holidayInfo,
			isRestDay,
			hoursWorked: day.hoursWorked || "0:00",
		});

		validatedDays.push({
			...day,
			status: effectiveStatus,
			scheduleSnapshot: daySchedule || null,
			validOvertimeMinutes: dayOvertimeMinutes,
			strictLateMinutes,
			strictEarlyOutMinutes,
			rawLateMinutes,
			rawEarlyOutMinutes,
			withinGrace,
			holidayInfo,
			isRestDay,
			dayTypeDisplay,
		});

		totalValidOvertimeMinutes += dayOvertimeMinutes;
		totalValidLateMinutes += strictLateMinutes;
		totalValidEarlyOutMinutes += strictEarlyOutMinutes;
	}

	return {
		totalValidOvertimeMinutes,
		totalValidLateMinutes,
		totalValidEarlyOutMinutes,
		validatedDays,
	};
}

export async function resolvePayrollTimesheetLockEmployeeId(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		processedBy?: string | null;
	},
): Promise<string | null> {
	const processedBy = String(params.processedBy || "").trim();
	if (!processedBy) return null;

	const employee = await prisma.employee.findFirst({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			OR: [{ id: processedBy }, { userId: processedBy }],
		},
		select: {
			id: true,
		},
	});

	if (!employee?.id) {
		payrollLogger.warn(
			`Payroll timesheet lock actor ${processedBy} did not resolve to an employee in organization ${params.organizationId}; locking without lockedBy`,
		);
		return null;
	}

	return employee.id;
}
/**
 * Generate employee payroll records from approved timesheets for a payroll period
 * @param prisma - Prisma client instance
 * @param payrollPeriodId - ID of the payroll period
 * @param organizationId - Organization ID
 * @param processedBy - User or employee ID who triggered the generation, when available
 * @returns Generation result with success/error counts and payroll details
 */
export async function generatePayrollFromTimesheets(
	prisma: PrismaClient,
	payrollPeriodId: string,
	organizationId: string,
	processedBy?: string | null,
	options?: {
		onStart?: (payload: { total: number }) => void;
		onProgress?: (payload: {
			processed: number;
			success: number;
			failed: number;
			employeeId?: string;
			error?: string;
		}) => void;
		shouldStop?: () => boolean | Promise<boolean>;
		shouldPause?: () => boolean | Promise<boolean>;
		resumeFromExistingPayrolls?: boolean;
		generationRunId?: string;
		departmentId?: string | null;
		sectionId?: string | null;
	},
) {
	payrollLogger.info(`Starting payroll generation for period: ${payrollPeriodId}`);

	// Fetch period/calculator first, then load only the scoped approved timesheet set.
	const payrollPeriodData: any = await prisma.payrollPeriod.findUnique({
		where: { id: payrollPeriodId },
		include: {
			calculator: true,
		},
	});

	if (!payrollPeriodData) {
		throw new Error(`Payroll period not found: ${payrollPeriodId}`);
	}

	// Validate calculator data
	if (!payrollPeriodData.calculator) {
		throw new Error(
			`No calculator configured for payroll period: ${payrollPeriodId}. Please assign a calculator to this payroll period.`,
		);
	}

	/**
	 * ? BACKEND DATA SOURCE
	 * All calculator configurations are fetched from the Calculator model in the database.
	 * These values were initially seeded from tax-calculator.helper.ts constants,
	 * but can now be modified through the admin interface.
	 *
	 * This ensures:
	 * - No hardcoded tax/contribution rates in the calculation logic
	 * - Rates can be updated without code changes
	 * - Different calculators can be used for different payroll periods
	 * - Full audit trail of which rates were used for each payroll run
	 */
	const calculator = payrollPeriodData.calculator;
	const taxRates = calculator.taxRates as any[]; // Tax brackets from backend
	const sssRates = calculator.sssRates as any; // SSS rates from backend
	const philHealthRates = calculator.philHealthRates as any; // PhilHealth rates from backend
	const pagibigRates = calculator.pagibigRates as any; // PAG-IBIG rates from backend
	const rateMultipliers = calculator.rateMultipliers as any; // Rate multipliers from backend

	payrollLogger.info(
		`Using calculator: ${calculator.name} (${calculator.code || calculator.id})`,
	);

	// Fetch holidays for the payroll period
	const holidays = await prisma.calendarItem.findMany({
		where: {
			organizationId,
			type: "HOLIDAY",
			status: "ACTIVE",
			startDate: {
				gte: payrollPeriodData.startDate,
				lte: payrollPeriodData.endDate,
			},
		},
		select: {
			startDate: true,
			endDate: true,
			title: true,
			metadata: true,
			tags: true,
		},
	});

	// Create a holiday lookup map by date (YYYY-MM-DD format)
	const holidayMap = new Map<string, any>();
	for (const holiday of holidays) {
		const dateKey = getDateKey(holiday.startDate);
		if (holidayMap.has(dateKey)) {
			// Handle double holidays (both regular and special on same day)
			const existing = holidayMap.get(dateKey);
			const existingType = (existing.metadata as any)?.holidayType;
			const newType = (holiday.metadata as any)?.holidayType;

			// Only mark as double holiday if we have a regular + special combination
			if (
				(existingType === "regular" &&
					(newType === "special-non-working" || newType === "special-working")) ||
				(newType === "regular" &&
					(existingType === "special-non-working" || existingType === "special-working"))
			) {
				holidayMap.set(dateKey, {
					hisDoubleHoliday: true,
					holidayType: "regular", // Primary type for double holiday
					holidayTitle: `${existing.holidayTitle} & ${holiday.title}`,
					metadata: existing.metadata,
					secondHolidayType: newType === "regular" ? existingType : newType,
				});
			}
		} else {
			holidayMap.set(dateKey, {
				holidayType: (holiday.metadata as any)?.holidayType,
				holidayTitle: holiday.title,
				isDoubleHoliday: false,
				metadata: holiday.metadata,
			});
		}
	}

	payrollLogger.info(
		`Found ${holidays.length} holiday occurrences for the payroll period (${holidayMap.size} unique dates)`,
	);

	// Debug: Log all holiday dates
	if (holidayMap.size > 0) {
		payrollLogger.debug(
			`Holiday dates: ${Array.from(holidayMap.keys())
				.map((key) => `${key} (${holidayMap.get(key)?.holidayTitle})`)
				.join(", ")}`,
		);
	}

	const scopedTimesheetIds = await findPayrollTimesheetCandidateIds(prisma, {
		payrollPeriodId,
		organizationId,
		payFrequency: payrollPeriodData.payFrequency || null,
		scope: {
			departmentId: options?.departmentId,
			sectionId: options?.sectionId,
		},
	});
	let timesheets = scopedTimesheetIds.length
		? await prisma.timesheet.findMany({
				where: {
					id: { in: scopedTimesheetIds },
				},
				include: {
					timesheetlines: {
						where: {
							isDeleted: false,
							isEffective: true,
						},
						orderBy: {
							date: "asc",
						},
					},
					employee: {
						select: {
							id: true,
							employeeId: true,
							basicSalary: true,
							payFrequency: true,
							embeddedSchedule: true,
							scheduleOverrides: {
								where: {
									isDeleted: false,
								},
								include: {
									shiftType: true,
								},
							},
							scheduleHistoryRecords: {
								orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
								select: {
									effectiveAt: true,
									createdAt: true,
									afterSchedule: true,
									beforeSchedule: true,
								},
							},
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
				orderBy: [{ employeeId: "asc" }, { id: "asc" }],
			})
		: [];

	payrollLogger.info(
		`Scoped payroll generation candidate timesheets for period ${payrollPeriodId}: ${timesheets.length}`,
	);

	const excludedTimesheets = timesheets.filter(
		(timesheet: any) => getPayrollGenerationExclusionReasons(timesheet.employee).length > 0,
	);
	if (excludedTimesheets.length > 0) {
		payrollLogger.warn(
			`Excluded ${excludedTimesheets.length} approved timesheet(s) from payroll generation because required payroll inputs are missing`,
		);
		timesheets = timesheets.filter(
			(timesheet: any) =>
				getPayrollGenerationExclusionReasons(timesheet.employee).length === 0,
		);
	}

	let resumeProcessedCount = 0;
	if (options?.resumeFromExistingPayrolls && timesheets.length > 0) {
		const existingPayrolls = await prisma.employeePayroll.findMany({
			where: {
				organizationId,
				payrollPeriodId,
				isDeleted: false,
			},
			select: {
				employeeId: true,
				isPaid: true,
				timesheetId: true,
				timesheet: {
					select: {
						lockedAt: true,
					},
				},
			},
		});
		const completedEmployeeIds = new Set(
			existingPayrolls
				.filter((payroll) => payroll.isPaid || payroll.timesheet?.lockedAt)
				.map((payroll) => payroll.employeeId),
		);
		const existingPayrollsNeedingTimesheetLock = existingPayrolls.filter(
			(payroll) => !payroll.isPaid && !payroll.timesheet?.lockedAt,
		);
		if (existingPayrollsNeedingTimesheetLock.length > 0) {
			payrollLogger.warn(
				`Payroll resume for period ${payrollPeriodId} found ${existingPayrollsNeedingTimesheetLock.length} unpaid payroll row(s) without a payroll-locked timesheet; these rows will be reprocessed to complete the lock boundary.`,
			);
		}
		resumeProcessedCount = timesheets.filter((timesheet: any) =>
			completedEmployeeIds.has(timesheet.employeeId),
		).length;
		if (resumeProcessedCount > 0) {
			timesheets = timesheets.filter(
				(timesheet: any) => !completedEmployeeIds.has(timesheet.employeeId),
			);
			payrollLogger.info(
				`Resuming payroll generation for period ${payrollPeriodId}: ${resumeProcessedCount} employee payroll record(s) already have completed payroll/timesheet locks`,
			);
		}
	}

	if (timesheets.length === 0) {
		options?.onStart?.({ total: resumeProcessedCount });
		if (resumeProcessedCount > 0) {
			return {
				success: true,
				message: `Payroll resume completed; ${resumeProcessedCount} employee payroll record(s) were already generated`,
				generated: resumeProcessedCount,
				errors: 0,
				payslipsGenerated: 0,
				payslipErrors: 0,
				total: resumeProcessedCount,
				payrolls: [],
			};
		}
		payrollLogger.warn(`No approved timesheets found for period: ${payrollPeriodId}`);
		return {
			success: false,
			message: payrollPeriodData.payFrequency
				? `No approved timesheets found for employees with ${payrollPeriodData.payFrequency} pay frequency`
				: "No approved timesheets found for this period",
			generated: 0,
			errors: 0,
			total: 0,
			payrolls: [],
		};
	}

	const timesheetLockEmployeeId = await resolvePayrollTimesheetLockEmployeeId(prisma, {
		organizationId,
		processedBy,
	});

	const generatedPayrolls = [];
	let successCount = resumeProcessedCount;
	let errorCount = 0;
	let lockedCount = 0;
	let payslipSuccessCount = 0;
	let payslipErrorCount = 0;
	let processedCount = resumeProcessedCount;
	let payrollCorrectionsAppliedCount = 0;

	options?.onStart?.({ total: timesheets.length + resumeProcessedCount });

	// Extract period information for tax calculation
	const periodNumber = payrollPeriodData.periodNumber || 1;
	const periodDate = new Date(payrollPeriodData.startDate);
	const year = periodDate.getFullYear();
	const month = periodDate.getMonth() + 1; // 1-12
	const payrollSourceAmountsByEmployeeId = await buildPayrollSourceAmountsByEmployeeId(prisma, {
		employeeIds: timesheets.map((timesheet: any) => timesheet.employeeId),
		organizationId,
		payrollPeriodId,
		startDate: payrollPeriodData.startDate,
		endDate: payrollPeriodData.endDate,
	});

	// 3. Process each timesheet and generate payroll
	for (const timesheet of timesheets) {
		if ((await options?.shouldStop?.()) === true) {
			payrollLogger.warn(
				`Payroll generation stop requested for period ${payrollPeriodId} after ${processedCount}/${timesheets.length + resumeProcessedCount} employees`,
			);
			return {
				success: false,
				cancelled: true,
				message: "Payroll generation stop requested",
				generated: successCount,
				errors: errorCount,
				locked: lockedCount,
				payslipsGenerated: payslipSuccessCount,
				payslipErrors: payslipErrorCount,
				total: timesheets.length + resumeProcessedCount,
				payrolls: generatedPayrolls,
			};
		}
		if ((await options?.shouldPause?.()) === true) {
			payrollLogger.warn(
				`Payroll generation pause requested for period ${payrollPeriodId} after ${processedCount}/${timesheets.length + resumeProcessedCount} employees`,
			);
			return {
				success: false,
				paused: true,
				message: "Payroll generation paused",
				generated: successCount,
				errors: errorCount,
				locked: lockedCount,
				payslipsGenerated: payslipSuccessCount,
				payslipErrors: payslipErrorCount,
				total: timesheets.length + resumeProcessedCount,
				payrolls: generatedPayrolls,
			};
		}

		try {
			const employee = timesheet.employee;
			const generationKey = `${payrollPeriodId}:${timesheet.id}`;
			const existingPayrollLock = await prisma.employeePayroll.findUnique({
				where: {
					employeeId_payrollPeriodId: {
						employeeId: employee.id,
						payrollPeriodId,
					},
				},
				select: {
					id: true,
					isPaid: true,
					paidAt: true,
					referenceNumber: true,
				},
			});

			if (existingPayrollLock?.isPaid) {
				lockedCount++;
				processedCount++;
				options?.onProgress?.({
					processed: processedCount,
					success: successCount,
					failed: errorCount,
					employeeId: employee.employeeId || employee.id,
				});
				payrollLogger.warn(
					`Skipped paid timesheet lock for employee ${employee.employeeId || employee.id} in period ${payrollPeriodId}`,
				);
				continue;
			}

			const reportingBreakdown = getTimesheetReportingBreakdown(timesheet);

			// Skip if employee has no salary configured
			if (!employee.basicSalary || employee.basicSalary <= 0) {
				payrollLogger.warn(`Skipping employee ${employee.id}: No basic salary configured`);
				errorCount++;
				processedCount++;
				options?.onProgress?.({
					processed: processedCount,
					success: successCount,
					failed: errorCount,
					employeeId: employee.employeeId || employee.id,
					error: "No basic salary configured",
				});
				continue;
			}

			const {
				totalValidOvertimeMinutes,
				totalValidLateMinutes,
				totalValidEarlyOutMinutes,
				validatedDays,
			} = validatePayrollBreakdownDays({
				breakdown: reportingBreakdown,
				employee,
				holidayMap,
			});

			// Convert validated minutes to decimal hours
			const regularHours = convertTimeToDecimal(timesheet.totalRegularHours);
			const overtimeHours = totalValidOvertimeMinutes / 60;
			const lateHours = totalValidLateMinutes / 60;
			const earlyOutHours = totalValidEarlyOutMinutes / 60;

			// Calculate pay based on pay frequency
			let periodBasic = employee.basicSalary;
			let splitFactor = 1.0;

			if (employee.payFrequency === "SEMI_MONTHLY") {
				periodBasic = employee.basicSalary;
				// splitFactor = 0.5;
			}

			// Calculate derived monthly rate for reference
			let estimatedMonthlyRate = periodBasic;
			switch (employee.payFrequency) {
				case "SEMI_MONTHLY":
					estimatedMonthlyRate = periodBasic * 2;
					break;
				case "WEEKLY":
					estimatedMonthlyRate = periodBasic * 4;
					break;
				case "BIWEEKLY":
					estimatedMonthlyRate = periodBasic * 2;
					break;
				case "ANNUALLY":
					estimatedMonthlyRate = periodBasic / 12;
					break;
				default: // MONTHLY
					estimatedMonthlyRate = periodBasic;
					break;
			}

			// Calculate daily rate and absent deduction from timesheet breakdown
			let daysAbsent = 0;
			let totalWorkDays = 0;

			if (reportingBreakdown.length) {
				for (const day of reportingBreakdown) {
					// Count work days (exclude REST_DAY)
					if (day.status !== "REST_DAY") {
						totalWorkDays++;
						// Count absent days
						if (day.status === "ABSENT") {
							daysAbsent++;
						}
					}
				}
			}

			// Calculate working hours per day and schedule snapshots for the payroll period
			let workingHoursPerDay = 8; // Default for rate calculation
			const weeklySchedule: {
				day: string;
				hours: number;
				isRestDay: boolean;
				gracePeriodMinutes: number;
			}[] = [];
			const periodScheduleWeeks = buildPeriodScheduleWeeks({
				periodStart: payrollPeriodData.startDate,
				periodEnd: payrollPeriodData.endDate,
				validatedDays,
				employee,
			});
			let weeklyTotalHours = periodScheduleWeeks[0]?.totalHours || 0;

			for (const day of periodScheduleWeeks[0]?.days || []) {
				weeklySchedule.push({
					day: day.weekday,
					hours: day.hours,
					isRestDay: day.isRestDay,
					gracePeriodMinutes: Math.max(
						0,
						Number(
							validatedDays.find(
								(validatedDay: any) =>
									getDateKey(new Date(validatedDay.date)) === day.date,
							)?.scheduleSnapshot?.graceLateMinutes ??
								validatedDays.find(
									(validatedDay: any) =>
										getDateKey(new Date(validatedDay.date)) === day.date,
								)?.scheduleSnapshot?.gracePeriodMinutes ??
								0,
						),
					),
				});
				if (!day.isRestDay && workingHoursPerDay === 8 && day.hours > 0) {
					workingHoursPerDay = day.hours;
				}
			}

			// Bandai OT buckets first — when present, attendance deductions use BNPI 313 daily.
			const bandaiApprovedBucketPay = calculateBandaiApprovedBucketPay(validatedDays, periodBasic);
			const attendanceRate = resolveBnpiAttendanceDailyRate({
				periodBasic,
				estimatedMonthlyRate,
				totalWorkDays,
				useBnpi313: Boolean(bandaiApprovedBucketPay),
				scheduleWorkingHoursPerDay: workingHoursPerDay,
			});
			const dailyRate = attendanceRate.dailyRate;
			const hourlyRate = attendanceRate.hourlyRate;
			const minuteRate = attendanceRate.minuteRate;
			workingHoursPerDay = attendanceRate.workingHoursPerDay;
			const absentDeduction = roundToCentavo(daysAbsent * dailyRate);

			// Base multipliers (ordinary day) from calculator
			const baseWorkMultiplier =
				getRateMultiplier(rateMultipliers, "ordinaryDay", "work") ?? 1.0;
			const baseOtMultiplier = getRateMultiplier(rateMultipliers, "ordinaryDay", "ot") ?? 1.0;
			const baseNdMultiplier = getRateMultiplier(rateMultipliers, "ordinaryDay", "nd") ?? 1.0;
			const baseNightDiffPremiumMultiplier = Math.max(
				0,
				baseNdMultiplier - baseWorkMultiplier,
			);

			// Calculate per-minute deductions
			const lateMinutes = lateHours * 60;
			const earlyOutMinutes = earlyOutHours * 60;
			const shortfallMinutes = lateMinutes + earlyOutMinutes;
			const lateDeduction = roundToCentavo(lateMinutes * minuteRate);
			const earlyOutDeduction = roundToCentavo(earlyOutMinutes * minuteRate);
			const shortfallDeduction = roundToCentavo(shortfallMinutes * minuteRate);

			// ? Calculate pay components using calculator rate multipliers
			// Process each validated day to apply correct multipliers
			let totalOvertimePay = 0;
			let totalNightDiffPay = 0;
			let totalHolidayPay = 0;
			let totalRestDayPay = 0;

			for (const validatedDay of validatedDays) {
				// Skip if not present or no work done
				if (validatedDay.status === "ABSENT" || validatedDay.status === "LEAVE") continue;

				// Merge day metadata with holiday info
				const dayMetadata = validatedDay.holidayInfo
					? {
							...validatedDay.metadata,
							...validatedDay.holidayInfo,
						}
					: validatedDay.metadata;

				// Get day type for rate calculation using holiday info and rest day flag
				const dayType = shouldUseOrdinaryRateFromApprovedSource(validatedDay)
					? "ordinaryDay"
					: getDayType(
						validatedDay.status,
						dayMetadata,
						validatedDay.isRestDay,
					);

				const dayOvertimeMinutes = validatedDay.validOvertimeMinutes || 0;
				const dayOvertimeHours = dayOvertimeMinutes / 60;

				// Calculate night differential hours from time in/out
				const nightDiffHours = calculateNightDiffHours(
					validatedDay.timeIn,
					validatedDay.timeOut,
				);

				// Get rate multipliers for this day type
				const workMultiplier = getRateMultiplier(rateMultipliers, dayType, "work");
				const otMultiplier = getRateMultiplier(rateMultipliers, dayType, "ot");
				const ndMultiplier = getRateMultiplier(rateMultipliers, dayType, "nd");
				const ndotMultiplier = getRateMultiplier(rateMultipliers, dayType, "ndot");

				// Debug log for holiday matching
				if (validatedDay.holidayInfo) {
					payrollLogger.debug(
						`Holiday detected: ${validatedDay.holidayInfo.holidayTitle} on ${getDateKey(new Date(validatedDay.date))} - Type: ${dayType}, WorkMultiplier: ${workMultiplier}`,
					);
				}

				// Calculate overtime pay for this day (only if multiplier is configured)
				if (dayOvertimeHours > 0 && otMultiplier !== null) {
					const completeOTHours = Math.floor(dayOvertimeHours);
					const dayOTPay = completeOTHours * hourlyRate * otMultiplier;
					totalOvertimePay += dayOTPay;
				}

				// Calculate night differential pay (only if multiplier is configured)
				if (nightDiffHours > 0 && ndMultiplier !== null) {
					const baseWorkMultiplier = workMultiplier ?? 1.0;
					const nightDiffPremiumMultiplier = Math.max(
						0,
						ndMultiplier - baseWorkMultiplier,
					);
					if (nightDiffPremiumMultiplier > 0) {
						const dayNDPay = nightDiffHours * hourlyRate * nightDiffPremiumMultiplier;
						totalNightDiffPay += dayNDPay;
					}
				}

				// Calculate holiday/rest day premium pay (only if multiplier is configured)
				// Premium is the additional amount beyond the base rate
				// Only apply premium if employee was PRESENT (not rest day, absent, or leave)
				if (
					dayType !== "ordinaryDay" &&
					workMultiplier !== null &&
					validatedDay.status === "PRESENT"
				) {
					// For holiday/rest day premium, use scheduled work hours or regular hours
					// NOT total hours (which includes OT) - OT gets its own multiplier
					const dayDate = new Date(validatedDay.date);
					const dayOfWeek = dayDate.getDay();
					const scheduleBoundaries = getScheduleBoundaries(
						validatedDay.scheduleSnapshot || null,
						dayOfWeek,
					);

					// Use scheduled hours if available, otherwise use min(regular hours, 8 hours)
					let premiumBaseHours = 8; // Default to 8 hours
					if (scheduleBoundaries?.scheduledMinutes) {
						premiumBaseHours = scheduleBoundaries.scheduledMinutes / 60;
					} else {
						const dayRegularHours = convertTimeToDecimal(
							validatedDay.regularHours || "0:00",
						);
						premiumBaseHours = Math.min(dayRegularHours, workingHoursPerDay);
					}

					// Premium is the difference between special rate and base rate
					const premiumMultiplier = workMultiplier - 1.0; // e.g., 2.0 - 1.0 = 1.0 for holidays

					if (premiumBaseHours > 0 && premiumMultiplier > 0) {
						const dayPremiumPay = premiumBaseHours * hourlyRate * premiumMultiplier;

						if (dayType.includes("Holiday")) {
							totalHolidayPay += dayPremiumPay;
							payrollLogger.debug(
								`Holiday premium: ${premiumBaseHours}h � ?${hourlyRate.toFixed(2)} � ${premiumMultiplier} = ?${dayPremiumPay.toFixed(2)} on ${getDateKey(new Date(validatedDay.date))}`,
							);
						} else if (dayType.includes("restDay")) {
							totalRestDayPay += dayPremiumPay;
						}
					}
				}
			}

			if (bandaiApprovedBucketPay) {
				totalOvertimePay = bandaiApprovedBucketPay.overtimePay;
				totalNightDiffPay = bandaiApprovedBucketPay.nightDiffPay;
				totalHolidayPay = bandaiApprovedBucketPay.specialHolidayPay + bandaiApprovedBucketPay.legalHolidayPay;
				totalRestDayPay = bandaiApprovedBucketPay.restDayPay + bandaiApprovedBucketPay.restDayOtPay;
			}

			// Round all calculated pays
			const overtimePay = roundToCentavo(totalOvertimePay);
			const nightDiffPay = roundToCentavo(totalNightDiffPay);
			// Combine holiday and rest day premium pay into holidayPay field
			const holidayPay = roundToCentavo(totalHolidayPay + totalRestDayPay);

			// Build daily breakdown using calculator multipliers
			const dailyBreakdown = validatedDays.map((day: any) => {
				const dayDate = new Date(day.date);
				const approvedBucketDayPay = calculateBandaiApprovedBucketDayPay(
					day,
					bandaiApprovedBucketPay,
					periodBasic,
				);

				// Merge day metadata with holiday info
				const dayMetadata = day.holidayInfo
					? {
							...day.metadata,
							...day.holidayInfo,
						}
					: day.metadata;

				// Use the rest day flag we stored in validatedDays
				const dayType = shouldUseOrdinaryRateFromApprovedSource(day)
					? "ordinaryDay"
					: getDayType(day.status, dayMetadata, day.isRestDay);
				const workMultiplier = getRateMultiplier(rateMultipliers, dayType, "work") ?? 1.0;
				const otMultiplier = getRateMultiplier(rateMultipliers, dayType, "ot");
				const ndMultiplier = getRateMultiplier(rateMultipliers, dayType, "nd");

				const dayHoursWorked = convertTimeToDecimal(day.hoursWorked || "0:00");
				const nightDiffHours = calculateNightDiffHours(day.timeIn, day.timeOut);

				const dayLateMinutes = day.strictLateMinutes || 0;
				const dayEarlyOutMinutes = day.strictEarlyOutMinutes || 0;
				const dayOvertimeMinutes = day.validOvertimeMinutes || 0;

				const dayLatePenalty = roundToCentavo(dayLateMinutes * minuteRate);
				const dayEarlyOutPenalty = roundToCentavo(dayEarlyOutMinutes * minuteRate);
				const dayShortfallPenalty = roundToCentavo(
					(dayLateMinutes + dayEarlyOutMinutes) * minuteRate,
				);

				const dayCompleteOvertimeHours = Math.floor(dayOvertimeMinutes / 60);
				const dayOvertimePay =
					otMultiplier !== null
						? roundToCentavo(dayCompleteOvertimeHours * hourlyRate * otMultiplier)
						: 0;

				const nightDiffPremiumMultiplier =
					ndMultiplier !== null ? Math.max(0, ndMultiplier - workMultiplier) : 0;
				const dayNightDiffPay =
					nightDiffHours > 0 && nightDiffPremiumMultiplier > 0
						? roundToCentavo(nightDiffHours * hourlyRate * nightDiffPremiumMultiplier)
						: 0;

				// For holiday/rest day premium in daily breakdown, use scheduled hours not total hours
				const dayDateObj = new Date(day.date);
				const dayDayOfWeek = dayDateObj.getDay();
				const dayScheduleBoundaries = getScheduleBoundaries(
					day.scheduleSnapshot || null,
					dayDayOfWeek,
				);
				let dayPremiumBaseHours = 8;
				if (dayScheduleBoundaries?.scheduledMinutes) {
					dayPremiumBaseHours = dayScheduleBoundaries.scheduledMinutes / 60;
				} else {
					const dayRegularHours = convertTimeToDecimal(day.regularHours || "0:00");
					dayPremiumBaseHours = Math.min(dayRegularHours, workingHoursPerDay);
				}

				const holidayPremiumMultiplier = Math.max(0, workMultiplier - 1.0);
				const dayHolidayPay =
					day.status === "PRESENT" &&
					dayPremiumBaseHours > 0 &&
					holidayPremiumMultiplier > 0 &&
					dayType !== "ordinaryDay"
						? roundToCentavo(
								dayPremiumBaseHours * hourlyRate * holidayPremiumMultiplier,
							)
						: 0;

				const dayRegularPay = day.status === "PRESENT" ? roundToCentavo(dailyRate) : 0;
				const dayAbsentDeduction = day.status === "ABSENT" ? roundToCentavo(dailyRate) : 0;
				const resolvedDayRegularPay = approvedBucketDayPay
					? approvedBucketDayPay.regularPay
					: dayRegularPay;
				const resolvedDayOvertimePay = approvedBucketDayPay
					? approvedBucketDayPay.overtimePay
					: dayOvertimePay;
				const resolvedDayNightDiffPay = approvedBucketDayPay
					? approvedBucketDayPay.nightDiffPay
					: dayNightDiffPay;
				const resolvedDayHolidayPay = approvedBucketDayPay
					? approvedBucketDayPay.holidayPay
					: dayHolidayPay;

				const dayTotalDeductions = roundToCentavo(dayAbsentDeduction + dayShortfallPenalty);
				const dayTotalEarnings = roundToCentavo(
					resolvedDayRegularPay +
						resolvedDayOvertimePay +
						resolvedDayNightDiffPay +
						resolvedDayHolidayPay,
				);
				const dayNetPay = roundToCentavo(dayTotalEarnings - dayTotalDeductions);

				return {
					date: day.date,
					dayOfWeek: dayDate.toLocaleDateString("en-US", { weekday: "long" }),
					dayType: day.isRestDay ? "REST_DAY" : "WORK_DAY",
					dayTypeDisplay: day.dayTypeDisplay || null,
					status: day.status,
					rateType: dayType, // e.g., "ordinaryDay", "regularHoliday", etc.
					holidayInfo: day.holidayInfo || null, // Include holiday info if present
					scheduleSnapshot: day.scheduleSnapshot || null,
					metadata: {
						...(day.metadata || {}),
						...(approvedBucketDayPay
							? { bandaiApprovedBucketDayPay: approvedBucketDayPay }
							: {}),
					},
					earnings: {
						regularPay: resolvedDayRegularPay,
						overtimePay: resolvedDayOvertimePay,
						nightDiffPay: resolvedDayNightDiffPay,
						holidayPay: resolvedDayHolidayPay,
						totalDayPay: dayTotalEarnings,
					},
					deductions: {
						absentDeduction: dayAbsentDeduction,
						latePenalty: dayLatePenalty,
						earlyOutPenalty: dayEarlyOutPenalty,
						shortfallPenalty: dayShortfallPenalty,
						totalDayDeductions: dayTotalDeductions,
					},
					netDayPay: dayNetPay,
					remarks: day.remarks || "",
				};
			});

			// For timesheet-based payroll, basicPay is the period basic salary
			const basicPay = periodBasic;

			// Calculate gross pay: basic pay - absent - undertime + overtime + night diff + holiday
			const grossPay = roundToCentavo(
				basicPay -
					absentDeduction -
					shortfallDeduction +
					overtimePay +
					nightDiffPay +
					holidayPay,
			);
			const payrollSource =
				payrollSourceAmountsByEmployeeId.get(employee.id) || {
					amounts: emptyPayrollSourceAmounts(),
					details: emptyPayrollSourceDetails(),
					installmentIds: [],
				};
			const payrollSourceAmounts = payrollSource.amounts;
			let grossPayWithSources = roundToCentavo(
				grossPay + payrollSourceAmounts.grossIncludedBenefits,
			);

			// Get all payroll periods for this employee in the same month
			const employeePayrollsThisMonth = await prisma.employeePayroll.findMany({
				where: {
					employeeId: employee.id,
					organizationId,
					isDeleted: false,
					payrollPeriod: {
						startDate: {
							gte: new Date(year, month - 1, 1), // Start of month
							lt: new Date(year, month, 1), // Start of next month
						},
					},
				},
				select: {
					grossPay: true,
					payrollPeriod: {
						select: {
							periodNumber: true,
						},
					},
				},
			});

			// Calculate actual monthly gross (sum of all periods in this month)
			const previousPeriodsGross = employeePayrollsThisMonth
				.filter((p) => (p.payrollPeriod?.periodNumber || 1) < periodNumber)
				.reduce((sum, p) => sum + p.grossPay, 0);

			const actualMonthlyGross = previousPeriodsGross + grossPayWithSources;

			const contributionSchedule = resolveContributionSchedule({
				payFrequency: employee.payFrequency,
				periodNumber,
				payrollPeriodMetadata: payrollPeriodData.generationMetadata,
			});
			const contributionSplitFactor = contributionSchedule.splitFactor;

			// Calculate contributions based on ACTUAL GROSS PAY (after undertime/absent deductions)
			// This is the correct approach per Philippine labor law
			let contributionBaseAmount = grossPayWithSources;

			// For semi-monthly, we need monthly equivalent for contribution brackets
			if (employee.payFrequency === "SEMI_MONTHLY") {
				contributionBaseAmount = grossPayWithSources * 2; // Convert to monthly for bracket calculation
			}

			const monthlyContributions = calculateTotalContributions(
				contributionBaseAmount,
				sssRates,
				philHealthRates,
				pagibigRates,
			);
			const periodContributions = {
				sss: roundToCentavo(monthlyContributions.sss * contributionSplitFactor),
				philHealth: roundToCentavo(
					monthlyContributions.philHealth * contributionSplitFactor,
				),
				pagIbig: roundToCentavo(monthlyContributions.pagIbig * contributionSplitFactor),
			};

			// Calculate tax based on period gross pay
			const periodTaxableIncome =
				grossPayWithSources -
				payrollSourceAmounts.nonTaxableGrossIncludedBenefits -
				(periodContributions.sss +
					periodContributions.philHealth +
					periodContributions.pagIbig);
			const isSemiMonthly = employee.payFrequency === "SEMI_MONTHLY";
			const withholdingTax = calculateWithholdingTax(
				periodTaxableIncome,
				taxRates,
				isSemiMonthly,
			);
			const taxCalculationMethod = "TAX_ON_PERIOD_GROSS";

			// Alternative: Tax only on 2nd period (commented out for reference)
			// let withholdingTax = 0;
			// let taxCalculationMethod = "NO_TAX_PERIOD_1";
			// if (periodNumber === 2 || periodNumber >= 2) {
			//   const monthlyTaxableIncome = actualMonthlyGross - monthlyContributions.total;
			//   withholdingTax = calculateWithholdingTax(monthlyTaxableIncome, taxRates);
			//   taxCalculationMethod = "ALL_TAX_PERIOD_2";
			// }

			// Calculate taxable income (gross pay minus contributions)
			const taxableIncome = roundToCentavo(
				grossPayWithSources -
					payrollSourceAmounts.nonTaxableGrossIncludedBenefits -
					(periodContributions.sss +
						periodContributions.philHealth +
						periodContributions.pagIbig),
			);

			// Total deductions — loan and benefit deductions are waived when gross pay is zero
			const zeroSalaryGuardrail = applyZeroSalaryGuardrail(
				grossPayWithSources,
				payrollSourceAmounts.loanDeductions,
				payrollSourceAmounts.deductionBenefits,
			);
			const totalDeductions = roundToCentavo(
					periodContributions.sss +
					periodContributions.philHealth +
					periodContributions.pagIbig +
					withholdingTax +
					zeroSalaryGuardrail.guardedLoanDeductions +
					zeroSalaryGuardrail.guardedDeductionBenefits,
			);

			// Calculate net pay (clamped to zero — net pay can never be negative)
			let netPay = Math.max(
				0,
				roundToCentavo(grossPayWithSources - totalDeductions + payrollSourceAmounts.netAdjustments),
			);

			const payrollAttendanceSnapshot = validatedDays.map((day: any) => ({
				approvalStatus: day.approvalStatus || "APPROVED",
				date: day.date,
				timeIn: day.timeIn || null,
				timeOut: day.timeOut || null,
				hoursWorked: day.hoursWorked || "0:00",
				regularHours: day.regularHours || "0:00",
				overtimeHours: formatMinutesAsTime(day.validOvertimeMinutes || 0),
				undertimeHours: day.undertimeHours || "0:00",
				lateHours: formatMinutesAsTime(day.strictLateMinutes || 0),
				earlyOutHours: formatMinutesAsTime(day.strictEarlyOutMinutes || 0),
				status: day.status || null,
				dayTypeDisplay: day.dayTypeDisplay || null,
				scheduleSnapshot: day.scheduleSnapshot || null,
				employeeNotes: day.employeeNotes || null,
				approverNotes: day.approverNotes || null,
				metadata: {
					...(day.metadata || {}),
					totalMinutes:
						day.metadata?.totalMinutes ?? Math.round(convertTimeToDecimal(day.hoursWorked || "0:00") * 60),
					regularMinutes:
						day.metadata?.regularMinutes ??
						Math.round(convertTimeToDecimal(day.regularHours || "0:00") * 60),
					overtimeMinutes: day.validOvertimeMinutes || 0,
					undertimeMinutes:
						day.metadata?.undertimeMinutes ??
						Math.round(convertTimeToDecimal(day.undertimeHours || "0:00") * 60),
					lateMinutes: day.strictLateMinutes || 0,
					earlyOutMinutes: day.strictEarlyOutMinutes || 0,
					rawLateMinutes: day.rawLateMinutes || 0,
					rawEarlyOutMinutes: day.rawEarlyOutMinutes || 0,
					gracePeriodMinutes: Math.max(
						0,
						Number(
							day.scheduleSnapshot?.graceLateMinutes ??
								day.scheduleSnapshot?.gracePeriodMinutes ??
								day.metadata?.gracePeriodMinutes ??
							0,
						),
					),
					graceEarlyOutMinutes: Math.max(
						0,
						Number(day.scheduleSnapshot?.graceEarlyOutMinutes ?? day.metadata?.graceEarlyOutMinutes ?? 0),
					),
					withinGrace: Boolean(day.withinGrace),
				},
			}));

			const payrollRegister = buildBandaiPayrollRegister({
				employee,
				payrollPeriodData,
				periodBasic,
				estimatedMonthlyRate,
				dailyRate,
				totalWorkDays,
				basicPay,
				absentDeduction,
				lateDeduction,
				earlyOutDeduction,
				shortfallDeduction,
				overtimePay,
				nightDiffPay,
				holidayPay,
				grossPayWithSources,
				withholdingTax,
				periodContributions,
				payrollSourceAmounts,
				payrollSourceDetails: payrollSource.details,
				totalDeductions,
				netPay,
				bandaiApprovedBucketPay,
			});

			// 4. Create or update employee payroll record
			let employeePayroll = await prisma.employeePayroll.upsert({
				where: {
					employeeId_payrollPeriodId: {
						employeeId: employee.id,
						payrollPeriodId,
					},
				},
				create: {
					employeeId: employee.id,
					payrollPeriodId,
					organizationId,

					// Earnings
					basicPay,
					overtimePay,
					nightDiffPay,
					holidayPay,
					allowances: payrollSourceAmounts.totalCompensationBenefits,
					bonuses: 0,

					// Deductions
					sssContribution: periodContributions.sss,
					philHealthContribution: periodContributions.philHealth,
					pagibigContribution: periodContributions.pagIbig,
					taxAmount: withholdingTax,
					loanDeductions: zeroSalaryGuardrail.guardedLoanDeductions,
					lateDeduction,
					earlyOutDeduction,
					otherDeductions: zeroSalaryGuardrail.guardedDeductionBenefits,

					// Totals
					grossPay: grossPayWithSources,
					taxableIncome,
					totalDeductions,
					netPay,
					absentDeduction,
					...payrollRegister.persistFields,

					// Timesheet snapshot - complete data for audit trail
					timesheetId: timesheet.id,
					timesheetSnapshot: {
						totalHoursWorked: timesheet.totalHoursWorked,
						totalRegularHours: timesheet.totalRegularHours,
						totalOvertimeHours: formatMinutesAsTime(totalValidOvertimeMinutes),
						totalLateHours: formatMinutesAsTime(totalValidLateMinutes),
						totalEarlyOutHours: formatMinutesAsTime(totalValidEarlyOutMinutes),
						totalDays: timesheet.totalDays,
						metadata: {
							...(((timesheet.metadata as Record<string, any> | null) || {}) as Record<
								string,
								any
							>),
							totalOvertimeMinutes: totalValidOvertimeMinutes,
							totalLateMinutes: totalValidLateMinutes,
							totalEarlyOutMinutes: totalValidEarlyOutMinutes,
						},
						daysPresent:
							reportingBreakdown?.filter((d: any) => d.status === "PRESENT")
								.length || 0,
						daysAbsent,
						daysRestDay:
							reportingBreakdown?.filter((d: any) => d.status === "REST_DAY")
								.length || 0,
						breakdown: payrollAttendanceSnapshot,
					},

					// Payroll calculation metadata - for audit trail and transparency
					metadata: {
						dailyRate: roundToCentavo(dailyRate),
						hourlyRate: roundToCentavo(dailyRate / workingHoursPerDay),
						minuteRate: roundToCentavo(dailyRate / workingHoursPerDay / 60),
						basicSalary: employee.basicSalary,
						monthlyRate: roundToCentavo(estimatedMonthlyRate),
						workingDays: totalWorkDays,
						weeklyTotalHours: roundToCentavo(weeklyTotalHours),
						weeklySchedule,
						periodScheduleWeeks,
						payFrequency: employee.payFrequency || "MONTHLY",
						periodDays: timesheet.totalDays,
						periodNumber,
						expectedWorkingDays: totalWorkDays,
						actualWorkingDays: totalWorkDays - daysAbsent,
						absentDays: daysAbsent,
						totalLateHours: roundToCentavo(lateHours),
						totalEarlyOutHours: roundToCentavo(earlyOutHours),
						lateDeduction,
						earlyOutDeduction,
						shortfallDeduction,
						payrollSourceAmounts,
						payrollSourceDetails: payrollSource.details,
						payrollRegisterColumns: payrollRegister.columns,
						restDays:
							reportingBreakdown?.filter((d: any) => d.status === "REST_DAY")
								.length || 0,
						overtimeRate: roundToCentavo(hourlyRate * baseOtMultiplier),
						nightDiffRate: roundToCentavo(hourlyRate * baseNightDiffPremiumMultiplier),
						calculatedAt: new Date().toISOString(),
						calculationMethod: "TIMESHEET_BASED",
						taxCalculation: {
							method: taxCalculationMethod,
							periodNumber,
							actualMonthlyGross: roundToCentavo(actualMonthlyGross),
							previousPeriodsGross: roundToCentavo(previousPeriodsGross),
							currentPeriodGross: roundToCentavo(grossPayWithSources),
							monthlyTaxableIncome:
								periodNumber >= 2
									? roundToCentavo(
											actualMonthlyGross - monthlyContributions.total,
										)
									: 0,
							withholdingTax: roundToCentavo(withholdingTax),
						},
						contributionSchedule: {
							splitFactor: contributionSplitFactor,
							periodNumber,
							method: contributionSchedule.method,
						},
						zeroSalaryGuardrailApplied: zeroSalaryGuardrail.applied,
					},

					// Rate calculation breakdown - detailed formulas
					rateBreakdown: {
						dailyRate: {
							formula: "Period Basic Salary / Total Work Days",
							calculation: `PHP ${employee.basicSalary.toFixed(2)} / ${totalWorkDays} days`,
							inputs: {
								periodBasicSalary: employee.basicSalary,
								totalWorkDays,
							},
							result: roundToCentavo(dailyRate),
						},
						hourlyRate: {
							formula: "Daily Rate / Working Hours Per Day",
							calculation: `PHP ${roundToCentavo(dailyRate)} / ${workingHoursPerDay} hours`,
							inputs: {
								dailyRate: roundToCentavo(dailyRate),
								workingHoursPerDay,
							},
							result: roundToCentavo(dailyRate / workingHoursPerDay),
						},
						minuteRate: {
							formula: "Hourly Rate / 60 Minutes",
							calculation: `PHP ${roundToCentavo(dailyRate / workingHoursPerDay)} / 60 minutes`,
							inputs: {
								hourlyRate: roundToCentavo(dailyRate / workingHoursPerDay),
							},
							result: roundToCentavo(dailyRate / workingHoursPerDay / 60),
						},
						overtimeRate: {
							formula: "Hourly Rate x OT Multiplier (calculator)",
							calculation: `PHP ${roundToCentavo(dailyRate / workingHoursPerDay)} x ${baseOtMultiplier}`,
							inputs: {
								hourlyRate: roundToCentavo(dailyRate / workingHoursPerDay),
								multiplier: baseOtMultiplier,
							},
							result: roundToCentavo(hourlyRate * baseOtMultiplier),
						},
						nightDiffRate: {
							formula: "Hourly Rate x (ND Multiplier - Work Multiplier)",
							calculation: `PHP ${roundToCentavo(dailyRate / workingHoursPerDay)} x (${baseNdMultiplier} - ${baseWorkMultiplier})`,
							inputs: {
								hourlyRate: roundToCentavo(dailyRate / workingHoursPerDay),
								multiplier: roundToCentavo(baseNightDiffPremiumMultiplier),
							},
							result: roundToCentavo(hourlyRate * baseNightDiffPremiumMultiplier),
						},
					},

					// Daily breakdown - day-by-day details
					dailyBreakdown: dailyBreakdown || [],

					// Status
					isPaid: false,
					generationRunId: options?.generationRunId || null,
					generationKey,

					notes: `Generated from approved timesheet: ${timesheet.code}`,
				},
				update: {
					// Earnings
					basicPay,
					overtimePay,
					nightDiffPay,
					holidayPay,
					allowances: payrollSourceAmounts.totalCompensationBenefits,

					// Deductions
					sssContribution: periodContributions.sss,
					philHealthContribution: periodContributions.philHealth,
					pagibigContribution: periodContributions.pagIbig,
					taxAmount: withholdingTax,
					loanDeductions: zeroSalaryGuardrail.guardedLoanDeductions,
					lateDeduction,
					earlyOutDeduction,
					otherDeductions: zeroSalaryGuardrail.guardedDeductionBenefits,

					// Totals
					grossPay: grossPayWithSources,
					taxableIncome,
					totalDeductions,
					netPay,
					absentDeduction,
					...payrollRegister.persistFields,

					// Timesheet snapshot - complete data for audit trail
					timesheetSnapshot: {
						totalHoursWorked: timesheet.totalHoursWorked,
						totalRegularHours: timesheet.totalRegularHours,
						totalOvertimeHours: formatMinutesAsTime(totalValidOvertimeMinutes),
						totalLateHours: formatMinutesAsTime(totalValidLateMinutes),
						totalEarlyOutHours: formatMinutesAsTime(totalValidEarlyOutMinutes),
						totalDays: timesheet.totalDays,
						metadata: {
							...(((timesheet.metadata as Record<string, any> | null) || {}) as Record<
								string,
								any
							>),
							totalOvertimeMinutes: totalValidOvertimeMinutes,
							totalLateMinutes: totalValidLateMinutes,
							totalEarlyOutMinutes: totalValidEarlyOutMinutes,
						},
						daysPresent:
							reportingBreakdown?.filter((d: any) => d.status === "PRESENT")
								.length || 0,
						daysAbsent,
						daysRestDay:
							reportingBreakdown?.filter((d: any) => d.status === "REST_DAY")
								.length || 0,
						breakdown: payrollAttendanceSnapshot,
					},

					// Payroll calculation metadata - for audit trail and transparency
					metadata: {
						dailyRate: roundToCentavo(dailyRate),
						hourlyRate: roundToCentavo(dailyRate / workingHoursPerDay),
						minuteRate: roundToCentavo(dailyRate / workingHoursPerDay / 60),
						basicSalary: employee.basicSalary,
						monthlyRate: roundToCentavo(estimatedMonthlyRate),
						workingDays: totalWorkDays,
						weeklyTotalHours: roundToCentavo(weeklyTotalHours),
						weeklySchedule,
						periodScheduleWeeks,
						payFrequency: employee.payFrequency || "MONTHLY",
						periodDays: timesheet.totalDays,
						periodNumber,
						expectedWorkingDays: totalWorkDays,
						actualWorkingDays: totalWorkDays - daysAbsent,
						absentDays: daysAbsent,
						totalLateHours: roundToCentavo(lateHours),
						totalEarlyOutHours: roundToCentavo(earlyOutHours),
						lateDeduction,
						earlyOutDeduction,
						shortfallDeduction,
						payrollSourceAmounts,
						payrollSourceDetails: payrollSource.details,
						payrollRegisterColumns: payrollRegister.columns,
						restDays:
							reportingBreakdown?.filter((d: any) => d.status === "REST_DAY")
								.length || 0,
						overtimeRate: roundToCentavo(hourlyRate * baseOtMultiplier),
						nightDiffRate: roundToCentavo(hourlyRate * baseNightDiffPremiumMultiplier),
						calculatedAt: new Date().toISOString(),
						calculationMethod: "TIMESHEET_BASED",
						taxCalculation: {
							method: taxCalculationMethod,
							periodNumber,
							actualMonthlyGross: roundToCentavo(actualMonthlyGross),
							previousPeriodsGross: roundToCentavo(previousPeriodsGross),
							currentPeriodGross: roundToCentavo(grossPayWithSources),
							monthlyTaxableIncome:
								periodNumber >= 2
									? roundToCentavo(
											actualMonthlyGross - monthlyContributions.total,
										)
									: 0,
							withholdingTax: roundToCentavo(withholdingTax),
						},
						contributionSchedule: {
							splitFactor: contributionSplitFactor,
							periodNumber,
						},
						zeroSalaryGuardrailApplied: zeroSalaryGuardrail.applied,
					},

					// Rate calculation breakdown - detailed formulas
					rateBreakdown: {
						dailyRate: {
							formula: "Period Basic Salary / Total Work Days",
							calculation: `PHP ${employee.basicSalary.toFixed(2)} / ${totalWorkDays} days`,
							inputs: {
								periodBasicSalary: employee.basicSalary,
								totalWorkDays,
							},
							result: roundToCentavo(dailyRate),
						},
						hourlyRate: {
							formula: "Daily Rate / Working Hours Per Day",
							calculation: `PHP ${roundToCentavo(dailyRate)} / ${workingHoursPerDay} hours`,
							inputs: {
								dailyRate: roundToCentavo(dailyRate),
								workingHoursPerDay,
							},
							result: roundToCentavo(dailyRate / workingHoursPerDay),
						},
						minuteRate: {
							formula: "Hourly Rate / 60 Minutes",
							calculation: `PHP ${roundToCentavo(dailyRate / workingHoursPerDay)} / 60 minutes`,
							inputs: {
								hourlyRate: roundToCentavo(dailyRate / workingHoursPerDay),
							},
							result: roundToCentavo(dailyRate / workingHoursPerDay / 60),
						},
						overtimeRate: {
							formula: "Hourly Rate x OT Multiplier (calculator)",
							calculation: `PHP ${roundToCentavo(dailyRate / workingHoursPerDay)} x ${baseOtMultiplier}`,
							inputs: {
								hourlyRate: roundToCentavo(dailyRate / workingHoursPerDay),
								multiplier: baseOtMultiplier,
							},
							result: roundToCentavo(hourlyRate * baseOtMultiplier),
						},
						nightDiffRate: {
							formula: "Hourly Rate x (ND Multiplier - Work Multiplier)",
							calculation: `PHP ${roundToCentavo(dailyRate / workingHoursPerDay)} x (${baseNdMultiplier} - ${baseWorkMultiplier})`,
							inputs: {
								hourlyRate: roundToCentavo(dailyRate / workingHoursPerDay),
								multiplier: roundToCentavo(baseNightDiffPremiumMultiplier),
							},
							result: roundToCentavo(hourlyRate * baseNightDiffPremiumMultiplier),
						},
					},

					// Daily breakdown - day-by-day details
					dailyBreakdown: dailyBreakdown || [],
					generationRunId: options?.generationRunId || null,
					generationKey,

					updatedAt: new Date(),
					notes: `Regenerated from approved timesheet: ${timesheet.code}`,
				},
			});

			// Post-payroll corrections (READY ledger) → explicit retro lines on this period.
			// Does not rewrite source (locked) timesheet snapshots or Period A payroll rows.
			let payrollCorrectionLines: Awaited<
				ReturnType<typeof applyReadyPayrollCorrectionsToEmployeePayroll>
			>["applied"] = [];
			let payrollCorrectionAppliedAmount = 0;
			try {
				const correctionApply = await applyReadyPayrollCorrectionsToEmployeePayroll({
					prisma,
					organizationId,
					employeeId: employee.id,
					targetPayrollPeriodId: payrollPeriodId,
					employeePayrollId: employeePayroll.id,
					existingMetadata: employeePayroll.metadata,
					rateContext: {
						hourlyRate: roundToCentavo(dailyRate / workingHoursPerDay),
						otMultiplier: baseOtMultiplier,
						ndPremiumMultiplier: baseNightDiffPremiumMultiplier,
					},
				});
				if (correctionApply.applied.length > 0) {
					const money = buildUpdatedPayrollMoneyAfterCorrections({
						existingMetadata: employeePayroll.metadata,
						lines: correctionApply.applied,
						otherCompensation: Number((employeePayroll as any).otherCompensation) || 0,
						grossPay: Number(employeePayroll.grossPay) || grossPayWithSources,
						netPay: Number(employeePayroll.netPay) || netPay,
						totalReceivable:
							Number((employeePayroll as any).totalReceivable) ||
							Number(employeePayroll.netPay) ||
							netPay,
					});
					employeePayroll = await prisma.employeePayroll.update({
						where: { id: employeePayroll.id },
						data: {
							otherCompensation: money.otherCompensation,
							grossPay: money.grossPay,
							netPay: money.netPay,
							...(money.totalReceivable != null
								? { totalReceivable: money.totalReceivable }
								: {}),
							metadata: money.metadata as any,
						},
					});
					payrollCorrectionLines = correctionApply.applied;
					payrollCorrectionAppliedAmount = money.appliedAmount;
					grossPayWithSources = money.grossPay;
					netPay = money.netPay;
					payrollCorrectionsAppliedCount += correctionApply.applied.length;
				}
			} catch (correctionError) {
				payrollLogger.error(
					`Payroll correction apply failed for employee ${employee.employeeId}: ${correctionError}`,
				);
			}

			await markPayrollBenefitInstallmentsDeducted(
				prisma,
				payrollSource.installmentIds,
				{ payrollPeriodId, payrollRunId: options?.generationRunId },
			);
			await (prisma as any).timesheet.updateMany({
				where: {
					id: timesheet.id,
					organizationId,
					lockedAt: null,
				},
				data: {
					lockedAt: new Date(),
					lockedBy: timesheetLockEmployeeId,
					lockReason: "PAYROLL_PERIOD_LOCK",
					lockRunId: options?.generationRunId || null,
					lockedEmployeePayrollId: employeePayroll.id,
				},
			});
			await (prisma as any).attendanceObligation.updateMany({
				where: {
					organizationId,
					employeeId: employee.id,
					payrollPeriodId,
					timesheetId: timesheet.id,
					isDeleted: false,
				},
				data: {
					phase: "PAID",
					metadata: {
						payrollId: employeePayroll.id,
						paidAt: new Date().toISOString(),
						sourceType: "EMPLOYEE_PAYROLL",
					},
				},
			});

			// Generate payslip PDF, upload to Cloudinary, and upsert employee document.
			// We don't fail payroll generation when payslip storage fails, but we count/report it.
			try {
				const employeeName = getEmployeeDisplayName(employee) || "Employee";
				const periodLabel = payrollPeriodData.name || `Period-${payrollPeriodData.id}`;
				const payslipReferenceNumber = buildPayslipDocumentNumber(
					payrollPeriodId,
					employee.id,
					{
						payrollPeriodName: payrollPeriodData.name,
						employeeCode: employee.employeeId,
					},
				);

				const payslipBuffer = await generatePayslipPdfBuffer({
					employee: {
						id: employee.id,
						employeeId: employee.employeeId,
						person: employee.person as any,
						department: null,
						position: null,
					},
					payrollPeriod: {
						id: payrollPeriodData.id,
						name: payrollPeriodData.name,
						startDate: payrollPeriodData.startDate,
						endDate: payrollPeriodData.endDate,
						payDate: payrollPeriodData.payDate,
					},
					employeePayroll: {
						id: employeePayroll.id,
						basicPay: employeePayroll.basicPay,
						overtimePay: employeePayroll.overtimePay,
						nightDiffPay: employeePayroll.nightDiffPay,
						holidayPay: employeePayroll.holidayPay,
						allowances: employeePayroll.allowances,
						bonuses: employeePayroll.bonuses,
						obAllowance: employeePayroll.obAllowance,
						deMinimisAllowance: employeePayroll.deMinimisAllowance,
						adjustmentOtNd: employeePayroll.adjustmentOtNd,
						otherCompensation: (employeePayroll as any).otherCompensation,
						grossPay: employeePayroll.grossPay,
						taxAmount: employeePayroll.taxAmount,
						sssContribution: employeePayroll.sssContribution,
						philHealthContribution: employeePayroll.philHealthContribution,
						pagibigContribution: employeePayroll.pagibigContribution,
						loanDeductions: employeePayroll.loanDeductions,
						sssSalaryLoan: employeePayroll.sssSalaryLoan,
						otherDeductions: employeePayroll.otherDeductions,
						modifiedHdmf2: employeePayroll.modifiedHdmf2,
						lateDeduction: employeePayroll.lateDeduction,
						earlyOutDeduction: employeePayroll.earlyOutDeduction,
						absentDeduction: employeePayroll.absentDeduction,
						totalDeductions: employeePayroll.totalDeductions,
						netPay: employeePayroll.netPay,
						perfectAttendance: employeePayroll.perfectAttendance,
						mealAllowance: employeePayroll.mealAllowance,
						lineLeaderAllowance: employeePayroll.lineLeaderAllowance,
						totalReceivable: employeePayroll.totalReceivable,
						// Required so PDF expands enrollment lines (Rice Subsidy, etc.)
						// instead of only register totals like "De Minimis Allowance".
						metadata: {
							...(((employeePayroll.metadata as Record<string, any> | null) ||
								{}) as Record<string, any>),
							payrollSourceDetails:
								((employeePayroll.metadata as any)?.payrollSourceDetails as
									| unknown[]
									| undefined) ||
								payrollSource.details,
						},
					},
					payslipReferenceNumber,
					organizationName: "Bandai",
				});

				const uploadResult = await uploadToCloudinary(payslipBuffer, {
					folder: `hris/employees/${employee.employeeId || employee.id}/documents`,
					resourceType: "raw",
					publicId: `payslip_${employee.employeeId || employee.id}_${payrollPeriodId}`,
				});

				if (!uploadResult.success || !uploadResult.secureUrl) {
					throw new Error(uploadResult.error || "Failed to upload payslip to Cloudinary");
				}

				const existingPayslipDocument = await prisma.document.findFirst({
					where: {
						employeeId: employee.id,
						type: "PAYSLIP",
						number: payslipReferenceNumber,
						isDeleted: false,
					},
					select: { id: true },
				});

				const documentPayload = {
					name: `Payslip - ${periodLabel} - ${employeeName}`,
					type: "PAYSLIP",
					number: payslipReferenceNumber,
					issueDate: payrollPeriodData.payDate || new Date(),
					expiryDate: null,
					fileUrl: uploadResult.secureUrl,
					ext: uploadResult.format || "pdf",
				};

				let payslipDocumentRecord: { id: string; number: string; fileUrl: string | null } | null =
					null;

				if (existingPayslipDocument?.id) {
					payslipDocumentRecord = await prisma.document.update({
						where: { id: existingPayslipDocument.id },
						data: documentPayload,
						select: {
							id: true,
							number: true,
							fileUrl: true,
						},
					});
				} else {
					payslipDocumentRecord = await prisma.document.create({
						data: {
							employeeId: employee.id,
							...documentPayload,
						},
						select: {
							id: true,
							number: true,
							fileUrl: true,
						},
					});
				}

				const existingMetadata =
					employeePayroll.metadata && typeof employeePayroll.metadata === "object"
						? (employeePayroll.metadata as Record<string, any>)
						: {};

				await prisma.employeePayroll.update({
					where: { id: employeePayroll.id },
					data: {
						metadata: {
							...existingMetadata,
						payslip: {
								documentId: payslipDocumentRecord?.id || null,
								documentNumber:
									payslipDocumentRecord?.number || payslipReferenceNumber,
								fileUrl: payslipDocumentRecord?.fileUrl || uploadResult.secureUrl,
								generatedAt: new Date().toISOString(),
							},
						},
					},
				});

				payslipSuccessCount++;
				payrollLogger.info(
					`Payslip generated and stored for employee ${employee.employeeId} (${employeePayroll.id})`,
				);
			} catch (payslipError) {
				payslipErrorCount++;
				payrollLogger.error(
					`Payroll generated but payslip creation failed for employee ${employee.employeeId}: ${payslipError}`,
				);
			}

			// Store result
			generatedPayrolls.push({
				payrollId: employeePayroll.id,
				employeeId: employee.id,
				employeeCode: employee.employeeId,
				name: getEmployeeDisplayName(employee),
				timesheetCode: timesheet.code,
				regularHours,
				overtimeHours,
				basicPay,
				overtimePay,
				grossPay: grossPayWithSources,
				totalDeductions,
				netPay,
				payrollCorrectionsApplied: payrollCorrectionLines.length,
				payrollCorrectionAmount: payrollCorrectionAppliedAmount,
				payslipDocumentNumber: buildPayslipDocumentNumber(payrollPeriodId, employee.id, {
					payrollPeriodName: payrollPeriodData.name,
					employeeCode: employee.employeeId,
				}),
				payslipFileName: buildPayslipFilename(
					employee.employeeId || employee.id,
					payrollPeriodData.name || payrollPeriodData.id,
				),
			});

			successCount++;
			processedCount++;
			options?.onProgress?.({
				processed: processedCount,
				success: successCount,
				failed: errorCount,
				employeeId: employee.employeeId || employee.id,
			});
			payrollLogger.info(`Generated payroll for employee: ${employee.employeeId}`);
		} catch (error) {
			errorCount++;
			processedCount++;
			options?.onProgress?.({
				processed: processedCount,
				success: successCount,
				failed: errorCount,
				employeeId: timesheet.employee?.employeeId || timesheet.employee?.id,
				error: error instanceof Error ? error.message : String(error),
			});
			payrollLogger.error(
				`Failed to generate payroll for timesheet ${timesheet.id}: ${error}`,
			);
		}
	}

	const [
		employeePayrollTotalCount,
		timesheetsTotalCount,
		approvedTimesheetsTotalCount,
		payrollReadyTimesheetsTotalCount,
		timesheetLinesTotalCount,
	] = await Promise.all([
		prisma.employeePayroll.count({
			where: {
				organizationId,
				payrollPeriodId,
				isDeleted: false,
			},
		}),
		prisma.timesheet.count({
			where: {
				organizationId,
				payrollPeriodId,
				isDeleted: false,
			},
		}),
		prisma.timesheet.count({
			where: {
				organizationId,
				payrollPeriodId,
				isDeleted: false,
				status: "APPROVED",
			},
		}),
		prisma.timesheet.count({
			where: {
				organizationId,
				payrollPeriodId,
				isDeleted: false,
				status: "APPROVED",
				employee: {
					basicSalary: { gt: 0 },
					NOT: [{ embeddedSchedule: { equals: Prisma.DbNull } }],
				},
			},
		}),
		prisma.timesheetline.count({
			where: {
				organizationId,
				payrollPeriodId,
				isDeleted: false,
				isEffective: true,
			},
		}),
	]);
	const existingPeriodMetadata = asRecord(payrollPeriodData.generationMetadata);
	const completedAt = new Date();

	// Update payroll period status to COMPLETED and persist audit-friendly totals.
	// Always force payrollGeneration → completed so UI never offers "Resume" against a
	// COMPLETED period (stale paused/processing snapshots caused "already completed" toast).
	const priorGeneration = asRecord(existingPeriodMetadata.payrollGeneration);
	const completedIso = completedAt.toISOString();
	await prisma.payrollPeriod.update({
		where: { id: payrollPeriodId },
		data: {
			status: "COMPLETED",
			processedBy: timesheetLockEmployeeId,
			processedAt: completedAt,
			generationMetadata: {
				...existingPeriodMetadata,
				payrollRunTotals: {
					employeePayrollTotalCount,
					timesheetsTotalCount,
					approvedTimesheetsTotalCount,
					payrollReadyTimesheetsTotalCount,
					timesheetLinesTotalCount,
					generatedPayrollCount: successCount,
					errorCount,
					lockedTimesheetsCount: lockedCount,
					payslipsGeneratedCount: payslipSuccessCount,
					payslipErrorCount,
					payrollCorrectionsAppliedCount,
					savedAt: completedIso,
				},
				payrollGeneration: {
					...priorGeneration,
					periodId: payrollPeriodId,
					status: "completed",
					total: Number(priorGeneration.total ?? timesheets.length + resumeProcessedCount) || successCount,
					processed: Math.max(
						Number(priorGeneration.processed || 0),
						successCount,
					),
					success: Math.max(Number(priorGeneration.success || 0), successCount),
					failed: Number(priorGeneration.failed || errorCount) || errorCount,
					message:
						payslipErrorCount > 0
							? `Payroll generated for ${successCount} employees with ${payslipErrorCount} payslip issue(s)`
							: `Payroll and payslips generated for ${successCount} employees`,
					updatedAt: completedIso,
					completedAt: completedIso,
					pauseRequested: false,
					pauseRequestedAt: null,
					cancellationRequested: false,
					cancellationRequestedAt: null,
					orphaned: false,
				},
			},
		},
	});

	payrollLogger.info(
		`Payroll generation completed: ${successCount} success, ${errorCount} errors, ${payrollCorrectionsAppliedCount} payroll corrections applied`,
	);

	return {
		success: true,
		message:
			payslipErrorCount > 0
				? `Payroll generated for ${successCount} employees with ${payslipErrorCount} payslip issue(s)`
				: `Payroll and payslips generated for ${successCount} employees`,
		generated: successCount,
		errors: errorCount,
		locked: lockedCount,
		payslipsGenerated: payslipSuccessCount,
		payslipErrors: payslipErrorCount,
		payrollCorrectionsApplied: payrollCorrectionsAppliedCount,
		total: timesheets.length + resumeProcessedCount,
		payrolls: generatedPayrolls,
	};
}

export async function previewPayrollFromTimesheets(
	prisma: PrismaClient,
	payrollPeriodId: string,
	organizationId: string,
	options?: {
		page?: number;
		limit?: number;
		query?: string;
		departmentId?: string | null;
		sectionId?: string | null;
		employeeId?: string | null;
		requireCalculator?: boolean;
		calculateRows?: boolean;
	},
) {
	const page = options?.page && options.page > 0 ? options.page : 1;
	const limit = options?.limit && options.limit > 0 ? options.limit : 10;
	const normalizedQuery = options?.query?.trim() || "";
	const detailEmployeeId = options?.employeeId?.trim() || "";
	const shouldCalculateRows = Boolean(detailEmployeeId || options?.calculateRows);

	const payrollPeriodData: any = await prisma.payrollPeriod.findUnique({
		where: { id: payrollPeriodId },
		include: {
			calculator: true,
		},
	});

	if (!payrollPeriodData) {
		throw new Error(`Payroll period not found: ${payrollPeriodId}`);
	}

	if ((options?.requireCalculator || shouldCalculateRows) && !payrollPeriodData.calculator) {
		throw new Error(
			`No calculator configured for payroll period: ${payrollPeriodId}. Please assign a calculator to this payroll period.`,
		);
	}

	const calculator = payrollPeriodData.calculator;

	const periodNumber = payrollPeriodData.periodNumber || 1;
	const periodDate = new Date(payrollPeriodData.startDate);
	const year = periodDate.getFullYear();
	const month = periodDate.getMonth() + 1;

	const baseWhere = buildPayrollPreviewBaseWhere({
		payrollPeriodId,
		organizationId,
		payFrequency: payrollPeriodData.payFrequency || null,
		departmentId: options?.departmentId,
		sectionId: options?.sectionId,
	});
	const employeeScopeWhere = buildPayrollScopeEmployeeWhere({
		organizationId,
		payFrequency: payrollPeriodData.payFrequency || null,
		departmentId: options?.departmentId,
		sectionId: options?.sectionId,
	});
	const summaryWhere = buildPayrollPreviewIncludedWhere({
		baseWhere,
		query: "",
	});
	const filteredWhere = buildPayrollPreviewIncludedWhere({
		baseWhere,
		query: normalizedQuery,
		employeeId: detailEmployeeId || undefined,
	});
	const excludedWhere = buildPayrollPreviewExcludedWhere({ baseWhere });
	const notReadyEmployeeWhere = buildPayrollPreviewNotReadyEmployeeWhere({
		employeeScopeWhere,
		payrollPeriodId,
	});
	const notSubmittedEmployeeWhere = buildPayrollPreviewNotSubmittedEmployeeWhere({
		employeeScopeWhere,
		payrollPeriodId,
	});

	const [
		scopeEmployeesCount,
		approvedTimesheetsCount,
		includedEmployeesCount,
		notSubmittedEmployeesCount,
		totalItems,
	] = await Promise.all([
		prisma.employee.count({
			where: employeeScopeWhere,
		}),
		prisma.timesheet.count({
			where: baseWhere,
		}),
		prisma.timesheet.count({
			where: summaryWhere,
		}),
		prisma.employee.count({
			where: notSubmittedEmployeeWhere,
		}),
		prisma.timesheet.count({
			where: filteredWhere,
		}),
	]);
	const totalPages = Math.max(1, Math.ceil(totalItems / limit));
	const safePage = Math.min(page, totalPages);
	const skip = (safePage - 1) * limit;

	const [paginatedTimesheets, excludedTimesheets, notReadyEmployees] = await Promise.all([
		prisma.timesheet.findMany({
			where: filteredWhere,
			select: shouldCalculateRows ? payrollPreviewTimesheetSelect : payrollPreviewListTimesheetSelect,
			orderBy: [{ employeeId: "asc" }, { id: "asc" }],
			skip,
			take: detailEmployeeId ? 1 : limit,
		}),
		prisma.timesheet.findMany({
			where: excludedWhere,
			select: payrollPreviewListTimesheetSelect,
			orderBy: [{ employeeId: "asc" }, { id: "asc" }],
		}),
		prisma.employee.findMany({
			where: notReadyEmployeeWhere,
			select: payrollPreviewExcludedEmployeeSelect,
			orderBy: [{ employeeId: "asc" }, { id: "asc" }],
		}),
	]);

	let pageRows = buildPayrollPreviewIncludedEmployees(paginatedTimesheets);
	let estimatedGrossPay = 0;
	let estimatedTotalDeductions = 0;
	let estimatedNetPay = 0;

	if (shouldCalculateRows && calculator) {
		const taxRates = calculator.taxRates as any[];
		const sssRates = calculator.sssRates as any;
		const philHealthRates = calculator.philHealthRates as any;
		const pagibigRates = calculator.pagibigRates as any;
		const rateMultipliers = calculator.rateMultipliers as any;

		const holidays = await prisma.calendarItem.findMany({
			where: {
				organizationId,
				type: "HOLIDAY",
				status: "ACTIVE",
				startDate: {
					gte: payrollPeriodData.startDate,
					lte: payrollPeriodData.endDate,
				},
			},
			select: {
				startDate: true,
				endDate: true,
				title: true,
				metadata: true,
				tags: true,
			},
		});

		const holidayMap = new Map<string, any>();
		for (const holiday of holidays) {
			const dateKey = getDateKey(holiday.startDate);
			if (holidayMap.has(dateKey)) {
				const existing = holidayMap.get(dateKey);
				const existingType = (existing.metadata as any)?.holidayType;
				const newType = (holiday.metadata as any)?.holidayType;

				if (
					(existingType === "regular" &&
						(newType === "special-non-working" || newType === "special-working")) ||
					(newType === "regular" &&
						(existingType === "special-non-working" || existingType === "special-working"))
				) {
					holidayMap.set(dateKey, {
						hisDoubleHoliday: true,
						holidayType: "regular",
						holidayTitle: `${existing.holidayTitle} & ${holiday.title}`,
						metadata: existing.metadata,
						secondHolidayType: newType === "regular" ? existingType : newType,
					});
				}
			} else {
				holidayMap.set(dateKey, {
					holidayType: (holiday.metadata as any)?.holidayType,
					holidayTitle: holiday.title,
					isDoubleHoliday: false,
					metadata: holiday.metadata,
				});
			}
		}

	const employeePayrollsByEmployeeId = await buildEmployeePayrollsByEmployeeId(prisma, {
		employeeIds: [
			...paginatedTimesheets.map((timesheet: any) => timesheet.employeeId),
		],
		organizationId,
		year,
		month,
	});
	const payrollSourceAmountsByEmployeeId = await buildPayrollSourceAmountsByEmployeeId(prisma, {
		employeeIds: [
			...paginatedTimesheets.map((timesheet: any) => timesheet.employeeId),
		],
		organizationId,
		payrollPeriodId,
		startDate: payrollPeriodData.startDate,
		endDate: payrollPeriodData.endDate,
	});
	const pageCalculation = calculatePayrollPreviewDataset({
		timesheets: paginatedTimesheets,
		payrollPeriodData,
		holidayMap,
		taxRates,
		sssRates,
		philHealthRates,
		pagibigRates,
		rateMultipliers,
		periodNumber,
		employeePayrollsByEmployeeId,
		payrollSourceAmountsByEmployeeId,
		includeRows: true,
	});
		pageRows = pageCalculation.rows;
		estimatedGrossPay = pageCalculation.estimatedGrossPay;
		estimatedTotalDeductions = pageCalculation.estimatedTotalDeductions;
		estimatedNetPay = pageCalculation.estimatedNetPay;
	}

	return {
		period: {
			id: payrollPeriodData.id,
			code: payrollPeriodData.code || null,
			name: payrollPeriodData.name,
			startDate: payrollPeriodData.startDate,
			endDate: payrollPeriodData.endDate,
			payDate: payrollPeriodData.payDate,
			status: payrollPeriodData.status,
		},
		summary: {
			scopeEmployeesCount,
			approvedTimesheetsCount,
			includedEmployeesCount,
			excludedEmployeesCount: Math.max(0, scopeEmployeesCount - includedEmployeesCount),
			approvedExcludedEmployeesCount: Math.max(
				0,
				approvedTimesheetsCount - includedEmployeesCount,
			),
			notSubmittedEmployeesCount,
			estimatedGrossPay: roundToCentavo(estimatedGrossPay),
			estimatedTotalDeductions: roundToCentavo(estimatedTotalDeductions),
			estimatedNetPay: roundToCentavo(estimatedNetPay),
		},
		includedEmployees: pageRows,
		approvedExcludedEmployees: buildPayrollPreviewExcludedEmployees(excludedTimesheets),
		excludedEmployees: buildPayrollPreviewNotReadyEmployees(notReadyEmployees),
		pagination: {
			page: safePage,
			limit,
			totalItems,
			totalPages,
			hasNextPage: safePage < totalPages,
			hasPreviousPage: safePage > 1,
		},
	};
}

const payrollPreviewTimesheetSelect = {
	id: true,
	employeeId: true,
	timesheetlines: {
		where: {
			isDeleted: false,
			isEffective: true,
		},
		orderBy: {
			date: "asc",
		},
	},
	employee: {
		select: {
			id: true,
			employeeId: true,
			basicSalary: true,
			payFrequency: true,
			embeddedSchedule: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
			department: {
				select: {
					id: true,
					name: true,
				},
			},
			position: {
				select: {
					id: true,
					title: true,
				},
			},
			scheduleOverrides: {
				where: {
					isDeleted: false,
				},
				include: {
					shiftType: true,
				},
			},
			scheduleHistoryRecords: {
				orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
				select: {
					effectiveAt: true,
					createdAt: true,
					afterSchedule: true,
					beforeSchedule: true,
				},
			},
		},
	},
} satisfies Prisma.TimesheetSelect;

const payrollPreviewListTimesheetSelect = {
	id: true,
	status: true,
	employeeId: true,
	employee: {
		select: {
			id: true,
			employeeId: true,
			basicSalary: true,
			payFrequency: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
			department: {
				select: {
					id: true,
					name: true,
				},
			},
			position: {
				select: {
					id: true,
					title: true,
				},
			},
		},
	},
} satisfies Prisma.TimesheetSelect;

const payrollPreviewExcludedEmployeeSelect = {
	id: true,
	employeeId: true,
	basicSalary: true,
	payFrequency: true,
	embeddedSchedule: true,
	person: {
		select: {
			personalInfo: true,
		},
	},
	department: {
		select: {
			id: true,
			name: true,
		},
	},
	position: {
		select: {
			id: true,
			title: true,
		},
	},
	timesheets: {
		select: {
			id: true,
			status: true,
		},
		orderBy: {
			updatedAt: "desc",
		},
		take: 1,
	},
} satisfies Prisma.EmployeeSelect;

function buildPayrollPreviewIncludedEmployees(timesheets: any[]) {
	return timesheets.map((timesheet) => {
		const employee = timesheet.employee || {};
		const employeeName =
			`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() ||
			employee.employeeId ||
			employee.id ||
			"Unknown employee";

		return {
			employeeId: employee.id || timesheet.employeeId || null,
			employeeCode: employee.employeeId || null,
			name: employeeName,
			department: employee.department?.name || "N/A",
			position: employee.position?.title || "N/A",
			payFrequency: employee.payFrequency || "MONTHLY",
			basicSalary: employee.basicSalary || 0,
			timesheetId: timesheet.id,
			payrollComputationStatus: "DETAIL_REQUIRED",
		};
	});
}

function buildPayrollPreviewBaseWhere(params: {
	payrollPeriodId: string;
	organizationId: string;
	payFrequency?: PayFrequency | null;
	departmentId?: string | null;
	sectionId?: string | null;
}): Prisma.TimesheetWhereInput {
	const { payrollPeriodId, organizationId, payFrequency } = params;
	const scope = normalizePayrollScope(params);

	return {
		organizationId,
		payrollPeriodId,
		status: "APPROVED",
		isDeleted: false,
		employee: {
			is: {
				isDeleted: false,
				workforceSource: "DIRECT",
				...(payFrequency ? { payFrequency } : {}),
				...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
				...(scope.sectionId ? { sectionId: scope.sectionId } : {}),
			},
		},
	};
}

function buildPayrollScopeEmployeeWhere(params: {
	organizationId: string;
	payFrequency?: PayFrequency | null;
	departmentId?: string | null;
	sectionId?: string | null;
}): Prisma.EmployeeWhereInput {
	const scope = normalizePayrollScope(params);
	return {
		organizationId: params.organizationId,
		isDeleted: false,
		workforceSource: "DIRECT",
		...(params.payFrequency ? { payFrequency: params.payFrequency } : {}),
		...(scope.departmentId ? { departmentId: scope.departmentId } : {}),
		...(scope.sectionId ? { sectionId: scope.sectionId } : {}),
	};
}

function buildPayrollPreviewIncludedWhere(params: {
	baseWhere: Prisma.TimesheetWhereInput;
	query?: string;
	employeeId?: string;
}): Prisma.TimesheetWhereInput {
	const terms = (params.query || "")
		.trim()
		.split(/\s+/)
		.map((term) => term.trim())
		.filter(Boolean);
	const insensitive = Prisma.QueryMode.insensitive;
	const searchConditions: Prisma.TimesheetWhereInput[] = terms.map((term) => ({
		OR: [
			{
				employee: {
					is: {
						employeeId: { contains: term, mode: insensitive },
					},
				},
			},
			{
				employee: {
					is: {
						person: {
							personalInfo: {
								path: ["firstName"],
								string_contains: term,
								mode: insensitive,
							},
						},
					},
				},
			},
			{
				employee: {
					is: {
						person: {
							personalInfo: {
								path: ["lastName"],
								string_contains: term,
								mode: insensitive,
							},
						},
					},
				},
			},
		],
	}));

	return {
		AND: [
			params.baseWhere,
			{
				employee: {
					is: {
						basicSalary: { gt: 0 },
						NOT: [{ embeddedSchedule: { equals: Prisma.DbNull } }],
					},
				},
			},
			...(params.employeeId
				? [
						{
							employeeId: params.employeeId,
						},
					]
				: []),
			...searchConditions,
		],
	};
}

function buildPayrollPreviewExcludedWhere(params: {
	baseWhere: Prisma.TimesheetWhereInput;
}): Prisma.TimesheetWhereInput {
	return {
		AND: [
			params.baseWhere,
			{
				OR: [
					{
						employee: {
							is: {
								basicSalary: { lte: 0 },
							},
						},
					},
					{
						employee: {
							is: {
								embeddedSchedule: { equals: Prisma.DbNull },
							},
						},
					},
				],
			},
		],
	};
}

function buildPayrollPreviewNotReadyEmployeeWhere(params: {
	employeeScopeWhere: Prisma.EmployeeWhereInput;
	payrollPeriodId: string;
}): Prisma.EmployeeWhereInput {
	return {
		AND: [
			params.employeeScopeWhere,
			{
				OR: [
					{ basicSalary: { lte: 0 } },
					{ embeddedSchedule: { equals: Prisma.DbNull } },
					{
						timesheets: {
							none: {
								payrollPeriodId: params.payrollPeriodId,
								isDeleted: false,
							},
						},
					},
					{
						timesheets: {
							some: {
								payrollPeriodId: params.payrollPeriodId,
								isDeleted: false,
								status: { in: ["DRAFT", "SUBMITTED", "REJECTED", "REVISED"] },
							},
						},
					},
				],
			},
		],
	};
}

function buildPayrollPreviewNotSubmittedEmployeeWhere(params: {
	employeeScopeWhere: Prisma.EmployeeWhereInput;
	payrollPeriodId: string;
}): Prisma.EmployeeWhereInput {
	return {
		AND: [
			params.employeeScopeWhere,
			{
				OR: [
					{
						timesheets: {
							none: {
								payrollPeriodId: params.payrollPeriodId,
								isDeleted: false,
							},
						},
					},
					{
						timesheets: {
							some: {
								payrollPeriodId: params.payrollPeriodId,
								isDeleted: false,
								status: "DRAFT",
							},
						},
					},
				],
			},
		],
	};
}

function getPayrollGenerationExclusionReasons(employee: any): string[] {
	const reasons: string[] = [];
	if (!employee?.basicSalary || employee.basicSalary <= 0) {
		reasons.push("Basic salary is missing or zero.");
	}
	if (!employee?.embeddedSchedule) {
		reasons.push("Work schedule is not configured.");
	}
	return reasons;
}

function buildPayrollPreviewExcludedEmployees(timesheets: any[]) {
	return timesheets.map((timesheet) => {
		const employee = timesheet.employee || {};
		const employeeName =
			`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() ||
			employee.employeeId ||
			employee.id ||
			"Unknown employee";
		const reasons = getPayrollGenerationExclusionReasons(employee);

		return {
			employeeId: employee.id || timesheet.employeeId || null,
			employeeCode: employee.employeeId || null,
			name: employeeName,
			reason: reasons.join(" "),
			blockerType:
				reasons.length > 1
					? "missing_payroll_inputs"
					: reasons[0]?.includes("schedule")
						? "missing_schedule"
						: "missing_basic_salary",
		};
	});
}

function getPayrollPreviewNotReadyReasons(employee: any): {
	reason: string;
	blockerType: string;
} {
	const timesheet = employee?.timesheets?.[0] || null;
	const reasons: string[] = [];
	const blockerTypes: string[] = [];

	if (!employee?.basicSalary || employee.basicSalary <= 0) {
		reasons.push("Basic salary is missing or zero.");
		blockerTypes.push("missing_basic_salary");
	}
	if (!employee?.embeddedSchedule) {
		reasons.push("Work schedule is not configured.");
		blockerTypes.push("missing_schedule");
	}
	if (!timesheet) {
		reasons.push("Timesheet is missing for this payroll period.");
		blockerTypes.push("missing_timesheet");
	} else if (timesheet.status === "DRAFT") {
		reasons.push("Timesheet has not been submitted.");
		blockerTypes.push("not_submitted");
	} else if (timesheet.status === "SUBMITTED") {
		reasons.push("Timesheet is submitted and pending approval.");
		blockerTypes.push("pending_approval");
	} else if (timesheet.status === "REJECTED" || timesheet.status === "REVISED") {
		reasons.push("Timesheet needs correction before payroll.");
		blockerTypes.push("correction_needed");
	}

	return {
		reason: reasons.join(" "),
		blockerType:
			blockerTypes.length > 1
				? "multiple"
				: blockerTypes[0] || "not_payroll_ready",
	};
}

function buildPayrollPreviewNotReadyEmployees(employees: any[]) {
	return employees.map((employee) => {
		const employeeName =
			`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() ||
			employee.employeeId ||
			employee.id ||
			"Unknown employee";
		const timesheet = employee.timesheets?.[0] || null;
		const readiness = getPayrollPreviewNotReadyReasons(employee);

		return {
			employeeId: employee.id || null,
			employeeCode: employee.employeeId || null,
			name: employeeName,
			department: employee.department?.name || "N/A",
			position: employee.position?.title || "N/A",
			payFrequency: employee.payFrequency || "MONTHLY",
			basicSalary: employee.basicSalary || 0,
			timesheetId: timesheet?.id || null,
			timesheetStatus: timesheet?.status || "MISSING",
			reason: readiness.reason,
			blockerType: readiness.blockerType,
		};
	});
}

type PayrollSourceAmounts = {
	totalCompensationBenefits: number;
	grossIncludedBenefits: number;
	nonTaxableGrossIncludedBenefits: number;
	receivableOnlyBenefits: number;
	leavePay: number;
	netAdjustments: number;
	deductionBenefits: number;
	uniformDeductionBenefits: number;
	loanDeductions: number;
};

type PayrollSourceDetail = {
	id: string;
	source: "employeeBenefit" | "employeeLoan";
	code: string | null;
	/** Primary display label (enrollment / payroll adjustment name). */
	name: string;
	/** Benefit type name used as category and Bandai register name matching. */
	benefitTypeName?: string | null;
	direction: "COMPENSATION" | "DEDUCTION" | "LOAN";
	reconciliationAction: string | null;
	/** From BenefitType.isTaxable; frozen for payslip/details tax grouping. */
	isTaxable?: boolean | null;
	amount: number;
	startDate: Date | null;
	endDate: Date | null;
	payrollPeriodId: string | null;
	payrollPeriodCode: string | null;
	installmentIds?: string[];
};

const emptyPayrollSourceAmounts = (): PayrollSourceAmounts => ({
	totalCompensationBenefits: 0,
	grossIncludedBenefits: 0,
	nonTaxableGrossIncludedBenefits: 0,
	receivableOnlyBenefits: 0,
	leavePay: 0,
	netAdjustments: 0,
	deductionBenefits: 0,
	uniformDeductionBenefits: 0,
	loanDeductions: 0,
});

const emptyPayrollSourceDetails = (): PayrollSourceDetail[] => [];

type BandaiPayrollRegisterInput = {
	employee: any;
	payrollPeriodData: any;
	periodBasic: number;
	estimatedMonthlyRate: number;
	dailyRate: number;
	totalWorkDays: number;
	basicPay: number;
	absentDeduction: number;
	lateDeduction: number;
	earlyOutDeduction: number;
	shortfallDeduction: number;
	overtimePay: number;
	nightDiffPay: number;
	holidayPay: number;
	grossPayWithSources: number;
	withholdingTax: number;
	periodContributions: { sss: number; philHealth: number; pagIbig: number };
	payrollSourceAmounts: PayrollSourceAmounts;
	payrollSourceDetails: PayrollSourceDetail[];
	totalDeductions: number;
	netPay: number;
	bandaiApprovedBucketPay: ReturnType<typeof calculateBandaiApprovedBucketPay>;
};

const normalizePayrollRegisterKey = (value: unknown): string =>
	String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");

function sumPayrollSourceDetails(
	details: PayrollSourceDetail[],
	params: { codes?: string[]; names?: string[]; directions?: Array<PayrollSourceDetail["direction"]> },
) {
	const codeKeys = new Set((params.codes || []).map(normalizePayrollRegisterKey));
	const nameKeys = new Set((params.names || []).map(normalizePayrollRegisterKey));
	const directionKeys = new Set(params.directions || []);
	return roundToCentavo(
		details.reduce((sum, detail) => {
			if (directionKeys.size && !directionKeys.has(detail.direction)) return sum;
			const codeKey = normalizePayrollRegisterKey(detail.code);
			const nameKey = normalizePayrollRegisterKey(detail.name);
			const typeNameKey = normalizePayrollRegisterKey(detail.benefitTypeName);
			// Match code, enrollment name, or benefit type name so register columns
			// (e.g. De Minimis) still roll up when display name is enrollment-specific.
			if (
				(codeKey && codeKeys.has(codeKey)) ||
				(nameKey && nameKeys.has(nameKey)) ||
				(typeNameKey && nameKeys.has(typeNameKey))
			) {
				return sum + Number(detail.amount || 0);
			}
			return sum;
		}, 0),
	);
}

function buildBandaiPayrollRegister(input: BandaiPayrollRegisterInput) {
	const details = input.payrollSourceDetails || [];
	const sourceBy = (codes: string[], names: string[], directions?: Array<PayrollSourceDetail["direction"]>) =>
		sumPayrollSourceDetails(details, { codes, names, directions });
	const bucket = input.bandaiApprovedBucketPay;
	const bucketHours = asRecord(bucket?.hours);
	const totalReceivable = roundToCentavo(
		input.netPay + input.payrollSourceAmounts.receivableOnlyBenefits,
	);
	const sourceRow = {
		monthlySalary: roundToCentavo(input.estimatedMonthlyRate),
		dailySalary: roundToCentavo(input.dailyRate),
		numberOfDays: roundToCentavo(input.totalWorkDays),
		basicPay: roundToCentavo(input.periodBasic),
		absentDeduction: roundToCentavo(input.absentDeduction),
		// shortfallDeduction is already late+earlyOut; do not triple-sum for register UT/Late-Amt.
		lateUndertimeAmount: roundToCentavo(
			input.shortfallDeduction > 0
				? input.shortfallDeduction
				: input.lateDeduction + input.earlyOutDeduction,
		),
		regularOtHours: roundToCentavo(Number(bucketHours.regOtHrs || 0)),
		overtimePay: roundToCentavo(bucket ? Number(bucket.overtimePay || 0) : input.overtimePay),
		restDayHours: roundToCentavo(Number(bucketHours.rdHrs || 0)),
		restDayHoursPay: roundToCentavo(bucket ? Number(bucket.restDayPay || 0) : 0),
		restDayOtHours: roundToCentavo(Number(bucketHours.rdOtHrs || 0)),
		restDayOtPay: roundToCentavo(bucket ? Number(bucket.restDayOtPay || 0) : 0),
		specialHolidayOtHours: roundToCentavo(
			Number(bucketHours.spclHrs || 0) + Number(bucketHours.spclOtHrs || 0),
		),
		specialHolidayOtPay: roundToCentavo(bucket ? Number(bucket.specialHolidayPay || 0) : 0),
		sunSpecialHolidayOtExcessHours: 0,
		sunSpecialHolidayOtExcessPay: 0,
		specialHolidayRestDayOtHours: 0,
		specialHolidayRestDayOtPay: 0,
		specialRestDayExcessHours: 0,
		specialRestDayExcessOtPay: 0,
		legalHolidayOtHours: roundToCentavo(
			Number(bucketHours.rholHrs || 0) + Number(bucketHours.rholOtHrs || 0),
		),
		legalHolidayOtPay: roundToCentavo(bucket ? Number(bucket.legalHolidayPay || 0) : 0),
		legalHolidayExcessPay: 0,
		legalHolidayRestDayPay: 0,
		legalHolidayExcess1Pay: 0,
		legalHolidayRestDayExcessPay: 0,
		nightDiffPay: roundToCentavo(input.nightDiffPay),
		leavePay: roundToCentavo(input.payrollSourceAmounts.leavePay),
		christmasGift: sourceBy([], ["Christmas Gift"], ["COMPENSATION"]),
		specialBonus: sourceBy([], ["Special Bonus"], ["COMPENSATION"]),
		mandatoryContributionAdjustment: sourceBy([], ["Mandatory Cont Adjustment"], ["COMPENSATION"]),
		guaranteedBonus: sourceBy([], ["Guaranteed Bonus"], ["COMPENSATION"]),
		hysMealAllowance: sourceBy(["HYS"], ["HYS Meal Allowance"], ["COMPENSATION"]),
		obAllowance: sourceBy(["OBA"], ["OB Allowance"], ["COMPENSATION"]),
		otherAdjustment: sourceBy([], ["Other Adjustment"], ["COMPENSATION"]),
		overtimeMealAllowance: sourceBy(["OTM"], ["Overtime Meal Allownce"], ["COMPENSATION"]),
		sportsfestOt: sourceBy([], ["Sportsfest OT"], ["COMPENSATION"]),
		fringeBenefit: sourceBy([], ["Fringe Benefit"], ["COMPENSATION"]),
		annualIncentive: sourceBy([], ["Annual Incentive"], ["COMPENSATION"]),
		technicalSkillsAllowance: sourceBy(["TSA"], ["Technical Skills Allowance"], ["COMPENSATION"]),
		aclVlConversionTaxable: sourceBy([], ["ACL/VL Conversion Taxable"], ["COMPENSATION"]),
		adjustmentOverusedLeave: sourceBy([], ["Adjustment Overused Leave"], ["COMPENSATION"]),
		thirteenthMonthAdjustment: sourceBy([], ["13th Month Adjustment"], ["COMPENSATION"]),
		productionIncentives: sourceBy([], ["Production Incentives"], ["COMPENSATION"]),
		otherCompensation: sourceBy(["OAD"], ["Other Compensation"], ["COMPENSATION"]),
		adjustmentBasic: sourceBy(["ABS"], ["Adjustment Basic"], ["COMPENSATION"]),
		adjustmentOtNd: sourceBy(["AON"], ["Adjustment OT/ND"], ["COMPENSATION"]),
		adjustmentNonTax: sourceBy([], ["Adjustment Non-Tax"], ["COMPENSATION"]),
		excessDeduction: sourceBy([], ["Excess Deduction"], ["COMPENSATION"]),
		deMinimisAllowance: sourceBy(["DMA"], ["De Minimis Allowance"], ["COMPENSATION"]),
		christmasGiftKid: sourceBy([], ["Christmas Gift (Kid)"], ["COMPENSATION"]),
		birthdayGiftKid: sourceBy([], ["Birthday Gift (Kid)"], ["COMPENSATION"]),
		birthdayGiftEmployee: sourceBy([], ["Birthday Gift (Employee)"], ["COMPENSATION"]),
		grossPay: roundToCentavo(input.grossPayWithSources),
		taxAmount: roundToCentavo(input.withholdingTax),
		fringeBenefitTax: sourceBy([], ["FBTax"], ["DEDUCTION"]),
		sssContribution: roundToCentavo(input.periodContributions.sss),
		philHealthContribution: roundToCentavo(input.periodContributions.philHealth),
		pagibigContribution: roundToCentavo(input.periodContributions.pagIbig),
		sssEmergencyLoan: sourceBy([], ["SSS Emergency Loan"], ["LOAN"]),
		philHealthContributionAdjustment: sourceBy([], ["PHEALTH CONTRI Adjustment"], ["DEDUCTION"]),
		excessInternetUsage: sourceBy([], ["Excess Internet Usage"], ["DEDUCTION"]),
		taxPayable: sourceBy([], ["Tax Payable"], ["DEDUCTION"]),
		adjustmentBasicDeduction: sourceBy([], ["Adjustment Basic Deduction"], ["DEDUCTION"]),
		excessMlBenefits: sourceBy([], ["Excess ML Benefits"], ["DEDUCTION"]),
		uniformDeduction: roundToCentavo(input.payrollSourceAmounts.uniformDeductionBenefits),
		sssLoanRestructuringProgram: sourceBy([], ["SSS Loan Restructuring Program"], ["LOAN"]),
		phicOnePercentDifferential: sourceBy([], ["PHIC 1% DIFFERENTIAL"], ["DEDUCTION"]),
		modifiedHdmf2: sourceBy(["MHDMF2"], ["Modified HDMF 2"], ["DEDUCTION"]),
		communityTaxCertificate: sourceBy([], ["Community Tax Certificate"], ["DEDUCTION"]),
		hdmfContributionAdjustment: sourceBy([], ["HDMF Contribution Adjustment"], ["DEDUCTION"]),
		personalCallsUsage: sourceBy([], ["Personal Calls Usage"], ["DEDUCTION"]),
		healthInsurance: sourceBy([], ["Health Insurance"], ["DEDUCTION"]),
		shuttleService: sourceBy([], ["Shuttle Service"], ["DEDUCTION"]),
		negativeAdjustment: sourceBy([], ["Negative Adjustment"], ["DEDUCTION"]),
		bnpiEmergencyLoan: sourceBy([], ["BNPI Emergency Loan"], ["LOAN"]),
		bnpiSalaryLoan: sourceBy([], ["BNPI Salary Loan"], ["LOAN"]),
		rcbcLoan: sourceBy([], ["RCBC Loan"], ["LOAN"]),
		hdmfCalamityLoan: sourceBy([], ["HDMF Calamity Loan"], ["LOAN"]),
		hdmfSalaryLoan: sourceBy([], ["HDMF Salary Loan"], ["LOAN"]),
		sssCalamityLoan: sourceBy([], ["SSS Calamity Loan"], ["LOAN"]),
		sssSalaryLoan: sourceBy([], ["SSS Salary Loan"], ["LOAN"]),
		totalDeductions: roundToCentavo(input.totalDeductions),
		netPay: roundToCentavo(input.netPay),
		adjustmentHolidayPay: sourceBy([], ["Adjustment Holiday Pay"], ["COMPENSATION"]),
		communityTaxCert: sourceBy([], ["Community Tax Cert"], ["COMPENSATION"]),
		oneKChristmasGift: sourceBy([], ["1K Christmas Gift"], ["COMPENSATION"]),
		taxRefund: sourceBy([], ["Tax Refund"], ["COMPENSATION"]),
		thirteenthMonthPay: sourceBy([], ["13th Month"], ["COMPENSATION"]),
		aclVlConversion: sourceBy([], ["ACL/VL Conversion"], ["COMPENSATION"]),
		otMealAllowance: sourceBy(["OTM"], ["OT Meal Allowance"], ["COMPENSATION"]),
		perfectAttendance: sourceBy(["PFA"], ["Perfect Attendance"], ["COMPENSATION"]),
		mealAllowance: sourceBy(["MLA"], ["Meal Allowance"], ["COMPENSATION"]),
		lineLeaderAllowance: sourceBy(["LLA"], ["Line Leader Allowance"], ["COMPENSATION"]),
		totalReceivable,
	};
	const columns = BANDAI_PAYROLL_REGISTER_COLUMNS.map(([column, label, field]) => ({
		column,
		label,
		field,
		value: roundToCentavo(Number((sourceRow as Record<string, any>)[field] || 0)),
		source:
			field === "monthlySalary" ||
			field === "dailySalary" ||
			field === "numberOfDays" ||
			field === "basicPay"
				? "Employee/PayrollPeriod rate basis"
				: field === "regularOtHours" ||
					  field === "restDayHours" ||
					  field === "restDayOtHours" ||
					  field === "specialHolidayOtHours" ||
					  field === "legalHolidayOtHours"
					? "Timesheetline approved bucket snapshot"
					: "Generated payroll and active EmployeeBenefit/EmployeeLoan rows",
	}));
	const {
		basicPay: _basicPay,
		overtimePay: _overtimePay,
		nightDiffPay: _nightDiffPay,
		absentDeduction: _absentDeduction,
		grossPay: _grossPay,
		taxAmount: _taxAmount,
		sssContribution: _sssContribution,
		philHealthContribution: _philHealthContribution,
		pagibigContribution: _pagibigContribution,
		totalDeductions: _totalDeductions,
		netPay: _netPay,
		...persistFields
	} = sourceRow;
	return {
		fields: sourceRow,
		persistFields,
		columns,
	};
}

export async function buildPayrollSourceAmountsByEmployeeId(
	prisma: PrismaClient,
	params: {
		employeeIds: string[];
		organizationId: string;
		payrollPeriodId: string;
		startDate: Date;
		endDate: Date;
	},
) {
	const uniqueEmployeeIds = Array.from(new Set(params.employeeIds.filter(Boolean)));
	const sourceByEmployeeId = new Map<
		string,
		{ amounts: PayrollSourceAmounts; details: PayrollSourceDetail[]; installmentIds: string[] }
	>();
	if (uniqueEmployeeIds.length === 0) return sourceByEmployeeId;

	const periodSourceWhere = {
		OR: [
			{ payrollPeriodId: params.payrollPeriodId },
			{
				payrollPeriodId: null,
				startDate: { lte: params.endDate },
				OR: [{ endDate: null }, { endDate: { gte: params.startDate } }],
			},
		],
	};

	const monthRange = getUtcMonthRangeContaining(params.endDate);
	const loadCycleConfig = async () => {
		try {
			if (!(prisma as any).payrollCycleConfig?.findFirst) return null;
			return await (prisma as any).payrollCycleConfig.findFirst({
				where: { organizationId: params.organizationId, isDeleted: false },
				select: {
					defaultPayFrequency: true,
					payDateOffsetDays: true,
					businessDayRule: true,
					includeHolidaysInBusinessDayCheck: true,
					cycleRules: true,
				},
			});
		} catch {
			return null;
		}
	};
	const [currentPayrollPeriod, cycleConfig, periodsInMonthCount, employeeBenefits, loans, timesheetsForAttendance] =
		await Promise.all([
		(prisma as any).payrollPeriod.findUnique({
			where: { id: params.payrollPeriodId },
			select: {
				id: true,
				periodNumber: true,
				payFrequency: true,
				startDate: true,
				endDate: true,
			},
		}),
		loadCycleConfig(),
		(prisma as any).payrollPeriod.count({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				// Periods whose end falls in the same UTC calendar month as the current period end.
				endDate: { gte: monthRange.start, lte: monthRange.end },
			},
		}),
		(prisma as any).employeeBenefit.findMany({
			where: {
				organizationId: params.organizationId,
				employeeId: { in: uniqueEmployeeIds },
				isDeleted: false,
				isActive: true,
				status: { in: ["ACTIVE", "APPROVED"] },
				...periodSourceWhere,
				benefitType: {
					payrollDirection: { in: ["COMPENSATION", "DEDUCTION"] },
					isDeleted: false,
				},
			},
			select: {
				id: true,
				organizationId: true,
				employeeId: true,
				// Enrollment / payroll adjustment display name (not benefit type name).
				name: true,
				status: true,
				isActive: true,
				isDeleted: true,
				amount: true,
				totalAmount: true,
				installmentAmount: true,
				scheduleMode: true,
				recurrenceFrequency: true,
				attendanceBased: true,
				attendanceAmountBasis: true,
				eligibilityMode: true,
				eligibilityDisqualifyOnAbsent: true,
				eligibilityDisqualifyOnLate: true,
				eligibilityDisqualifyOnUndertime: true,
				eligibilityDisqualifyOnLeave: true,
				startDate: true,
				endDate: true,
				startPayrollCutOff: true,
				endPayrollCutOff: true,
				payrollPeriodId: true,
				payrollPeriod: {
					select: {
						code: true,
					},
				},
				benefitType: {
					select: {
						code: true,
						name: true,
						reconciliationAction: true,
						isTaxable: true,
						payrollDirection: true,
						isDeleted: true,
					},
				},
				installments: {
					select: {
						id: true,
						installmentNumber: true,
						amount: true,
						scheduledDate: true,
						status: true,
						payrollCutOffId: true,
					},
				},
			},
		}),
		(prisma as any).employeeLoan.findMany({
			where: {
				organizationId: params.organizationId,
				employeeId: { in: uniqueEmployeeIds },
				isDeleted: false,
				status: { in: ["ACTIVE", "APPROVED"] },
				startDate: { lte: params.endDate },
				endDate: { gte: params.startDate },
				loanType: { isDeleted: false, isActive: true },
			},
			select: {
				id: true,
				employeeId: true,
				monthlyPayment: true,
				totalAmount: true,
				startDate: true,
				endDate: true,
				loanType: {
					select: {
						name: true,
					},
				},
			},
		}),
		// Timesheet day breakdowns for attendance-based benefit amount computation.
		// Built here because benefit sources resolve before the per-employee payroll loop.
		(prisma as any).timesheet.findMany({
			where: {
				organizationId: params.organizationId,
				employeeId: { in: uniqueEmployeeIds },
				payrollPeriodId: params.payrollPeriodId,
				isDeleted: false,
			},
			select: {
				employeeId: true,
				timesheetlines: {
					where: {
						isDeleted: false,
						isEffective: true,
					},
					orderBy: {
						date: "asc",
					},
					select: {
						// Timesheetline has hoursWorked (String?), not hours; rest days are status === REST_DAY.
						// Amount pro-rate needs status; eligibility also needs late/undertime durations.
						date: true,
						status: true,
						hoursWorked: true,
						lateHours: true,
						undertimeHours: true,
						isDeleted: true,
						isEffective: true,
					},
				},
			},
		}),
	]);

	const currentFor = (employeeId: string) => {
		const current = sourceByEmployeeId.get(employeeId) || {
			amounts: emptyPayrollSourceAmounts(),
			details: emptyPayrollSourceDetails(),
			installmentIds: [],
		};
		sourceByEmployeeId.set(employeeId, current);
		return current;
	};

	let fiscalYearStartMonth = 1;
	try {
		if (cycleConfig) {
			const merged = getMergedCycleRules({
				defaultPayFrequency: cycleConfig.defaultPayFrequency || "SEMI_MONTHLY",
				payDateOffsetDays: Number(cycleConfig.payDateOffsetDays ?? 5),
				businessDayRule: cycleConfig.businessDayRule || "NEXT_BUSINESS_DAY",
				includeHolidaysInBusinessDayCheck:
					cycleConfig.includeHolidaysInBusinessDayCheck !== false,
				cycleRules: cycleConfig.cycleRules,
			});
			fiscalYearStartMonth = Number(merged.ANNUALLY?.startMonth) || 1;
		}
	} catch {
		fiscalYearStartMonth = 1;
	}

	const periodForEnsure = {
		id: params.payrollPeriodId,
		startDate: params.startDate,
		endDate: params.endDate,
		periodNumber: currentPayrollPeriod?.periodNumber ?? null,
		payFrequency:
			currentPayrollPeriod?.payFrequency ||
			cycleConfig?.defaultPayFrequency ||
			null,
		isOnlyPeriodInMonth: Number(periodsInMonthCount || 0) <= 1,
		fiscalYearStartMonth,
	};

	const attendanceMetricsByEmployeeId = new Map<
		string,
		ReturnType<typeof countAttendanceBenefitDaysFromBreakdown>
	>();
	const eligibilitySignalsByEmployeeId = new Map<
		string,
		ReturnType<typeof countEligibilitySignalsFromBreakdown>
	>();
	for (const timesheet of timesheetsForAttendance as any[]) {
		const employeeId = String(timesheet.employeeId || "");
		if (!employeeId) continue;
		const breakdown = getTimesheetReportingBreakdown(timesheet);
		attendanceMetricsByEmployeeId.set(
			employeeId,
			countAttendanceBenefitDaysFromBreakdown(breakdown),
		);
		eligibilitySignalsByEmployeeId.set(
			employeeId,
			countEligibilitySignalsFromBreakdown(breakdown),
		);
	}

	// Lazy-create / recompute installments before resolve.
	// Order: eligibility (all-or-nothing) → amount pro-rate → recurring ensure.
	for (const row of employeeBenefits as any[]) {
		if (!Array.isArray(row.installments)) {
			row.installments = [];
		}

		const eligibilityMode = normalizeBenefitEligibilityMode(row.eligibilityMode);
		const employeeId = String(row.employeeId || "");
		const amountMetrics = attendanceMetricsByEmployeeId.get(employeeId) || {
			scheduledWorkDays: 0,
			absentDays: 0,
			presentDays: 0,
		};
		const eligibilitySignals = eligibilitySignalsByEmployeeId.get(employeeId) || {
			scheduledWorkDays: 0,
			absentDays: 0,
			lateDays: 0,
			undertimeDays: 0,
			leaveDays: 0,
		};
		const eligibility = evaluateBenefitAttendanceEligibility({
			mode: eligibilityMode,
			flags: {
				disqualifyOnAbsent: row.eligibilityDisqualifyOnAbsent,
				disqualifyOnLate: row.eligibilityDisqualifyOnLate,
				disqualifyOnUndertime: row.eligibilityDisqualifyOnUndertime,
				disqualifyOnLeave: row.eligibilityDisqualifyOnLeave,
			},
			signals: eligibilitySignals,
		});

		const enrolledAmount = Number(
			row.installmentAmount ?? row.amount ?? row.totalAmount ?? 0,
		);
		const needsPeriodAmountRecompute =
			eligibilityMode === "ATTENDANCE_QUALIFIED" || row.attendanceBased === true;

		if (needsPeriodAmountRecompute) {
			let computedAmount: number;
			if (!eligibility.eligible) {
				computedAmount = 0;
			} else if (row.attendanceBased === true) {
				const basis = String(row.attendanceAmountBasis || "").toUpperCase();
				if (basis !== "PER_DAY" && basis !== "PER_CUTOFF") {
					// Invalid attendance config: fall through to recurring ensure if needed
					if (row.scheduleMode === "RECURRING") {
						await ensureRecurringBenefitInstallmentForPeriod(
							prisma as any,
							row,
							periodForEnsure,
						);
					}
					continue;
				}
				computedAmount = computeAttendanceBenefitAmount({
					basis: basis as BenefitAttendanceAmountBasis,
					enrolledAmount,
					scheduledWorkDays: amountMetrics.scheduledWorkDays,
					absentDays: amountMetrics.absentDays,
				});
			} else {
				// ATTENDANCE_QUALIFIED pass + fixed amount
				computedAmount = enrolledAmount > 0 ? enrolledAmount : 0;
			}

			await ensureAttendanceBenefitInstallmentForPeriod(
				prisma as any,
				row,
				periodForEnsure,
				computedAmount,
				{
					requireAttendanceBased: false,
					allowZero: true,
				},
			);
			continue;
		}

		if (row.scheduleMode === "RECURRING") {
			await ensureRecurringBenefitInstallmentForPeriod(prisma as any, row, periodForEnsure);
		}
	}

	const resolvedBenefits = resolvePayrollBenefitSources(
		employeeBenefits.map((row: any) => ({
			...row,
			payrollPeriodCode: row.payrollPeriod?.code || null,
		})) as PayrollBenefitSourceInput[],
		periodForEnsure,
	);

	for (const source of resolvedBenefits) {
		const current = currentFor(source.employeeId);
		const amount = source.amount;
		const action = String(source.reconciliationAction || "").toUpperCase();
		const code = String(source.code || "").toUpperCase();
		current.details.push({
			id: source.id,
			source: "employeeBenefit",
			code: source.code,
			name: source.name,
			benefitTypeName: source.benefitTypeName,
			direction: source.direction,
			reconciliationAction: source.reconciliationAction,
			isTaxable: source.isTaxable === true,
			amount: roundToCentavo(amount),
			startDate: source.startDate,
			endDate: source.endDate,
			payrollPeriodId: source.payrollPeriodId,
			payrollPeriodCode: source.payrollPeriodCode,
			installmentIds: source.installmentIds,
		});
		current.installmentIds.push(...source.installmentIds);

		if (source.direction === "COMPENSATION") {
			if (code === "LVP") {
				current.amounts.leavePay = roundToCentavo(current.amounts.leavePay + amount);
			} else {
				current.amounts.totalCompensationBenefits = roundToCentavo(
					current.amounts.totalCompensationBenefits + amount,
				);
			}
			if (action === "GROSS_INCLUDED" && code !== "LVP") {
				current.amounts.grossIncludedBenefits = roundToCentavo(
					current.amounts.grossIncludedBenefits + amount,
				);
				if (!source.isTaxable) {
					current.amounts.nonTaxableGrossIncludedBenefits = roundToCentavo(
						current.amounts.nonTaxableGrossIncludedBenefits + amount,
					);
				}
			} else if (action === "NET_ADJUSTMENT") {
				current.amounts.netAdjustments = roundToCentavo(current.amounts.netAdjustments + amount);
			} else if (action === "RECEIVABLE_ONLY") {
				current.amounts.receivableOnlyBenefits = roundToCentavo(
					current.amounts.receivableOnlyBenefits + amount,
				);
			}
		} else {
			current.amounts.deductionBenefits = roundToCentavo(
				current.amounts.deductionBenefits + amount,
			);
			if (code === "UFD") {
				current.amounts.uniformDeductionBenefits = roundToCentavo(
					current.amounts.uniformDeductionBenefits + amount,
				);
			}
		}
	}

	for (const row of loans) {
		const employeeId = row.employeeId;
		if (!employeeId) continue;
		const amount = Number(row.monthlyPayment ?? row.totalAmount ?? 0);
		if (!Number.isFinite(amount) || amount <= 0) continue;
		const current = currentFor(employeeId);
		const loanName = row.loanType?.name || "Employee loan";
		// Prefer stored loan type code when present; else map BNPI mass-upload DEDCODE names.
		const loanCode =
			(row.loanType as { code?: string | null } | null)?.code ||
			loanTypeNameToDeductionCode(loanName) ||
			null;
		current.details.push({
			id: row.id,
			source: "employeeLoan",
			code: loanCode,
			name: loanName,
			benefitTypeName: row.loanType?.name || null,
			direction: "LOAN",
			reconciliationAction: "DEDUCTION",
			amount: roundToCentavo(amount),
			startDate: row.startDate || null,
			endDate: row.endDate || null,
			payrollPeriodId: null,
			payrollPeriodCode: null,
		});
		current.amounts.loanDeductions = roundToCentavo(current.amounts.loanDeductions + amount);
	}

	return sourceByEmployeeId;
}

export async function markPayrollBenefitInstallmentsDeducted(
	prisma: PrismaClient,
	installmentIds: string[],
	params: { payrollPeriodId: string; payrollRunId?: string | null },
): Promise<number> {
	const uniqueIds = Array.from(new Set(installmentIds.filter(Boolean)));
	if (uniqueIds.length === 0) return 0;

	let updatedCount = 0;
	for (const installmentId of uniqueIds) {
		const alreadyApplied = await (prisma as any).employeeBenefitInstallment.findFirst({
			where: {
				id: installmentId,
				status: "DEDUCTED",
				payrollCutOffId: params.payrollPeriodId,
			},
		});
		if (alreadyApplied) continue;

		const result = await (prisma as any).employeeBenefitInstallment.updateMany({
			where: {
				id: installmentId,
				status: "SCHEDULED",
			},
			data: {
				status: "DEDUCTED",
				processedDate: new Date(),
				payrollCutOffId: params.payrollPeriodId,
				payrollRunId: params.payrollRunId || null,
			},
		});

		if (result.count !== 1) {
			const appliedDuringUpdate = await (prisma as any).employeeBenefitInstallment.findFirst({
				where: {
					id: installmentId,
					status: "DEDUCTED",
					payrollCutOffId: params.payrollPeriodId,
				},
			});
			if (appliedDuringUpdate) continue;
			throw new Error(
				`Payroll benefit installment ${installmentId} was already processed or is unavailable`,
			);
		}
		updatedCount += result.count;
	}

	return updatedCount;
}

async function buildEmployeePayrollsByEmployeeId(
	prisma: PrismaClient,
	params: {
		employeeIds: string[];
		organizationId: string;
		year: number;
		month: number;
	},
) {
	const uniqueEmployeeIds = Array.from(new Set(params.employeeIds.filter(Boolean)));
	if (uniqueEmployeeIds.length === 0) {
		return new Map<string, any[]>();
	}

	const payrolls = await prisma.employeePayroll.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			employeeId: {
				in: uniqueEmployeeIds,
			},
			payrollPeriod: {
				startDate: {
					gte: new Date(params.year, params.month - 1, 1),
					lt: new Date(params.year, params.month, 1),
				},
			},
		},
		select: {
			employeeId: true,
			grossPay: true,
			payrollPeriod: {
				select: {
					periodNumber: true,
				},
			},
		},
	});

	const payrollsByEmployeeId = new Map<string, any[]>();
	for (const payroll of payrolls) {
		const current = payrollsByEmployeeId.get(payroll.employeeId) || [];
		current.push(payroll);
		payrollsByEmployeeId.set(payroll.employeeId, current);
	}

	return payrollsByEmployeeId;
}

function calculatePayrollPreviewDataset(params: {
	timesheets: any[];
	payrollPeriodData: any;
	holidayMap: Map<string, any>;
	taxRates: any[];
	sssRates: any;
	philHealthRates: any;
	pagibigRates: any;
	rateMultipliers: any;
	periodNumber: number;
	employeePayrollsByEmployeeId: Map<string, any[]>;
		payrollSourceAmountsByEmployeeId: Map<
			string,
			{ amounts: PayrollSourceAmounts; details: PayrollSourceDetail[] }
		>;
	includeRows: boolean;
}) {
	const rows: any[] = [];
	let estimatedGrossPay = 0;
	let estimatedTotalDeductions = 0;
	let estimatedNetPay = 0;
	let includedEmployeesCount = 0;

	for (const timesheet of params.timesheets) {
		try {
			const employee = timesheet.employee;

			const reportingBreakdown = getTimesheetReportingBreakdown(timesheet);
			const employeeName =
				`${employee.person?.personalInfo?.firstName || ""} ${employee.person?.personalInfo?.lastName || ""}`.trim() ||
				employee.employeeId ||
				employee.id;

			const {
				totalValidOvertimeMinutes,
				totalValidLateMinutes,
				totalValidEarlyOutMinutes,
				validatedDays,
			} = validatePayrollBreakdownDays({
				breakdown: reportingBreakdown,
				employee,
				holidayMap: params.holidayMap,
			});

			const overtimeHours = totalValidOvertimeMinutes / 60;
			const lateHours = totalValidLateMinutes / 60;
			const earlyOutHours = totalValidEarlyOutMinutes / 60;
			const periodBasic = employee.basicSalary;

			let estimatedMonthlyRate = periodBasic;
			switch (employee.payFrequency) {
				case "SEMI_MONTHLY":
					estimatedMonthlyRate = periodBasic * 2;
					break;
				case "WEEKLY":
					estimatedMonthlyRate = periodBasic * 4;
					break;
				case "BIWEEKLY":
					estimatedMonthlyRate = periodBasic * 2;
					break;
				case "ANNUALLY":
					estimatedMonthlyRate = periodBasic / 12;
					break;
				default:
					estimatedMonthlyRate = periodBasic;
					break;
			}

			let daysAbsent = 0;
			let totalWorkDays = 0;
			if (reportingBreakdown.length) {
				for (const day of reportingBreakdown) {
					if (day.status !== "REST_DAY") {
						totalWorkDays++;
						if (day.status === "ABSENT") {
							daysAbsent++;
						}
					}
				}
			}

			let workingHoursPerDay = 8;
			const periodScheduleWeeks = buildPeriodScheduleWeeks({
				periodStart: params.payrollPeriodData.startDate,
				periodEnd: params.payrollPeriodData.endDate,
				validatedDays,
				employee,
			});
			const weeklyTotalHours = periodScheduleWeeks[0]?.totalHours || 0;
			for (const day of periodScheduleWeeks[0]?.days || []) {
				if (!day.isRestDay && workingHoursPerDay === 8 && day.hours > 0) {
					workingHoursPerDay = day.hours;
				}
			}

			const bandaiApprovedBucketPay = calculateBandaiApprovedBucketPay(validatedDays, periodBasic);
			const attendanceRate = resolveBnpiAttendanceDailyRate({
				periodBasic,
				estimatedMonthlyRate,
				totalWorkDays,
				useBnpi313: Boolean(bandaiApprovedBucketPay),
				scheduleWorkingHoursPerDay: workingHoursPerDay,
			});
			const dailyRate = attendanceRate.dailyRate;
			const hourlyRate = attendanceRate.hourlyRate;
			const minuteRate = attendanceRate.minuteRate;
			workingHoursPerDay = attendanceRate.workingHoursPerDay;
			const absentDeduction = roundToCentavo(daysAbsent * dailyRate);

			const baseWorkMultiplier =
				getRateMultiplier(params.rateMultipliers, "ordinaryDay", "work") ?? 1.0;
			const baseOtMultiplier =
				getRateMultiplier(params.rateMultipliers, "ordinaryDay", "ot") ?? 1.0;
			const baseNdMultiplier =
				getRateMultiplier(params.rateMultipliers, "ordinaryDay", "nd") ?? 1.0;
			const baseNightDiffPremiumMultiplier = Math.max(
				0,
				baseNdMultiplier - baseWorkMultiplier,
			);

			const lateMinutes = lateHours * 60;
			const earlyOutMinutes = earlyOutHours * 60;
			const shortfallMinutes = lateMinutes + earlyOutMinutes;
			const lateDeduction = roundToCentavo(lateMinutes * minuteRate);
			const earlyOutDeduction = roundToCentavo(earlyOutMinutes * minuteRate);
			const shortfallDeduction = roundToCentavo(shortfallMinutes * minuteRate);

			let totalOvertimePay = 0;
			let totalNightDiffPay = 0;
			let totalHolidayPay = 0;
			let totalRestDayPay = 0;

			for (const validatedDay of validatedDays) {
				if (validatedDay.status === "ABSENT" || validatedDay.status === "LEAVE") continue;

				const dayMetadata = validatedDay.holidayInfo
					? {
							...validatedDay.metadata,
							...validatedDay.holidayInfo,
						}
					: validatedDay.metadata;

				const dayType = shouldUseOrdinaryRateFromApprovedSource(validatedDay)
					? "ordinaryDay"
					: getDayType(
						validatedDay.status,
						dayMetadata,
						validatedDay.isRestDay,
					);
				const dayOvertimeHours = (validatedDay.validOvertimeMinutes || 0) / 60;
				const nightDiffHours = calculateNightDiffHours(
					validatedDay.timeIn,
					validatedDay.timeOut,
				);
				const workMultiplier = getRateMultiplier(
					params.rateMultipliers,
					dayType,
					"work",
				);
				const otMultiplier = getRateMultiplier(params.rateMultipliers, dayType, "ot");
				const ndMultiplier = getRateMultiplier(params.rateMultipliers, dayType, "nd");

				if (dayOvertimeHours > 0 && otMultiplier !== null) {
					totalOvertimePay += Math.floor(dayOvertimeHours) * hourlyRate * otMultiplier;
				}

				if (nightDiffHours > 0 && ndMultiplier !== null) {
					const nightDiffPremiumMultiplier = Math.max(
						0,
						ndMultiplier - (workMultiplier ?? 1.0),
					);
					if (nightDiffPremiumMultiplier > 0) {
						totalNightDiffPay +=
							nightDiffHours * hourlyRate * nightDiffPremiumMultiplier;
					}
				}

				if (
					dayType !== "ordinaryDay" &&
					workMultiplier !== null &&
					validatedDay.status === "PRESENT"
				) {
					const dayDate = new Date(validatedDay.date);
					const dayOfWeek = dayDate.getDay();
					const scheduleBoundaries = getScheduleBoundaries(
						validatedDay.scheduleSnapshot || null,
						dayOfWeek,
					);
					let premiumBaseHours = 8;
					if (scheduleBoundaries?.scheduledMinutes) {
						premiumBaseHours = scheduleBoundaries.scheduledMinutes / 60;
					} else {
						premiumBaseHours = Math.min(
							convertTimeToDecimal(validatedDay.regularHours || "0:00"),
							workingHoursPerDay,
						);
					}
					const premiumMultiplier = workMultiplier - 1.0;
					if (premiumBaseHours > 0 && premiumMultiplier > 0) {
						const dayPremiumPay = premiumBaseHours * hourlyRate * premiumMultiplier;
						if (dayType.includes("Holiday")) {
							totalHolidayPay += dayPremiumPay;
						} else if (dayType.includes("restDay")) {
							totalRestDayPay += dayPremiumPay;
						}
					}
				}
			}

			if (bandaiApprovedBucketPay) {
				totalOvertimePay = bandaiApprovedBucketPay.overtimePay;
				totalNightDiffPay = bandaiApprovedBucketPay.nightDiffPay;
				totalHolidayPay = bandaiApprovedBucketPay.specialHolidayPay + bandaiApprovedBucketPay.legalHolidayPay;
				totalRestDayPay = bandaiApprovedBucketPay.restDayPay + bandaiApprovedBucketPay.restDayOtPay;
			}

			const basicPay = roundToCentavo(periodBasic - absentDeduction - shortfallDeduction);
			const overtimePay = roundToCentavo(totalOvertimePay);
			const nightDiffPay = roundToCentavo(totalNightDiffPay);
			const holidayPay = roundToCentavo(totalHolidayPay + totalRestDayPay);
			const grossPay = roundToCentavo(
				basicPay + overtimePay + nightDiffPay + holidayPay,
			);

			const employeePayrollsThisMonth =
				params.employeePayrollsByEmployeeId.get(employee.id) || [];
			const payrollSource =
				params.payrollSourceAmountsByEmployeeId.get(employee.id) || {
					amounts: emptyPayrollSourceAmounts(),
					details: emptyPayrollSourceDetails(),
					installmentIds: [],
				};
			const payrollSourceAmounts = payrollSource.amounts;
			const previousPeriodsGross = employeePayrollsThisMonth
				.filter(
					(payroll) => (payroll.payrollPeriod?.periodNumber || 1) < params.periodNumber,
				)
				.reduce((sum, payroll) => sum + payroll.grossPay, 0);
			const grossPayWithSources = roundToCentavo(
				grossPay + payrollSourceAmounts.grossIncludedBenefits,
			);
			const actualMonthlyGross = previousPeriodsGross + grossPayWithSources;

			const contributionSchedule = resolveContributionSchedule({
				payFrequency: employee.payFrequency,
				periodNumber: params.periodNumber,
				payrollPeriodMetadata: params.payrollPeriodData.generationMetadata,
			});
			const contributionSplitFactor = contributionSchedule.splitFactor;

			let contributionBaseAmount = grossPayWithSources;
			if (employee.payFrequency === "SEMI_MONTHLY") {
				contributionBaseAmount = grossPayWithSources * 2;
			}

			const monthlyContributions = calculateTotalContributions(
				contributionBaseAmount,
				params.sssRates,
				params.philHealthRates,
				params.pagibigRates,
			);
			const periodContributions = {
				sss: roundToCentavo(monthlyContributions.sss * contributionSplitFactor),
				philHealth: roundToCentavo(
					monthlyContributions.philHealth * contributionSplitFactor,
				),
				pagIbig: roundToCentavo(monthlyContributions.pagIbig * contributionSplitFactor),
			};

			const periodTaxableIncome =
				grossPayWithSources -
				payrollSourceAmounts.nonTaxableGrossIncludedBenefits -
				(periodContributions.sss +
					periodContributions.philHealth +
					periodContributions.pagIbig);
			const withholdingTax = calculateWithholdingTax(
				periodTaxableIncome,
				params.taxRates,
				employee.payFrequency === "SEMI_MONTHLY",
			);
			const taxableIncome = roundToCentavo(periodTaxableIncome);
			const zeroSalaryGuardrail = applyZeroSalaryGuardrail(
				grossPayWithSources,
				payrollSourceAmounts.loanDeductions,
				payrollSourceAmounts.deductionBenefits,
			);
			const totalDeductions = roundToCentavo(
				periodContributions.sss +
					periodContributions.philHealth +
					periodContributions.pagIbig +
					withholdingTax +
					zeroSalaryGuardrail.guardedLoanDeductions +
					zeroSalaryGuardrail.guardedDeductionBenefits,
			);
			const netPay = Math.max(
				0,
				roundToCentavo(grossPayWithSources - totalDeductions + payrollSourceAmounts.netAdjustments),
			);
			const payrollRegister = buildBandaiPayrollRegister({
				employee,
				payrollPeriodData: params.payrollPeriodData,
				periodBasic,
				estimatedMonthlyRate,
				dailyRate,
				totalWorkDays,
				basicPay,
				absentDeduction,
				lateDeduction,
				earlyOutDeduction,
				shortfallDeduction,
				overtimePay,
				nightDiffPay,
				holidayPay,
				grossPayWithSources,
				withholdingTax,
				periodContributions,
				payrollSourceAmounts,
				payrollSourceDetails: payrollSource.details,
				totalDeductions,
				netPay,
				bandaiApprovedBucketPay,
			});

			estimatedGrossPay += grossPayWithSources;
			estimatedTotalDeductions += totalDeductions;
			estimatedNetPay += netPay;
			includedEmployeesCount += 1;

			if (!params.includeRows) continue;

			rows.push({
				employeeId: employee.id,
				employeeCode: employee.employeeId,
				name: employeeName,
				department: employee.department?.name || "N/A",
				position: employee.position?.title || "N/A",
				payFrequency: employee.payFrequency || "MONTHLY",
				basicSalary: employee.basicSalary,
				timesheetId: timesheet.id,
				basicPay,
				overtimePay,
				nightDiffPay,
				holidayPay,
				allowances: payrollSourceAmounts.totalCompensationBenefits,
				loanDeductions: zeroSalaryGuardrail.guardedLoanDeductions,
				otherDeductions: zeroSalaryGuardrail.guardedDeductionBenefits,
				totalReceivable: roundToCentavo(
					netPay + payrollSourceAmounts.receivableOnlyBenefits,
				),
				grossPay: grossPayWithSources,
				taxableIncome,
				totalDeductions,
				netPay,
				payrollRegister: payrollRegister.fields,
				payrollRegisterColumns: payrollRegister.columns,
				deductions: {
					sssContribution: periodContributions.sss,
					philHealthContribution: periodContributions.philHealth,
					pagibigContribution: periodContributions.pagIbig,
					taxAmount: roundToCentavo(withholdingTax),
					absentDeduction,
					lateDeduction,
					earlyOutDeduction,
					loanDeductions: zeroSalaryGuardrail.guardedLoanDeductions,
					otherDeductions: zeroSalaryGuardrail.guardedDeductionBenefits,
				},
				metadata: {
					estimatedMonthlyRate: roundToCentavo(estimatedMonthlyRate),
					periodNumber: params.periodNumber,
					actualMonthlyGross: roundToCentavo(actualMonthlyGross),
					previousPeriodsGross: roundToCentavo(previousPeriodsGross),
					payrollSourceAmounts,
					payrollSourceDetails: payrollSource.details,
					payrollRegisterColumns: payrollRegister.columns,
					contributionSchedule: {
						splitFactor: contributionSplitFactor,
						periodNumber: params.periodNumber,
						method: contributionSchedule.method,
					},
					bandaiPayrollBuckets: bandaiApprovedBucketPay,
					weeklyTotalHours: roundToCentavo(weeklyTotalHours),
					periodScheduleWeeks,
					daysAbsent,
					totalWorkDays,
					totalLateHours: roundToCentavo(lateHours),
					totalEarlyOutHours: roundToCentavo(earlyOutHours),
					totalOvertimeHours: roundToCentavo(overtimeHours),
					overtimeRate: roundToCentavo(hourlyRate * baseOtMultiplier),
					nightDiffRate: roundToCentavo(hourlyRate * baseNightDiffPremiumMultiplier),
					zeroSalaryGuardrailApplied: zeroSalaryGuardrail.applied,
				},
			});
		} catch (error) {
			payrollLogger.warn(
				`Failed to calculate payroll preview row for period ${params.payrollPeriodData.id}, timesheet ${timesheet?.id}, employee ${timesheet?.employee?.id}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	return {
		rows,
		includedEmployeesCount,
		estimatedGrossPay,
		estimatedTotalDeductions,
		estimatedNetPay,
	};
}

/**
 * Get payroll summary for a payroll period
 * @param prisma - Prisma client instance
 * @param payrollPeriodId - ID of the payroll period
 * @param organizationId - Organization ID
 * @returns Summary of generated payrolls
 */
export async function getPayrollPeriodSummary(
	prisma: PrismaClient,
	payrollPeriodId: string,
	organizationId: string,
) {
	// Single query: Fetch payroll period with all employee payrolls
	const payrollPeriodData = await prisma.payrollPeriod.findUnique({
		where: { id: payrollPeriodId },
		include: {
			employeePayrolls: {
				where: {
					organizationId,
					isDeleted: false,
				},
				include: {
					employee: {
						include: {
							person: {
								select: {
									personalInfo: true,
								},
							},
						},
					},
				},
			},
		},
	});

	if (!payrollPeriodData) {
		throw new Error(`Payroll period not found: ${payrollPeriodId}`);
	}

	const payrolls = payrollPeriodData.employeePayrolls;

	const totalGrossPay = payrolls.reduce((sum, p) => sum + p.grossPay, 0);
	const totalNetPay = payrolls.reduce((sum, p) => sum + p.netPay, 0);
	const totalDeductions = payrolls.reduce((sum, p) => sum + p.totalDeductions, 0);

	return {
		period: {
			id: payrollPeriodData.id,
			name: payrollPeriodData.name,
			startDate: payrollPeriodData.startDate,
			endDate: payrollPeriodData.endDate,
			status: payrollPeriodData.status,
		},
		employeeCount: payrolls.length,
		totalGrossPay: roundToCentavo(totalGrossPay),
		totalNetPay: roundToCentavo(totalNetPay),
		totalDeductions: roundToCentavo(totalDeductions),
		payrolls: payrolls.map((p) => ({
			employeeId: p.employee.id,
			employeeCode: p.employee.employeeId,
			name: `${getJsonString((p as any).employee?.person?.personalInfo, "firstName")} ${getJsonString((p as any).employee?.person?.personalInfo, "lastName")}`.trim(),
			grossPay: p.grossPay,
			netPay: p.netPay,
			isPaid: p.isPaid,
		})),
	};
}



