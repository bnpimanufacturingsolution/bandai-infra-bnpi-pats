/**
 * Pure helpers for Special Payroll manual entry and workbook normalization.
 * Canonical fields: COMPENSATION_CODE, AMOUNT, EMPLOYEE_NUMBER, EMPLOYEE_NAME, START_PAY_DATE.
 * Sample aliases: COMCODE, Amount, EmployeeID, EmployeeName, StartPayDate.
 */

import { createHash } from "node:crypto";

export const SPECIAL_PAYROLL_CANONICAL_KEYS = [
	"COMPENSATION_CODE",
	"AMOUNT",
	"EMPLOYEE_NUMBER",
	"EMPLOYEE_NAME",
	"START_PAY_DATE",
] as const;

export type SpecialPayrollCanonicalKey = (typeof SPECIAL_PAYROLL_CANONICAL_KEYS)[number];

const HEADER_ALIASES: Record<string, SpecialPayrollCanonicalKey> = {
	COMPENSATION_CODE: "COMPENSATION_CODE",
	COMPENSATIONCODE: "COMPENSATION_CODE",
	COMCODE: "COMPENSATION_CODE",
	COM_CODE: "COMPENSATION_CODE",
	CODE: "COMPENSATION_CODE",
	BENEFIT_CODE: "COMPENSATION_CODE",
	AMOUNT: "AMOUNT",
	EMPLOYEE_NUMBER: "EMPLOYEE_NUMBER",
	EMPLOYEENUMBER: "EMPLOYEE_NUMBER",
	EMPLOYEEID: "EMPLOYEE_NUMBER",
	EMPLOYEE_ID: "EMPLOYEE_NUMBER",
	EMP_ID: "EMPLOYEE_NUMBER",
	EMPID: "EMPLOYEE_NUMBER",
	EMPLOYEE_NAME: "EMPLOYEE_NAME",
	EMPLOYEENAME: "EMPLOYEE_NAME",
	START_PAY_DATE: "START_PAY_DATE",
	STARTPAYDATE: "START_PAY_DATE",
	START_DATE: "START_PAY_DATE",
	STARTDATE: "START_PAY_DATE",
};

export function normalizeSpecialPayrollHeaderKey(key: string): string {
	return String(key || "")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_")
		.replace(/[^A-Z0-9_]/g, "");
}

export function normalizeSpecialPayrollImportRow(
	row: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [rawKey, value] of Object.entries(row || {})) {
		const normalized = normalizeSpecialPayrollHeaderKey(rawKey);
		const canonical =
			HEADER_ALIASES[normalized] || (normalized as SpecialPayrollCanonicalKey);
		if (out[canonical] === undefined || out[canonical] === null || out[canonical] === "") {
			out[canonical] = value;
		}
	}
	return out;
}

export function parseSpecialPayrollAmount(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.round(value * 100) / 100;
	}
	const text = String(value)
		.replace(/,/g, "")
		.replace(/₱/g, "")
		.replace(/PHP/gi, "")
		.trim();
	if (!text) return null;
	const n = Number(text);
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 100) / 100;
}

/**
 * Parse source pay dates for PH HR sheets (audit metadata only).
 * Supports Date, Excel serial, YYYY-MM-DD, DD/MM/YYYY.
 */
export function parseSpecialPayrollDate(value: unknown): Date | null {
	if (value === null || value === undefined || value === "") return null;

	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		const excelEpoch = Date.UTC(1899, 11, 30);
		const ms = excelEpoch + Math.floor(value) * 24 * 60 * 60 * 1000;
		const d = new Date(ms);
		if (Number.isNaN(d.getTime())) return null;
		return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
	}

	const text = String(value).trim();
	if (!text) return null;

	const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
	if (iso) {
		return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
	}

	const slash = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
	if (slash) {
		const a = Number(slash[1]);
		const b = Number(slash[2]);
		const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
		let day = a;
		let month = b;
		if (a > 12 && b <= 12) {
			day = a;
			month = b;
		} else if (b > 12 && a <= 12) {
			month = a;
			day = b;
		}
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return new Date(Date.UTC(year, month - 1, day));
	}

	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) return null;
	return new Date(
		Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
	);
}

export function normalizePersonNameTokens(name: string): string[] {
	return String(name || "")
		.toUpperCase()
		.replace(/[.,]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.split(" ")
		.filter((token) => token.length > 1);
}

/**
 * Material name mismatch: provided name shares fewer than half of its tokens
 * with the employee name (or vice-versa when provided is longer). Empty provided name is OK.
 */
export function isMaterialEmployeeNameMismatch(
	providedName: string | null | undefined,
	employeeName: string | null | undefined,
): boolean {
	const provided = String(providedName || "").trim();
	if (!provided) return false;
	const actual = String(employeeName || "").trim();
	if (!actual) return true;

	const providedTokens = normalizePersonNameTokens(provided);
	const actualTokens = new Set(normalizePersonNameTokens(actual));
	if (providedTokens.length === 0) return false;

	const matched = providedTokens.filter((t) => actualTokens.has(t)).length;
	const ratio = matched / providedTokens.length;
	return ratio < 0.5;
}

export function formatEmployeeDisplayName(person?: {
	personalInfo?: {
		firstName?: string | null;
		middleName?: string | null;
		lastName?: string | null;
	} | null;
} | null): string {
	const info = person?.personalInfo;
	if (!info) return "";
	const parts = [info.lastName, info.firstName, info.middleName]
		.map((p) => String(p || "").trim())
		.filter(Boolean);
	if (info.lastName && info.firstName) {
		const middle = info.middleName ? ` ${String(info.middleName).trim()}` : "";
		return `${info.lastName}, ${info.firstName}${middle}`.trim();
	}
	return parts.join(" ");
}

export type SpecialPayrollRowValidation =
	| {
			ok: true;
			employeeNumber: string;
			compensationCode: string;
			amount: number;
			employeeName: string | null;
			sourcePayDate: Date | null;
	  }
	| { ok: false; error: string };

export function validateSpecialPayrollRow(
	row: Record<string, unknown>,
): SpecialPayrollRowValidation {
	const employeeNumber = String(row.EMPLOYEE_NUMBER ?? "").trim();
	const compensationCode = String(row.COMPENSATION_CODE ?? "").trim().toUpperCase();
	const amount = parseSpecialPayrollAmount(row.AMOUNT);
	const employeeName = String(row.EMPLOYEE_NAME ?? "").trim() || null;
	const hasSourceDate =
		row.START_PAY_DATE !== undefined &&
		row.START_PAY_DATE !== null &&
		String(row.START_PAY_DATE).trim() !== "";
	const sourcePayDate = hasSourceDate ? parseSpecialPayrollDate(row.START_PAY_DATE) : null;

	if (!employeeNumber) {
		return { ok: false, error: "Missing EMPLOYEE_NUMBER" };
	}
	if (!compensationCode) {
		return { ok: false, error: "Missing COMPENSATION_CODE" };
	}
	if (amount === null || !(amount > 0)) {
		return { ok: false, error: "AMOUNT must be a finite number greater than zero" };
	}
	if (hasSourceDate && !sourcePayDate) {
		return { ok: false, error: "Invalid START_PAY_DATE" };
	}

	return {
		ok: true,
		employeeNumber,
		compensationCode,
		amount,
		employeeName,
		sourcePayDate,
	};
}

export type SpecialPayrollNormalizedInputRow = {
	employeeNumber: string;
	compensationCode: string;
	amount: number;
	employeeName?: string | null;
	sourcePayDate?: Date | string | null;
	sourceRowNumber?: number | null;
};

export type SpecialPayrollPreviewRowError = {
	rowNumber: number;
	employeeNumber?: string;
	compensationCode?: string;
	error: string;
	code:
		| "VALIDATION"
		| "EMPLOYEE_NOT_FOUND"
		| "EMPLOYEE_INACTIVE"
		| "NAME_MISMATCH"
		| "COMPENSATION_NOT_FOUND"
		| "COMPENSATION_INACTIVE"
		| "COMPENSATION_DIRECTION"
		| "DUPLICATE_IN_RUN"
		| "DUPLICATE_IN_PERIOD"
		| "AMOUNT_INVALID";
};

export type SpecialPayrollResolvedRow = {
	rowNumber: number;
	employeeId: string;
	employeeNumber: string;
	employeeName: string;
	benefitTypeId: string;
	compensationCode: string;
	compensationName: string;
	direction: string;
	isTaxable: boolean;
	amount: number;
	/** gross === net in v1 */
	gross: number;
	net: number;
	sourcePayDate: Date | null;
};

export function buildSourceFingerprint(parts: {
	organizationId: string;
	contextPayrollPeriodId: string | null;
	contextStartDate: string;
	contextEndDate: string;
	label: string;
	rows: Array<{
		employeeNumber: string;
		compensationCode: string;
		amount: number;
	}>;
}): string {
	const sorted = [...parts.rows]
		.map((r) => ({
			employeeNumber: String(r.employeeNumber).trim(),
			compensationCode: String(r.compensationCode).trim().toUpperCase(),
			amount: Number(r.amount),
		}))
		.sort((a, b) => {
			const emp = a.employeeNumber.localeCompare(b.employeeNumber);
			if (emp !== 0) return emp;
			const code = a.compensationCode.localeCompare(b.compensationCode);
			if (code !== 0) return code;
			return a.amount - b.amount;
		});

	const payload = JSON.stringify({
		organizationId: parts.organizationId,
		contextPayrollPeriodId: parts.contextPayrollPeriodId,
		contextStartDate: parts.contextStartDate,
		contextEndDate: parts.contextEndDate,
		label: parts.label.trim().toLowerCase(),
		rows: sorted,
	});

	return createHash("sha256").update(payload).digest("hex");
}

export function buildSpecialPayrollRunCode(now = new Date()): string {
	const y = now.getUTCFullYear();
	const m = String(now.getUTCMonth() + 1).padStart(2, "0");
	const d = String(now.getUTCDate()).padStart(2, "0");
	const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
	return `SPR-${y}${m}${d}-${rand}`;
}

export function buildSpecialPayslipNumber(runCode: string, sequence: number): string {
	return `SPS-${runCode}-${String(sequence).padStart(4, "0")}`;
}

export function toIsoDateOnly(value: Date | string): string {
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "";
	return d.toISOString().slice(0, 10);
}

export function roundMoney(value: number): number {
	return Math.round(Number(value) * 100) / 100;
}

export const SPECIAL_PAYROLL_TEMPLATE_HEADERS = [
	"COMPENSATION_CODE",
	"AMOUNT",
	"EMPLOYEE_NUMBER",
	"EMPLOYEE_NAME",
	"START_PAY_DATE",
] as const;
