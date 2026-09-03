// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PerfectAttendanceTab } from "./PerfectAttendanceTab";

const usePerfectAttendanceMetricsMock = vi.fn();
const useAttendanceMetricsDetailedMock = vi.fn();
const useDepartmentsMock = vi.fn();
const useEmployeesMock = vi.fn();
const useReportScopeFiltersMock = vi.fn();

vi.mock("~/lib/hooks/useMetrics", () => ({
	usePerfectAttendanceMetrics: (...args: unknown[]) =>
		usePerfectAttendanceMetricsMock(...args),
	useAttendanceMetricsDetailed: (...args: unknown[]) =>
		useAttendanceMetricsDetailedMock(...args),
}));

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: (...args: unknown[]) => useDepartmentsMock(...args),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: (...args: unknown[]) => useEmployeesMock(...args),
}));

vi.mock("../useReportScopeFilters", () => ({
	useReportScopeFilters: () => useReportScopeFiltersMock(),
}));

describe("PerfectAttendanceTab", () => {
	beforeEach(() => {
		useReportScopeFiltersMock.mockReturnValue({
			scope: "monthly",
			dateRange: {
				from: new Date("2026-08-01T00:00:00.000Z"),
				to: new Date("2026-08-31T23:59:59.999Z"),
			},
			fromIso: "2026-08-01",
			toIso: "2026-08-31",
			activeMonth: "7",
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
					{ id: "dept-prod", name: "Production" },
					{ id: "dept-exec", name: "Executive" },
				],
			},
		});

		useEmployeesMock.mockReturnValue({
			data: {
				data: [
					{
						id: "emp-1",
						employeeId: "EMP-001",
						person: { personalInfo: { firstName: "Ramon", lastName: "Villanueva" } },
						department: { id: "dept-exec" },
					},
					{
						id: "emp-2",
						employeeId: "00536",
						person: { personalInfo: { firstName: "Russel", lastName: "Garcia" } },
						department: { id: "dept-prod" },
					},
				],
			},
		});

		usePerfectAttendanceMetricsMock.mockReturnValue({
			data: {
				metrics: {
					perfectAttendanceMetrics: {
						totalEmployees: 220,
						perfectAttendanceCount: 2,
						perfectAttendanceRate: 0.9,
						averageAttendanceRate: 85.5,
						employees: [
							{
								id: "emp-1",
								employeeId: "EMP-001",
								name: "Ramon Villanueva",
								department: "Executive",
								daysPresent: 23,
								totalWorkDays: 23,
								isPerfect: true,
							},
							{
								id: "emp-2",
								employeeId: "00536",
								name: "Russel Garcia",
								department: "Production",
								daysPresent: 22,
								totalWorkDays: 22,
								isPerfect: true,
							},
						],
					},
				},
			},
			isLoading: false,
			error: null,
		});

		useAttendanceMetricsDetailedMock.mockReturnValue({
			data: {
				metrics: {
					attendanceObligationDetailed: {
						records: [
							{
								id: "rec-1",
								date: "2026-08-01",
								status: "PRESENT",
								timeIn: "2026-08-01T08:00:00.000Z",
								timeOut: "2026-08-01T17:00:00.000Z",
								lateHours: "0:00",
								undertimeHours: "0:00",
								hoursWorked: "8:00",
								scheduleSnapshot: { shiftTypeName: "Regular Day Shift" },
							},
						],
					},
				},
			},
			isLoading: false,
			error: null,
		});
	});

	it("renders perfect attendance metrics summary cards and table rows, and opens view attendance modal", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<PerfectAttendanceTab />
			</MemoryRouter>,
		);

		expect(screen.getByText("Perfect Attendance Report")).toBeInTheDocument();
		expect(screen.getByText("Total Scheduled Employees")).toBeInTheDocument();
		expect(screen.getByText("220")).toBeInTheDocument();
		expect(screen.getByText("Perfect Attendance")).toBeInTheDocument();
		expect(screen.getByText("Average Attendance Rate")).toBeInTheDocument();
		expect(screen.getByText("Ramon Villanueva")).toBeInTheDocument();
		expect(screen.getByText("Russel Garcia")).toBeInTheDocument();
		expect(screen.getByText("23 / 23 days")).toBeInTheDocument();
		expect(screen.getByText("22 / 22 days")).toBeInTheDocument();
		expect(screen.getAllByText("Perfect")).toHaveLength(2);
		expect(screen.getAllByRole("button", { name: /view attendance/i })).toHaveLength(2);

		// Click "View Attendance" for Ramon Villanueva
		await user.click(screen.getAllByRole("button", { name: /view attendance/i })[0]);

		// Verify modal opened
		expect(screen.getByText(/Monthly Attendance Breakdown/i)).toBeInTheDocument();
		expect(screen.getByText("Regular Day Shift")).toBeInTheDocument();
	});
});
