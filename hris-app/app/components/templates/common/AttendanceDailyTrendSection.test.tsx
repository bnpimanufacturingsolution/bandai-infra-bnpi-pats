// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceDailyTrendSection } from "./AttendanceDailyTrendSection";

const useAttendanceDailyTrendByDepartmentMock = vi.fn();

vi.mock("~/lib/hooks/useMetrics", () => ({
	useAttendanceDailyTrendByDepartment: (...args: unknown[]) =>
		useAttendanceDailyTrendByDepartmentMock(...args),
}));

describe("AttendanceDailyTrendSection", () => {
	beforeEach(() => {
		useAttendanceDailyTrendByDepartmentMock.mockReset();
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

	it("renders the daily trend section with the selected period title and forwards the current filters", async () => {
		const user = userEvent.setup();

		render(
			<AttendanceDailyTrendSection
				visible
				title="Today Trend by Department"
				description="Jun 1, 2026 to Jun 3, 2026"
				filters={{
					dateFrom: "2026-06-01",
					dateTo: "2026-06-03",
					search: "Amina",
					status: "PRESENT",
					departmentId: "dept-ops",
					reportToId: "mgr-1",
					employeeId: "emp-1",
					shiftType: "DAY",
				}}
			/>,
		);

		expect(useAttendanceDailyTrendByDepartmentMock).toHaveBeenCalledWith(
			"2026-06-01",
			"2026-06-03",
			"Amina",
			"PRESENT",
			"dept-ops",
			"mgr-1",
			"emp-1",
			"DAY",
			{ enabled: true },
		);
		expect(screen.getByText("Today Trend by Department")).toBeInTheDocument();
		expect(screen.getByText("Jun 1, 2026 to Jun 3, 2026")).toBeInTheDocument();
		expect(screen.getByText("Operations")).toBeInTheDocument();
		expect(screen.getByText("People")).toBeInTheDocument();
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

	it("renders the date window inline instead of hiding it behind an info trigger", () => {
		render(
			<AttendanceDailyTrendSection
				visible
				title="Today Trend by Department"
				description="Jun 1, 2026 to Jun 3, 2026"
				filters={{
					dateFrom: "2026-06-01",
					dateTo: "2026-06-03",
				}}
			/>,
		);

		expect(screen.getByText("Jun 1, 2026 to Jun 3, 2026")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /attendance trend info/i })).not.toBeInTheDocument();
	});

	it("shows an accessible loading status while the chart data is fetching", () => {
		useAttendanceDailyTrendByDepartmentMock.mockReturnValue({
			data: undefined,
			isLoading: true,
			error: null,
		});

		render(
			<AttendanceDailyTrendSection
				visible
				title="Today Trend by Department"
				description="Jun 1, 2026 to Jun 3, 2026"
				filters={{
					dateFrom: "2026-06-01",
					dateTo: "2026-06-03",
				}}
			/>,
		);

		expect(
			screen.getByRole("status", { name: /loading attendance trend chart/i }),
		).toBeInTheDocument();
		expect(screen.getByText("Today Trend by Department")).toBeInTheDocument();
	});

	it("renders when a day bucket is missing department breakdown data", () => {
		useAttendanceDailyTrendByDepartmentMock.mockReturnValue({
			data: {
				metrics: {
					attendanceDailyTrendByDepartment: {
						startDate: "2026-06-01T00:00:00.000Z",
						endDate: "2026-06-03T23:59:59.999Z",
						totalDays: 3,
						totalRecords: 5,
						departments: [
							{ departmentId: "dept-ops", departmentName: "Operations", total: 5 },
						],
						series: [
							{
								businessDate: "2026-06-01",
								total: 5,
							} as any,
						],
					},
				},
			},
			isLoading: false,
			error: null,
		});

		render(
			<AttendanceDailyTrendSection
				visible
				title="Today Trend by Department"
				description="Jun 1, 2026 to Jun 3, 2026"
				filters={{
					dateFrom: "2026-06-01",
					dateTo: "2026-06-03",
				}}
			/>,
		);

		expect(screen.getByText("Today Trend by Department")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /line/i })).toBeInTheDocument();
	});

	it("stays hidden when the section is not visible", () => {
		render(
			<AttendanceDailyTrendSection
				visible={false}
				title="Today Trend by Department"
				description="Jun 1, 2026 to Jun 3, 2026"
				filters={{
					dateFrom: "2026-06-01",
					dateTo: "2026-06-03",
				}}
			/>,
		);

		expect(screen.queryByText("Today Trend by Department")).not.toBeInTheDocument();
		expect(useAttendanceDailyTrendByDepartmentMock).toHaveBeenCalledWith(
			"2026-06-01",
			"2026-06-03",
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			{ enabled: false },
		);
	});
});
