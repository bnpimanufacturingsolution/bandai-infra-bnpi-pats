// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ShiftAttendanceTab } from "./ShiftAttendanceTab";

const useAttendanceMetricsDetailedMock = vi.fn();
const useDepartmentsMock = vi.fn();
const usePositionsMock = vi.fn();
const useEmployeesMock = vi.fn();
const useShiftTypesMock = vi.fn();
const useReportScopeFiltersMock = vi.fn();
const setSearchParamsMock = vi.fn();

vi.mock("~/lib/hooks/useMetrics", () => ({
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

describe("ShiftAttendanceTab", () => {
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
					{ id: "st-night", name: "Night Shift", code: "NS-12", isOvernight: true, startTime: "18:00", endTime: "06:00" },
					{ id: "st-day", name: "Day Shift", code: "DS-12", isOvernight: false, startTime: "06:00", endTime: "18:00" },
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
	});

	it("renders ShiftAttendanceTab with metric selector, shift dropdown, KPI cards, and roster table", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<ShiftAttendanceTab />
			</MemoryRouter>,
		);

		expect(screen.getByText("Shift Attendance & Schedule Roster")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /present \(clocked in\)/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /absent/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /late \(tardiness\)/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /undertime/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /all scheduled/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /export report/i })).toBeInTheDocument();

		// Check KPI cards
		expect(screen.getByText("Total Present (Clocked In)")).toBeInTheDocument();
		expect(screen.getAllByText("Late (Tardiness)").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Undertime").length).toBeGreaterThan(0);

		// Check employee roster table
		expect(screen.getByText("Mila Reyes")).toBeInTheDocument();
		expect(screen.getByText("Operations")).toBeInTheDocument();
		expect(screen.getAllByText("Night Shift").length).toBeGreaterThan(0);
		expect(screen.getByText("6:00 PM - 6:00 AM")).toBeInTheDocument();

		// Switch metric
		await user.click(screen.getByRole("button", { name: /late \(tardiness\)/i }));
		expect(screen.getByText("Total Late (Tardiness)")).toBeInTheDocument();
	});
});
