// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TardinessUndetimeTab } from "./TardinessUndetimeTab";

const useTardinessMetricsMock = vi.fn();
const useAttendanceMetricsDetailedMock = vi.fn();
const useDepartmentsMock = vi.fn();
const usePositionsMock = vi.fn();
const useEmployeesMock = vi.fn();
const useReportScopeFiltersMock = vi.fn();

vi.mock("~/lib/hooks/useMetrics", () => ({
	useTardinessMetrics: (...args: unknown[]) => useTardinessMetricsMock(...args),
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

describe("TardinessUndetimeTab", () => {
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
					{ id: "dept-ga", name: "GA/HR" },
					{ id: "dept-prod", name: "Production" },
				],
			},
		});

		usePositionsMock.mockReturnValue({
			data: {
				positions: [
					{ id: "pos-1", name: "HR Specialist" },
					{ id: "pos-2", name: "Operator" },
				],
			},
		});

		useEmployeesMock.mockReturnValue({
			data: {
				data: [
					{
						id: "emp-10",
						employeeId: "00010",
						person: { personalInfo: { firstName: "Zen", lastName: "Andrei" } },
						department: { id: "dept-ga", name: "GA/HR" },
						position: { id: "pos-1", name: "HR Specialist" },
					},
					{
						id: "emp-432",
						employeeId: "00432",
						person: { personalInfo: { firstName: "Myra", lastName: "De Torres" } },
						department: { id: "dept-prod", name: "Production" },
						position: { id: "pos-2", name: "Operator" },
					},
				],
			},
		});

		useTardinessMetricsMock.mockReturnValue({
			data: {
				metrics: {
					tardinessMetrics: {
						totalTardinessInstances: 182,
						totalLateHours: 55.4,
						totalUndertimeInstances: 12,
						totalUndertimeHours: 116.07,
						employeesWithIssues: 25,
						employees: [
							{
								id: "emp-10",
								employeeId: "00010",
								name: "Zen Andrei",
								department: "GA/HR",
								tardinessCount: 6,
								totalLateMinutes: 1536,
								avgLateMinutes: 256,
								maxLateMinutes: 487,
								undertimeCount: 2,
								totalUndertimeMinutes: 120,
								earlyOutCount: 0,
								totalEarlyOutMinutes: 0,
							},
							{
								id: "emp-432",
								employeeId: "00432",
								name: "Myra De Torres",
								department: "Production",
								tardinessCount: 3,
								totalLateMinutes: 1440,
								avgLateMinutes: 480,
								maxLateMinutes: 480,
								undertimeCount: 0,
								totalUndertimeMinutes: 0,
								earlyOutCount: 0,
								totalEarlyOutMinutes: 0,
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
								date: "2026-08-25",
								status: "LATE",
								timeIn: "2026-08-25T08:25:00.000Z",
								timeOut: "2026-08-25T17:00:00.000Z",
								lateHours: "0:25",
								lateMinutes: 25,
								undertimeHours: "0:00",
								hoursWorked: "7:35",
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

	it("renders tardiness & undertime report with filters, search, tabs, and breakdown modal", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter>
				<TardinessUndetimeTab />
			</MemoryRouter>,
		);

		expect(screen.getByText("Tardiness & Undertime Report")).toBeInTheDocument();
		expect(screen.getByText("Total Tardiness")).toBeInTheDocument();
		expect(screen.getByText("182")).toBeInTheDocument();
		expect(screen.getByText("Total Undertime")).toBeInTheDocument();
		expect(screen.getByText("Zen Andrei")).toBeInTheDocument();
		expect(screen.getByText("Myra De Torres")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Search employee...")).toBeInTheDocument();

		// Search filtering
		await user.type(screen.getByPlaceholderText("Search employee..."), "Zen");
		expect(screen.getByText("Zen Andrei")).toBeInTheDocument();
		expect(screen.queryByText("Myra De Torres")).not.toBeInTheDocument();

		// Clear search
		await user.clear(screen.getByPlaceholderText("Search employee..."));
		expect(screen.getByText("Myra De Torres")).toBeInTheDocument();

		// Switch to Undertime Details tab
		const undertimeTabBtn = screen.getByRole("button", { name: /undertime details/i });
		await user.click(undertimeTabBtn);
		expect(screen.getByText("Zen Andrei")).toBeInTheDocument();
		expect(screen.queryByText("Myra De Torres")).not.toBeInTheDocument();

		// Click "View Breakdown" button for Zen Andrei
		await user.click(screen.getAllByRole("button", { name: /view breakdown/i })[0]);

		// Verify modal opened
		expect(screen.getByText(/Attendance Breakdown/i)).toBeInTheDocument();
		expect(screen.getByText("08:00 to 17:00")).toBeInTheDocument();
		expect(screen.getByText("0:25")).toBeInTheDocument();
	});
});
