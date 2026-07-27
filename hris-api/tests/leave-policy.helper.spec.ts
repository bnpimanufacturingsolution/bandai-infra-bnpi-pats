import { expect } from "chai";

import { validateLeaveRequestPolicy } from "../helper/leave-policy.helper";

const basePolicy = {
	id: "policy-1",
	organizationId: "org-1",
	leaveTypeId: "leave-type-1",
	code: "VACATION",
	name: "Vacation Leave",
	description: null,
	sortOrder: 10,
	enabled: true,
	isPaid: true,
	requiresApproval: true,
	minAdvanceNoticeDays: 3,
	maxDaysPerRequest: 10,
	allowHalfDay: false,
	requireAttachment: false,
	allowedEmploymentTypes: [],
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	leaveType: "VACATION",
};

describe("leave policy helper", () => {
	it("skips advance notice validation for sick leave even when policy requires notice", () => {
		expect(() =>
			validateLeaveRequestPolicy({
				policy: {
					...basePolicy,
					code: "SICK",
					leaveType: "SICK",
					minAdvanceNoticeDays: 3,
				},
				leaveType: "SICK",
				totalDays: 1,
				durationUnit: "FULL_DAY",
				startDate: new Date("2026-05-01T00:00:00.000Z"),
				now: new Date("2026-07-07T00:00:00.000Z"),
			}),
		).to.not.throw();
	});

	it("enforces advance notice for vacation leave", () => {
		expect(() =>
			validateLeaveRequestPolicy({
				policy: basePolicy,
				leaveType: "VACATION",
				totalDays: 1,
				durationUnit: "FULL_DAY",
				startDate: new Date("2026-05-01T00:00:00.000Z"),
				now: new Date("2026-07-07T00:00:00.000Z"),
			}),
		).to.throw(/advance notice/i);
	});

	it("enforces advance notice for personal leave", () => {
		expect(() =>
			validateLeaveRequestPolicy({
				policy: {
					...basePolicy,
					code: "PERSONAL",
					leaveType: "PERSONAL",
					minAdvanceNoticeDays: 1,
				},
				leaveType: "PERSONAL",
				totalDays: 1,
				durationUnit: "FULL_DAY",
				startDate: new Date("2026-07-06T00:00:00.000Z"),
				now: new Date("2026-07-07T00:00:00.000Z"),
			}),
		).to.throw(/advance notice/i);
	});
});