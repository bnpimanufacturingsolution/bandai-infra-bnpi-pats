/**
 * Pure helpers for auto-approving timesheets after approved OT (rptOvertimeDetails)
 * is imported onto effective timesheet lines.
 *
 * Run Payroll OT readiness treats non-APPROVED timesheets with payable line OT as
 * blocker `timesheet_not_approved`. Past historical OT import must flip those
 * timesheets to APPROVED so payroll is not blocked.
 */

/** Payroll-blocking timesheet statuses that auto-approve may flip to APPROVED. */
export const PAYROLL_BLOCKING_TIMESHEET_STATUSES = [
	"DRAFT",
	"SUBMITTED",
	"REVISED",
	"REJECTED",
] as const;

export type PayrollBlockingTimesheetStatus =
	(typeof PAYROLL_BLOCKING_TIMESHEET_STATUSES)[number];

/**
 * True when a timesheet status should be auto-approved after approved OT import.
 * APPROVED stays put. Known blocking statuses and any other non-APPROVED value
 * (defensive) are eligible so payroll OT readiness is unblocked.
 */
export function shouldAutoApproveTimesheetStatus(
	status: string | null | undefined,
): boolean {
	const normalized = String(status || "")
		.trim()
		.toUpperCase();
	if (!normalized || normalized === "APPROVED") return false;
	if (
		(PAYROLL_BLOCKING_TIMESHEET_STATUSES as readonly string[]).includes(normalized)
	) {
		return true;
	}
	// Unknown non-APPROVED status is still payroll-blocking for OT readiness.
	return true;
}

export type AutoApproveEligibility = {
	eligible: boolean;
	reason: "already_approved" | "empty_status" | "blocking_status" | "unknown_non_approved";
};

export function classifyAutoApproveEligibility(
	status: string | null | undefined,
): AutoApproveEligibility {
	const normalized = String(status || "")
		.trim()
		.toUpperCase();
	if (normalized === "APPROVED") {
		return { eligible: false, reason: "already_approved" };
	}
	if (!normalized) {
		// Empty/missing status is not a known timesheet row state — do not flip.
		return { eligible: false, reason: "empty_status" };
	}
	if (
		(PAYROLL_BLOCKING_TIMESHEET_STATUSES as readonly string[]).includes(normalized)
	) {
		return { eligible: true, reason: "blocking_status" };
	}
	return { eligible: true, reason: "unknown_non_approved" };
}

export const AUTO_APPROVED_REASON = "approved_ot_import" as const;
export const AUTO_APPROVED_BY = "system:approved_ot_import" as const;

/**
 * Build nested metadata marker for bandaiPayrollSourceRepair auto-approve.
 * Merges into existing bandaiPayrollSourceRepair without dropping prior keys.
 */
export function buildAutoApproveMetadataMarker(nowIso: string = new Date().toISOString()): {
	bandaiPayrollSourceRepair: {
		autoApprovedAt: string;
		autoApprovedReason: typeof AUTO_APPROVED_REASON;
	};
} {
	return {
		bandaiPayrollSourceRepair: {
			autoApprovedAt: nowIso,
			autoApprovedReason: AUTO_APPROVED_REASON,
		},
	};
}
