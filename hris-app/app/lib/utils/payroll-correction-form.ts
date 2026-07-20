/**
 * Pure form helpers for the payroll correction request modal.
 * Kept free of React so unit + Playwright logic harnesses can exercise the same rules.
 *
 * UX: proposed day change is entered as Time In / Time Out (same mental model as
 * edit timesheet). API still receives before/after minutes derived from those clocks.
 */

export type PayrollCorrectionHoursType =
	| "REGULAR"
	| "OT"
	| "ND"
	| "LATE"
	| "ABSENT"
	| "EARLY_OUT"
	| "OTHER";

export type PayrollCorrectionDayRow = {
	date: string;
	selected: boolean;
	/** Auto-derived from proposed clocks vs paid snapshot; not user-editable */
	hoursType: PayrollCorrectionHoursType;
	/** Paid snapshot minutes for the selected type / worked duration baseline */
	beforeMinutes: number;
	/** Proposed clocks as HH:mm (24h). Empty while incomplete. */
	timeIn: string;
	timeOut: string;
	/** Original recorded clocks (HH:mm) for reference */
	originalTimeIn: string;
	originalTimeOut: string;
	/** Original day regular/OT buckets (for type classification when duration unchanged) */
	originalRegularMinutes: number;
	originalOtMinutes: number;
	/**
	 * Derived duration from timeIn→timeOut (overnight-aware).
	 * Empty string while either clock is incomplete so the user can clear/retype.
	 */
	afterMinutes: number | "";
};

export type PayrollCorrectionDayDeltaPayload = {
	date: string;
	hoursType: PayrollCorrectionHoursType;
	beforeMinutes: number;
	afterMinutes: number;
	deltaMinutes: number;
	/** Optional audit of proposed clocks */
	timeIn?: string;
	timeOut?: string;
};

export function parseHmToMinutes(value?: string | null): number {
	if (!value) return 0;
	const m = String(value).match(/^(\d+):(\d{2})$/);
	if (!m) return 0;
	return Number(m[1]) * 60 + Number(m[2]);
}

/** Parse HH:mm clock; returns null when empty/invalid (distinct from 0 minutes). */
export function parseClockToMinutes(value?: string | null): number | null {
	if (!value) return null;
	const trimmed = String(value).trim();
	if (!trimmed) return null;
	const m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) {
		return null;
	}
	return h * 60 + min;
}

/**
 * Duration in minutes from timeIn → timeOut.
 * If out ≤ in, treats as overnight (+24h). Returns "" when either clock is incomplete.
 */
export function durationMinutesFromClocks(
	timeIn?: string | null,
	timeOut?: string | null,
): number | "" {
	const inM = parseClockToMinutes(timeIn);
	const outM = parseClockToMinutes(timeOut);
	if (inM === null || outM === null) return "";
	let diff = outM - inM;
	if (diff <= 0) diff += 24 * 60;
	return diff;
}

/** Extract local HH:mm from an ISO datetime (or already-clock string). */
export function extractClockFromIso(iso?: string | null): string {
	if (!iso) return "";
	const raw = String(iso).trim();
	if (/^\d{1,2}:\d{2}$/.test(raw)) {
		const [h, m] = raw.split(":");
		return `${h.padStart(2, "0")}:${m}`;
	}
	try {
		const date = new Date(raw);
		if (Number.isNaN(date.getTime())) return "";
		return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
	} catch {
		return "";
	}
}

export function dayKey(value?: string | null): string {
	if (!value) return "";
	if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	const y = d.getUTCFullYear();
	const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${mo}-${day}`;
}

/**
 * Parse after-minutes draft input (legacy / harness).
 * Empty string is preserved so the user can clear the field and retype.
 */
export function parseAfterMinutesInput(raw: string, _fallback = 0): number | "" {
	const trimmed = String(raw ?? "").trim();
	if (trimmed === "") return "";
	const n = Number(trimmed);
	if (!Number.isFinite(n)) return "";
	return Math.max(0, Math.round(n));
}

/**
 * Auto-classify hours type from proposed Time In / Time Out vs the paid snapshot.
 * Not user-editable — used whenever clocks change.
 *
 * Rules (duration-first, clock-shift second):
 * - Missing/incomplete clocks or 0 duration → ABSENT
 * - Longer than paid baseline → OT (or REGULAR when filling a zero-paid day)
 * - Shorter + later start → LATE
 * - Shorter otherwise → EARLY_OUT
 * - Same duration → preserve original OT/REGULAR classification
 */
export function deriveHoursTypeFromProposedClocks(params: {
	timeIn: string;
	timeOut: string;
	afterMinutes: number | "";
	beforeMinutes: number;
	originalTimeIn: string;
	originalTimeOut: string;
	originalRegularMinutes?: number;
	originalOtMinutes?: number;
}): PayrollCorrectionHoursType {
	const inV = String(params.timeIn || "").trim();
	const outV = String(params.timeOut || "").trim();
	if (!inV || !outV || params.afterMinutes === "") {
		return "ABSENT";
	}
	const after = Math.max(0, Math.round(Number(params.afterMinutes) || 0));
	if (after <= 0) return "ABSENT";

	const before = Math.max(0, Math.round(Number(params.beforeMinutes) || 0));
	const origOt = Math.max(0, Math.round(Number(params.originalOtMinutes) || 0));
	const origReg = Math.max(0, Math.round(Number(params.originalRegularMinutes) || 0));

	if (after > before) {
		// New / previously unpaid work day → regular hours; extending paid day → OT
		return before <= 0 ? "REGULAR" : "OT";
	}

	if (after < before) {
		const origIn = parseClockToMinutes(params.originalTimeIn);
		const newIn = parseClockToMinutes(inV);
		if (origIn !== null && newIn !== null && newIn > origIn) {
			return "LATE";
		}
		return "EARLY_OUT";
	}

	// Unchanged duration: keep original bucket
	if (origOt > 0) return "OT";
	if (origReg > 0 || before > 0) return "REGULAR";
	return "REGULAR";
}

/** Apply proposed clocks and recompute afterMinutes + auto hoursType. */
export function withProposedClocks(
	row: Pick<
		PayrollCorrectionDayRow,
		| "timeIn"
		| "timeOut"
		| "beforeMinutes"
		| "originalTimeIn"
		| "originalTimeOut"
		| "originalRegularMinutes"
		| "originalOtMinutes"
	>,
	patch: { timeIn?: string; timeOut?: string },
): {
	timeIn: string;
	timeOut: string;
	afterMinutes: number | "";
	hoursType: PayrollCorrectionHoursType;
} {
	const timeIn = patch.timeIn !== undefined ? patch.timeIn : row.timeIn;
	const timeOut = patch.timeOut !== undefined ? patch.timeOut : row.timeOut;
	const afterMinutes = durationMinutesFromClocks(timeIn, timeOut);
	return {
		timeIn,
		timeOut,
		afterMinutes,
		hoursType: deriveHoursTypeFromProposedClocks({
			timeIn,
			timeOut,
			afterMinutes,
			beforeMinutes: row.beforeMinutes,
			originalTimeIn: row.originalTimeIn,
			originalTimeOut: row.originalTimeOut,
			originalRegularMinutes: row.originalRegularMinutes,
			originalOtMinutes: row.originalOtMinutes,
		}),
	};
}

export function resolveAfterMinutes(
	row: Pick<PayrollCorrectionDayRow, "beforeMinutes" | "afterMinutes">,
): number {
	if (row.afterMinutes === "" || row.afterMinutes === null || row.afterMinutes === undefined) {
		return Number(row.beforeMinutes) || 0;
	}
	return Math.max(0, Math.round(Number(row.afterMinutes) || 0));
}

export function hasDayDelta(
	row: Pick<PayrollCorrectionDayRow, "beforeMinutes" | "afterMinutes" | "timeIn" | "timeOut">,
): boolean {
	// Empty draft is not a committed change yet.
	if (row.afterMinutes === "") return false;
	// Partial clocks (only one side filled) are incomplete.
	const inV = String(row.timeIn ?? "").trim();
	const outV = String(row.timeOut ?? "").trim();
	if ((inV && !outV) || (!inV && outV)) return false;
	return Number(row.afterMinutes) !== Number(row.beforeMinutes);
}

/** Selected days that actually change paid minutes (only these should be submitted). */
export function getChangedSelectedDays(rows: PayrollCorrectionDayRow[]): PayrollCorrectionDayRow[] {
	return rows.filter((r) => r.selected && Boolean(r.date) && hasDayDelta(r));
}

export function evaluatePayrollCorrectionSubmit(params: {
	reason: string;
	rows: PayrollCorrectionDayRow[];
}): {
	canSubmit: boolean;
	changedDays: PayrollCorrectionDayRow[];
	selectedCount: number;
	errors: {
		reasonRequired: boolean;
		noChangedDays: boolean;
		selectedWithoutChange: boolean;
	};
} {
	const reason = String(params.reason || "").trim();
	const selected = params.rows.filter((r) => r.selected && r.date);
	const changedDays = getChangedSelectedDays(params.rows);
	const selectedWithoutChange =
		selected.length > 0 && changedDays.length === 0;
	const reasonRequired = reason.length === 0;
	const noChangedDays = changedDays.length === 0;

	return {
		canSubmit: !reasonRequired && changedDays.length > 0,
		changedDays,
		selectedCount: selected.length,
		errors: {
			reasonRequired,
			noChangedDays,
			selectedWithoutChange,
		},
	};
}

export function buildPayrollCorrectionPayload(params: {
	reason: string;
	rows: PayrollCorrectionDayRow[];
}): {
	ok: true;
	payload: { reason: string; dayDeltas: PayrollCorrectionDayDeltaPayload[] };
} | {
	ok: false;
	errors: ReturnType<typeof evaluatePayrollCorrectionSubmit>["errors"];
} {
	const evalResult = evaluatePayrollCorrectionSubmit(params);
	if (!evalResult.canSubmit) {
		return { ok: false, errors: evalResult.errors };
	}
	return {
		ok: true,
		payload: {
			reason: String(params.reason || "").trim(),
			dayDeltas: evalResult.changedDays.map((r) => {
				const afterMinutes = resolveAfterMinutes(r);
				return {
					date: r.date,
					hoursType: r.hoursType,
					beforeMinutes: r.beforeMinutes,
					afterMinutes,
					deltaMinutes: afterMinutes - r.beforeMinutes,
					timeIn: r.timeIn || undefined,
					timeOut: r.timeOut || undefined,
				};
			}),
		},
	};
}

export type BreakdownDayForCorrection = {
	date?: string | null;
	timeIn?: string | null;
	timeOut?: string | null;
	hoursWorked?: string | null;
	regularHours?: string | null;
	overtimeHours?: string | null;
};

/** Build one form row from a timesheet breakdown day. */
export function buildCorrectionRowFromBreakdownDay(
	day: BreakdownDayForCorrection,
	selected: boolean,
): PayrollCorrectionDayRow {
	const date = dayKey(day.date);
	const originalTimeIn = extractClockFromIso(day.timeIn);
	const originalTimeOut = extractClockFromIso(day.timeOut);
	const span = durationMinutesFromClocks(originalTimeIn, originalTimeOut);
	const worked = parseHmToMinutes(day.hoursWorked);
	const ot = parseHmToMinutes(day.overtimeHours);
	const reg = parseHmToMinutes(day.regularHours);
	// Baseline paid minutes: prefer recorded clock span, then hoursWorked, then type buckets.
	const before =
		span !== ""
			? span
			: worked > 0
				? worked
				: ot > 0
					? ot
					: reg;
	const afterMinutes: number | "" =
		span !== "" ? span : before > 0 ? before : "";
	const hoursType = deriveHoursTypeFromProposedClocks({
		timeIn: originalTimeIn,
		timeOut: originalTimeOut,
		afterMinutes,
		beforeMinutes: before,
		originalTimeIn,
		originalTimeOut,
		originalRegularMinutes: reg,
		originalOtMinutes: ot,
	});
	return {
		date,
		selected,
		hoursType,
		beforeMinutes: before,
		timeIn: originalTimeIn,
		timeOut: originalTimeOut,
		originalTimeIn,
		originalTimeOut,
		originalRegularMinutes: reg,
		originalOtMinutes: ot,
		afterMinutes,
	};
}
