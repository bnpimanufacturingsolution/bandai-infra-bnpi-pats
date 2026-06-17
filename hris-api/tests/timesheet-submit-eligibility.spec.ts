import { expect } from "chai";
import { evaluateTimesheetSubmitEligibility } from "../app/timesheet/timesheet.controller";
import { isTimesheetAttendanceRefreshAllowed } from "../helper/timesheet.helper";

describe("evaluateTimesheetSubmitEligibility", () => {
	it("allows DRAFT submission", () => {
		const result = evaluateTimesheetSubmitEligibility("DRAFT", "NONE");
		expect(result.canSubmit).to.equal(true);
		expect(result.isCorrectionResubmit).to.equal(false);
		expect(result.requiresEditPermission).to.equal(false);
		expect(result.reason).to.equal(null);
	});

	it("allows REVISED submission", () => {
		const result = evaluateTimesheetSubmitEligibility("REVISED", "NONE");
		expect(result.canSubmit).to.equal(true);
		expect(result.isCorrectionResubmit).to.equal(false);
		expect(result.requiresEditPermission).to.equal(false);
		expect(result.reason).to.equal(null);
	});

	it("allows SUBMITTED correction resubmit when permission is APPROVED", () => {
		const result = evaluateTimesheetSubmitEligibility("SUBMITTED", "APPROVED");
		expect(result.canSubmit).to.equal(true);
		expect(result.isCorrectionResubmit).to.equal(true);
		expect(result.requiresEditPermission).to.equal(false);
		expect(result.reason).to.equal(null);
	});

	it("allows SUBMITTED correction resubmit when permission is CONSUMED", () => {
		const result = evaluateTimesheetSubmitEligibility("SUBMITTED", "CONSUMED");
		expect(result.canSubmit).to.equal(true);
		expect(result.isCorrectionResubmit).to.equal(true);
		expect(result.requiresEditPermission).to.equal(false);
		expect(result.reason).to.equal(null);
	});

	it("blocks SUBMITTED without approved edit permission", () => {
		const statuses = ["NONE", "REQUESTED", "REJECTED", null, undefined];
		for (const permissionStatus of statuses) {
			const result = evaluateTimesheetSubmitEligibility("SUBMITTED", permissionStatus as any);
			expect(result.canSubmit).to.equal(false);
			expect(result.isCorrectionResubmit).to.equal(false);
			expect(result.requiresEditPermission).to.equal(true);
			expect(result.reason).to.equal("EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION");
		}
	});

	it("allows APPROVED correction resubmit with approved/consumed permission", () => {
		const approved = evaluateTimesheetSubmitEligibility("APPROVED", "APPROVED");
		const consumed = evaluateTimesheetSubmitEligibility("APPROVED", "CONSUMED");
		expect(approved.canSubmit).to.equal(true);
		expect(consumed.canSubmit).to.equal(true);
		expect(approved.isCorrectionResubmit).to.equal(true);
		expect(consumed.isCorrectionResubmit).to.equal(true);
	});

	it("blocks APPROVED without approved edit permission", () => {
		const result = evaluateTimesheetSubmitEligibility("APPROVED", "NONE");
		expect(result.canSubmit).to.equal(false);
		expect(result.requiresEditPermission).to.equal(true);
		expect(result.reason).to.equal("EDIT_PERMISSION_REQUIRED_FOR_RESUBMISSION");
	});
});

describe("isTimesheetAttendanceRefreshAllowed", () => {
	it("allows attendance-driven refresh only while the timesheet is editable", () => {
		for (const status of ["DRAFT", "REVISED", "REJECTED"]) {
			expect(isTimesheetAttendanceRefreshAllowed(status), status).to.equal(true);
		}
	});

	it("blocks attendance-driven refresh once the timesheet is submitted or approved", () => {
		for (const status of ["SUBMITTED", "APPROVED", null, undefined]) {
			expect(isTimesheetAttendanceRefreshAllowed(status), String(status)).to.equal(false);
		}
	});
});
