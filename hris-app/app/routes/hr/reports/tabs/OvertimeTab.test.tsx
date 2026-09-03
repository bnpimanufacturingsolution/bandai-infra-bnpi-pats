// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OvertimeTab } from "./OvertimeTab";

const useOvertimeMetricsMock = vi.fn();
const useAttendanceMetricsDetailedMock = vi.fn();
const useDepartmentsMock = vi.fn();
const usePositionsMock = vi.fn();
const useEmployeesMock = vi.fn();
const useReportScopeFiltersMock = vi.fn();

vi.mock("~/lib/hooks/useMetrics", () => ({
	useOvertimeMetrics: (...args: unknown[]) => useOvertimeMetricsMock(...args),
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

vi.mock("../useReportScopeFilters", () => ({
	useReportScopeFilters: () => useReportScopeFiltersMock(),
}));

describe("OvertimeTab", () => {
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
					{ id: "dept-hr", name: "Human Resources" },
					{ id: "dept-sw", name: "Software Development" },
				],
			},
		});

		usePositionsMock.mockReturnValue({
			data: {
				positions: [
					{ id: "pos-mgr", name: "HR Manager" },
					{ id: "pos-dev", name: "Software Developer" },
				],
			},
		});

		useEmployeesMock.mockReturnValue({
			data: {
				data: [
					{
						id: "emp-hr-1",
						employeeId: "EMP-HR-MGR-001",
						person: { personalInfo: { firstName: "Maria", lastName: "Santos" } },
						department: { id: "dept-hr", name: "Human Resources" },
						position: { id: "pos-mgr", name: "HR Manager" },
					},
					{
						id: "emp-sw-1",
						employeeId: "EMP-SW-DEV-001",
						person: { personalInfo: { firstName: "Juan", lastName: "Mendoza" } },
						department: { id: "dept-sw", name: "Software Development" },
						position: { id: "pos-dev", name: "Software Developer" },
					},
				],
			},
		});

		useOvertimeMetricsMock.mockReturnValue({
			data: {
				metrics: {
					overtimeMetrics: {
						totalOvertimeHours: 41.77,
						employeesWithOvertime: 2,
						totalApprovedOvertimeHours: 41.77,
						employeesWithApprovedOvertime: 2,
						totalUnapprovedOvertimeHours: 0,
						employeesWithUnapprovedOvertime: 0,
						employees: [
							{
								id: "emp-hr-1",
								employeeId: "EMP-HR-MGR-001",
								name: "Maria Santos",
								department: "Human Resources",
								workforceSource: "DIRECT",
								overtimeCount: 4,
								totalOvertimeHours: 21.22,
								approvedOvertimeHours: 21.22,
								unapprovedOvertimeHours: 0,
								approvalStatus: "APPROVED",
							},
							{
								id: "emp-sw-1",
								employeeId: "EMP-SW-DEV-001",
								name: "Juan Mendoza",
								department: "Software Development",
								workforceSource: "DIRECT",
								overtimeCount: 3,
								totalOvertimeHours: 20.55,
								approvedOvertimeHours: 20.55,
								unapprovedOvertimeHours: 0,
								approvalStatus: "APPROVED",
							},
						],
						split: {
							direct: { totalOvertimeHours: 41.77, employeesWithOvertime: 2 },
							agency: { totalOvertimeHours: 0, employeesWithOvertime: 0 },
						},
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
								id: "rec-ot-1",
								date: "2026-08-25",
								status: "PRESENT",
								timeIn: "2026-08-25T08:00:00.000Z",
								timeOut: "2026-08-25T20:00:00.000Z",
								overtimeHours: "3:00",
								hoursWorked: "12:00",
								scheduleSnapshot: { shiftTypeName: "08:00 to 17:00" },
							},
						],
					},
				},
			},
			isLoading: false,
			error: null,
		});
	});

	it("renders overtime tracking report with actual vs approved OT, search, and breakdown modal", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<OvertimeTab />
			</MemoryRouter>,
		);

		expect(screen.getByText("Overtime Report")).toBeInTheDocument();
		expect(screen.getByText("Total Overtime Worked")).toBeInTheDocument();
		expect(screen.getAllByText("41.77")).toHaveLength(3);
		expect(screen.getByText("Approved Overtime")).toBeInTheDocument();
		expect(screen.getByText("Maria Santos")).toBeInTheDocument();
		expect(screen.getByText("Juan Mendoza")).toBeInTheDocument();
		expect(screen.getAllByText("21.22 hrs")).toHaveLength(2);
		expect(screen.getAllByText("20.55 hrs")).toHaveLength(2);
		expect(screen.getAllByText("APPROVED")).toHaveLength(2);

		// Search filtering
		await user.type(screen.getByPlaceholderText("Search employee..."), "Maria");
		expect(screen.getByText("Maria Santos")).toBeInTheDocument();
		expect(screen.queryByText("Juan Mendoza")).not.toBeInTheDocument();

		await user.clear(screen.getByPlaceholderText("Search employee..."));
		expect(screen.getByText("Juan Mendoza")).toBeInTheDocument();

		// Click "View Breakdown" for Maria Santos
		await user.click(screen.getAllByRole("button", { name: /view breakdown/i })[0]);

		// Verify modal opened
		expect(screen.getByText(/Overtime Breakdown/i)).toBeInTheDocument();
		expect(screen.getByText("3:00")).toBeInTheDocument();
	});
});
