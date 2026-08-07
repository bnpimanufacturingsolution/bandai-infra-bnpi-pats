/**
 * Preview Payroll modal journey helpers (URL step + dry-run mode labels).
 * Keeps confirm → progress → results contract stable for Run Payroll UX parity.
 */

export type PreviewPayrollStep = "confirm" | "progress" | "results";

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
