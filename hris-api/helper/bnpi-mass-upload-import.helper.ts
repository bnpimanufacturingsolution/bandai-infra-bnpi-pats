/**
 * BNPI Compensation / Deduction mass-upload workbook helpers.
 * Accepts client files such as:
 * - Compensation Mass Upload 07.15.26.xlsx (COMCODE, Amount, EmployeeID, StartPayDate)
 * - Deduction Mass Upload 07.15.26.xlsx (DEDCODE, Amount, Payment, EmployeeID, StartPayment)
 */

import {
	normalizeImportHeaderKey,
	parseBenefitImportAmount,
	parseBenefitImportDate,
} from "./employee-benefit-import.helper";

export type MassUploadKind = "compensation" | "deduction";

export const COMPENSATION_CODE_LABELS: Record<string, string> = {
	LLA: "Line Leader Allowance",
	MLA: "Meal Allowance",
	PFA: "Perfect Attendance",
	DMA: "De Minimis Allowance",
	HYS: "HYS Meal Allowance",
	OBA: "OB Allowance",
	OTM: "OT Meal Allowance",
	TSA: "Technical Skills Allowance",
	OAD: "Other Compensation",
	AON: "Adjustment OT/ND",
	ARP: "Attendance Recognition Program",
	/** Client COMCODE ABS = Adjustment Basic (adjustment only), not absent recovery. */
	ABS: "Adjustment Basic",
	MTX: "MWE Tax Adjustment",
};

/**
 * Canonical payroll wiring for BNPI compensation mass-upload COMCODEs.
 * Used when creating/updating BenefitType rows so Run Payroll applies money
 * (not display-only enrollments with empty reconciliationAction).
 *
 * - GROSS_INCLUDED → adds to GrossPay
 * - NET_ADJUSTMENT → adds to NetPay after deductions (not gross)
 * - RECEIVABLE_ONLY → adds to TotalReceivable after NetPay (e.g. PFA/MLA/ARP)
 */
export type CompensationCodePayrollRole = {
	reconciliationAction: "GROSS_INCLUDED" | "NET_ADJUSTMENT" | "RECEIVABLE_ONLY";
	isTaxable: boolean;
};

export const COMPENSATION_CODE_PAYROLL_ROLES: Record<string, CompensationCodePayrollRole> = {
	AON: { reconciliationAction: "GROSS_INCLUDED", isTaxable: true },
	/** Receivable-only: increases TotalReceivable without changing GrossPay/NetPay. */
	ARP: { reconciliationAction: "RECEIVABLE_ONLY", isTaxable: true },
	/**
	 * Client COMCODE ABS = Adjustment Basic (manual/one-time ADJUSTMENT).
	 * Include in GrossPay so the payslip left column tallies with GrossPay.
	 */
	ABS: { reconciliationAction: "GROSS_INCLUDED", isTaxable: true },
	LLA: { reconciliationAction: "RECEIVABLE_ONLY", isTaxable: true },
	MLA: { reconciliationAction: "RECEIVABLE_ONLY", isTaxable: false },
	PFA: { reconciliationAction: "RECEIVABLE_ONLY", isTaxable: true },
	DMA: { reconciliationAction: "GROSS_INCLUDED", isTaxable: false },
	HYS: { reconciliationAction: "GROSS_INCLUDED", isTaxable: true },
	OBA: { reconciliationAction: "GROSS_INCLUDED", isTaxable: true },
	OTM: { reconciliationAction: "GROSS_INCLUDED", isTaxable: true },
	TSA: { reconciliationAction: "GROSS_INCLUDED", isTaxable: true },
	OAD: { reconciliationAction: "GROSS_INCLUDED", isTaxable: true },
	MTX: { reconciliationAction: "GROSS_INCLUDED", isTaxable: true },
};

export function resolveCompensationCodePayrollRole(
	code: string,
): CompensationCodePayrollRole | null {
	const key = String(code || "")
		.trim()
		.toUpperCase();
	if (!key) return null;
	return COMPENSATION_CODE_PAYROLL_ROLES[key] || null;
}

/** Deduction-direction benefit codes created from mass upload / statutory import. */
export const DEDUCTION_CODE_PAYROLL_ROLES: Record<
	string,
	{ reconciliationAction: "DEDUCTION"; isTaxable: boolean }
> = {
	NEGADJ: { reconciliationAction: "DEDUCTION", isTaxable: false },
	UFD: { reconciliationAction: "DEDUCTION", isTaxable: false },
	MHDMF2: { reconciliationAction: "DEDUCTION", isTaxable: false },
	UNIDED: { reconciliationAction: "DEDUCTION", isTaxable: false },
};

export function resolveDeductionCodePayrollRole(
	code: string,
): { reconciliationAction: "DEDUCTION"; isTaxable: boolean } | null {
	const key = String(code || "")
		.trim()
		.toUpperCase();
	if (!key) return null;
	return DEDUCTION_CODE_PAYROLL_ROLES[key] || { reconciliationAction: "DEDUCTION", isTaxable: false };
}

/** Loan type display name → mass-upload DEDCODE (for payroll source details). */
export function loanTypeNameToDeductionCode(name: string | null | undefined): string | null {
	const n = String(name || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
	if (!n) return null;
	const map: Record<string, string> = {
		"sss emergency loan": "SSSELN",
		"sss calamity loan": "SSSCALLN",
		"sss salary loan": "SSSSALLN",
		"hdmf salary loan": "HDMFSALLN",
		"hdmf calamity loan": "HDMFCALLN",
		"bnpi emergency loan": "BNPIEMLN",
		"bnpi salary loan": "BNPISALLN",
		"rcbc loan": "RCBCLN",
	};
	return map[n] || null;
}

/** Deduction mass-upload codes → loan type name (must match DM2 Loan Types when loan). */
export const DEDUCTION_CODE_TO_LOAN_NAME: Record<string, string> = {
	SSSSALLN: "SSS Salary Loan",
	SSSELN: "SSS Emergency Loan",
	SSSCALLN: "SSS Calamity Loan",
	HDMFSALLN: "HDMF Salary Loan",
	HDMFCALLN: "HDMF Calamity Loan",
	BNPISALLN: "BNPI Salary Loan",
	BNPIEMLN: "BNPI Emergency Loan",
	RCBCLN: "RCBC Loan",
};

/** Deduction codes that are not loans → benefit-type code (DEDUCTION direction). */
export const DEDUCTION_CODE_TO_BENEFIT_CODE: Record<string, string> = {
	NEGADJ: "NEGADJ",
	UFD: "UFD",
	MHDMF2: "MHDMF2",
	/** Client mass-upload alias for Modified HDMF / MP2 voluntary. */
	HDMFMP2: "MHDMF2",
	/** Unidentified / generic one-period deduction. */
	UNIDED: "UNIDED",
};

/** Display names when auto-creating deduction benefit types from mass upload. */
export const DEDUCTION_BENEFIT_CODE_LABELS: Record<string, string> = {
	NEGADJ: "Negative Adjustment",
	UFD: "Uniform Deduction",
	MHDMF2: "Modified HDMF 2",
	UNIDED: "Unidentified Deduction",
};

export function detectMassUploadKindFromHeaders(headers: string[]): MassUploadKind | null {
	const normalized = headers.map((h) => normalizeImportHeaderKey(h));
	const set = new Set(normalized);
	if (set.has("COMCODE") || (set.has("AMOUNT") && set.has("STARTPAYDATE"))) {
		return "compensation";
	}
	if (set.has("DEDCODE") || set.has("STARTPAYMENT") || set.has("PAYMENT")) {
		return "deduction";
	}
	return null;
}

export function normalizeMassUploadRow(row: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [rawKey, value] of Object.entries(row || {})) {
		const key = normalizeImportHeaderKey(rawKey);
		if (out[key] === undefined || out[key] === null || out[key] === "") {
			out[key] = value;
		}
	}
	return out;
}

export function padEmployeeId(value: unknown): string {
	const raw = String(value ?? "").trim();
	if (!raw) return "";
	if (/^\d+$/.test(raw) && raw.length < 5) return raw.padStart(5, "0");
	return raw;
}

export type CompensationMassUploadRow =
	| {
			ok: true;
			employeeId: string;
			employeeName: string | null;
			code: string;
			amount: number;
			startDate: Date;
	  }
	| { ok: false; error: string };

export function parseCompensationMassUploadRow(
	raw: Record<string, unknown>,
): CompensationMassUploadRow {
	const row = normalizeMassUploadRow(raw);
	const employeeId = padEmployeeId(row.EMPLOYEEID ?? row.EMPLOYEE_ID ?? row.EMP_ID);
	const code = String(row.COMCODE ?? row.BENEFIT_CODE ?? row.CODE ?? "")
		.trim()
		.toUpperCase();
	const amount = parseBenefitImportAmount(row.AMOUNT);
	const startDate = parseBenefitImportDate(row.STARTPAYDATE ?? row.START_DATE ?? row.STARTDATE);
	const employeeName = String(row.EMPLOYEENAME ?? row.EMPLOYEE_NAME ?? "").trim() || null;

	if (!employeeId) return { ok: false, error: "Missing EmployeeID" };
	if (!code) return { ok: false, error: "Missing COMCODE" };
	if (amount === null || !(amount > 0)) return { ok: false, error: "Amount must be greater than zero" };
	if (!startDate) return { ok: false, error: "Invalid or missing StartPayDate" };

	return { ok: true, employeeId, employeeName, code, amount, startDate };
}

/**
 * Collapse multiple compensation mass-upload rows for the same employee + COMCODE +
 * StartPayDate day into one amount (sum). Client workbooks often split ABS (and
 * occasionally other codes) across lines; last-write-wins import under-pays.
 */
export type AggregateableCompensationMassRow = {
	rowNumber: number;
	employeeId: string;
	code: string;
	amount: number;
	startDate: Date;
};

export type AggregatedCompensationMassRow = AggregateableCompensationMassRow & {
	/** Source sheet rows that were summed (1-based Excel data rows). */
	sourceRowNumbers: number[];
};

export function aggregateCompensationMassUploadRowsByEmployeeCodeStart(
	rows: AggregateableCompensationMassRow[],
): AggregatedCompensationMassRow[] {
	const byKey = new Map<string, AggregatedCompensationMassRow>();
	for (const row of rows) {
		const dayKey = row.startDate.toISOString().slice(0, 10);
		const code = String(row.code || "")
			.trim()
			.toUpperCase();
		const key = `${row.employeeId}|${code}|${dayKey}`;
		const existing = byKey.get(key);
		if (existing) {
			existing.amount = Math.round((existing.amount + Number(row.amount || 0) + Number.EPSILON) * 100) / 100;
			existing.sourceRowNumbers.push(row.rowNumber);
			// Keep earliest rowNumber as primary for stable notes / ordering.
			if (row.rowNumber < existing.rowNumber) {
				existing.rowNumber = row.rowNumber;
			}
		} else {
			byKey.set(key, {
				rowNumber: row.rowNumber,
				employeeId: row.employeeId,
				code,
				amount: Number(row.amount || 0),
				startDate: row.startDate,
				sourceRowNumbers: [row.rowNumber],
			});
		}
	}
	return Array.from(byKey.values()).sort(
		(a, b) => a.rowNumber - b.rowNumber || a.employeeId.localeCompare(b.employeeId),
	);
}

export type DeductionMassUploadRow =
	| {
			ok: true;
			employeeId: string;
			employeeName: string | null;
			code: string;
			principalAmount: number;
			paymentAmount: number;
			startDate: Date;
			kind: "loan" | "benefit";
			loanTypeName: string | null;
			benefitCode: string | null;
	  }
	| { ok: false; error: string };

export function parseDeductionMassUploadRow(raw: Record<string, unknown>): DeductionMassUploadRow {
	const row = normalizeMassUploadRow(raw);
	const employeeId = padEmployeeId(row.EMPLOYEEID ?? row.EMPLOYEE_ID ?? row.EMP_ID);
	const code = String(row.DEDCODE ?? row.CODE ?? "")
		.trim()
		.toUpperCase();
	const principalAmount = parseBenefitImportAmount(row.AMOUNT) ?? 0;
	const paymentAmount =
		parseBenefitImportAmount(row.PAYMENT ?? row.PAYMENTAMOUNT ?? row.PAY) ?? null;
	const startDate = parseBenefitImportDate(
		row.STARTPAYMENT ?? row.START_PAYMENT ?? row.STARTPAYDATE ?? row.START_DATE,
	);
	const employeeName = String(row.EMPLOYEENAME ?? row.EMPLOYEE_NAME ?? "").trim() || null;

	if (!employeeId) return { ok: false, error: "Missing EmployeeID" };
	if (!code) return { ok: false, error: "Missing DEDCODE" };
	if (paymentAmount === null || !(paymentAmount > 0)) {
		return { ok: false, error: "Payment must be greater than zero" };
	}
	if (!startDate) return { ok: false, error: "Invalid or missing StartPayment" };

	const loanTypeName = DEDUCTION_CODE_TO_LOAN_NAME[code] || null;
	const benefitCode = DEDUCTION_CODE_TO_BENEFIT_CODE[code] || (!loanTypeName ? code : null);
	const kind: "loan" | "benefit" = loanTypeName ? "loan" : "benefit";

	return {
		ok: true,
		employeeId,
		employeeName,
		code,
		principalAmount: principalAmount > 0 ? principalAmount : paymentAmount,
		paymentAmount,
		startDate,
		kind,
		loanTypeName,
		benefitCode,
	};
}

export function compensationBenefitLabel(code: string): string {
	return COMPENSATION_CODE_LABELS[code] || code;
}
