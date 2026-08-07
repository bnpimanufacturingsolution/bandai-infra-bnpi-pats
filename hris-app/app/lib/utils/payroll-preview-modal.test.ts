import {
	isPreviewOnlyMode,
	previewPayrollModalTitle,
	resolvePreviewPayrollStep,
	shouldCalculatePreviewRows,
} from "./payroll-preview-modal";

describe("payroll preview modal journey", () => {
	it("defaults unknown previewStep to confirm", () => {
		expect(resolvePreviewPayrollStep(null)).toBe("confirm");
		expect(resolvePreviewPayrollStep("")).toBe("confirm");
		expect(resolvePreviewPayrollStep("results")).toBe("results");
		expect(resolvePreviewPayrollStep("progress")).toBe("progress");
	});

	it("only calculates dry-run rows after Run Preview", () => {
		expect(
			shouldCalculatePreviewRows({ action: "preview-payroll", previewStep: "confirm" }),
		).toBe(false);
		expect(
			shouldCalculatePreviewRows({ action: "preview-payroll", previewStep: "progress" }),
		).toBe(true);
		expect(
			shouldCalculatePreviewRows({ action: "preview-payroll", previewStep: "results" }),
		).toBe(true);
		expect(
			shouldCalculatePreviewRows({ action: "start-payroll", previewStep: "results" }),
		).toBe(false);
	});

	it("uses preview-only titles distinct from Start Payroll", () => {
		expect(previewPayrollModalTitle("confirm")).toBe("Start Payroll Preview");
		expect(previewPayrollModalTitle("progress")).toBe("Preview running");
		expect(previewPayrollModalTitle("progress", true)).toBe("Preview failed");
		expect(previewPayrollModalTitle("results")).toBe("Payroll Preview");
	});

	it("marks preview-payroll action as preview-only", () => {
		expect(isPreviewOnlyMode("preview-payroll")).toBe(true);
		expect(isPreviewOnlyMode("start-payroll")).toBe(false);
	});
});
