/**
 * Recurring benefit cadence eligibility (under scheduleMode RECURRING).
 * Installments remain payroll-period lazy ensure; this only filters which periods pay.
 */

export type BenefitRecurrenceFrequency = "EVERY_CUTOFF" | "MONTHLY" | "YEARLY";

const FREQUENCIES = new Set<BenefitRecurrenceFrequency>([
	"EVERY_CUTOFF",
	"MONTHLY",
	"YEARLY",
]);

export function isBenefitRecurrenceFrequency(
	value: unknown,
): value is BenefitRecurrenceFrequency {
	return typeof value === "string" && FREQUENCIES.has(value as BenefitRecurrenceFrequency);
}

/**
 * When scheduleMode is RECURRING, null/missing/invalid frequency → EVERY_CUTOFF.
 * When not RECURRING, always null (frequency does not apply).
 */
export function normalizeRecurrenceFrequency(
	scheduleMode: string | null | undefined,
	frequency: string | null | undefined,
): BenefitRecurrenceFrequency | null {
	if (String(scheduleMode || "").toUpperCase() !== "RECURRING") {
		return null;
	}
	const raw = String(frequency || "").trim().toUpperCase();
	if (raw === "MONTHLY") return "MONTHLY";
	if (raw === "YEARLY") return "YEARLY";
	return "EVERY_CUTOFF";
}

/** Fiscal year end calendar month (1–12) given fiscal start month (1–12). */
export function getFiscalYearEndMonth(fiscalStartMonth: number): number {
	const start = Math.min(12, Math.max(1, Math.floor(Number(fiscalStartMonth) || 1)));
	return start === 1 ? 12 : start - 1;
}

export function getUtcCalendarMonth(periodEndDate: Date): number {
	return periodEndDate.getUTCMonth() + 1; // 1–12
}

export function getUtcCalendarYear(periodEndDate: Date): number {
	return periodEndDate.getUTCFullYear();
}

/**
 * Whether a payroll period should receive a RECURRING installment for the given frequency.
 *
 * MONTHLY: periodNumber === 2, or sole period in that calendar month, or MONTHLY payFrequency
 *          (supporting sole monthly cadence — never treats semi-monthly period 1 as monthly).
 * YEARLY: period end month is fiscal end month AND last period of that month (p2 or sole).
 */
export function isRecurringPeriodEligible(input: {
	frequency?: BenefitRecurrenceFrequency | string | null;
	periodNumber?: number | null;
	periodEndDate: Date;
	payFrequency?: string | null;
	isOnlyPeriodInMonth?: boolean;
	fiscalYearStartMonth?: number | null;
}): boolean {
	const frequency = isBenefitRecurrenceFrequency(input.frequency)
		? input.frequency
		: "EVERY_CUTOFF";

	if (frequency === "EVERY_CUTOFF") {
		return true;
	}

	const periodNumber =
		input.periodNumber === null || input.periodNumber === undefined
			? null
			: Number(input.periodNumber);
	const isPeriodTwo = periodNumber === 2;
	const isOnlyPeriodInMonth = input.isOnlyPeriodInMonth === true;
	const payFrequency = String(input.payFrequency || "").toUpperCase();
	const isMonthlyPayFrequency = payFrequency === "MONTHLY";

	/** Last / monthly pay slot in a month: 2nd cutoff, or sole period, or monthly frequency. */
	const isLastOrSoleMonthlySlot =
		isPeriodTwo || isOnlyPeriodInMonth || (isMonthlyPayFrequency && periodNumber !== 1);

	// Semi-monthly period 1 must never pay MONTHLY/YEARLY when periodNumber is explicitly 1
	// and it is not the only period in the month.
	if (periodNumber === 1 && !isOnlyPeriodInMonth) {
		return false;
	}

	if (frequency === "MONTHLY") {
		return isLastOrSoleMonthlySlot;
	}

	// YEARLY
	const fiscalStart = Math.min(
		12,
		Math.max(1, Math.floor(Number(input.fiscalYearStartMonth) || 1)),
	);
	const fiscalEndMonth = getFiscalYearEndMonth(fiscalStart);
	const endMonth = getUtcCalendarMonth(input.periodEndDate);
	if (endMonth !== fiscalEndMonth) {
		return false;
	}
	return isLastOrSoleMonthlySlot;
}

/** UTC month range covering the calendar month of periodEndDate (inclusive). */
export function getUtcMonthRangeContaining(periodEndDate: Date): {
	start: Date;
	end: Date;
} {
	const year = periodEndDate.getUTCFullYear();
	const month = periodEndDate.getUTCMonth(); // 0-based
	const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
	const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
	return { start, end };
}
