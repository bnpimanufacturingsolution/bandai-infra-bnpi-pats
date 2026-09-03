/**
 * Preview Payroll journey helpers (URL step + dry-run mode labels).
 *
 * Contract:
 * - confirm + progress → modal (loading / confirm chrome)
 * - results → full page on /hr/run-payroll (not modal)
 */

export type PreviewPayrollStep = "confirm" | "progress" | "results";

export type PreviewReadinessKey =
	| "payroll_ready"
	| "not_submitted"
	| "pending_approval"
	| "needs_correction"
	| "unknown";

export function resolvePreviewPayrollStep(
	param: string | null | undefined,
): PreviewPayrollStep {
	if (param === "progress" || param === "results") return param;
	return "confirm";
}

export function shouldCalculatePreviewRows(args: {
	action: string | null | undefined;
	previewStep: PreviewPayrollStep;
}): boolean {
	return (
		args.action === "preview-payroll" &&
		(args.previewStep === "progress" || args.previewStep === "results")
	);
}

/** Modal hosts only confirm + progress. Results render on the page. */
export function isPreviewPayrollModalStep(step: PreviewPayrollStep): boolean {
	return step === "confirm" || step === "progress";
}

/** Full-page dry-run results surface (action + previewStep=results). */
export function isPreviewPayrollResultsPage(args: {
	action: string | null | undefined;
	previewStep: PreviewPayrollStep;
}): boolean {
	return args.action === "preview-payroll" && args.previewStep === "results";
}

export function previewPayrollModalTitle(
	step: PreviewPayrollStep,
	failed?: boolean,
): string {
	if (step === "confirm") return "Start Payroll Preview";
	if (step === "progress") return failed ? "Preview failed" : "Preview running";
	return "Payroll Preview";
}

export function isPreviewOnlyMode(action: string | null | undefined): boolean {
	return action === "preview-payroll";
}

/** Badge copy for timesheet workflow status on preview rows. */
export function resolvePreviewReadinessPresentation(args: {
	timesheetStatus?: string | null;
	isPayrollReady?: boolean;
	readinessKey?: PreviewReadinessKey | string | null;
	readinessLabel?: string | null;
}): {
	key: PreviewReadinessKey;
	label: string;
	tone: "ready" | "warn" | "danger" | "muted";
} {
	const key = (args.readinessKey ||
		(args.isPayrollReady
			? "payroll_ready"
			: String(args.timesheetStatus || "").toUpperCase() === "DRAFT"
				? "not_submitted"
				: String(args.timesheetStatus || "").toUpperCase() === "SUBMITTED"
					? "pending_approval"
					: String(args.timesheetStatus || "").toUpperCase() === "REJECTED" ||
						  String(args.timesheetStatus || "").toUpperCase() === "REVISED"
						? "needs_correction"
						: args.isPayrollReady === false
							? "unknown"
							: "payroll_ready")) as PreviewReadinessKey;

	if (key === "payroll_ready") {
		return {
			key,
			label: args.readinessLabel || "Payroll-ready",
			tone: "ready",
		};
	}
	if (key === "not_submitted") {
		return {
			key,
			label: args.readinessLabel || "Not submitted",
			tone: "warn",
		};
	}
	if (key === "pending_approval") {
		return {
			key,
			label: args.readinessLabel || "Pending approval",
			tone: "warn",
		};
	}
	if (key === "needs_correction") {
		return {
			key,
			label: args.readinessLabel || "Needs correction",
			tone: "danger",
		};
	}
	return {
		key: "unknown",
		label: args.readinessLabel || args.timesheetStatus || "Estimate only",
		tone: "muted",
	};
}

/** Allow Run Preview when any computable timesheet exists (not only approved). */
export function canRunPayrollPreview(args: {
	payrollPeriodId?: string | null;
	payableEmployeesCount?: number | null;
	previewComputableEmployeesCount?: number | null;
}): boolean {
	if (!args.payrollPeriodId) return false;
	const payable = Number(args.payableEmployeesCount || 0);
	const computable = Number(
		args.previewComputableEmployeesCount ?? args.payableEmployeesCount ?? 0,
	);
	return payable > 0 || computable > 0;
}
