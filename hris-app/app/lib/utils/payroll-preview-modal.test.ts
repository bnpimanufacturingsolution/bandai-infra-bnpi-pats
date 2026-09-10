import {
	canRunPayrollPreview,
	isPreviewOnlyMode,
	isPreviewPayrollModalStep,
	isPreviewPayrollResultsPage,
	previewPayrollModalTitle,
	resolvePreviewPayrollStep,
	resolvePreviewReadinessPresentation,
	shouldCalculatePreviewRows,
} from "./payroll-preview-modal";

describe("payroll preview modal journey", () => {
	it("defaults unknown previewStep to confirm", () => {
		expect(resolvePreviewPayrollStep(null)).toBe("confirm");
		expect(resolvePreviewPayrollStep("")).toBe("confirm");
		expect(resolvePreviewPayrollStep("results")).toBe("results");
		expect(resolvePreviewPayrollStep("progress")).toBe("progress");
	});

	it("only calculates dry-run rows after Run Management", () => {
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

	it("keeps confirm/progress in modal and results on the page", () => {
		expect(isPreviewPayrollModalStep("confirm")).toBe(true);
		expect(isPreviewPayrollModalStep("progress")).toBe(true);
		expect(isPreviewPayrollModalStep("results")).toBe(false);
		expect(
			isPreviewPayrollResultsPage({
				action: "preview-payroll",
				previewStep: "results",
			}),
		).toBe(true);
		expect(
			isPreviewPayrollResultsPage({
				action: "preview-payroll",
				previewStep: "progress",
			}),
		).toBe(false);
		expect(
			isPreviewPayrollResultsPage({
				action: "start-payroll",
				previewStep: "results",
			}),
		).toBe(false);
	});

	it("uses payroll-management titles distinct from Start Payroll", () => {
		expect(previewPayrollModalTitle("confirm")).toBe("Start Payroll Management");
		expect(previewPayrollModalTitle("progress")).toBe("Payroll Management running");
		expect(previewPayrollModalTitle("progress", true)).toBe("Payroll Management failed");
		expect(previewPayrollModalTitle("results")).toBe("Payroll Management");
	});

	it("marks preview-payroll action as preview-only", () => {
		expect(isPreviewOnlyMode("preview-payroll")).toBe(true);
		expect(isPreviewOnlyMode("start-payroll")).toBe(false);
	});

	it("labels not-submitted / pending readiness for preview rows", () => {
		expect(
			resolvePreviewReadinessPresentation({
				readinessKey: "not_submitted",
				readinessLabel: "Timesheet not submitted",
			}),
		).toEqual({
			key: "not_submitted",
			label: "Timesheet not submitted",
			tone: "warn",
		});
		expect(
			resolvePreviewReadinessPresentation({
				timesheetStatus: "SUBMITTED",
				isPayrollReady: false,
			}).key,
		).toBe("pending_approval");
		expect(
			resolvePreviewReadinessPresentation({
				isPayrollReady: true,
			}).tone,
		).toBe("ready");
	});

	it("allows Run Management when only non-approved timesheets are computable", () => {
		expect(
			canRunPayrollPreview({
				payrollPeriodId: "pp-1",
				payableEmployeesCount: 0,
				previewComputableEmployeesCount: 12,
			}),
		).toBe(true);
		expect(
			canRunPayrollPreview({
				payrollPeriodId: "pp-1",
				payableEmployeesCount: 0,
				previewComputableEmployeesCount: 0,
			}),
		).toBe(false);
		expect(
			canRunPayrollPreview({
				payrollPeriodId: null,
				payableEmployeesCount: 5,
				previewComputableEmployeesCount: 5,
			}),
		).toBe(false);
	});
});
