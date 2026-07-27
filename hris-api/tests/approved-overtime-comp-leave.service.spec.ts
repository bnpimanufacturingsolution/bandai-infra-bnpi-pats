import { expect } from "chai";
import { applyApprovedOvertimeCompensatoryCredit } from "../app/timesheet/approved-overtime-comp-leave.service";

describe("approved overtime compensatory leave credit service", () => {
	it("creates a compensatory leave credit from approved overtime lines", async () => {
		const employeeUpdateCalls: any[] = [];
		const timesheetUpdateCalls: any[] = [];
		const prisma = {
			timesheet: {
				findFirst: async () => ({
					id: "timesheet-1",
					organizationId: "org-1",
					employeeId: "employee-1",
					approvalDate: new Date("2026-06-30T08:00:00.000Z"),
					metadata: {},
					payrollPeriod: {
						endDate: new Date("2026-06-30T23:59:59.999Z"),
					},
					timesheetlines: [
						{
							date: new Date("2026-06-28T00:00:00.000Z"),
							overtimeHours: "2:00",
							approverNotes: "Approved month-end push",
							employeeNotes: "Stayed late for month-end close",
							notes: null,
							scheduleSnapshot: {
								shiftHour: 8,
							},
							metadata: {},
						},
					],
				}),
				update: async (args: any) => {
					timesheetUpdateCalls.push(args);
					return {
						id: "timesheet-1",
						metadata: args.data.metadata,
					};
				},
			},
			employee: {
				findFirst: async () => ({
					id: "employee-1",
					leaveBalances: [],
				}),
				update: async (args: any) => {
					employeeUpdateCalls.push(args);
					return args;
				},
			},
		} as any;

		const approvedAt = new Date("2026-06-30T08:00:00.000Z");
		const result = await applyApprovedOvertimeCompensatoryCredit({
			prisma,
			organizationId: "org-1",
			timesheetId: "timesheet-1",
			approvedByEmployeeId: "employee-hr-1",
			approvedAt,
			dependencies: {
				getLeavePolicyByType: async () => ({
					id: "leave-policy-comp-1",
				}) as any,
			},
		});

		expect(employeeUpdateCalls).to.have.length(1);
		expect(employeeUpdateCalls[0].data.leaveBalances).to.have.length(1);
		expect(employeeUpdateCalls[0].data.leaveBalances[0]).to.deep.include({
			leaveType: "COMPENSATORY",
			totalEntitled: 0.25,
			used: 0,
			pending: 0,
			available: 0.25,
		});
		expect(timesheetUpdateCalls).to.have.length(1);
		expect(result.creditSummary).to.deep.include({
			leaveType: "COMPENSATORY",
			totalMinutes: 120,
			totalDays: 0.25,
			deltaMinutes: 120,
			deltaDays: 0.25,
			lineCount: 1,
			creditedByEmployeeId: "employee-hr-1",
		});
		expect(result.creditSummary.approvedOvertimeDays).to.deep.equal([
			{
				date: "2026-06-28",
				overtimeHours: "2:00",
				overtimeMinutes: 120,
				workdayHours: 8,
				approvalReason: "Approved month-end push",
				employeeReason: "Stayed late for month-end close",
			},
		]);
	});

	it("adjusts an existing compensatory balance when a re-approved timesheet has less overtime", async () => {
		const employeeUpdateCalls: any[] = [];
		const prisma = {
			timesheet: {
				findFirst: async () => ({
					id: "timesheet-2",
					organizationId: "org-1",
					employeeId: "employee-2",
					approvalDate: new Date("2026-07-15T08:00:00.000Z"),
					metadata: {
						compensatoryLeaveCredit: {
							totalMinutes: 120,
							totalDays: 0.25,
						},
					},
					payrollPeriod: {
						endDate: new Date("2026-07-15T23:59:59.999Z"),
					},
					timesheetlines: [
						{
							date: new Date("2026-07-14T00:00:00.000Z"),
							overtimeHours: "1:00",
							approverNotes: "Approved corrected OT window",
							employeeNotes: null,
							notes: null,
							scheduleSnapshot: {
								shiftHour: 8,
							},
							metadata: {},
						},
					],
				}),
				update: async (args: any) => ({
					id: "timesheet-2",
					metadata: args.data.metadata,
				}),
			},
			employee: {
				findFirst: async () => ({
					id: "employee-2",
					leaveBalances: [
						{
							leaveType: "COMPENSATORY",
							totalEntitled: 0.25,
							used: 0,
							pending: 0,
							available: 0.25,
							periodStart: new Date("2026-01-01T00:00:00.000Z"),
							periodEnd: new Date("2026-12-31T00:00:00.000Z"),
						},
					],
				}),
				update: async (args: any) => {
					employeeUpdateCalls.push(args);
					return args;
				},
			},
		} as any;

		const result = await applyApprovedOvertimeCompensatoryCredit({
			prisma,
			organizationId: "org-1",
			timesheetId: "timesheet-2",
			approvedByEmployeeId: "employee-hr-2",
			approvedAt: new Date("2026-07-15T08:00:00.000Z"),
			dependencies: {
				getLeavePolicyByType: async () => ({
					id: "leave-policy-comp-1",
				}) as any,
			},
		});

		expect(employeeUpdateCalls).to.have.length(1);
		expect(employeeUpdateCalls[0].data.leaveBalances[0]).to.deep.include({
			leaveType: "COMPENSATORY",
			totalEntitled: 0.125,
			available: 0.125,
		});
		expect(result.creditSummary).to.deep.include({
			totalMinutes: 60,
			totalDays: 0.125,
			deltaMinutes: -60,
			deltaDays: -0.125,
		});
	});

	it("records zero-credit metadata without mutating leave balances when no approved overtime exists", async () => {
		const employeeUpdateCalls: any[] = [];
		const timesheetUpdateCalls: any[] = [];
		const prisma = {
			timesheet: {
				findFirst: async () => ({
					id: "timesheet-3",
					organizationId: "org-1",
					employeeId: "employee-3",
					approvalDate: new Date("2026-08-15T08:00:00.000Z"),
					metadata: {},
					payrollPeriod: {
						endDate: new Date("2026-08-15T23:59:59.999Z"),
					},
					timesheetlines: [
						{
							date: new Date("2026-08-14T00:00:00.000Z"),
							overtimeHours: "0:00",
							approverNotes: null,
							employeeNotes: null,
							notes: null,
							scheduleSnapshot: {
								shiftHour: 8,
							},
							metadata: {},
						},
					],
				}),
				update: async (args: any) => {
					timesheetUpdateCalls.push(args);
					return args;
				},
			},
			employee: {
				findFirst: async () => ({
					id: "employee-3",
					leaveBalances: [],
				}),
				update: async (args: any) => {
					employeeUpdateCalls.push(args);
					return args;
				},
			},
		} as any;

		const result = await applyApprovedOvertimeCompensatoryCredit({
			prisma,
			organizationId: "org-1",
			timesheetId: "timesheet-3",
			approvedByEmployeeId: "employee-hr-3",
			approvedAt: new Date("2026-08-15T08:00:00.000Z"),
			dependencies: {
				getLeavePolicyByType: async () => ({
					id: "leave-policy-comp-1",
				}) as any,
			},
		});

		expect(employeeUpdateCalls).to.have.length(0);
		expect(timesheetUpdateCalls).to.have.length(1);
		expect(result.creditSummary).to.deep.include({
			totalMinutes: 0,
			totalDays: 0,
			deltaMinutes: 0,
			deltaDays: 0,
			lineCount: 0,
		});
	});

	it("skips the balance mutation and flags the gap when no compensatory leave policy can be resolved", async () => {
		const employeeUpdateCalls: any[] = [];
		const timesheetUpdateCalls: any[] = [];
		const prisma = {
			timesheet: {
				findFirst: async () => ({
					id: "timesheet-4",
					organizationId: "org-1",
					employeeId: "employee-4",
					approvalDate: new Date("2026-09-15T08:00:00.000Z"),
					metadata: {},
					payrollPeriod: {
						endDate: new Date("2026-09-15T23:59:59.999Z"),
					},
					timesheetlines: [
						{
							date: new Date("2026-09-14T00:00:00.000Z"),
							overtimeHours: "2:00",
							approverNotes: "Approved despite missing leave policy",
							employeeNotes: null,
							notes: null,
							scheduleSnapshot: {
								shiftHour: 8,
							},
							metadata: {},
						},
					],
				}),
				update: async (args: any) => {
					timesheetUpdateCalls.push(args);
					return args;
				},
			},
			employee: {
				findFirst: async () => ({
					id: "employee-4",
					leaveBalances: [],
				}),
				update: async (args: any) => {
					employeeUpdateCalls.push(args);
					return args;
				},
			},
		} as any;

		const result = await applyApprovedOvertimeCompensatoryCredit({
			prisma,
			organizationId: "org-1",
			timesheetId: "timesheet-4",
			approvedByEmployeeId: "employee-hr-4",
			approvedAt: new Date("2026-09-15T08:00:00.000Z"),
			dependencies: {
				getLeavePolicyByType: async () => null,
			},
		});

		expect(employeeUpdateCalls).to.have.length(0);
		expect(timesheetUpdateCalls).to.have.length(1);
		expect(result.creditSummary).to.deep.include({
			totalMinutes: 120,
			totalDays: 0.25,
			creditApplied: false,
			skipReason: "NO_COMPENSATORY_LEAVE_POLICY",
		});
	});
});
