import { PrismaClient } from "../generated/prisma";

/**
 * Day-labor-only write guard (D2 security fix, 2026-09-07).
 *
 * Line leaders may tag DIRECT/INDIRECT on a member's timesheet days, but may
 * NOT change anything else (clock times, hours, statuses, notes) — those go
 * through timesheet adjustment requests. This guard diffs the requested
 * breakdown against the stored effective lines and allows the write only when
 * every difference is `dayLaborType`.
 *
 * Comparison tolerance: null/undefined/"" are equivalent; time values compare
 * within one minute (coerce + timezone jitter); hour strings compare trimmed.
 */

export interface DayLaborGuardResult {
	ok: boolean;
	reason?: "missing_line_with_content" | "non_day_labor_change";
	dayKey?: string;
	field?: string;
}

const FIELD_ALIASES: Array<{ key: string; requestKey?: string }> = [
	{ key: "timeIn" },
	{ key: "timeOut" },
	{ key: "status" },
	{ key: "hoursWorked" },
	{ key: "regularHours" },
	{ key: "overtimeHours" },
	{ key: "undertimeHours" },
	{ key: "lateHours" },
	{ key: "earlyOutHours" },
	{ key: "employeeNotes", requestKey: "employeeNotes" },
	{ key: "approverNotes" },
];

const normalizeEmpty = (value: unknown): string | null => {
	if (value === undefined || value === null) return null;
	const text = String(value).trim();
	return text === "" ? null : text;
};

const sameTimeValue = (a: unknown, b: unknown): boolean => {
	const left = normalizeEmpty(a);
	const right = normalizeEmpty(b);
	if (!left && !right) return true;
	if (!left || !right) return false;
	const leftTime = new Date(left).getTime();
	const rightTime = new Date(right).getTime();
	if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
		return Math.abs(leftTime - rightTime) <= 60_000;
	}
	return left === right;
};

const sameScalar = (a: unknown, b: unknown): boolean => {
	const left = normalizeEmpty(a);
	const right = normalizeEmpty(b);
	if (left === null && right === null) return true;
	if (left === null || right === null) return false;
	return left === right;
};

const sameValue = (field: string, a: unknown, b: unknown): boolean =>
	field === "timeIn" || field === "timeOut" ? sameTimeValue(a, b) : sameScalar(a, b);

export async function isDayLaborOnlyBreakdownChange(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		timesheetId: string;
		/** Validated breakdown days (DailyBreakdownSchema shape). */
		breakdown: Array<Record<string, any>>;
	},
): Promise<DayLaborGuardResult> {
	const lines = await prisma.timesheetline.findMany({
		where: {
			organizationId: params.organizationId,
			timesheetId: params.timesheetId,
			isDeleted: false,
			isEffective: true,
		},
		select: {
			date: true,
			timeIn: true,
			timeOut: true,
			status: true,
			hoursWorked: true,
			regularHours: true,
			overtimeHours: true,
			undertimeHours: true,
			lateHours: true,
			earlyOutHours: true,
			employeeNotes: true,
			approverNotes: true,
		},
	});
	const lineByDateKey = new Map<string, Record<string, unknown>>();
	for (const line of lines) {
		const date = line.date instanceof Date ? line.date : new Date(line.date);
		lineByDateKey.set(date.toISOString().slice(0, 10), line as unknown as Record<string, unknown>);
	}

	for (const day of params.breakdown) {
		if (!day || typeof day !== "object") continue;
		const dateValue = day.date;
		const dayKey =
			dateValue instanceof Date
				? dateValue.toISOString().slice(0, 10)
				: String(dateValue || "").slice(0, 10);
		if (!dayKey) continue;
		const stored = lineByDateKey.get(dayKey);

		for (const { key } of FIELD_ALIASES) {
			// Absent = untouched (editor semantics): only fields present on the
			// request day participate in the diff. Explicit null still compares
			// (and clears).
			if (day[key] === undefined) continue;
			const requestedValue = day[key];
			const storedValue = stored ? stored[key] : null;
			if (!sameValue(key, requestedValue, storedValue)) {
				if (!stored && normalizeEmpty(requestedValue) === null) {
					// Tag-only day on a date without an effective line yet: allowed.
					continue;
				}
				return {
					ok: false,
					reason: stored ? "non_day_labor_change" : "missing_line_with_content",
					dayKey,
					field: key,
				};
			}
		}
	}
	return { ok: true };
}
