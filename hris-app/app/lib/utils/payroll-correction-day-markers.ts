/**
 * Index payroll corrections onto timesheet calendar days for markers + tooltips.
 */

export type PayrollCorrectionListStatus =
	| "REQUESTED"
	| "READY"
	| "APPROVED_HOLD"
	| "APPLIED"
	| "REJECTED"
	| "VOID"
	| string;

export type PayrollCorrectionDayDelta = {
	date?: string;
	hoursType?: string;
	beforeMinutes?: number;
	afterMinutes?: number;
	deltaMinutes?: number;
	notes?: string | null;
};

export type PayrollCorrectionListItem = {
	id: string;
	status: PayrollCorrectionListStatus;
	reason?: string | null;
	requestId?: string | null;
	estimatedAmount?: number | null;
	appliedAmount?: number | null;
	dayDeltas?: PayrollCorrectionDayDelta[] | unknown;
	metadata?: Record<string, unknown> | null;
	createdAt?: string;
	approvedAt?: string | null;
	appliedAt?: string | null;
};

export type DayPayrollCorrectionMarker = {
	date: string;
	/** Highest-priority open/applied correction status for this day */
	status: PayrollCorrectionListStatus;
	badgeLabel: string;
	badgeTone: "correction-requested" | "correction-ready" | "correction-applied";
	statusLabel: string;
	deltas: Array<{
		hoursType: string;
		beforeMinutes: number;
		afterMinutes: number;
		deltaMinutes: number;
		correctionId: string;
		status: PayrollCorrectionListStatus;
		reason?: string | null;
	}>;
	correctionIds: string[];
};

const VISIBLE_STATUSES = new Set([
	"REQUESTED",
	"READY",
	"APPROVED_HOLD",
	"APPLIED",
]);

const STATUS_PRIORITY: Record<string, number> = {
	REQUESTED: 40,
	READY: 30,
	APPROVED_HOLD: 25,
	APPLIED: 10,
	REJECTED: 0,
	VOID: 0,
};

export function dayKeyFromValue(value?: string | Date | null): string {
	if (!value) return "";
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
		return value.slice(0, 10);
	}
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function parseCorrectionDayDeltas(
	raw: unknown,
): PayrollCorrectionDayDelta[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.map((item) => {
			const row =
				item && typeof item === "object" && !Array.isArray(item)
					? (item as Record<string, unknown>)
					: {};
			const date = dayKeyFromValue(String(row.date || ""));
			if (!date) return null;
			const beforeMinutes = Math.round(Number(row.beforeMinutes) || 0);
			const afterMinutes = Math.round(Number(row.afterMinutes) || 0);
			const deltaMinutes =
				row.deltaMinutes == null
					? afterMinutes - beforeMinutes
					: Math.round(Number(row.deltaMinutes) || 0);
			return {
				date,
				hoursType: String(row.hoursType || "OTHER").toUpperCase(),
				beforeMinutes,
				afterMinutes,
				deltaMinutes,
				notes: row.notes != null ? String(row.notes) : null,
			} satisfies PayrollCorrectionDayDelta;
		})
		.filter(Boolean) as PayrollCorrectionDayDelta[];
}

export function formatMinutesShort(minutes: number): string {
	const sign = minutes < 0 ? "-" : "";
	const abs = Math.abs(Math.round(minutes));
	const h = Math.floor(abs / 60);
	const m = abs % 60;
	return `${sign}${h}:${String(m).padStart(2, "0")}`;
}

export function statusLabelForCorrection(status: string): string {
	switch (String(status || "").toUpperCase()) {
		case "REQUESTED":
			return "Requested — pending approval";
		case "READY":
			return "Approved — scheduled for next payroll";
		case "APPROVED_HOLD":
			return "Approved (on hold)";
		case "APPLIED":
			return "Applied on a later payslip";
		case "REJECTED":
			return "Rejected";
		case "VOID":
			return "Void";
		default:
			return String(status || "Unknown");
	}
}

function badgeForStatus(
	status: string,
): Pick<DayPayrollCorrectionMarker, "badgeLabel" | "badgeTone" | "statusLabel"> {
	const normalized = String(status || "").toUpperCase();
	if (normalized === "REQUESTED") {
		return {
			badgeLabel: "COR",
			badgeTone: "correction-requested",
			statusLabel: statusLabelForCorrection(normalized),
		};
	}
	if (normalized === "APPLIED") {
		return {
			badgeLabel: "COR",
			badgeTone: "correction-applied",
			statusLabel: statusLabelForCorrection(normalized),
		};
	}
	// READY / APPROVED_HOLD
	return {
		badgeLabel: "COR",
		badgeTone: "correction-ready",
		statusLabel: statusLabelForCorrection(normalized),
	};
}

/**
 * Build a map of YYYY-MM-DD → marker for timesheet calendar rendering.
 * Only REQUESTED / READY / APPROVED_HOLD / APPLIED are shown.
 */
export function buildPayrollCorrectionMarkersByDate(
	items: PayrollCorrectionListItem[] | null | undefined,
): Map<string, DayPayrollCorrectionMarker> {
	const map = new Map<string, DayPayrollCorrectionMarker>();
	const list = Array.isArray(items) ? items : [];

	for (const item of list) {
		const status = String(item.status || "").toUpperCase();
		if (!VISIBLE_STATUSES.has(status)) continue;
		const deltas = parseCorrectionDayDeltas(item.dayDeltas);
		for (const delta of deltas) {
			const date = dayKeyFromValue(delta.date);
			if (!date) continue;
			const existing = map.get(date);
			const badge = badgeForStatus(status);
			const deltaEntry = {
				hoursType: String(delta.hoursType || "OTHER"),
				beforeMinutes: Number(delta.beforeMinutes) || 0,
				afterMinutes: Number(delta.afterMinutes) || 0,
				deltaMinutes:
					delta.deltaMinutes != null
						? Number(delta.deltaMinutes)
						: (Number(delta.afterMinutes) || 0) - (Number(delta.beforeMinutes) || 0),
				correctionId: item.id,
				status,
				reason: item.reason || null,
			};

			if (!existing) {
				map.set(date, {
					date,
					status,
					...badge,
					deltas: [deltaEntry],
					correctionIds: [item.id],
				});
				continue;
			}

			existing.deltas.push(deltaEntry);
			if (!existing.correctionIds.includes(item.id)) {
				existing.correctionIds.push(item.id);
			}
			// Prefer the most "active" status for the cell marker
			const existingPriority = STATUS_PRIORITY[existing.status] ?? 0;
			const nextPriority = STATUS_PRIORITY[status] ?? 0;
			if (nextPriority > existingPriority) {
				existing.status = status;
				existing.badgeLabel = badge.badgeLabel;
				existing.badgeTone = badge.badgeTone;
				existing.statusLabel = badge.statusLabel;
			}
		}
	}

	return map;
}

export function extractPayrollCorrectionItems(apiPayload: unknown): PayrollCorrectionListItem[] {
	if (!apiPayload) return [];
	if (Array.isArray(apiPayload)) return apiPayload as PayrollCorrectionListItem[];
	const record =
		apiPayload && typeof apiPayload === "object"
			? (apiPayload as Record<string, unknown>)
			: {};
	if (Array.isArray(record.items)) return record.items as PayrollCorrectionListItem[];
	if (Array.isArray(record.data)) return record.data as PayrollCorrectionListItem[];
	const nested =
		record.data && typeof record.data === "object"
			? (record.data as Record<string, unknown>)
			: null;
	if (nested && Array.isArray(nested.items)) return nested.items as PayrollCorrectionListItem[];
	return [];
}
