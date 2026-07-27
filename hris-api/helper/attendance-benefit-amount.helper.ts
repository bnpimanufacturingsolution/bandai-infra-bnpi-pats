export type BenefitAttendanceAmountBasis = "PER_DAY" | "PER_CUTOFF";

export type AttendanceBenefitMetrics = {
	scheduledWorkDays: number;
	absentDays: number;
	presentDays: number;
};

export type ComputeAttendanceBenefitAmountInput = {
	basis: BenefitAttendanceAmountBasis;
	enrolledAmount: number;
	scheduledWorkDays: number;
	absentDays: number;
};

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const finiteNonNegative = (value: unknown): number => {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric < 0) return 0;
	return numeric;
};

/**
 * Present/scheduled definitions for attendance-based benefits (v1):
 * - scheduledWorkDays: non-REST_DAY days in the timesheet reporting breakdown
 * - absentDays: days with status === ABSENT (ABSENT only; leave does not reduce)
 * - presentDays: scheduledWorkDays - absentDays (clamped at 0)
 */
export function deriveAttendanceBenefitMetrics(params: {
	scheduledWorkDays: number;
	absentDays: number;
}): AttendanceBenefitMetrics {
	const scheduledWorkDays = finiteNonNegative(params.scheduledWorkDays);
	const absentDays = Math.min(finiteNonNegative(params.absentDays), scheduledWorkDays);
	const presentDays = Math.max(0, scheduledWorkDays - absentDays);
	return { scheduledWorkDays, absentDays, presentDays };
}

/**
 * Compute the payroll period benefit amount from enrollment + attendance.
 *
 * PER_DAY:    rate × presentDays
 * PER_CUTOFF: full × (presentDays / scheduledWorkDays); 0 when scheduled is 0
 */
export function computeAttendanceBenefitAmount(
	input: ComputeAttendanceBenefitAmountInput,
): number {
	const enrolledAmount = Number(input.enrolledAmount);
	if (!Number.isFinite(enrolledAmount) || enrolledAmount <= 0) {
		return 0;
	}

	const metrics = deriveAttendanceBenefitMetrics({
		scheduledWorkDays: input.scheduledWorkDays,
		absentDays: input.absentDays,
	});

	if (input.basis === "PER_DAY") {
		return roundMoney(enrolledAmount * metrics.presentDays);
	}

	if (input.basis === "PER_CUTOFF") {
		if (metrics.scheduledWorkDays <= 0) return 0;
		return roundMoney(enrolledAmount * (metrics.presentDays / metrics.scheduledWorkDays));
	}

	return 0;
}

/**
 * Count scheduled / absent days from a timesheet reporting breakdown
 * using the same ABSENT-only rules as basic-pay absence in payroll.
 */
export function countAttendanceBenefitDaysFromBreakdown(
	breakdown: Array<{ status?: string | null } | null | undefined> | null | undefined,
): AttendanceBenefitMetrics {
	let scheduledWorkDays = 0;
	let absentDays = 0;

	for (const day of Array.isArray(breakdown) ? breakdown : []) {
		if (!day) continue;
		const status = String(day.status || "").toUpperCase();
		if (status === "REST_DAY") continue;
		scheduledWorkDays += 1;
		if (status === "ABSENT") {
			absentDays += 1;
		}
	}

	return deriveAttendanceBenefitMetrics({ scheduledWorkDays, absentDays });
}
