/**
 * BNPI Monthly Payment / Statutory Benefits workbook helpers.
 * Accepts client remittance-shaped files such as:
 * - April 2026 Monthly Payment_Statutory Benefits.xlsx
 *
 * Sheet columns (header row, flexible spacing):
 * Emp. No., Employee Name, SSS EE, PHIC EE, HDMF EE,
 * SSS Loan 15th/30th, HDMF Loan 15th/30th, calamity, MP2, SSS LRP, …
 *
 * Import target for DM3 migration UI: ongoing loan / deduction enrollments
 * (not frozen government contribution amounts as permanent benefits).
 */

import * as XLSX from "xlsx";
import { padEmployeeId } from "./bnpi-mass-upload-import.helper";

export type StatutoryDeductionKind = "loan" | "benefit";

export type StatutoryLoanFamily =
	| "SSS_SALARY_LOAN"
	| "HDMF_SALARY_LOAN"
	| "SSS_CALAMITY"
	| "HDMF_CALAMITY"
	| "HDMF_MP2"
	| "SSS_LRP";

export const STATUTORY_LOAN_FAMILY_TO_LOAN_NAME: Record<
	Exclude<StatutoryLoanFamily, "HDMF_MP2">,
	string
> = {
	SSS_SALARY_LOAN: "SSS Salary Loan",
	HDMF_SALARY_LOAN: "HDMF Salary Loan",
	SSS_CALAMITY: "SSS Calamity Loan",
	HDMF_CALAMITY: "HDMF Calamity Loan",
	SSS_LRP: "SSS Loan Restructuring Program",
};

/** MP2 is a recurring deduction benefit (DM2 code MHDMF2), not a loan type. */
export const STATUTORY_MP2_BENEFIT_CODE = "MHDMF2";
export const STATUTORY_MP2_BENEFIT_NAME = "Modified HDMF 2";

export type StatutoryDeductionRow = {
	employeeId: string;
	employeeName: string | null;
	family: StatutoryLoanFamily;
	kind: StatutoryDeductionKind;
	loanTypeName: string | null;
	benefitCode: string | null;
	/** Per-cutoff installment (15th or 30th amount). */
	paymentAmount: number;
	/** Best-effort principal (unknown in remittance board → payment × 24). */
	principalAmount: number;
	amount15: number;
	amount30: number;
	sourceSheet: string;
	sourceRow: number;
	startDate: Date;
	sssNo: string | null;
};

export type StatutoryBenefitsParseResult = {
	sheetName: string;
	startDate: Date;
	headers: string[];
	deductionRows: StatutoryDeductionRow[];
	skippedEmployees: number;
	contributionOnlyEmployees: number;
	errors: Array<{ row: number; message: string }>;
};

function normalizeHeader(value: unknown): string {
	return String(value ?? "")
		.replace(/\r?\n/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.toLowerCase();
}

function parseMoney(value: unknown): number {
	if (value == null) return 0;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const s = String(value)
		.replace(/,/g, "")
		.replace(/₱/g, "")
		.trim();
	if (!s || s === "-" || s === "—" || s.toLowerCase() === "true" || s.toLowerCase() === "false") {
		return 0;
	}
	const n = Number(s);
	return Number.isFinite(n) ? n : 0;
}

/**
 * Pick the installment that should apply as a recurring per-cutoff payment.
 * Prefer a positive 15th cut; else 30th; if both positive and differ, use 15th
 * (semi-monthly boards usually mirror equal halves).
 */
export function resolveStatutoryPeriodPayment(amount15: number, amount30: number): number {
	const a15 = amount15 > 0 ? amount15 : 0;
	const a30 = amount30 > 0 ? amount30 : 0;
	if (a15 > 0) return a15;
	if (a30 > 0) return a30;
	return 0;
}

export function isStatutoryBenefitsHeaderRow(headers: unknown[]): boolean {
	const normalized = headers.map(normalizeHeader);
	const joined = normalized.join("|");
	const hasEmp =
		normalized.some((h) => h.includes("emp. no") || h === "emp no" || h === "emp. no.") ||
		normalized.includes("employee name");
	const hasStatutorySignal =
		joined.includes("sss ee") ||
		joined.includes("phic ee") ||
		joined.includes("hdmf ee") ||
		joined.includes("sss loan") ||
		joined.includes("hdmf loan") ||
		joined.includes("sss calamity") ||
		joined.includes("hdmf calamity") ||
		joined.includes("hdmf mp2") ||
		joined.includes("sss lrp") ||
		joined.includes(" mp2 ") ||
		joined.includes(" lrp ");
	return hasEmp && hasStatutorySignal;
}

export function detectStatutoryBenefitsWorkbook(buffer: Buffer): boolean {
	const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
	for (const name of workbook.SheetNames) {
		const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
			header: 1,
			defval: null,
			raw: true,
		});
		const header = rows[0];
		if (Array.isArray(header) && isStatutoryBenefitsHeaderRow(header)) {
			return true;
		}
	}
	return false;
}

/** Parse sheet names like "2026 April", "2024 December" → first day of that month (UTC). */
export function parseStatutorySheetStartDate(sheetName: string, fallback = new Date()): Date {
	const raw = String(sheetName || "").trim();
	const months: Record<string, number> = {
		january: 0,
		february: 1,
		march: 2,
		april: 3,
		may: 4,
		june: 5,
		july: 6,
		august: 7,
		september: 8,
		october: 9,
		november: 10,
		december: 11,
	};
	const match = raw.match(/(\d{4})\s+([A-Za-z]+)|([A-Za-z]+)\s+(\d{4})/);
	if (match) {
		const year = Number(match[1] || match[4]);
		const monthName = String(match[2] || match[3] || "").toLowerCase();
		const month = months[monthName];
		if (Number.isFinite(year) && month != null) {
			return new Date(Date.UTC(year, month, 1));
		}
	}
	const d = new Date(fallback.getTime());
	return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function scoreSheetNameForRecency(sheetName: string): number {
	const start = parseStatutorySheetStartDate(sheetName, new Date(0));
	return start.getTime();
}

type ColumnMap = {
	emp: number;
	name: number | null;
	sssNo: number | null;
	sssLoan15: number | null;
	sssLoan30: number | null;
	hdmfLoan15: number | null;
	hdmfLoan30: number | null;
	sssCal15: number | null;
	sssCal30: number | null;
	hdmfCal15: number | null;
	hdmfCal30: number | null;
	mp2_15: number | null;
	mp2_30: number | null;
	lrp15: number | null;
	lrp30: number | null;
};

function mapStatutoryColumns(headerRow: unknown[]): ColumnMap {
	const map: ColumnMap = {
		emp: -1,
		name: null,
		sssNo: null,
		sssLoan15: null,
		sssLoan30: null,
		hdmfLoan15: null,
		hdmfLoan30: null,
		sssCal15: null,
		sssCal30: null,
		hdmfCal15: null,
		hdmfCal30: null,
		mp2_15: null,
		mp2_30: null,
		lrp15: null,
		lrp30: null,
	};

	headerRow.forEach((raw, index) => {
		const h = normalizeHeader(raw);
		if (!h) return;
		if (map.emp < 0 && (h.includes("emp. no") || h === "emp no" || h === "emp. no.")) {
			map.emp = index;
			return;
		}
		if (map.name == null && h.includes("employee name")) {
			map.name = index;
			return;
		}
		if (map.sssNo == null && (h === "sss no." || h === "sss no" || h.startsWith("sss no"))) {
			map.sssNo = index;
			return;
		}
		if (h.includes("sss loan") && h.includes("15")) map.sssLoan15 = index;
		else if (h.includes("sss loan") && h.includes("30")) map.sssLoan30 = index;
		else if (h.includes("hdmf loan") && h.includes("15")) map.hdmfLoan15 = index;
		else if (h.includes("hdmf loan") && h.includes("30")) map.hdmfLoan30 = index;
		else if (h.includes("sss calamity") && h.includes("15")) map.sssCal15 = index;
		else if (h.includes("sss calamity") && h.includes("30")) map.sssCal30 = index;
		else if (h.includes("hdmf calamity") && h.includes("15")) map.hdmfCal15 = index;
		else if (h.includes("hdmf calamity") && h.includes("30")) map.hdmfCal30 = index;
		else if ((h.includes("hdmf mp2") || h.includes("mp2")) && h.includes("15")) map.mp2_15 = index;
		else if ((h.includes("hdmf mp2") || h.includes("mp2")) && h.includes("30")) map.mp2_30 = index;
		else if ((h.includes("sss lrp") || h.includes("lrp")) && h.includes("15")) map.lrp15 = index;
		else if ((h.includes("sss lrp") || h.includes("lrp")) && h.includes("30")) map.lrp30 = index;
	});

	return map;
}

function cell(row: unknown[], index: number | null | undefined): unknown {
	if (index == null || index < 0) return null;
	return row[index];
}

function pushFamily(
	out: StatutoryDeductionRow[],
	params: {
		employeeId: string;
		employeeName: string | null;
		sssNo: string | null;
		family: StatutoryLoanFamily;
		amount15: number;
		amount30: number;
		sourceSheet: string;
		sourceRow: number;
		startDate: Date;
	},
) {
	const paymentAmount = resolveStatutoryPeriodPayment(params.amount15, params.amount30);
	if (!(paymentAmount > 0)) return;

	const isMp2 = params.family === "HDMF_MP2";
	out.push({
		employeeId: params.employeeId,
		employeeName: params.employeeName,
		family: params.family,
		kind: isMp2 ? "benefit" : "loan",
		loanTypeName: isMp2
			? null
			: STATUTORY_LOAN_FAMILY_TO_LOAN_NAME[params.family as Exclude<StatutoryLoanFamily, "HDMF_MP2">],
		benefitCode: isMp2 ? STATUTORY_MP2_BENEFIT_CODE : null,
		paymentAmount,
		// Remittance board has installment only; estimate principal for loan balance fields.
		principalAmount: Math.max(paymentAmount, paymentAmount * 24),
		amount15: params.amount15,
		amount30: params.amount30,
		sourceSheet: params.sourceSheet,
		sourceRow: params.sourceRow,
		startDate: params.startDate,
		sssNo: params.sssNo,
	});
}

/**
 * Parse the most recent statutory sheet in the workbook into deduction enrollments.
 * Government contribution columns (SSS EE / PHIC EE / HDMF EE) are intentionally
 * not expanded into fixed benefits — payroll computes those by schedule.
 */
export function parseStatutoryBenefitsWorkbook(buffer: Buffer): StatutoryBenefitsParseResult {
	const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
	const candidates: Array<{ name: string; score: number; rows: unknown[][] }> = [];

	for (const name of workbook.SheetNames) {
		const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
			header: 1,
			defval: null,
			raw: true,
		});
		if (!rows.length || !Array.isArray(rows[0]) || !isStatutoryBenefitsHeaderRow(rows[0])) {
			continue;
		}
		candidates.push({ name, score: scoreSheetNameForRecency(name), rows: rows as unknown[][] });
	}

	if (!candidates.length) {
		return {
			sheetName: "",
			startDate: parseStatutorySheetStartDate(""),
			headers: [],
			deductionRows: [],
			skippedEmployees: 0,
			contributionOnlyEmployees: 0,
			errors: [
				{
					row: 0,
					message:
						"No statutory benefits sheet found. Expected headers like Emp. No., SSS EE, PHIC EE, HDMF EE, SSS Loan 15th/30th.",
				},
			],
		};
	}

	candidates.sort((a, b) => b.score - a.score);
	const selected = candidates[0];
	const headerRow = selected.rows[0] || [];
	const columns = mapStatutoryColumns(headerRow);
	const startDate = parseStatutorySheetStartDate(selected.name);
	const deductionRows: StatutoryDeductionRow[] = [];
	const errors: Array<{ row: number; message: string }> = [];
	let skippedEmployees = 0;
	let contributionOnlyEmployees = 0;

	if (columns.emp < 0) {
		return {
			sheetName: selected.name,
			startDate,
			headers: headerRow.map((h) => String(h ?? "")),
			deductionRows: [],
			skippedEmployees: 0,
			contributionOnlyEmployees: 0,
			errors: [{ row: 1, message: "Could not find Emp. No. column in statutory benefits sheet." }],
		};
	}

	for (let i = 1; i < selected.rows.length; i++) {
		const row = selected.rows[i];
		if (!Array.isArray(row)) continue;
		const rowNumber = i + 1;
		const empRaw = cell(row, columns.emp);
		const employeeId = padEmployeeId(empRaw);
		if (!employeeId || employeeId === "00000") {
			const hasAny = row.some((c) => c != null && String(c).trim() !== "");
			if (hasAny) {
				skippedEmployees += 1;
				errors.push({ row: rowNumber, message: "Missing Emp. No." });
			}
			continue;
		}

		const employeeName =
			String(cell(row, columns.name) ?? "")
				.trim() || null;
		const sssNo =
			String(cell(row, columns.sssNo) ?? "")
				.trim() || null;

		const before = deductionRows.length;
		const common = {
			employeeId,
			employeeName,
			sssNo,
			sourceSheet: selected.name,
			sourceRow: rowNumber,
			startDate,
		};

		pushFamily(deductionRows, {
			...common,
			family: "SSS_SALARY_LOAN",
			amount15: parseMoney(cell(row, columns.sssLoan15)),
			amount30: parseMoney(cell(row, columns.sssLoan30)),
		});
		pushFamily(deductionRows, {
			...common,
			family: "HDMF_SALARY_LOAN",
			amount15: parseMoney(cell(row, columns.hdmfLoan15)),
			amount30: parseMoney(cell(row, columns.hdmfLoan30)),
		});
		pushFamily(deductionRows, {
			...common,
			family: "SSS_CALAMITY",
			amount15: parseMoney(cell(row, columns.sssCal15)),
			amount30: parseMoney(cell(row, columns.sssCal30)),
		});
		pushFamily(deductionRows, {
			...common,
			family: "HDMF_CALAMITY",
			amount15: parseMoney(cell(row, columns.hdmfCal15)),
			amount30: parseMoney(cell(row, columns.hdmfCal30)),
		});
		pushFamily(deductionRows, {
			...common,
			family: "HDMF_MP2",
			amount15: parseMoney(cell(row, columns.mp2_15)),
			amount30: parseMoney(cell(row, columns.mp2_30)),
		});
		pushFamily(deductionRows, {
			...common,
			family: "SSS_LRP",
			amount15: parseMoney(cell(row, columns.lrp15)),
			amount30: parseMoney(cell(row, columns.lrp30)),
		});

		if (deductionRows.length === before) {
			contributionOnlyEmployees += 1;
		}
	}

	return {
		sheetName: selected.name,
		startDate,
		headers: headerRow.map((h) => String(h ?? "")),
		deductionRows,
		skippedEmployees,
		contributionOnlyEmployees,
		errors,
	};
}
