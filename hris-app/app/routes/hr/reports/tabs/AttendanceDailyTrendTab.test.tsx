// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceDailyTrendTab } from "./AttendanceDailyTrendTab";

const useAttendanceDailyTrendByDepartmentMock = vi.fn();
const useDepartmentsMock = vi.fn();
const useEmployeesMock = vi.fn();
const useReportScopeFiltersMock = vi.fn();
const setSearchParamsMock = vi.fn();

vi.mock("~/lib/hooks/useMetrics", () => ({
	useAttendanceDailyTrendByDepartment: (...args: unknown[]) =>
		useAttendanceDailyTrendByDepartmentMock(...args),
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

	it("renders the department trend summary and toggles chart mode", async () => {
		const user = userEvent.setup();

		render(<AttendanceDailyTrendTab />);

		expect(screen.getByText("Daily Trend by Department")).toBeInTheDocument();
		expect(screen.getByText("Operations")).toBeInTheDocument();
		expect(screen.getByText("People")).toBeInTheDocument();
		expect(screen.getByText("Total Records")).toBeInTheDocument();
		expect(screen.getByText("Peak Day")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /line/i })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByRole("button", { name: /stacked bars/i })).toHaveAttribute(
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
	});
});
