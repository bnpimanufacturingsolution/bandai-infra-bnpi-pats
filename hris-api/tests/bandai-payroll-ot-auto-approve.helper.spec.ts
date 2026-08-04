import { expect } from "chai";
import {
	AUTO_APPROVED_BY,
	AUTO_APPROVED_REASON,
	buildAutoApproveMetadataMarker,
	classifyAutoApproveEligibility,
	shouldAutoApproveTimesheetStatus,
} from "../helper/bandai-payroll-ot-auto-approve.helper";
import {
	classifyPerson,
	resolveOtApprovalMeta,
} from "../helper/payroll-ot-readiness.helper";

describe("bandai payroll OT auto-approve helper", () => {
	describe("shouldAutoApproveTimesheetStatus", () => {
		it("returns false for APPROVED (already green for Run Payroll OT readiness)", () => {
			expect(shouldAutoApproveTimesheetStatus("APPROVED")).to.equal(false);
			expect(shouldAutoApproveTimesheetStatus("approved")).to.equal(false);
			expect(shouldAutoApproveTimesheetStatus(" Approved ")).to.equal(false);
		});

		it("returns true for payroll-blocking workflow statuses", () => {
			for (const status of ["DRAFT", "SUBMITTED", "REVISED", "REJECTED"]) {
				expect(shouldAutoApproveTimesheetStatus(status), status).to.equal(true);
				expect(shouldAutoApproveTimesheetStatus(status.toLowerCase()), status).to.equal(
					true,
				);
			}
		});

		it("returns false for empty status; true for unknown non-APPROVED (defensive)", () => {
			expect(shouldAutoApproveTimesheetStatus("")).to.equal(false);
			expect(shouldAutoApproveTimesheetStatus(null)).to.equal(false);
			expect(shouldAutoApproveTimesheetStatus(undefined)).to.equal(false);
			expect(shouldAutoApproveTimesheetStatus("PENDING_REVIEW")).to.equal(true);
		});
	});

	describe("classifyAutoApproveEligibility", () => {
		it("classifies already_approved vs blocking_status", () => {
			expect(classifyAutoApproveEligibility("APPROVED")).to.deep.equal({
				eligible: false,
				reason: "already_approved",
			});
			expect(classifyAutoApproveEligibility("DRAFT")).to.deep.equal({
				eligible: true,
				reason: "blocking_status",
			});
			expect(classifyAutoApproveEligibility("")).to.deep.equal({
				eligible: false,
				reason: "empty_status",
			});
		});
	});

	describe("buildAutoApproveMetadataMarker", () => {
		it("embeds approved_ot_import reason and timestamp", () => {
			const marker = buildAutoApproveMetadataMarker("2026-06-15T12:00:00.000Z");
			expect(marker.bandaiPayrollSourceRepair.autoApprovedAt).to.equal(
				"2026-06-15T12:00:00.000Z",
			);
			expect(marker.bandaiPayrollSourceRepair.autoApprovedReason).to.equal(
				AUTO_APPROVED_REASON,
			);
			expect(AUTO_APPROVED_REASON).to.equal("approved_ot_import");
			expect(AUTO_APPROVED_BY).to.equal("system:approved_ot_import");
		});
	});
});

describe("payroll OT readiness classifyPerson (timesheet_not_approved blocker)", () => {
	it("flags line OT on non-APPROVED timesheet as timesheet_not_approved", () => {
		const draft = classifyPerson({
			status: "DRAFT",
			summaryMin: 120,
			lineOtMinutes: 120,
			attendanceOtMinutes: 0,
		});
		expect(draft.blockerClass).to.equal("timesheet_not_approved");
		expect(draft.nextStep).to.match(/approve timesheet/i);

		const submitted = classifyPerson({
			status: "SUBMITTED",
			summaryMin: 60,
			lineOtMinutes: 60,
			attendanceOtMinutes: 0,
		});
		expect(submitted.blockerClass).to.equal("timesheet_not_approved");
	});

	it("returns ok when line OT exists and timesheet is APPROVED", () => {
		const ok = classifyPerson({
			status: "APPROVED",
			summaryMin: 90,
			lineOtMinutes: 90,
			attendanceOtMinutes: 90,
		});
		expect(ok.blockerClass).to.equal("ok");
	});

	it("auto-approve eligibility aligns with timesheet_not_approved blocker", () => {
		// After OT import, any status that classifies as timesheet_not_approved
		// must be auto-approve eligible so Run Payroll is unblocked.
		for (const status of ["DRAFT", "SUBMITTED", "REVISED", "REJECTED"]) {
			const person = classifyPerson({
				status,
				summaryMin: 30,
				lineOtMinutes: 30,
				attendanceOtMinutes: 0,
			});
			expect(person.blockerClass).to.equal("timesheet_not_approved");
			expect(shouldAutoApproveTimesheetStatus(status)).to.equal(true);
		}
		const approved = classifyPerson({
			status: "APPROVED",
			summaryMin: 30,
			lineOtMinutes: 30,
			attendanceOtMinutes: 0,
		});
		expect(approved.blockerClass).to.not.equal("timesheet_not_approved");
		expect(shouldAutoApproveTimesheetStatus("APPROVED")).to.equal(false);
	});
});

describe("resolveOtApprovalMeta (truthful Approved OT labels)", () => {
	it("labels system auto-approve from past OT import", () => {
		const meta = resolveOtApprovalMeta({
			status: "APPROVED",
			approvedBy: AUTO_APPROVED_BY,
			metadata: {
				bandaiPayrollSourceRepair: {
					autoApprovedAt: "2026-06-15T12:00:00.000Z",
					autoApprovedReason: AUTO_APPROVED_REASON,
				},
			},
		});
		expect(meta.approvalSource).to.equal("system");
		expect(meta.approvalLabel).to.equal("System approved OT");
	});

	it("labels manager approval when approvedBy is a person id", () => {
		const meta = resolveOtApprovalMeta({
			status: "APPROVED",
			approvedBy: "emp-manager-uuid-1",
			metadata: {},
		});
		expect(meta.approvalSource).to.equal("manager");
		expect(meta.approvalLabel).to.equal("Manager approved");
	});

	it("labels pending when timesheet is not APPROVED", () => {
		const meta = resolveOtApprovalMeta({
			status: "DRAFT",
			approvedBy: null,
			metadata: {},
		});
		expect(meta.approvalSource).to.equal("none");
		expect(meta.approvalLabel).to.equal("Needs timesheet approval");
	});
});
