import { expect } from "chai";
import { applyApprovedTimeAdjustmentReconciliation } from "../app/request/time-adjustment-reconciliation.service";

const ADJUSTMENT_DATE = new Date("2026-06-10T00:00:00.000Z");

describe("approved time adjustment reconciliation service", () => {
	it("recomputes attendance obligations and refreshes a mutable timesheet snapshot", async () => {
		const recomputeCalls: any[] = [];
		const refreshCalls: any[] = [];
		const prisma = {
			attendance: {
				findMany: async () => [
					{
						id: "attendance-effective-1",
						organizationId: "org-1",
						employeeId: "employee-1",
						date: ADJUSTMENT_DATE,
						status: "PRESENT",
						ledgerType: "CORRECTION",
						isEffective: true,
						isDeleted: false,
						supersedesAttendanceId: "attendance-raw-1",
					},
				],
			},
		} as any;

		const result = await applyApprovedTimeAdjustmentReconciliation({
			prisma,
			organizationId: "org-1",
			requestId: "request-time-adjustment-1",
			employeeId: "employee-1",
			date: ADJUSTMENT_DATE,
			dependencies: {
				recomputeAttendanceObligationsForRange: async (_client: any, args: any) => {
					recomputeCalls.push(args);
					return { touched: 1 };
				},
				refreshTimesheetForAttendanceDate: async (_client: any, args: any) => {
					refreshCalls.push(args);
					return { id: "timesheet-draft-1", status: "DRAFT" };
				},
			},
		});

		expect(recomputeCalls).to.have.length(1);
		expect(recomputeCalls[0]).to.deep.include({
			organizationId: "org-1",
			employeeId: "employee-1",
			reason: "TimeAdjustmentApproved",
		});
		expect(recomputeCalls[0].fromDate.toISOString()).to.equal("2026-06-10T00:00:00.000Z");
		expect(recomputeCalls[0].toDate.toISOString()).to.equal("2026-06-10T00:00:00.000Z");
		expect(refreshCalls).to.have.length(1);
		expect(refreshCalls[0]).to.deep.include({
			organizationId: "org-1",
			employeeId: "employee-1",
		});
		expect(refreshCalls[0].date.toISOString()).to.equal("2026-06-10T00:00:00.000Z");
		expect(result.attendanceResults).to.deep.equal([
			{
				dateKey: "2026-06-10",
				action: "refreshed",
				attendanceId: "attendance-effective-1",
				previousAttendanceId: "attendance-raw-1",
			},
		]);
		expect(result.timesheetResults).to.deep.equal([
			{
				dateKey: "2026-06-10",
				action: "refreshed",
				timesheetId: "timesheet-draft-1",
				reason: null,
			},
		]);
	});

	it("marks locked timesheet snapshots as adjustment-required", async () => {
		const prisma = {
			attendance: {
				findMany: async () => [
					{
						id: "attendance-effective-2",
						organizationId: "org-1",
						employeeId: "employee-1",
						date: ADJUSTMENT_DATE,
						status: "PRESENT",
						ledgerType: "CORRECTION",
						isEffective: true,
						isDeleted: false,
						supersedesAttendanceId: null,
					},
				],
			},
		} as any;

		const result = await applyApprovedTimeAdjustmentReconciliation({
			prisma,
			organizationId: "org-1",
			requestId: "request-time-adjustment-2",
			employeeId: "employee-1",
			date: ADJUSTMENT_DATE,
			dependencies: {
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
