import type { DayStatusRow } from "./day-status-resolution.helper";

/**
 * Disciplinary auto-escalation engine (absence family).
 *
 * Operator-accepted policy 2026-09-02 (docs/00-product/DISCIPLINARY-AUTO-ESCALATION.md):
 *  - 1 evidenced absent day in window  -> LOW
 *  - 2 evidenced absent days          -> MEDIUM
 *  - 3+ evidenced absent days         -> HIGH
 *  - each prior non-dismissed DA for the same employee inside the rolling
 *    lookback window escalates severity one level (cap HIGH; CRITICAL stays manual)
 *  - engine files DRAFT cases only; an HR confirm moves DRAFT -> OPEN
 *  - REVIEW_NO_EVIDENCE days never auto-file (phantom-absence guard)
 */

export const DISCIPLINARY_AUTO_RULE_VERSION = 1;

export const DISCIPLINARY_ESCALATION_LOOKBACK_DAYS = 180;

export const DISCIPLINARY_AUTO_OFFENSE_TYPE = "ABSENTEEISM";

export const DISCIPLINARY_ESCALATION_ORDER = ["LOW", "MEDIUM", "HIGH"] as const;

export type DisciplinarySeverity = (typeof DISCIPLINARY_ESCALATION_ORDER)[number];

/** Days absent in the occurrence window -> base severity. */
export const resolveAbsenceSeverity = (absentDays: number): DisciplinarySeverity => {
	if (absentDays >= 3) return "HIGH";
	if (absentDays === 2) return "MEDIUM";
	return "LOW";
};

export const escalateSeverity = (
	base: DisciplinarySeverity,
	priorAttempts: number,
): DisciplinarySeverity => {
	const index = DISCIPLINARY_ESCALATION_ORDER.indexOf(base);
	const bumped = Math.min(index + Math.max(0, priorAttempts), DISCIPLINARY_ESCALATION_ORDER.length - 1);
	return DISCIPLINARY_ESCALATION_ORDER[bumped];
};

const dateOf = (row: { date: string }) => row.date;

/**
 * Collapse evidenced-absent day rows into occurrence clusters.
 * Consecutive calendar days (including intervening Sunday rest days) belong to
 * the same occurrence; a gap of two or more calendar days starts a new cluster.
 */
export const clusterEvidencedAbsentDays = (
	rows: Array<Pick<DayStatusRow, "code" | "date">>,
): Array<{ code: string; start: string; end: string; days: number; dates: string[] }> => {
	const byCode = new Map<string, string[]>();
	for (const row of rows) {
		const list = byCode.get(row.code) || [];
		list.push(dateOf(row));
		byCode.set(row.code, list);
	}

	const clusters: Array<{ code: string; start: string; end: string; days: number; dates: string[] }> = [];
	for (const [code, datesRaw] of byCode) {
		const dates = [...new Set(datesRaw)].sort();
		let current: string[] = [];
		const flush = () => {
			if (!current.length) return;
			clusters.push({ code, start: current[0], end: current[current.length - 1], days: current.length, dates: [...current] });
			current = [];
		};
		for (const date of dates) {
			if (!current.length) {
				current = [date];
				continue;
			}
			const prev = new Date(`${current[current.length - 1]}T00:00:00Z`);
			const cur = new Date(`${date}T00:00:00Z`);
			const gapDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
			// gap of 1 = consecutive; gap of 2 with Sunday in between is still one AWOL run
			if (gapDays <= 2) {
				current.push(date);
			} else {
				flush();
				current = [date];
			}
		}
		flush();
	}

	clusters.sort((a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code));
	return clusters;
};

export type AutoEvaluateProposal = {
	employeeId: string;
	employeeCode: string;
	employeeName: string;
	offenseType: typeof DISCIPLINARY_AUTO_OFFENSE_TYPE;
	offenseDate: string;
	description: string;
	severity: DisciplinarySeverity;
	baseSeverity: DisciplinarySeverity;
	priorAttempts: number;
	absentDays: number;
	occurrenceWindow: { start: string; end: string };
	evidenceClasses: string[];
	status: "DRAFT";
	dedupKey: string;
};

export const buildAutoEvaluateProposalKey = (
	code: string,
	occurrence: { start: string; end: string },
): string => `attendance-auto-escalation|${code}|${occurrence.start}|${occurrence.end}`;

const describeOccurrence = (cluster: { days: number; start: string; end: string }): string => {
	return `Auto-filed: ${cluster.days} evidenced absent day(s) ${cluster.start}..${cluster.end} (attendance auto-escalation rule v${DISCIPLINARY_AUTO_RULE_VERSION}). Requires HR confirmation before the case becomes official.`;
};

/**
 * Pure proposal builder: turns evidenced-absent day rows plus prior case counts
 * into DRAFT disciplinary-action proposals. No I/O; pinned by unit tests.
 */
export const buildAutoEvaluateProposals = (input: {
	evidencedAbsentRows: Array<Pick<DayStatusRow, "code" | "date">>;
	employeeIdByCode: Map<string, { id: string; name: string }>;
	priorAttemptsByCode: Map<string, number>;
}): AutoEvaluateProposal[] => {
	const clusters = clusterEvidencedAbsentDays(input.evidencedAbsentRows);
	const proposals: AutoEvaluateProposal[] = [];

	for (const cluster of clusters) {
		const employee = input.employeeIdByCode.get(cluster.code);
		if (!employee) continue;
		const priorAttempts = input.priorAttemptsByCode.get(cluster.code) || 0;
		const baseSeverity = resolveAbsenceSeverity(cluster.days);
		const severity = escalateSeverity(baseSeverity, priorAttempts);
		const evidenceClasses = Array.from(new Set(cluster.dates.map(() => "EVIDENCED_ABSENT")));
		proposals.push({
			employeeId: employee.id,
			employeeCode: cluster.code,
			employeeName: employee.name,
			offenseType: DISCIPLINARY_AUTO_OFFENSE_TYPE,
			offenseDate: cluster.start,
			description: describeOccurrence(cluster),
			severity,
			baseSeverity,
			priorAttempts,
			absentDays: cluster.days,
			occurrenceWindow: { start: cluster.start, end: cluster.end },
			evidenceClasses,
			status: "DRAFT",
			dedupKey: buildAutoEvaluateProposalKey(cluster.code, {
				start: cluster.start,
				end: cluster.end,
			}),
		});
	}

	return proposals;
};
