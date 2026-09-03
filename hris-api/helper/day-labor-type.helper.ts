export const DAY_LABOR_TYPES = ["DIRECT", "INDIRECT"] as const;

export type DayLaborTypeValue = (typeof DAY_LABOR_TYPES)[number];

export function normalizeDayLaborType(value: unknown): DayLaborTypeValue | null {
	if (value == null) return null;
	const normalized = String(value).trim().toUpperCase();
	if (normalized === "DIRECT" || normalized === "INDIRECT") return normalized;
	return null;
}

export function formatDayLaborTypeLabel(value: unknown): string {
	const normalized = normalizeDayLaborType(value);
	if (normalized === "DIRECT") return "Direct";
	if (normalized === "INDIRECT") return "Indirect";
	return "Not tagged";
}
