import { beforeEach, describe, expect, it, vi } from "vitest";

const postMock = vi.fn();

vi.mock("../lib/api-client", () => ({
	hrisApiClient: {
		post: postMock,
	},
}));

describe("metricsService HR attendance metrics", () => {
	beforeEach(() => {
		postMock.mockReset();
	});

	it("uses attendance obligations for past HR attendance detail ranges", async () => {
		const { default: metricsService } = await import("./metrics.service");
		postMock.mockResolvedValueOnce({
			data: {
				metrics: {
					attendanceObligationDetailed: {
						records: [{ id: "obligation-1", status: "REST_DAY" }],
						metrics: { totalRestDay: 1 },
						totalRecords: 1,
					},
				},
			},
		});

		await metricsService.getAttendanceMetricsDetailed(
			"2026-05-17",
			"2026-05-17",
			20,
			1,
		);

		expect(postMock).toHaveBeenCalledWith("/api/metrics", {
			model: "Attendance",
			data: ["attendanceObligationDetailed"],
			filter: {
				dateFrom: "2026-05-17",
				dateTo: "2026-05-17",
				limit: 20,
				page: 1,
			},
		});
		expect(postMock.mock.calls[0][1].data).not.toContain("attendanceMetricsDetailed");
	});

	it("passes status only for the filtered attendance table row request", async () => {
		const { default: metricsService } = await import("./metrics.service");
		postMock.mockResolvedValueOnce({
			data: {
				metrics: {
					attendanceObligationDetailed: {
						records: [{ id: "late-1", status: "LATE" }],
						metrics: { totalLate: 3 },
						totalRecords: 1,
					},
				},
			},
		});

		await metricsService.getAttendanceMetricsDetailed(
			"2026-06-08",
			"2026-06-08",
			10,
			1,
			"",
			"LATE",
			"dept-1",
			"manager-1",
			"emp-1",
			"DAY",
		);

		expect(postMock).toHaveBeenCalledWith("/api/metrics", {
			model: "Attendance",
			data: ["attendanceObligationDetailed"],
			filter: {
				dateFrom: "2026-06-08",
				dateTo: "2026-06-08",
				limit: 10,
				page: 1,
				status: "LATE",
				departmentId: "dept-1",
				reportToId: "manager-1",
				employeeId: "emp-1",
				shiftType: "DAY",
			},
		});
	});

	it("uses attendance obligations for today's operational attendance summary", async () => {
		const { default: metricsService } = await import("./metrics.service");
		postMock.mockResolvedValueOnce({
			data: {
				metrics: {
					attendanceObligationTodayOpsSummary: {
						businessDate: "2026-05-25",
						scheduledTodayCount: 10,
						notYetInCount: 2,
					},
				},
			},
		});

		await metricsService.getAttendanceTodayOpsSummary(
			"2026-05-25",
			"2026-05-25",
			"Ada",
			"dept-1",
			"manager-1",
			"emp-1",
			"NIGHT",
		);

		expect(postMock).toHaveBeenCalledWith("/api/metrics", {
			model: "Attendance",
			data: ["attendanceObligationTodayOpsSummary"],
			filter: {
				dateFrom: "2026-05-25",
				dateTo: "2026-05-25",
				search: "Ada",
				departmentId: "dept-1",
				reportToId: "manager-1",
				employeeId: "emp-1",
				shiftType: "NIGHT",
			},
		});
	});

	it("uses attendance obligation summary for attendance line summaries", async () => {
		const { default: metricsService } = await import("./metrics.service");
		postMock.mockResolvedValueOnce({
			data: {
				metrics: {
					attendanceObligationSummary: {
						totalScheduledWorkDays: 1,
						totalOvertimeMinutes: 60,
					},
				},
			},
		});

		await metricsService.getAttendanceTimesheetLineSummary(
			"2026-05-01",
			"2026-05-15",
			"Ada",
			"PRESENT",
			"dept-1",
			"manager-1",
			"emp-1",
			"DAY",
		);

		expect(postMock).toHaveBeenCalledWith("/api/metrics", {
			model: "Attendance",
			data: ["attendanceObligationSummary"],
			filter: {
				dateFrom: "2026-05-01",
				dateTo: "2026-05-15",
				search: "Ada",
				status: "PRESENT",
				departmentId: "dept-1",
				reportToId: "manager-1",
				employeeId: "emp-1",
				shiftType: "DAY",
			},
		});
	});

	it("keeps payroll blockers scoped to PayrollPeriod metrics", async () => {
		const { default: metricsService } = await import("./metrics.service");
		postMock.mockResolvedValueOnce({
			data: {
				metrics: {
					payrollBlockers: {
						missingInfo: [],
						timesheetNotSubmitted: [],
						pendingApproval: [],
						semiMonthlyEmployeesTotal: 0,
						total: 0,
					},
				},
			},
		});

		await metricsService.getPayrollBlockers("period-1", 50, {
			departmentId: "dept-1",
			sectionId: "sec-1",
		});

		expect(postMock).toHaveBeenCalledWith("/api/metrics", {
			model: "PayrollPeriod",
			data: ["payrollBlockers"],
			filter: {
				payrollPeriodId: "period-1",
				limit: 50,
				departmentId: "dept-1",
				sectionId: "sec-1",
			},
		});
	});

	it("keeps payroll run summary scoped to PayrollPeriod metrics", async () => {
		const { default: metricsService } = await import("./metrics.service");
		postMock.mockResolvedValueOnce({
			data: {
				metrics: {
					payrollRunSummary: {
						payrollScopeEmployeesTotal: 13,
						previewEligibleEmployeesTotal: 12,
						includedEmployeesTotal: 11,
						missingInfoEmployeesTotal: 1,
						timesheetNotSubmittedEmployeesTotal: 1,
						pendingApprovalEmployeesTotal: 0,
						blockedEmployeesTotal: 1,
						notReadyEmployeesTotal: 2,
						total: 2,
					},
				},
			},
		});

		await metricsService.getPayrollRunSummary("period-1", {
			departmentId: "dept-1",
			sectionId: "sec-1",
		});

		expect(postMock).toHaveBeenCalledWith("/api/metrics", {
			model: "PayrollPeriod",
			data: ["payrollRunSummary"],
			filter: {
				payrollPeriodId: "period-1",
				departmentId: "dept-1",
				sectionId: "sec-1",
			},
		});
	});

	it("requests payroll summaries from PayrollPeriod metrics", async () => {
		const { default: metricsService } = await import("./metrics.service");
		postMock.mockResolvedValueOnce({
			data: {
				metrics: {
					payrollSummary: {
						periodsCovered: 1,
						totalEmployees: 1,
						payrollPeriods: [],
						payrolls: [],
					},
				},
			},
		});

		await metricsService.getPayrollSummary(
			"2026-05-01",
			"2026-05-15",
			"period-1",
			"dept-1",
			"manager-1",
		);

		expect(postMock).toHaveBeenCalledWith("/api/metrics", {
			model: "PayrollPeriod",
			data: ["payrollSummary"],
			filter: {
				dateFrom: "2026-05-01",
				dateTo: "2026-05-15",
				payrollPeriodId: "period-1",
				departmentId: "dept-1",
				reportToId: "manager-1",
			},
		});
	});

	it("requests timesheet statistics from Timesheet metrics", async () => {
		const { default: metricsService } = await import("./metrics.service");
		postMock.mockResolvedValueOnce({
			data: {
				metrics: {
					timesheetStatistics: {
						total: 10,
						submitted: 5,
						approved: 4,
						actionRequired: 1,
						draft: 0,
					},
				},
			},
		});

		await metricsService.getTimesheetStatistics({
			payrollPeriodId: "period-1",
			reportToId: "manager-1",
		});

		expect(postMock).toHaveBeenCalledWith("/api/metrics", {
			model: "Timesheet",
			data: ["timesheetStatistics"],
			filter: {
				payrollPeriodId: "period-1",
				reportToId: "manager-1",
			},
		});
	});
});
