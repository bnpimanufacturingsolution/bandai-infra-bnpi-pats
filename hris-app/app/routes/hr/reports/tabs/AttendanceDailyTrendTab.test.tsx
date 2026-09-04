// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceDailyTrendTab } from "./AttendanceDailyTrendTab";

const useAttendanceDailyTrendByDepartmentMock = vi.fn();
const useAttendanceMetricsDetailedMock = vi.fn();
const useDepartmentsMock = vi.fn();
const usePositionsMock = vi.fn();
const useEmployeesMock = vi.fn();
const useShiftTypesMock = vi.fn();
const useReportScopeFiltersMock = vi.fn();
const setSearchParamsMock = vi.fn();

vi.mock("~/lib/hooks/useMetrics", () => ({
	useAttendanceDailyTrendByDepartment: (...args: unknown[]) =>
		useAttendanceDailyTrendByDepartmentMock(...args),
	useAttendanceMetricsDetailed: (...args: unknown[]) =>
		useAttendanceMetricsDetailedMock(...args),
}));

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: (...args: unknown[]) => useDepartmentsMock(...args),
}));

vi.mock("~/lib/hooks/usePositions", () => ({
	usePositions: (...args: unknown[]) => usePositionsMock(...args),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: (...args: unknown[]) => useEmployeesMock(...args),
}));

vi.mock("~/lib/hooks/useSchedules", () => ({
	useShiftTypes: (...args: unknown[]) => useShiftTypesMock(...args),
}));

vi.mock("../useReportScopeFilters", () => ({
	useReportScopeFilters: () => useReportScopeFiltersMock(),
}));

describe("AttendanceDailyTrendTab", () => {
	beforeEach(() => {
		setSearchParamsMock.mockReset();
		useReportScopeFiltersMock.mockReturnValue({
			searchParams: new URLSearchParams(),
			setSearchParams: setSearchParamsMock,
			scope: "monthly",
			dateRange: {
				from: new Date("2026-06-01T00:00:00.000Z"),
				to: new Date("2026-06-03T00:00:00.000Z"),
			},
			fromIso: "2026-06-01",
			toIso: "2026-06-03",
			activeMonth: "5",
			activeYear: "2026",
			yearOptions: ["2026"],
			setScope: vi.fn(),
			setMonth: vi.fn(),
			setYear: vi.fn(),
			setDateRange: vi.fn(),
			clearFilters: vi.fn(),
		});
		useDepartmentsMock.mockReturnValue({
			data: {
				departments: [
					{ id: "dept-ops", name: "Operations" },
					{ id: "dept-people", name: "People" },
				],
			},
		});
		useShiftTypesMock.mockReturnValue({
			data: {
				shiftTypes: [
					{ id: "st-night", name: "Night Shift", code: "NS-12" },
					{ id: "st-day", name: "Day Shift", code: "DS-12" },
				],
			},
		});
		useEmployeesMock.mockReturnValue({
			data: {
				data: [
					{
						id: "mgr-1",
						employeeId: "EMP-001",
						person: { personalInfo: { firstName: "Mila", lastName: "Reyes" } },
						department: { id: "dept-ops" },
					},
					{
						id: "mgr-2",
						employeeId: "EMP-002",
						person: { personalInfo: { firstName: "Noel", lastName: "Tan" } },
						department: { id: "dept-people" },
					},
				],
			},
		});
		usePositionsMock.mockReturnValue({
			data: {
				positions: [
					{ id: "pos-1", title: "Operator" },
					{ id: "pos-2", title: "Supervisor" },
				],
			},
		});
		useAttendanceMetricsDetailedMock.mockReturnValue({
			data: {
				metrics: {
					attendanceObligationDetailed: {
						records: [
							{
								id: "rec-1",
								employeeRefId: "mgr-1",
								employeeId: "EMP-001",
								employeeName: "Mila Reyes",
								departmentName: "Operations",
								date: "2026-06-01",
								status: "PRESENT",
								timeIn: "2026-06-01T18:00:00.000Z",
								timeOut: "2026-06-02T06:00:00.000Z",
								lateHours: "0:00",
								undertimeHours: "0:00",
								hoursWorked: "12:00",
								scheduleSnapshot: {
									shiftTypeName: "Night Shift",
									shiftTypeCode: "NS-12",
									startTime: "18:00",
									endTime: "06:00",
								},
							},
						],
						totalRecords: 1,
					},
				},
			},
			isLoading: false,
			error: null,
		});
		useAttendanceDailyTrendByDepartmentMock.mockReturnValue({
			data: {
				metrics: {
					attendanceDailyTrendByDepartment: {
						startDate: "2026-06-01T00:00:00.000Z",
						endDate: "2026-06-03T23:59:59.999Z",
						totalDays: 3,
						totalRecords: 8,
						departments: [
							{ departmentId: "dept-ops", departmentName: "Operations", total: 6 },
							{ departmentId: "dept-people", departmentName: "People", total: 2 },
						],
						series: [
							{
								businessDate: "2026-06-01",
								total: 5,
								departmentBreakdown: [
									{
										departmentId: "dept-ops",
										departmentName: "Operations",
										total: 4,
									},
									{
										departmentId: "dept-people",
										departmentName: "People",
										total: 1,
									},
								],
							},
							{
								businessDate: "2026-06-02",
								total: 3,
								departmentBreakdown: [
									{
										departmentId: "dept-ops",
										departmentName: "Operations",
										total: 2,
									},
									{
										departmentId: "dept-people",
										departmentName: "People",
										total: 1,
									},
								],
							},
						],
					},
				},
			},
			isLoading: false,
			error: null,
		});
	});

	it("renders the department trend summary, metric tabs, and toggles chart/table modes", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<AttendanceDailyTrendTab />
			</MemoryRouter>,
		);

		expect(
			screen.getByText("Daily Present (Clocked In) Trend by Department"),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /present \(clocked in\)/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /absent/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /late \(tardiness\)/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /undertime/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /all scheduled/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /export report/i })).toBeInTheDocument();
		expect(screen.getByText("Operations")).toBeInTheDocument();
		expect(screen.getByText("People")).toBeInTheDocument();
		expect(screen.getByText("Total Present (Clocked In)")).toBeInTheDocument();
		expect(screen.getByText("Peak Day")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /line/i })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByRole("button", { name: /stacked bars/i })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		expect(screen.getByRole("button", { name: /table/i })).toHaveAttribute(
			"aria-pressed",
			"false",
		);

		await user.click(screen.getByRole("button", { name: /stacked bars/i }));

		expect(screen.getByRole("button", { name: /line/i })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		expect(screen.getByRole("button", { name: /stacked bars/i })).toHaveAttribute(
			"aria-pressed",
			"true",
		);

		// Switch to Table View
		await user.click(screen.getByRole("button", { name: /table/i }));
		expect(screen.getByRole("button", { name: /table/i })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByText("Mila Reyes")).toBeInTheDocument();
		expect(screen.getByPlaceholderText(/search employee/i)).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /late \(tardiness\)/i }));
		expect(
			screen.getByText("Daily Tardiness Trend by Department"),
		).toBeInTheDocument();
	});
});
