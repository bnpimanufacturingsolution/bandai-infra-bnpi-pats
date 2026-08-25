import * as XLSX from "xlsx";

/** BNPI annual work-day factor shared with the payroll engine (Path B daily basis). */
export const PERIOD_LEAVE_BNPI_ANNUAL_WORK_DAYS = 313;

export const PERIOD_LEAVE_BENEFIT_CODE = "LVP";
export const PERIOD_LEAVE_BENEFIT_NAME = "Leave Pay";

export type PeriodLeaveRawRow = {
	rowNumber: number;
	code: string;
	name: string;
	date: Date | null;
	leaveType: string;
	days: number;
	paid: boolean;
	status: string;
};

export type ParsedPeriodLeaveWorkbook = {
	sheetNames: string[];
	/** Sheet used for the import (explicit override or first qualifying sheet). */
	sheetName: string;
	/** Sheets whose headers looked like leave usage ledgers. */
	qualifyingSheetNames: string[];
	rows: PeriodLeaveRawRow[];
};

export type PeriodLeaveAggregated = {
	code: string;
	name: string;
	paidDays: number;
	dates: string[];
	leaveTypes: string[];
	sourceRows: number[];
};

const normalizeHeaderKey = (value: unknown): string =>
	String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");

const toMoneyNumber = (value: unknown): number => {
	if (value == null || value === "") return 0;
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const n = Number(String(value).replace(/,/g, "").trim());
	return Number.isFinite(n) ? n : 0;
};

export const normalizePeriodLeaveEmployeeCode = (value: unknown): string => {
	const s = String(value ?? "").trim();
	if (!s || s === "undefined" || s === "null") return "";
	if (/^\d+$/.test(s)) return s.padStart(5, "0");
	return s;
};

export function parsePeriodLeaveDate(value: unknown): Date | null {
	if (value == null || value === "") return null;
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	const raw = String(value).trim();
	const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
	if (m) {
		let year = Number(m[3]);
		if (year < 100) year += 2000;
		const month = Number(m[1]);
		const day = Number(m[2]);
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return new Date(Date.UTC(year, month - 1, day));
	}
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const utcDayKey = (date: Date): string =>
	date.toISOString().slice(0, 10);

/**
 * Parse a BNPI "Leave (M D, YYYY)" style usage ledger.
 * Prefers an explicitly requested sheet; otherwise the FIRST sheet whose header
 * row carries EmployeeNumber + DateOfLeave (client workbooks place the
 * cutoff-authoritative view first).
 */
export function parsePeriodLeaveWorkbook(
	buffer: Buffer,
	options?: { sheetName?: string | null },
): ParsedPeriodLeaveWorkbook {
	const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
	const sheetNames = workbook.SheetNames || [];
	const qualifyingSheetNames: string[] = [];

	for (const sheetName of sheetNames) {
		const sheet = workbook.Sheets[sheetName];
		if (!sheet) continue;
		const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
			defval: "",
			raw: true,
		});
		const headerKeys = new Set(
			Object.keys(rows[0] || {}).map((key) => normalizeHeaderKey(key)),
		);
		if (
			headerKeys.has("employeenumber") &&
			headerKeys.has("dateofleave")
		) {
			qualifyingSheetNames.push(sheetName);
		}
	}

	const requested = String(options?.sheetName || "").trim();
	const sheetName =
		requested && sheetNames.includes(requested)
			? requested
			: qualifyingSheetNames[0] || sheetNames[0] || "";
	if (!sheetName || !workbook.Sheets[sheetName]) {
		return { sheetNames, sheetName: "", qualifyingSheetNames, rows: [] };
	}

	const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
		workbook.Sheets[sheetName],
		{ defval: "", raw: true },
	);
	const rows: PeriodLeaveRawRow[] = rawRows.map((raw, index) => ({
		rowNumber: index + 2,
		code: normalizePeriodLeaveEmployeeCode(raw.EmployeeNumber),
		name: String(raw.EmployeeName ?? "").trim(),
		date: parsePeriodLeaveDate(raw.DateOfLeave),
		leaveType: String(raw.LeaveType ?? "").trim().toUpperCase(),
		days: toMoneyNumber(raw.Days),
		paid:
			String(raw.PaidUnpaid ?? "").trim().toLowerCase() === "paid",
		status: String(raw.CurrentStatus ?? "").trim(),
	}));

	return { sheetNames, sheetName, qualifyingSheetNames, rows };
}

/**
 * Sum PAID leave days per employee inside the inclusive cutoff window.
 * Unpaid / undated / outside-window / zero-day rows are skipped.
 */
export function aggregatePaidLeaveDaysByEmployee(
	rows: PeriodLeaveRawRow[],
	window: { startDate: Date; endDate: Date },
): {
	byCode: Map<string, PeriodLeaveAggregated>;
	totalRows: number;
	totalPaidDays: number;
	skippedUnpaid: number;
	skippedOutsideWindow: number;
} {
	const startDay = utcDayKey(window.startDate);
	const endDay = utcDayKey(window.endDate);
	const byCode = new Map<string, PeriodLeaveAggregated>();
	let totalRows = 0;
	let totalPaidDays = 0;
	let skippedUnpaid = 0;
	let skippedOutsideWindow = 0;

	for (const row of rows) {
		if (!row.code && !row.date) continue;
		totalRows += 1;
		if (!row.paid) {
			skippedUnpaid += 1;
			continue;
		}
		if (!row.date || row.days <= 0) {
			skippedOutsideWindow += 1;
			continue;
		}
		const dayKey = utcDayKey(row.date);
		if (dayKey < startDay || dayKey > endDay) {
			skippedOutsideWindow += 1;
			continue;
		}
		totalPaidDays += row.days;
		const current = byCode.get(row.code) || {
			code: row.code,
			name: row.name,
			paidDays: 0,
			dates: [],
			leaveTypes: [],
			sourceRows: [],
		};
		current.paidDays += row.days;
		current.name = current.name || row.name;
		if (!current.dates.includes(dayKey)) current.dates.push(dayKey);
		if (row.leaveType && !current.leaveTypes.includes(row.leaveType)) {
			current.leaveTypes.push(row.leaveType);
		}
		if (!current.sourceRows.includes(row.rowNumber)) {
			current.sourceRows.push(row.rowNumber);
		}
		byCode.set(row.code, current);
	}

	return {
		byCode,
		totalRows,
		totalPaidDays,
		skippedUnpaid,
		skippedOutsideWindow,
	};
}

export const roundPeriodLeaveMoney = (value: number): number =>
	Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Per-day money basis mirroring the computation-file dual formula:
 * Path A daily-rated -> Daily Salary; Path B monthly-rated -> x24/313 of the
 * semi-monthly period basic (== monthly x12/313).
 */
export function resolvePeriodLeaveDailyBasis(employee: {
	dailyRate?: number | null;
	basicSalary?: number | null;
}): { basis: "DAILY_RATE" | "BNPI_313"; dailyRate: number } {
	const dailyRate = Number(employee.dailyRate || 0);
	if (dailyRate > 0) return { basis: "DAILY_RATE", dailyRate };
	const basicSalary = Number(employee.basicSalary || 0);
	// Do not round the rate itself: Sheet2 rounds only the final peso amount
	// (e.g. 15200 basic x24/313 = 1165.495204...; 2.5 days -> 2913.74).
	return {
		basis: "BNPI_313",
		dailyRate: (basicSalary * 24) / PERIOD_LEAVE_BNPI_ANNUAL_WORK_DAYS,
	};
}

export function computePeriodLeaveAmount(params: {
	paidDays: number;
	dailyRate: number;
}): number {
	return roundPeriodLeaveMoney(params.paidDays * params.dailyRate);
}
