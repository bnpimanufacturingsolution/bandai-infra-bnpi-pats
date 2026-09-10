/**
 * Payroll register row-status helpers (HR payroll records table).
 *
 * Derives the per-row Status badge and, for zero-pay rows, the human reason
 * why the employee has no salary — using only data already present on the
 * payroll row. Reasons never guess beyond what the row proves:
 *
 * 1. basic salary missing/zero  -> "No basic salary on file"
 * 2. no timesheet attached      -> "No timesheet for this period"
 * 3. timesheet without any day  -> "Timesheet has no days"
 * 4. present nowhere, absent    -> "Absent all N scheduled day(s)"
 * 5. anything else zero         -> "Computed pay is zero — open the record"
 */

export type PayrollRowStatusKey = "paid" | "unpaid" | "no-salary";

export interface PayrollRowStatus {
	key: PayrollRowStatusKey;
	label: string;
	/** Why the employee has no salary. Null unless key is "no-salary". */
	reason: string | null;
}

export interface PayrollRowStatusInput {
	isPaid?: boolean | null;
	basicPay?: number | null;
	grossPay?: number | null;
	netPay?: number | null;
	employee?: {
		basicSalary?: number | null;
	} | null;
	timesheet?: unknown;
	timesheetSnapshot?: {
		totalDays?: number | null;
		daysPresent?: number | null;
		daysAbsent?: number | null;
	} | null;
}

const toNumber = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

export function resolvePayrollRowStatus(
	row: PayrollRowStatusInput | null | undefined,
): PayrollRowStatus {
	if (!row) {
		return { key: "no-salary", label: "No salary", reason: "No payroll data" };
	}
	if (row.isPaid === true) {
		return { key: "paid", label: "Paid", reason: null };
	}
	const hasPay =
		toNumber(row.basicPay) > 0 ||
		toNumber(row.grossPay) > 0 ||
		toNumber(row.netPay) > 0;
	if (hasPay) {
		return { key: "unpaid", label: "Unpaid", reason: null };
	}
	if (!(toNumber(row.employee?.basicSalary) > 0)) {
		return {
			key: "no-salary",
			label: "No salary",
			reason: "No basic salary on file",
		};
	}
	const snapshot = row.timesheetSnapshot ?? null;
	if (!row.timesheet && !snapshot) {
		return {
			key: "no-salary",
			label: "No salary",
			reason: "No timesheet for this period",
		};
	}
	if (snapshot && !(toNumber(snapshot.totalDays) > 0)) {
		return {
			key: "no-salary",
			label: "No salary",
			reason: "Timesheet has no days",
		};
	}
	if (
		snapshot &&
		!(toNumber(snapshot.daysPresent) > 0) &&
		toNumber(snapshot.daysAbsent) > 0
	) {
		const days = toNumber(snapshot.daysAbsent);
		return {
			key: "no-salary",
			label: "No salary",
			reason: `Absent all ${days} scheduled day${days === 1 ? "" : "s"}`,
		};
	}
	return {
		key: "no-salary",
		label: "No salary",
		reason: "Computed pay is zero — open the record for the breakdown",
	};
}
