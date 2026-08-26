import { expect } from "chai";
import {
	PAYROLL_PREVIEW_TIMESHEET_STATUSES,
	PAYROLL_READY_TIMESHEET_STATUS,
	resolvePayrollPreviewReadiness,
} from "../helper/payroll-period.helper";

describe("payroll preview readiness (status ≠ money)", () => {
	it("keeps APPROVED as the only payroll-ready workflow status", () => {
		expect(PAYROLL_READY_TIMESHEET_STATUS).to.equal("APPROVED");
		expect(resolvePayrollPreviewReadiness("APPROVED")).to.deep.equal({
			isPayrollReady: true,
			readinessKey: "payroll_ready",
			readinessLabel: "Payroll-ready",
		});
	});

	it("marks DRAFT as not submitted (estimate-only, still previewable)", () => {
		expect(resolvePayrollPreviewReadiness("DRAFT")).to.deep.equal({
			isPayrollReady: false,
			readinessKey: "not_submitted",
			readinessLabel: "Timesheet not submitted",
		});
	});

	it("marks SUBMITTED as pending approval (estimate-only)", () => {
		expect(resolvePayrollPreviewReadiness("SUBMITTED")).to.deep.equal({
			isPayrollReady: false,
			readinessKey: "pending_approval",
			readinessLabel: "Pending approval",
		});
	});

	it("includes draft/submitted in the preview status set without inventing money rules", () => {
		expect(PAYROLL_PREVIEW_TIMESHEET_STATUSES).to.include.members([
			"APPROVED",
			"DRAFT",
			"SUBMITTED",
			"REJECTED",
			"REVISED",
		]);
		// Money engine does not branch on these statuses; workflow gate is Start Payroll only.
		for (const status of PAYROLL_PREVIEW_TIMESHEET_STATUSES) {
			const readiness = resolvePayrollPreviewReadiness(status);
			if (status === "APPROVED") {
				expect(readiness.isPayrollReady).to.equal(true);
			} else {
				expect(readiness.isPayrollReady).to.equal(false);
			}
		}
	});
});
