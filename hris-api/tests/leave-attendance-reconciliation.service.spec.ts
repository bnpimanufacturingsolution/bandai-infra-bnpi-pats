import { expect } from "chai";
import { applyApprovedLeaveAttendanceReconciliation } from "../app/request/leave-attendance-reconciliation.service";

const LEAVE_START = new Date("2026-06-10T00:00:00.000Z");
const LEAVE_END = new Date("2026-06-10T23:59:59.999Z");

describe("approved leave attendance reconciliation service", () => {
	it("converts an existing absent row into a leave correction and refreshes a mutable timesheet", async () => {
		const updateManyCalls: any[] = [];
		const createCalls: any[] = [];
		const refreshCalls: any[] = [];
		const prisma = {
			attendance: {
				findMany: async () => [
					{
						id: "attendance-absent-1",
						organizationId: "org-1",
						employeeId: "employee-1",
						date: new Date("2026-06-10T00:00:00.000Z"),
						status: "ABSENT",
						ledgerType: "RAW",
						isEffective: true,
						isDeleted: false,
					},
				],
				updateMany: async (args: any) => {
					updateManyCalls.push(args);
					return { count: 1 };
				},
				create: async (args: any) => {
					createCalls.push(args);
					return {
						id: "attendance-leave-1",
						...args.data,
					};
				},
			},
		} as any;

		const result = await applyApprovedLeaveAttendanceReconciliation({
			prisma,
			organizationId: "org-1",
			requestId: "request-leave-1",
			employeeId: "employee-1",
			startDate: LEAVE_START,
			endDate: LEAVE_END,
			employeeSchedule: {
				shifts: [{ label: "Tuesday", isRestDay: false }],
			},
			leaveType: "SICK",
			notes: "SICK Leave - Approved",
			actorEmployeeId: "employee-hr-1",
			dependencies: {
				fetchAttendanceEmployeeSnapshotFields: async () => ({
					employeeCodeSnapshot: "EMP-001",
					employeeNameSnapshot: "Mika Reyes",
					departmentIdSnapshot: "dept-1",
					departmentNameSnapshot: "Operations",
					reportToIdSnapshot: null,
					workforceSourceSnapshot: "DIRECT",
					agencyIdSnapshot: null,
				}),
				buildAttendanceTimekeepingFields: () => ({
					totalMinutesWorked: 0,
					regularMinutes: 0,
					overtimeMinutes: 0,
					undertimeMinutes: 0,
					lateMinutes: 0,
					earlyOutMinutes: 0,
					breakMinutes: 0,
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					undertimeHours: "0:00",
					lateHours: "0:00",
					earlyOutHours: "0:00",
				}),
				recomputeAttendanceObligationsForRange: async () => ({ touched: 1 }),
				refreshTimesheetForAttendanceDate: async (client: any, args: any) => {
					refreshCalls.push({ client, args });
					return { id: "timesheet-1", status: "DRAFT" };
				},
			},
		});

		expect(updateManyCalls).to.have.length(1);
		expect(updateManyCalls[0].data).to.deep.equal({ isEffective: false });
		expect(createCalls).to.have.length(1);
		expect(createCalls[0].data).to.deep.include({
			status: "LEAVE",
			ledgerType: "CORRECTION",
			isEffective: true,
			sourceRequestId: "request-leave-1",
			supersedesAttendanceId: "attendance-absent-1",
			appliedBy: "employee-hr-1",
		});
		expect(createCalls[0].data.deviceInfo).to.deep.include({
			source: "LEAVE_REQUEST_APPROVAL",
			leaveRequestId: "request-leave-1",
			leaveType: "SICK",
			actorEmployeeId: "employee-hr-1",
		});
		expect(refreshCalls).to.have.length(1);
		expect(result.attendanceResults).to.deep.equal([
			{
				dateKey: "2026-06-10",
				action: "converted",
				attendanceId: "attendance-leave-1",
				previousAttendanceId: "attendance-absent-1",
			},
		]);
		expect(result.timesheetResults).to.deep.equal([
			{
				dateKey: "2026-06-10",
				action: "refreshed",
				timesheetId: "timesheet-1",
				reason: null,
			},
		]);
	});

	it("creates a first leave row when no same-day attendance exists", async () => {
		const createCalls: any[] = [];
		const prisma = {
			attendance: {
				findMany: async () => [],
				updateMany: async () => {
					throw new Error("should not supersede any row");
				},
				create: async (args: any) => {
					createCalls.push(args);
					return {
						id: "attendance-leave-raw-1",
						...args.data,
					};
				},
			},
		} as any;

		const result = await applyApprovedLeaveAttendanceReconciliation({
			prisma,
			organizationId: "org-1",
			requestId: "request-leave-2",
			employeeId: "employee-1",
			startDate: LEAVE_START,
			endDate: LEAVE_END,
			employeeSchedule: {
				shifts: [{ label: "Tuesday", isRestDay: false }],
			},
			leaveType: "SICK",
			notes: "SICK Leave - Approved",
			actorEmployeeId: "employee-hr-1",
			dependencies: {
				fetchAttendanceEmployeeSnapshotFields: async () => ({}),
				buildAttendanceTimekeepingFields: () => ({
					totalMinutesWorked: 0,
					regularMinutes: 0,
					overtimeMinutes: 0,
					undertimeMinutes: 0,
					lateMinutes: 0,
					earlyOutMinutes: 0,
					breakMinutes: 0,
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					undertimeHours: "0:00",
					lateHours: "0:00",
					earlyOutHours: "0:00",
				}),
				recomputeAttendanceObligationsForRange: async () => ({ touched: 1 }),
				refreshTimesheetForAttendanceDate: async () => null,
			},
		});

		expect(createCalls).to.have.length(1);
		expect(createCalls[0].data).to.deep.include({
			status: "LEAVE",
			ledgerType: "RAW",
			isEffective: true,
			sourceRequestId: "request-leave-2",
			appliedBy: "employee-hr-1",
		});
		expect(result.attendanceResults).to.deep.equal([
			{
				dateKey: "2026-06-10",
				action: "created",
				attendanceId: "attendance-leave-raw-1",
				previousAttendanceId: null,
			},
		]);
	});

	it("marks a locked timesheet as adjustment-required instead of pretending the snapshot changed", async () => {
		const prisma = {
			attendance: {
				findMany: async () => [
					{
						id: "attendance-absent-2",
						organizationId: "org-1",
						employeeId: "employee-1",
						date: new Date("2026-06-10T00:00:00.000Z"),
						status: "ABSENT",
						ledgerType: "RAW",
						isEffective: true,
						isDeleted: false,
					},
				],
				updateMany: async () => ({ count: 1 }),
				create: async (args: any) => ({
					id: "attendance-leave-2",
					...args.data,
				}),
			},
		} as any;

		const result = await applyApprovedLeaveAttendanceReconciliation({
			prisma,
			organizationId: "org-1",
			requestId: "request-leave-3",
			employeeId: "employee-1",
			startDate: LEAVE_START,
			endDate: LEAVE_END,
			employeeSchedule: {
				shifts: [{ label: "Tuesday", isRestDay: false }],
			},
			leaveType: "SICK",
			notes: "SICK Leave - Approved",
			actorEmployeeId: "employee-hr-1",
			dependencies: {
				fetchAttendanceEmployeeSnapshotFields: async () => ({}),
				buildAttendanceTimekeepingFields: () => ({
					totalMinutesWorked: 0,
					regularMinutes: 0,
					overtimeMinutes: 0,
					undertimeMinutes: 0,
					lateMinutes: 0,
					earlyOutMinutes: 0,
					breakMinutes: 0,
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					undertimeHours: "0:00",
					lateHours: "0:00",
					earlyOutHours: "0:00",
				}),
				recomputeAttendanceObligationsForRange: async () => ({ touched: 1 }),
				refreshTimesheetForAttendanceDate: async () => ({
					id: "timesheet-locked-1",
					refreshSkipped: true,
					refreshSkipReason: "TIMESHEET_SNAPSHOT_LOCKED",
				}),
			},
		});

		expect(result.timesheetResults).to.deep.equal([
			{
				dateKey: "2026-06-10",
				action: "adjustment_required",
				timesheetId: "timesheet-locked-1",
				reason: "TIMESHEET_SNAPSHOT_LOCKED",
			},
		]);
	});
});
