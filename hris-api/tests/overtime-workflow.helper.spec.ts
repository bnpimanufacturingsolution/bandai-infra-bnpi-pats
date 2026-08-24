import assert from "node:assert/strict";
import {
	isOvertimeRequestType,
	isOvertimeWorkflowCode,
	normalizeOvertimeWorkflowSteps,
} from "../helper/overtime-workflow.helper";
import {
	parseOvertimeHoursToMinutes,
	resolveRequestedOvertimeMinutes,
} from "../helper/overtime-approval.helper";
import { applyOvertimeRequestApprovalSideEffects } from "../app/timesheet/overtime-request.service";

describe("overtime workflow", () => {
	it("goes directly to HR then system completion", () => {
		const steps = normalizeOvertimeWorkflowSteps();
		assert.equal(isOvertimeRequestType("OVERTIME"), true);
		assert.equal(isOvertimeWorkflowCode("WF-OVERTIME-DEFAULT"), true);
		assert.deepEqual(
			steps.map((step) => `${step.step_number}:${step.assignee_type}`),
			["1:REQUESTER", "2:HR", "3:SYSTEM"],
		);
		assert.equal(steps[1].step_name, "HR Approval");
		assert.equal(steps[1].step_type, "APPROVAL");
	});
});

describe("overtime request minutes", () => {
	it("parses 2 hours 50 minutes from clock and metadata", () => {
		assert.equal(parseOvertimeHoursToMinutes("2:50"), 170);
		assert.equal(
			resolveRequestedOvertimeMinutes({
				requestedOvertimeMinutes: 170,
				overtimeHours: "2:50",
			}),
			170,
		);
	});
});

describe("apply overtime request approval", () => {
	it("writes payable OT from a self-service request without timesheetLineId", async () => {
		const updates: any[] = [];
		const prisma = {
			timesheetline: {
				findFirst: async (args: any) => {
					if (args?.where?.id) return null;
					return {
						id: "line-1",
						timesheetId: "ts-1",
						employeeId: "emp-zen",
						date: new Date("2026-08-18T00:00:00.000Z"),
						attendanceId: null,
						metadata: {},
					};
				},
				update: async (args: any) => {
					updates.push(args.data);
					return args.data;
				},
			},
			timesheet: {
				findFirst: async () => ({
					id: "ts-1",
					employeeId: "emp-zen",
					payrollPeriodId: "pp-1",
					status: "SUBMITTED",
				}),
			},
		} as any;

		const result = await applyOvertimeRequestApprovalSideEffects({
			prisma,
			organizationId: "org-1",
			requestId: "req-ot-1",
			requestMetadata: {
				date: "2026-08-18",
				employeeId: "emp-zen",
				requestedOvertimeMinutes: 170,
				overtimeHours: "2:50",
			},
			isApprove: true,
			requesterEmployeeId: "emp-zen",
		});

		assert.equal(result.overtimeApprovalStatus, "APPROVED");
		assert.equal(result.approvedOvertimeHours, "2:50");
		assert.equal(updates[0].overtimeHours, "2:50");
	});
});
