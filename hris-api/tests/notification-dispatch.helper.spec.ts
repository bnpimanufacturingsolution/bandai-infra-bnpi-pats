import { expect } from "chai";
import { buildRequestTargetUrl, buildTimesheetTargetUrl } from "../helper/notification-dispatch.helper";

describe("notification-dispatch.helper route targets", () => {
	it("routes time adjustment requests to the employee request hub", () => {
		expect(buildRequestTargetUrl("hris-employee", "req-1", "TIME_ADJUSTMENT")).to.equal(
			"/employee/requests?action=view&id=req-1",
		);
	});

	it("routes overtime requests to the employee request hub", () => {
		expect(buildRequestTargetUrl("hris-employee", "req-2", "OVERTIME")).to.equal(
			"/employee/requests?action=view&id=req-2",
		);
	});

	it("routes manager-side request approvals to the matching approval hub", () => {
		expect(buildRequestTargetUrl("hris-employee-manager", "req-3", "OVERTIME")).to.equal(
			"/employee/approvals/requests?action=view&id=req-3",
		);
	});

	it("routes timesheet approvals to the approval timesheet view", () => {
		expect(buildTimesheetTargetUrl("hris-employee-manager", "ts-1", "approval")).to.equal(
			"/employee/approvals/timesheet?action=timesheet.review&id=ts-1",
		);
		expect(buildTimesheetTargetUrl("hris-hr-manager", "ts-2", "approval")).to.equal(
			"/hr/approvals/timesheet?action=timesheet.review&id=ts-2",
		);
	});
});
