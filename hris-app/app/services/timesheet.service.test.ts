import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hrisGetMock = vi.fn();

vi.mock("~/lib/api-client", () => ({
	hrisApiClient: {
		get: hrisGetMock,
		post: hrisGetMock,
	},
}));

describe("timesheetService client contract", () => {
	beforeEach(() => {
		hrisGetMock.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("builds breakdown from timesheetlines and passes the compensatory leave credit through untouched", async () => {
		const { default: timesheetService } = await import("./timesheet.service");
		const compensatoryLeaveCredit = {
			source: "APPROVED_OVERTIME_TIMESHEETLINES" as const,
			leaveType: "COMPENSATORY" as const,
			totalMinutes: 120,
			totalDays: 0.25,
			deltaMinutes: 120,
			deltaDays: 0.25,
			lineCount: 1,
			creditedAt: "2026-06-25T00:00:00.000Z",
			creditedByEmployeeId: "hr-1",
			approvedOvertimeDays: [],
		};

		hrisGetMock.mockResolvedValueOnce({
			data: {
				timesheet: {
					id: "timesheet-1",
					status: "APPROVED",
					metadata: { compensatoryLeaveCredit },
					timesheetlines: [
						{
							id: "line-2",
							date: "2026-06-26",
							isDeleted: false,
							metadata: {},
						},
						{
							id: "line-1",
							date: "2026-06-25",
							isDeleted: false,
							metadata: {},
						},
						{
							id: "line-deleted",
							date: "2026-06-24",
							isDeleted: true,
							metadata: {},
						},
					],
				},
			},
		});

		const result = await timesheetService.viewTimesheets({ employeeId: "employee-1" });

		expect(result.timesheet.metadata?.compensatoryLeaveCredit).toEqual(compensatoryLeaveCredit);
		expect(result.timesheet.breakdown?.map((entry) => entry.date)).toEqual([
			"2026-06-25",
			"2026-06-26",
		]);
	});

	it("stamps the timesheet's real status onto each synthesized breakdown day instead of hardcoding DRAFT", async () => {
		const { default: timesheetService } = await import("./timesheet.service");

		hrisGetMock.mockResolvedValueOnce({
			data: {
				timesheet: {
					id: "timesheet-2",
					status: "APPROVED",
					metadata: {},
					timesheetlines: [
						{
							id: "line-1",
							date: "2026-06-25",
							isDeleted: false,
							overtimeHours: "2:00",
							approverNotes: "Approved month-end push",
							metadata: {},
						},
					],
				},
			},
		});

		const result = await timesheetService.viewTimesheets({ employeeId: "employee-1" });

		expect(result.timesheet.breakdown?.[0].approvalStatus).toBe("APPROVED");
	});

	it("passes through a skipped credit (no compensatory leave policy) without dropping the flags", async () => {
		const { default: timesheetService } = await import("./timesheet.service");
		const compensatoryLeaveCredit = {
			source: "APPROVED_OVERTIME_TIMESHEETLINES" as const,
			leaveType: "COMPENSATORY" as const,
			totalMinutes: 120,
			totalDays: 0.25,
			deltaMinutes: 120,
			deltaDays: 0.25,
			lineCount: 1,
			creditedAt: "2026-06-25T00:00:00.000Z",
			creditedByEmployeeId: "hr-1",
			approvedOvertimeDays: [],
			creditApplied: false,
			skipReason: "NO_COMPENSATORY_LEAVE_POLICY" as const,
		};

		hrisGetMock.mockResolvedValueOnce({
			data: {
				timesheet: {
					id: "timesheet-1",
					status: "APPROVED",
					metadata: { compensatoryLeaveCredit },
				},
			},
		});

		const result = await timesheetService.viewTimesheets({ employeeId: "employee-1" });

		expect(result.timesheet.metadata?.compensatoryLeaveCredit).toEqual(compensatoryLeaveCredit);
	});

	it("keeps an explicit breakdown as-is when one is already provided", async () => {
		const { default: timesheetService } = await import("./timesheet.service");
		const breakdown = [{ date: "2026-06-25" }];

		hrisGetMock.mockResolvedValueOnce({
			data: {
				timesheet: {
					id: "timesheet-1",
					status: "APPROVED",
					breakdown,
				},
			},
		});

		const result = await timesheetService.viewTimesheets({ employeeId: "employee-1" });

		expect(result.timesheet.breakdown).toBe(breakdown);
	});

	it("posts payroll-period generation to the auto-approve ensure endpoint", async () => {
		const { default: timesheetService } = await import("./timesheet.service");
		const payload = {
			payrollPeriodId: "period-1",
			eligibleEmployees: 2,
			created: 1,
			autoApproved: 2,
			refreshedLines: 15,
			preservedManual: 0,
			skippedLocked: 0,
			skippedPaid: 0,
			remainingToPrepare: 0,
			createLimit: 500,
			errors: [],
		};

		hrisGetMock.mockResolvedValueOnce({ data: payload });

		const result = await timesheetService.ensureAutoApprovedTimesheets("period-1", {
			createLimit: 500,
		});

		expect(hrisGetMock).toHaveBeenCalledWith("/api/timesheet/ensure-auto-approved", {
			payrollPeriodId: "period-1",
			createLimit: 500,
		});
		expect(result).toEqual(payload);
	});
});
