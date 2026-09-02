import { expect } from "chai";
import {
	buildAutoApprovedSubmissionMetadata,
	evaluateTimesheetSubmitEligibility,
	resolveTimesheetSubmissionOutcome,
	TIMESHEET_AUTO_APPROVE_METADATA_REASON,
} from "../app/timesheet/timesheet.controller";

describe("resolveTimesheetSubmissionOutcome (enableAutoApprove policy)", () => {
	it("keeps the historic SUBMITTED flow when auto-approve is off", () => {
		for (const flag of [false, null, undefined]) {
			const outcome = resolveTimesheetSubmissionOutcome(flag);
			expect(outcome.status).to.equal("SUBMITTED");
			expect(outcome.autoApproved).to.equal(false);
		}
	});

	it("lands submissions directly APPROVED when auto-approve is on", () => {
		const outcome = resolveTimesheetSubmissionOutcome(true);
		expect(outcome.status).to.equal("APPROVED");
		expect(outcome.autoApproved).to.equal(true);
	});
});

describe("auto-approve vs submit eligibility gates", () => {
	it("still requires edit permission to resubmit an auto-approved timesheet", () => {
		// Auto-approve never bypasses the correction gate: an APPROVED timesheet
		// (auto or manual) still needs an approved/consumed edit permission.
		const gate = evaluateTimesheetSubmitEligibility("APPROVED", "NONE");
		expect(gate.canSubmit).to.equal(false);
		expect(gate.reason).to.equal("EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION");
	});

	it("allows the normal first submission the auto-approve flow builds on", () => {
		for (const status of ["DRAFT", "REVISED"]) {
			const gate = evaluateTimesheetSubmitEligibility(status, "NONE");
			expect(gate.canSubmit).to.equal(true);
		}
	});
});

describe("buildAutoApprovedSubmissionMetadata", () => {
	it("mirrors the manual APPROVE snapshot shape plus auto-approve markers", () => {
		const submittedAt = new Date("2026-09-02T06:00:00.000Z");
		const metadata = buildAutoApprovedSubmissionMetadata(
			{ snapshotSubmittedAtLegacy: "keep-me" },
			submittedAt,
			"employee-1",
		);

		expect(metadata.snapshotState).to.equal("APPROVED");
		expect(metadata.snapshotSubmittedAt).to.equal(submittedAt.toISOString());
		expect(metadata.snapshotSubmittedBy).to.equal("employee-1");
		expect(metadata.snapshotType).to.equal("TIMESHEET_PERIOD");
		expect(metadata.snapshotLockedAt).to.equal(submittedAt.toISOString());
		expect(metadata.snapshotLockedBy).to.equal("employee-1");
		expect(metadata.autoApproved).to.equal(true);
		expect(metadata.autoApprovedReason).to.equal(TIMESHEET_AUTO_APPROVE_METADATA_REASON);
		expect(metadata.snapshotSubmittedAtLegacy).to.equal("keep-me");
	});

	it("does not mutate the existing metadata object", () => {
		const existing = { existingKey: 1 };
		buildAutoApprovedSubmissionMetadata(existing, new Date(), "employee-1");
		expect(existing).to.deep.equal({ existingKey: 1 });
	});
});
