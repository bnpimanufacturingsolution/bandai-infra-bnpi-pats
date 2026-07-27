/**
 * Pure helpers for post-payroll timesheet corrections (next-period retro apply).
 * Domain model: PayrollCorrection ledger — does not mutate locked timesheet SOT.
 */

export const PAYROLL_CORRECTION_STATUSES = [
	"REQUESTED",
	"READY",
	"APPLIED",
	"REJECTED",
	"VOID",
	"APPROVED_HOLD",
] as const;

export type PayrollCorrectionStatus = (typeof PAYROLL_CORRECTION_STATUSES)[number];

export const PAYROLL_CORRECTION_HOURS_TYPES = [
	"REGULAR",
	"OT",
	"ND",
	"LATE",
	"ABSENT",
	"EARLY_OUT",
	"OTHER",
] as const;

export type PayrollCorrectionHoursType = (typeof PAYROLL_CORRECTION_HOURS_TYPES)[number];

export type PayrollCorrectionDayDelta = {
	date: string;
	hoursType: PayrollCorrectionHoursType;
	beforeMinutes: number;
	afterMinutes: number;
	deltaMinutes: number;
	notes?: string | null;
};

export type PayrollCorrectionRateContext = {
	hourlyRate: number;
	otMultiplier?: number;
	ndPremiumMultiplier?: number;
};

export type PayrollCorrectionPayslipLine = {
	correctionId: string;
	requestId?: string | null;
	sourcePayrollPeriodId: string;
	sourcePayrollPeriodName?: string | null;
	sourceTimesheetId: string;
	label: string;
	amount: number;
	dayDeltas: PayrollCorrectionDayDelta[];
	status: "APPLIED";
	appliedAt: string;
};

const asRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};

export function normalizeDayKey(value: string | Date | null | undefined): string {
	if (!value) return "";
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
		return value.slice(0, 10);
	}
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	const y = d.getUTCFullYear();
	const m = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function parsePayrollCorrectionDayDeltas(raw: unknown): PayrollCorrectionDayDelta[] {
	if (!Array.isArray(raw)) return [];
	const out: PayrollCorrectionDayDelta[] = [];
	for (const item of raw) {
		const row = asRecord(item);
		const date = normalizeDayKey(String(row.date || ""));
		const hoursType = String(row.hoursType || "OTHER")
			.trim()
			.toUpperCase() as PayrollCorrectionHoursType;
		if (!date) continue;
		if (!PAYROLL_CORRECTION_HOURS_TYPES.includes(hoursType)) continue;
		const beforeMinutes = Math.round(Number(row.beforeMinutes) || 0);
		const afterMinutes = Math.round(Number(row.afterMinutes) || 0);
		const explicitDelta = row.deltaMinutes;
		const deltaMinutes =
			explicitDelta === undefined || explicitDelta === null
				? afterMinutes - beforeMinutes
				: Math.round(Number(explicitDelta) || 0);
		if (deltaMinutes === 0 && beforeMinutes === afterMinutes) continue;
		out.push({
			date,
			hoursType,
			beforeMinutes,
			afterMinutes,
			deltaMinutes,
			notes: row.notes != null ? String(row.notes) : null,
		});
	}
	return out;
}

export function validatePayrollCorrectionDayDeltas(raw: unknown): {
	ok: boolean;
	deltas: PayrollCorrectionDayDelta[];
	error?: string;
} {
	const deltas = parsePayrollCorrectionDayDeltas(raw);
	if (!deltas.length) {
		return { ok: false, deltas: [], error: "DAY_DELTAS_REQUIRED" };
	}
	const dates = new Set(deltas.map((d) => d.date));
	if (dates.size === 0) {
		return { ok: false, deltas: [], error: "DAY_DELTAS_REQUIRED" };
	}
	return { ok: true, deltas };
}

/**
 * Rate by hours type. LATE/ABSENT/EARLY_OUT treat positive deltaMinutes
 * (worse after) as pay reduction (negative money).
 */
export function ratePerMinuteForHoursType(
	hoursType: PayrollCorrectionHoursType,
	rates: PayrollCorrectionRateContext,
): number {
	const hourly = Math.max(0, Number(rates.hourlyRate) || 0);
	const perMinute = hourly / 60;
	const otMult = Number(rates.otMultiplier) > 0 ? Number(rates.otMultiplier) : 1.5;
	const ndPremium =
		Number(rates.ndPremiumMultiplier) > 0 ? Number(rates.ndPremiumMultiplier) : 0.2;

	switch (hoursType) {
		case "OT":
			return perMinute * otMult;
		case "ND":
			return perMinute * ndPremium;
		case "LATE":
		case "ABSENT":
		case "EARLY_OUT":
			// more late/absent after → negative money
			return -perMinute;
		case "REGULAR":
		case "OTHER":
		default:
			return perMinute;
	}
}

export function computePayrollCorrectionAmount(
	dayDeltas: PayrollCorrectionDayDelta[],
	rates: PayrollCorrectionRateContext,
): number {
	let total = 0;
	for (const d of dayDeltas) {
		const rpm = ratePerMinuteForHoursType(d.hoursType, rates);
		total += d.deltaMinutes * rpm;
	}
	return Math.round(total * 100) / 100;
}

export function resolvePostApprovalStatus(estimatedAmount: number | null | undefined): {
	status: Extract<PayrollCorrectionStatus, "READY" | "APPROVED_HOLD">;
	holdReason?: string;
} {
	const amount = Number(estimatedAmount);
	if (Number.isFinite(amount) && amount < 0) {
		return {
			status: "APPROVED_HOLD",
			holdReason: "NEGATIVE_DELTA_REQUIRES_HR_PATH",
		};
	}
	return { status: "READY" };
}

export function buildRetroPayslipLabel(params: {
	sourcePeriodName?: string | null;
	hoursTypes?: string[];
}): string {
	const period = params.sourcePeriodName?.trim() || "prior period";
	const types = (params.hoursTypes || []).filter(Boolean);
	const typeLabel =
		types.length === 1
			? types[0] === "OT"
				? "OT"
				: types[0] === "ND"
					? "ND"
					: types[0] === "REGULAR"
						? "hours"
						: String(types[0]).toLowerCase()
			: "adjustment";
	return `Retro ${typeLabel} (${period} correction)`;
}

export function buildPayrollCorrectionPayslipLine(params: {
	correctionId: string;
	requestId?: string | null;
	sourcePayrollPeriodId: string;
	sourcePayrollPeriodName?: string | null;
	sourceTimesheetId: string;
	dayDeltas: PayrollCorrectionDayDelta[];
	amount: number;
	appliedAt?: Date;
}): PayrollCorrectionPayslipLine {
	const hoursTypes = [...new Set(params.dayDeltas.map((d) => d.hoursType))];
	return {
		correctionId: params.correctionId,
		requestId: params.requestId || null,
		sourcePayrollPeriodId: params.sourcePayrollPeriodId,
		sourcePayrollPeriodName: params.sourcePayrollPeriodName || null,
		sourceTimesheetId: params.sourceTimesheetId,
		label: buildRetroPayslipLabel({
			sourcePeriodName: params.sourcePayrollPeriodName,
			hoursTypes,
		}),
		amount: params.amount,
		dayDeltas: params.dayDeltas,
		status: "APPLIED",
		appliedAt: (params.appliedAt || new Date()).toISOString(),
	};
}

/** Merge correction lines into employee payroll metadata without dropping existing keys. */
export function mergePayrollCorrectionsIntoMetadata(
	existingMetadata: unknown,
	lines: PayrollCorrectionPayslipLine[],
	extra?: Record<string, unknown>,
): Record<string, unknown> {
	const meta = asRecord(existingMetadata);
	const prior = Array.isArray(meta.payrollCorrections)
		? (meta.payrollCorrections as unknown[])
		: [];
	const byId = new Map<string, unknown>();
	for (const item of prior) {
		const row = asRecord(item);
		const id = String(row.correctionId || "");
		if (id) byId.set(id, item);
	}
	for (const line of lines) {
		byId.set(line.correctionId, line);
	}
	return {
		...meta,
		...(extra || {}),
		payrollCorrections: [...byId.values()],
	};
}

export function sumAppliedCorrectionAmounts(lines: PayrollCorrectionPayslipLine[]): number {
	return Math.round(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0) * 100) / 100;
}

/** Open statuses that block a duplicate correction for the same day on a timesheet. */
export const OPEN_PAYROLL_CORRECTION_STATUSES: PayrollCorrectionStatus[] = [
	"REQUESTED",
	"READY",
	"APPROVED_HOLD",
];

export function dayKeysFromDeltas(dayDeltas: PayrollCorrectionDayDelta[]): string[] {
	return [...new Set(dayDeltas.map((d) => d.date).filter(Boolean))];
}

export function hasOverlappingOpenDay(
	existingOpenDeltas: PayrollCorrectionDayDelta[],
	incoming: PayrollCorrectionDayDelta[],
): boolean {
	const openDays = new Set(dayKeysFromDeltas(existingOpenDeltas));
	return dayKeysFromDeltas(incoming).some((d) => openDays.has(d));
}
