import { DayLaborType, WorkforceSource } from "../generated/prisma";

/**
 * Default project code resolution for timesheet lines (operator requirement 2026-09-08).
 *
 * Rule: per-day project code derived from the day's labor classification.
 *   - DIRECT  -> `bnpi-dl-<year>`
 *   - INDIRECT -> `bnpi-id-<year>`
 *
 * The year is the Asia/Manila year of the line's date (schedule/punch truth is
 * Manila; UTC date spill must not change the project-code year).
 *
 * Per-day classification precedence (a line per date, so an employee can carry
 * different project codes on different days):
 *   1. Explicit `dayLaborType` tag on that day (line leader / editor tag)
 *   2. Employee `workforceSource` snapshot (AGENCY = INDIRECT; missing/BNPI
 *      counts as DIRECT per canonical terminology)
 * 3. `projectCode` is a DEFAULT: an explicit `projectCode` in a write request
 *    overrides the derivation (validated/normalized separately).
 */

export const BNPI_DIRECT_PREFIX = "bnpi-dl";
export const BNPI_INDIRECT_PREFIX = "bnpi-id";

export interface TimesheetProjectCodeSource {
	dayLaborType?: string | null | undefined;
	workforceSource?: string | null | undefined;
}

/** Normalize a WorkforceSource-ish value to DIRECT/INDIRECT bucket. */
export function normalizeWorkforceSourceBucket(
	value: string | null | undefined,
): "DIRECT" | "INDIRECT" {
	const normalized = value ? String(value).trim().toUpperCase() : "";
	if (normalized === "AGENCY") return "INDIRECT";
	// BNPI, unknown, empty, and missing source count as DIRECT (canonical terminology).
	return "DIRECT";
}

/**
 * Manila-year extraction. Accepts Date | ISO string | "YYYY-MM-DD".
 * `Asia/Manila` is UTC+8 with no DST; formatting via Intl then parsing is the
 * deterministic way (getUTCFullYear would be wrong for Manila Dec 31/Jan 1
 * boundaries where UTC is still the prior year).
 */
export function resolveManilaYearOfDate(value: unknown): number | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(String(value));
	if (Number.isNaN(date.getTime())) return null;
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Manila",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(date);
	const yearPart = parts.find((p) => p.type === "year")?.value;
	const year = Number(yearPart);
	return Number.isFinite(year) && year > 1970 && year < 2200 ? year : null;
}

/** Resolve the labor bucket for a single day, tag first, hire source second. */
export function resolveDayLaborBucket(
	source: TimesheetProjectCodeSource,
): "DIRECT" | "INDIRECT" {
	const tag = source.dayLaborType ? String(source.dayLaborType).trim().toUpperCase() : "";
	if (tag === "DIRECT" || tag === "INDIRECT") return tag;
	return normalizeWorkforceSourceBucket(source.workforceSource);
}

/**
 * Default project code for a timesheet line. Every line classifies: the day tag
 * wins, else the workforce source bucket (AGENCY -> INDIRECT, else DIRECT).
 * Returns null only when the date itself is unparseable.
 */
export function resolveTimesheetProjectCode(
	source: TimesheetProjectCodeSource & { date?: unknown },
): string | null {
	const bucket = resolveDayLaborBucket(source);
	if (!bucket) return null;
	const year = resolveManilaYearOfDate(source.date);
	if (!year) return null;
	return bucket === "DIRECT"
		? `${BNPI_DIRECT_PREFIX}-${year}`
		: `${BNPI_INDIRECT_PREFIX}-${year}`;
}

/** Validate/normalize an explicit projectCode override from a request. */
export function normalizeProjectCodeOverride(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	const text = String(value).trim();
	if (!text) return null;
	if (text.length > 64) {
		throw new Error("projectCode must be 64 characters or fewer");
	}
	return text;
}

/** Convenience for breakdown-payload mapping (line rows may be partial). */
export function attachProjectCodeToLinePayload<T extends Record<string, any>>(
	line: T,
): T {
	return {
		...line,
		projectCode: line?.projectCode ?? null,
	};
}
