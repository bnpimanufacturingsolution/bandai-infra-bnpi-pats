/**
 * Pure helpers for employee benefit Excel/CSV bulk enrollment import.
 * Canonical field keys match the HR import mapper targets.
 */

export const BENEFIT_IMPORT_CANONICAL_KEYS = [
	"EMPLOYEE_NUMBER",
	"BENEFIT_CODE",
	"BENEFIT_TYPE",
	"AMOUNT",
	"START_DATE",
	"END_DATE",
	"EMPLOYEE_NAME",
	"NAME",
	"DESCRIPTION",
	"NOTES",
	"IS_ACTIVE",
] as const;

export type BenefitImportCanonicalKey = (typeof BENEFIT_IMPORT_CANONICAL_KEYS)[number];

/** Header aliases (uppercased, stripped) → canonical key */
const HEADER_ALIASES: Record<string, BenefitImportCanonicalKey> = {
	EMPLOYEE_NUMBER: "EMPLOYEE_NUMBER",
	EMPLOYEENUMBER: "EMPLOYEE_NUMBER",
	EMPLOYEEID: "EMPLOYEE_NUMBER",
	EMPLOYEE_ID: "EMPLOYEE_NUMBER",
	EMP_ID: "EMPLOYEE_NUMBER",
	EMPID: "EMPLOYEE_NUMBER",
	BENEFIT_CODE: "BENEFIT_CODE",
	BENEFITCODE: "BENEFIT_CODE",
	COMCODE: "BENEFIT_CODE",
	COM_CODE: "BENEFIT_CODE",
	CODE: "BENEFIT_CODE",
	BENEFIT_TYPE: "BENEFIT_TYPE",
	BENEFITTYPE: "BENEFIT_TYPE",
	BENEFIT: "BENEFIT_TYPE",
	AMOUNT: "AMOUNT",
	START_DATE: "START_DATE",
	STARTDATE: "START_DATE",
	START_PAY_DATE: "START_DATE",
	STARTPAYDATE: "START_DATE",
	END_DATE: "END_DATE",
	ENDDATE: "END_DATE",
	EMPLOYEE_NAME: "EMPLOYEE_NAME",
	EMPLOYEENAME: "EMPLOYEE_NAME",
	NAME: "NAME",
	DESCRIPTION: "DESCRIPTION",
	NOTES: "NOTES",
	IS_ACTIVE: "IS_ACTIVE",
	ISACTIVE: "IS_ACTIVE",
	ACTIVE: "IS_ACTIVE",
};

export function normalizeImportHeaderKey(key: string): string {
	return String(key || "")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_")
		.replace(/[^A-Z0-9_]/g, "");
}

/**
 * Normalize a raw spreadsheet row to canonical UPPER keys.
 * Accepts both canonical headers and sample aliases (COMCODE, EmployeeID, …).
 */
export function normalizeBenefitImportRow(row: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [rawKey, value] of Object.entries(row || {})) {
		const normalized = normalizeImportHeaderKey(rawKey);
		const canonical = HEADER_ALIASES[normalized] || (normalized as BenefitImportCanonicalKey);
		// Prefer first non-empty value when aliases collide
		if (out[canonical] === undefined || out[canonical] === null || out[canonical] === "") {
			out[canonical] = value;
		}
	}
	return out;
}

export function parseBenefitImportAmount(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const text = String(value).replace(/,/g, "").replace(/₱/g, "").trim();
	if (!text) return null;
	const n = Number(text);
	return Number.isFinite(n) ? n : null;
}

/**
 * Parse import dates for PH HR sheets.
 * Supports: Date, Excel serial, YYYY-MM-DD, DD/MM/YYYY (preferred slash), ISO strings.
 */
export function parseBenefitImportDate(value: unknown): Date | null {
	if (value === null || value === undefined || value === "") return null;

	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		// Excel serial day (1900 date system); xlsx often emits these
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

	// DD/MM/YYYY or D/M/YY (Philippine default)
	const slash = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})$/);
	if (slash) {
		const a = Number(slash[1]);
		const b = Number(slash[2]);
		const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
		let day = a;
		let month = b;
		// If first part > 12, must be day-first; if second > 12, must be month-first
		if (a > 12 && b <= 12) {
			day = a;
			month = b;
		} else if (b > 12 && a <= 12) {
			month = a;
			day = b;
		}
		// else keep DD/MM preference
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return new Date(Date.UTC(year, month - 1, day));
	}

	const parsed = new Date(text);
	if (Number.isNaN(parsed.getTime())) return null;
	return new Date(
		Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()),
	);
}

export function parseBenefitImportIsActive(value: unknown): boolean {
	if (value === undefined || value === null || value === "") return true;
	if (typeof value === "boolean") return value;
	const text = String(value).trim().toLowerCase();
	if (["false", "0", "no", "n", "inactive"].includes(text)) return false;
	return true;
}

export type BenefitImportRowValidation =
	| {
			ok: true;
			employeeNumber: string;
			benefitCode: string | null;
			benefitTypeName: string | null;
			amount: number;
			startDate: Date;
			endDate: Date | null;
			name: string | null;
			description: string | null;
			notes: string | null;
			isActive: boolean;
			employeeName: string | null;
	  }
	| { ok: false; error: string };

export function validateBenefitImportRow(row: Record<string, unknown>): BenefitImportRowValidation {
	const employeeNumber = String(row.EMPLOYEE_NUMBER ?? "").trim();
	const benefitCode = String(row.BENEFIT_CODE ?? "").trim() || null;
	const benefitTypeName = String(row.BENEFIT_TYPE ?? "").trim() || null;
	const amount = parseBenefitImportAmount(row.AMOUNT);
	const startDate = parseBenefitImportDate(row.START_DATE);
	const endDate = row.END_DATE ? parseBenefitImportDate(row.END_DATE) : null;
	const name = String(row.NAME ?? "").trim() || null;
	const description = String(row.DESCRIPTION ?? "").trim() || null;
	const notes = String(row.NOTES ?? "").trim() || null;
	const employeeName = String(row.EMPLOYEE_NAME ?? "").trim() || null;
	// Imports always create active enrollments (IS_ACTIVE column removed from template).
	const isActive = true;

	if (!employeeNumber) {
		return { ok: false, error: "Missing EMPLOYEE_NUMBER" };
	}
	if (!benefitCode && !benefitTypeName) {
		return { ok: false, error: "Missing BENEFIT_CODE or BENEFIT_TYPE" };
	}
	if (amount === null || !(amount > 0)) {
		return { ok: false, error: "AMOUNT must be a number greater than zero" };
	}
	if (!startDate) {
		return { ok: false, error: "Invalid or missing START_DATE" };
	}
	if (row.END_DATE && !endDate) {
		return { ok: false, error: "Invalid END_DATE" };
	}
	if (endDate && endDate < startDate) {
		return { ok: false, error: "END_DATE cannot be before START_DATE" };
	}

	return {
		ok: true,
		employeeNumber,
		benefitCode,
		benefitTypeName,
		amount,
		startDate,
		endDate,
		name,
		description,
		notes,
		isActive,
		employeeName,
	};
}
