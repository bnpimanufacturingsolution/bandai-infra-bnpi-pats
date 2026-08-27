/**
 * Shared pure logic for the BNPI per-cutoff payroll tally compare
 * (client Sheet2 register vs live HRIS payroll preview).
 *
 * Consumers: scripts/run-period-tally-compare.mjs (all-period CLI) and tests.
 */

export type TallyKeyField = {
	/** Column header in the client Sheet2 register. */
	target: string;
	/** Field on the app preview record. */
	app: string;
	/** Canonical key used in results/deltas. */
	key: string;
	optional?: boolean;
};

/** Unified field set (July variant): includes Leave/leavePay and optional ARP column. */
export const TALLY_KEY_FIELDS: TallyKeyField[] = [
	{ target: "Monthly Salary", app: "monthlySalary", key: "monthlySalary" },
	{ target: "No. of Days", app: "numberOfDays", key: "numberOfDays" },
	{ target: "Basic Salary", app: "basicPay", key: "basicPay" },
	{ target: "Absent-Amt", app: "absentDeduction", key: "absent" },
	{ target: "UT/Late-Amt", app: "lateUndertimeAmount", key: "late" },
	{ target: "No. of Reg OT Hrs", app: "regularOtHours", key: "regOtHrs" },
	{ target: "Reg OT", app: "overtimePay", key: "ot" },
	{ target: "Adjustment OT/ND", app: "adjustmentOtNd", key: "aon" },
	{ target: "De Minimis Allowance", app: "deMinimisAllowance", key: "dma" },
	{ target: "GrossPay", app: "grossPay", key: "gross" },
	{ target: "W/Tax", app: "taxAmount", key: "tax" },
	{ target: "Modified HDMF 2", app: "modifiedHdmf2", key: "mhdmf2" },
	{ target: "RCBC Loan", app: "rcbcLoan", key: "rcbc" },
	{ target: "HDMF Salary Loan", app: "hdmfSalaryLoan", key: "hdmfSl" },
	{ target: "SSS Salary Loan", app: "sssSalaryLoan", key: "sssSl" },
	{ target: "TOTAL DEDN", app: "totalDeductions", key: "totalDedn" },
	{ target: "NetPay", app: "netPay", key: "net" },
	{
		target: "Attendance Recognition Program",
		app: "attendanceRecognitionProgram",
		key: "arp",
		optional: true,
	},
	{ target: "Perfect Attendance", app: "perfectAttendance", key: "pfa" },
	{ target: "Meal Allowance", app: "mealAllowance", key: "mla" },
	{ target: "TotalReceivable", app: "totalReceivable", key: "totalReceivable" },
	{ target: "Leave", app: "leavePay", key: "leavePay" },
];

/** Core fields that decide TALLIED (leavePay is compared but not core — client manual exclusions exist). */
export const TALLY_CORE_KEYS = [
	"gross",
	"net",
	"totalReceivable",
	"ot",
	"absent",
	"late",
	"totalDedn",
] as const;

export function money(v: unknown): number {
	if (v == null || v === "" || v === "-") return 0;
	if (typeof v === "number") return Number.isFinite(v) ? v : 0;
	const s = String(v).replace(/,/g, "").replace(/PHP/gi, "").trim();
	if (!s || s === "-") return 0;
	const n = Number(s);
	return Number.isFinite(n) ? n : 0;
}

export function normCode(v: unknown): string {
	const s = String(v ?? "").trim();
	if (!s || s === "undefined" || s === "null") return "";
	if (/^\d+$/.test(s)) return s.padStart(5, "0");
	return s;
}

const almost = (a: unknown, b: unknown, tol: number) =>
	Math.abs(money(a) - money(b)) <= tol;

export type TallySide = Record<string, unknown> & { [k: string]: any };

export type TallyClassification = {
	band:
		| "TALLIED"
		| "ALEXA_NEAR"
		| "NEAR_10"
		| "OT_OK_NEAR_50"
		| "OT_MATCH_ONLY"
		| "UNMATCH";
	matchCount: number;
	compared: number;
	deltas: Record<string, number>;
	fieldMatch: Record<string, boolean | "SKIP_OPTIONAL">;
	absDeltaTotal: number;
	absDeltaGross: number;
};

export function classifyTally(
	target: TallySide,
	app: TallySide,
	opts?: { tol?: number; nearTol?: number; keyFields?: TallyKeyField[] },
): TallyClassification {
	const tol = opts?.tol ?? 0.05;
	const nearTol = opts?.nearTol ?? 10;
	const keyFields = opts?.keyFields ?? TALLY_KEY_FIELDS;

	const d = (k: string) => money(app[k]) - money(target[k]);
	const deltas: Record<string, number> = {};
	for (const f of keyFields) deltas[f.key] = d(f.key);

	const fieldMatch: Record<string, boolean | "SKIP_OPTIONAL"> = {};
	let matchCount = 0;
	let compared = 0;
	for (const f of keyFields) {
		if (f.optional && money(app[f.key]) === 0 && money(target[f.key]) !== 0) {
			// e.g. ARP may only live in receivable-only sum; don't punish a 0 column.
			fieldMatch[f.key] = "SKIP_OPTIONAL";
			continue;
		}
		compared += 1;
		const ok = almost(target[f.key], app[f.key], tol);
		fieldMatch[f.key] = ok;
		if (ok) matchCount += 1;
	}

	const coreTallied = TALLY_CORE_KEYS.every((k) =>
		almost(target[k], app[k], tol),
	);

	const trDelta = Math.abs(deltas.totalReceivable);
	const grossDelta = Math.abs(deltas.gross);
	const near =
		!coreTallied &&
		trDelta <= nearTol &&
		almost(target.ot, app.ot, tol) &&
		grossDelta <= nearTol * 2;

	const otMatched =
		almost(target.ot, app.ot, tol) && almost(target.regOtHrs, app.regOtHrs, tol);
	const alexaLike =
		otMatched && trDelta <= 1.0 && Math.abs(deltas.absent) <= 10 && Math.abs(deltas.late) <= 5;

	let band: TallyClassification["band"];
	if (coreTallied) band = "TALLIED";
	else if (alexaLike || (near && trDelta <= 1)) band = "ALEXA_NEAR";
	else if (near) band = "NEAR_10";
	else if (otMatched && trDelta <= 50) band = "OT_OK_NEAR_50";
	else if (otMatched) band = "OT_MATCH_ONLY";
	else band = "UNMATCH";

	return {
		band,
		matchCount,
		compared,
		deltas,
		fieldMatch,
		absDeltaTotal: trDelta,
		absDeltaGross: grossDelta,
	};
}

export function bucketBands(rows: Array<{ band: string }>): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const r of rows) counts[r.band] = (counts[r.band] || 0) + 1;
	return counts;
}
