/**
 * Benefit attendance eligibility (all-or-nothing period qualification).
 * Independent of attendance-based amount pro-rate (ABSENT-only money math).
 */

export type BenefitEligibilityMode = "ENROLLED_ALWAYS" | "ATTENDANCE_QUALIFIED";

export type BenefitEligibilityFlags = {
	disqualifyOnAbsent?: boolean | null;
	disqualifyOnLate?: boolean | null;
	disqualifyOnUndertime?: boolean | null;
	disqualifyOnLeave?: boolean | null;
};

export type BenefitEligibilitySignals = {
	scheduledWorkDays: number;
	absentDays: number;
	lateDays: number;
	undertimeDays: number;
	leaveDays: number;
};

export type EvaluateBenefitAttendanceEligibilityInput = {
	mode?: BenefitEligibilityMode | string | null;
	flags?: BenefitEligibilityFlags | null;
	signals: BenefitEligibilitySignals;
};

export type BenefitAttendanceEligibilityResult = {
	eligible: boolean;
	mode: BenefitEligibilityMode;
	failReasons: string[];
};

/** Parse "H:MM" / "HH:MM" duration strings to whole minutes. Invalid → 0. */
export function parseBenefitDurationToMinutes(value?: string | number | null): number {
	if (value == null || value === "") return 0;
	if (typeof value === "number") {
		if (!Number.isFinite(value) || value <= 0) return 0;
		// Treat bare numbers as minutes when small; as hours when fractional display is unlikely
		return Math.max(0, Math.round(value));
	}
	const raw = String(value).trim();
	if (!raw || raw === "0:00" || raw === "00:00") return 0;
	const parts = raw.split(":");
	if (parts.length < 2) {
		const asNum = Number(raw);
		return Number.isFinite(asNum) && asNum > 0 ? Math.round(asNum) : 0;
	}
	const hours = Number(parts[0]);
	const minutes = Number(parts[1]);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	const total = hours * 60 + minutes;
	return total > 0 ? total : 0;
}

export function normalizeBenefitEligibilityMode(
	mode?: string | null,
): BenefitEligibilityMode {
	return String(mode || "")
		.trim()
		.toUpperCase() === "ATTENDANCE_QUALIFIED"
		? "ATTENDANCE_QUALIFIED"
		: "ENROLLED_ALWAYS";
}

/**
 * Count qualification signals from a timesheet reporting breakdown.
 * REST_DAY is excluded from scheduled work; leave counts separately from ABSENT.
 */
export function countEligibilitySignalsFromBreakdown(
	breakdown: Array<{
		status?: string | null;
		lateHours?: string | number | null;
		undertimeHours?: string | number | null;
		lateMinutes?: number | null;
		undertimeMinutes?: number | null;
	} | null | undefined> | null | undefined,
): BenefitEligibilitySignals {
	let scheduledWorkDays = 0;
	let absentDays = 0;
	let lateDays = 0;
	let undertimeDays = 0;
	let leaveDays = 0;

	for (const day of Array.isArray(breakdown) ? breakdown : []) {
		if (!day) continue;
		const status = String(day.status || "").toUpperCase();
		if (status === "REST_DAY") continue;

		scheduledWorkDays += 1;

		if (status === "ABSENT") {
			absentDays += 1;
		}
		if (status === "LEAVE") {
			leaveDays += 1;
		}

		const lateMinutes =
			typeof day.lateMinutes === "number" && Number.isFinite(day.lateMinutes)
				? Math.max(0, day.lateMinutes)
				: parseBenefitDurationToMinutes(day.lateHours);
		if (lateMinutes > 0) {
			lateDays += 1;
		}

		const undertimeMinutes =
			typeof day.undertimeMinutes === "number" && Number.isFinite(day.undertimeMinutes)
				? Math.max(0, day.undertimeMinutes)
				: parseBenefitDurationToMinutes(day.undertimeHours);
		if (undertimeMinutes > 0) {
			undertimeDays += 1;
		}
	}

	return {
		scheduledWorkDays,
		absentDays,
		lateDays,
		undertimeDays,
		leaveDays,
	};
}

/**
 * Evaluate whether a benefit may pay for the period.
 * ENROLLED_ALWAYS → always eligible.
 * ATTENDANCE_QUALIFIED → fail if any enabled disqualify flag has signal count > 0.
 * Default flags when QUALIFIED and flag omitted: absent true; late/undertime/leave false.
 */
export function evaluateBenefitAttendanceEligibility(
	input: EvaluateBenefitAttendanceEligibilityInput,
): BenefitAttendanceEligibilityResult {
	const mode = normalizeBenefitEligibilityMode(input.mode);
	if (mode === "ENROLLED_ALWAYS") {
		return { eligible: true, mode, failReasons: [] };
	}

	const flags = input.flags || {};
	const disqualifyOnAbsent = flags.disqualifyOnAbsent !== false;
	const disqualifyOnLate = flags.disqualifyOnLate === true;
	const disqualifyOnUndertime = flags.disqualifyOnUndertime === true;
	const disqualifyOnLeave = flags.disqualifyOnLeave === true;

	const signals = input.signals;
	const failReasons: string[] = [];

	if (disqualifyOnAbsent && signals.absentDays > 0) {
		failReasons.push("absent");
	}
	if (disqualifyOnLate && signals.lateDays > 0) {
		failReasons.push("late");
	}
	if (disqualifyOnUndertime && signals.undertimeDays > 0) {
		failReasons.push("undertime");
	}
	if (disqualifyOnLeave && signals.leaveDays > 0) {
		failReasons.push("leave");
	}

	return {
		eligible: failReasons.length === 0,
		mode,
		failReasons,
	};
}

/** Classic Perfect Attendance (PFA) enrollment defaults. */
export const PFA_ELIGIBILITY_DEFAULTS = {
	eligibilityMode: "ATTENDANCE_QUALIFIED" as BenefitEligibilityMode,
	eligibilityDisqualifyOnAbsent: true,
	eligibilityDisqualifyOnLate: true,
	eligibilityDisqualifyOnUndertime: true,
	eligibilityDisqualifyOnLeave: true,
};

export function isPerfectAttendanceBenefitTypeCode(code?: string | null): boolean {
	return String(code || "").trim().toUpperCase() === "PFA";
}
