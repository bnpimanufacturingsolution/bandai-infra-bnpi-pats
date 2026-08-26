/**
 * Day-status resolution pipeline (READ-ONLY classification; never prices payroll).
 *
 * Operator decision 2026-08-26 (REC-20260826-DAY-STATUS-REVIEW-QUEUE):
 * the WorkSharing `0` flag is ambiguous (Rest | Absent | Leave), so schedule
 * truth for BNPI becomes universal **Monday–Saturday with Sunday REST**, and
 * each scheduled employee-day is classified by evidence precedence:
 *
 *   1. OUT_OF_TENURE            — before hire / after final termination
 *   2. REST_SUNDAY              — Sunday is a rest day (zero punches ever proven)
 *   3. PRESENT_PUNCH            — biometric punch wins over everything
 *   4. PRESENT_SCHEDULE_POSITIVE— client schedule says worked (e.g. WS=1), no punch
 *   5. ABSENT_AWOL_EVIDENCED    — AWOL workbook row (evidence label only, all Unpaid)
 *   6. LEAVE_PAID / LEAVE_UNPAID— leave-ledger row (paid prices LVP elsewhere)
 *   7. REVIEW_NO_EVIDENCE       — bare no-show on a scheduled day → REVIEW QUEUE.
 *                                 Never silently auto-charged ABSENT (fleet sim
 *                                 proved ₱463k–573k/window of false charges).
 *
 * Future Sunday work needs no pre-build: its punch classifies PRESENT_PUNCH.
 */

export const DAY_STATUS_CLASSES = [
	"OUT_OF_TENURE",
	"REST_SUNDAY",
	"PRESENT_PUNCH",
	"PRESENT_SCHEDULE_POSITIVE",
	"ABSENT_AWOL_EVIDENCED",
	"LEAVE_PAID",
	"LEAVE_UNPAID",
	"REVIEW_NO_EVIDENCE",
] as const;

export type DayStatusClass = (typeof DAY_STATUS_CLASSES)[number];

export type DayEvidenceRow = {
	/** YYYY-MM-DD */
	date: string;
	/** Fractional days from the ledger (0.5 half-day rows); default 1. */
	days?: number;
	/** Free label: leave type / AWOL remarks. */
	label?: string;
};

export type DayStatusEmployee = {
	code: string;
	name?: string;
	/** YYYY-MM-DD or null. */
	tenureStart?: string | null;
	/** YYYY-MM-DD or null (sentinel year<=1971 terminations filtered by caller). */
	tenureEnd?: string | null;
};

export type DayStatusSources = {
	/** Inclusive window, YYYY-MM-DD bounds. */
	window: { start: string; end: string };
	employees: DayStatusEmployee[];
	/** Set of "code|YYYY-MM-DD" biometric punches. */
	punchKeys?: Set<string>;
	/** Set of "code|YYYY-MM-DD" positive schedule proof (e.g. WorkSharing =1). */
	schedulePositiveKeys?: Set<string>;
	/** code → date → evidence row. */
	leaveByCodeDate?: Map<string, Map<string, DayEvidenceRow>>;
	/** code → date → evidence row (AWOL tracker). */
	awolByCodeDate?: Map<string, Map<string, DayEvidenceRow>>;
	/** Per-day salary basis for ESTIMATE_ONLY exposure math (never pay). */
	dailyBasisByCode?: Map<string, number>;
};

export type DayStatusRow = {
	code: string;
	name: string;
	/** YYYY-MM-DD */
	date: string;
	weekday: string;
	status: DayStatusClass;
	reason: string;
	conflictWith?: Array<"punch" | "schedule_positive" | "awol" | "leave">;
	/** ESTIMATE_ONLY money context; absent for present/rest classes. */
	estAmount?: number | null;
};

export type DayStatusEmployeeSummary = {
	code: string;
	name: string;
	counts: Partial<Record<DayStatusClass, number>>;
	reviewDays: number;
	estReviewAmount: number | null;
};

export type DayStatusResolutionResult = {
	window: { start: string; end: string };
	scope: { employees: number; calendarDays: number };
	buckets: Record<DayStatusClass, number>;
	weekdayHistogramReview: Record<string, number>;
	reviewItems: DayStatusRow[];
	evidencedAbsentItems: DayStatusRow[];
	perEmployee: DayStatusEmployeeSummary[];
};

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const weekdayOfDate = (date: string): string =>
	WEEKDAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** Mon–Sat schedule truth: only Sunday rests. */
export const isScheduledWorkday = (date: string): boolean =>
	new Date(`${date}T00:00:00Z`).getUTCDay() !== 0;

export const enumerateDates = (start: string, end: string): string[] => {
	const out: string[] = [];
	const cursor = new Date(`${start}T00:00:00Z`);
	const stop = new Date(`${end}T00:00:00Z`);
	if (Number.isNaN(cursor.getTime()) || Number.isNaN(stop.getTime())) return out;
	for (; cursor <= stop; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
		out.push(cursor.toISOString().slice(0, 10));
	}
	return out;
};

const keyOf = (code: string, date: string) => `${code}|${date}`;

export type DayClassification = {
	status: DayStatusClass;
	reason: string;
	conflictWith?: DayStatusRow["conflictWith"];
};

/**
 * Pure single-day precedence classifier. Pinned by tests/day-status-resolution.helper.spec.ts.
 */
export const classifyEmployeeDay = (input: {
	code: string;
	date: string;
	tenureStart?: string | null;
	tenureEnd?: string | null;
	punched: boolean;
	schedulePositive: boolean;
	awolRow: DayEvidenceRow | null;
	leaveRow: (DayEvidenceRow & { paidFlag?: boolean }) | null;
}): DayClassification => {
	const { code, date } = input;
	if (input.tenureStart && date < input.tenureStart) {
		return { status: "OUT_OF_TENURE", reason: `before hire ${input.tenureStart}` };
	}
	if (input.tenureEnd && date > input.tenureEnd) {
		return { status: "OUT_OF_TENURE", reason: `after termination ${input.tenureEnd}` };
	}
	if (!isScheduledWorkday(date)) {
		return { status: "REST_SUNDAY", reason: "Sunday rest day (Mon–Sat schedule)" };
	}
	if (input.punched) {
		const conflicts: DayStatusRow["conflictWith"] = [];
		if (input.awolRow) conflicts.push("awol");
		if (input.leaveRow) conflicts.push("leave");
		return {
			status: "PRESENT_PUNCH",
			reason: "biometric punch",
			...(conflicts.length ? { conflictWith: conflicts } : {}),
		};
	}
	if (input.schedulePositive) {
		return {
			status: "PRESENT_SCHEDULE_POSITIVE",
			reason: "client schedule marks worked (no punch)",
			conflictWith: input.awolRow ? ["awol"] : input.leaveRow ? ["leave"] : undefined,
		};
	}
	if (input.awolRow) {
		return {
			status: "ABSENT_AWOL_EVIDENCED",
			reason: `AWOL ledger row${input.awolRow.label ? ` (${input.awolRow.label})` : ""}`,
			conflictWith: input.leaveRow ? ["leave"] : undefined,
		};
	}
	if (input.leaveRow) {
		return input.leaveRow.paidFlag === true
			? { status: "LEAVE_PAID", reason: `paid leave${input.leaveRow.label ? ` (${input.leaveRow.label})` : ""}` }
			: { status: "LEAVE_UNPAID", reason: `unpaid leave${input.leaveRow.label ? ` (${input.leaveRow.label})` : ""}` };
	}
	return { status: "REVIEW_NO_EVIDENCE", reason: "scheduled day with no punch/leave/AWOL evidence" };
};

const emptyBuckets = (): Record<DayStatusClass, number> => {
	const buckets = {} as Record<DayStatusClass, number>;
	for (const cls of DAY_STATUS_CLASSES) buckets[cls] = 0;
	return buckets;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fleet builder: classifies every employee × calendar day in the window and
 * aggregates honest buckets plus the review queue. Pure; performs no I/O.
 */
export const buildDayStatusResolution = (
	sources: DayStatusSources,
): DayStatusResolutionResult => {
	const dates = enumerateDates(sources.window.start, sources.window.end);
	const buckets = emptyBuckets();
	const weekdayHistogramReview: Record<string, number> = {};
	const reviewItems: DayStatusRow[] = [];
	const evidencedAbsentItems: DayStatusRow[] = [];
	const perEmployee: DayStatusEmployeeSummary[] = [];

	for (const employee of sources.employees) {
		const counts: Partial<Record<DayStatusClass, number>> = {};
		let estReviewAmount = 0;
		let hasReviewMoney = false;
		const basis = sources.dailyBasisByCode?.get(employee.code);

		for (const date of dates) {
			const leaveMap = sources.leaveByCodeDate?.get(employee.code);
			const awolMap = sources.awolByCodeDate?.get(employee.code);
			const leaveRow = (leaveMap?.get(date) as (DayEvidenceRow & { paidFlag?: boolean }) | undefined) ?? null;
			const awolRow = (awolMap?.get(date) as (DayEvidenceRow & { paidFlag?: boolean }) | undefined) ?? null;
			const cls = classifyEmployeeDay({
				code: employee.code,
				date,
				tenureStart: employee.tenureStart ?? null,
				tenureEnd: employee.tenureEnd ?? null,
				punched: sources.punchKeys?.has(keyOf(employee.code, date)) ?? false,
				schedulePositive: sources.schedulePositiveKeys?.has(keyOf(employee.code, date)) ?? false,
				awolRow,
				leaveRow,
			});
			buckets[cls.status] += 1;
			counts[cls.status] = (counts[cls.status] || 0) + 1;

			if (cls.status === "REVIEW_NO_EVIDENCE") {
				weekdayHistogramReview[weekdayOfDate(date)] =
					(weekdayHistogramReview[weekdayOfDate(date)] || 0) + 1;
				const estAmount = basis !== undefined ? round2(basis) : null;
				if (estAmount != null) {
					estReviewAmount += estAmount;
					hasReviewMoney = true;
				}
				reviewItems.push({
					code: employee.code,
					name: employee.name || "",
					date,
					weekday: weekdayOfDate(date),
					status: cls.status,
					reason: cls.reason,
					estAmount,
				});
			} else if (cls.status === "ABSENT_AWOL_EVIDENCED") {
				evidencedAbsentItems.push({
					code: employee.code,
					name: employee.name || "",
					date,
					weekday: weekdayOfDate(date),
					status: cls.status,
					reason: cls.reason,
					...(cls.conflictWith ? { conflictWith: cls.conflictWith } : {}),
				});
			}
		}

		perEmployee.push({
			code: employee.code,
			name: employee.name || "",
			counts,
			reviewDays: counts.REVIEW_NO_EVIDENCE || 0,
			estReviewAmount: hasReviewMoney ? round2(estReviewAmount) : null,
		});
	}

	perEmployee.sort(
		(a, b) => b.reviewDays - a.reviewDays || (b.estReviewAmount || 0) - (a.estReviewAmount || 0),
	);
	reviewItems.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : 1));

	return {
		window: { ...sources.window },
		scope: { employees: sources.employees.length, calendarDays: dates.length },
		buckets,
		weekdayHistogramReview,
		reviewItems,
		evidencedAbsentItems,
		perEmployee,
	};
};

/**
 * Rebuild day-level PAID leave dates from an imported LVP EmployeeBenefit row's
 * notes token written by the period-leave import:
 * `...; days=4.5; dates=2026-07-11+2026-07-14+...; types=VL; ...`
 */
export const parseBenefitNotesLeaveDates = (notes: string | null | undefined): string[] => {
	if (!notes) return [];
	const match = /(?:^|;)\s*dates=([^;]+);?/.exec(notes);
	if (!match) return [];
	return match[1]
		.split("+")
		.map((part) => part.trim())
		.filter((part) => /^\d{4}-\d{2}-\d{2}$/.test(part));
};
