export type JobCodeSource = {
	id?: string | null;
	positionTitle?: string | null;
	positionCode?: string | null;
	createdAt?: string | Date | null;
};

const DATELESS_FALLBACK = "JOB";

const normalizePositionCode = (positionCode?: string | null): string =>
	String(positionCode || "")
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9-]/g, "")
		.replace(/^-+|-+$/g, "");

/**
 * Fallback prefix when a position has no usable code: multi-word titles use
 * the initials of up to 3 words ("Software Engineer" -> SE,
 * "Deputy General Manager" -> DGM); single-word titles use their first two
 * letters ("Operator" -> OP). Anything unusable falls back to JOB.
 */
export const buildJobPositionInitials = (positionTitle?: string | null): string => {
	const words = String(positionTitle || "")
		.split(/\s+/)
		.map((word) => word.replace(/[^a-zA-Z]/g, ""))
		.filter(Boolean);
	if (!words.length) return DATELESS_FALLBACK;
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
	return words
		.slice(0, 3)
		.map((word) => word[0])
		.join("")
		.toUpperCase();
};

/** MMDDYYYY in local time (matches the operator's SE-01182026 convention). */
export const buildJobDateCode = (createdAt?: string | Date | null): string => {
	const date = createdAt instanceof Date ? createdAt : createdAt ? new Date(createdAt) : null;
	if (!date || Number.isNaN(date.getTime())) return "";
	const mm = String(date.getMonth() + 1).padStart(2, "0");
	const dd = String(date.getDate()).padStart(2, "0");
	const yyyy = String(date.getFullYear());
	return `${mm}${dd}${yyyy}`;
};

export const buildJobDisplayCode = (
	positionTitle?: string | null,
	createdAt?: string | Date | null,
	positionCode?: string | null,
): string => {
	const prefix = normalizePositionCode(positionCode) || buildJobPositionInitials(positionTitle);
	const dateCode = buildJobDateCode(createdAt);
	return dateCode ? `${prefix}-${dateCode}` : prefix;
};

/**
 * Derives a display code per job, in list order. The prefix is the position's
 * canonical `Position.code` (e.g. OPR, SW-MGR, 23); positions without a usable
 * code fall back to title initials. Two openings for the same position created
 * on the same day share a base code; the 2nd/3rd get -2/-3 suffixes so section
 * headers never look like duplicates. Codes are derived presentation only
 * (not persisted, suffix assignment is order-dependent).
 */
export const buildJobDisplayCodes = <T extends JobCodeSource>(
	jobs: T[],
): Record<string, string> => {
	const seen: Record<string, number> = {};
	const codes: Record<string, string> = {};
	for (const job of Array.isArray(jobs) ? jobs : []) {
		const id = String(job?.id || "").trim();
		if (!id) continue;
		const base = buildJobDisplayCode(job.positionTitle, job.createdAt, job.positionCode);
		const occurrence = (seen[base] || 0) + 1;
		seen[base] = occurrence;
		codes[id] = occurrence === 1 ? base : `${base}-${occurrence}`;
	}
	return codes;
};
