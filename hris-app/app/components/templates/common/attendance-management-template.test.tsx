// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useSearchParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getClockInArrivalIndicator } from "~/lib/utils/attendance-arrival";
import { formatManilaClockTime } from "~/lib/utils/manila-clock";

const mockUseNavigate = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());
const mockUseSocket = vi.hoisted(() => vi.fn());
const mockUseQueryClient = vi.hoisted(() => vi.fn());
const mockUseImportAttendance = vi.hoisted(() => vi.fn());
const mockUseCreateAttendanceCorrection = vi.hoisted(() => vi.fn());
const mockUseCreateAttendanceBackfill = vi.hoisted(() => vi.fn());
const mockUseAttendanceImportProgress = vi.hoisted(() => vi.fn());
const mockUseDepartments = vi.hoisted(() => vi.fn());
const mockUseSections = vi.hoisted(() => vi.fn());
const mockUsePositions = vi.hoisted(() => vi.fn());
const mockUseLevels = vi.hoisted(() => vi.fn());
const mockUseEmployees = vi.hoisted(() => vi.fn());
const mockUsePayrollPeriods = vi.hoisted(() => vi.fn());
const mockUseAttendanceMetricsDetailed = vi.hoisted(() => vi.fn());
const mockUseLeaveBalanceMetrics = vi.hoisted(() => vi.fn());
const mockInvalidateQueries = vi.hoisted(() => vi.fn());
const mockAttendanceFixModal = vi.hoisted(() => vi.fn());
const mockAttendanceDailyTrendSection = vi.hoisted(() => vi.fn());

const attendanceRecord = {
	id: "attendance-1",
	employeeId: "EMP-001",
	employeeName: "Amina Reyes",
	departmentId: "dept-ops",
	departmentName: "Operations",
	date: "2026-06-25",
	timeIn: "2026-06-25T08:00:00.000Z",
	timeBreak: null,
	timeOut: "2026-06-25T17:00:00.000Z",
	isOvernight: false,
	timeOutNextDay: false,
	status: "PRESENT",
	behaviorFlags: [],
	computationMeta: {
		rawLateMinutes: 0,
		gracePeriodMinutes: 0,
		withinGrace: false,
	},
	hoursWorked: "8:00",
	regularHours: "8:00",
	overtimeHours: "0:00",
	undertimeHours: "0:00",
	lateHours: "0:00",
	earlyOutHours: "0:00",
	breakMinutes: 60,
	isManualEntry: false,
	notes: "Missing clock-out corrected by HR.",
	timesheetId: null,
	isVirtual: false,
	primaryMarker: "HOURS",
	workforceSource: "DIRECT" as const,
} as const;

const metricsPayload = {
	totalPresent: 1,
	totalAbsent: 0,
	totalNotClockedIn: 0,
	totalLate: 0,
	totalOnLeave: 0,
	totalRestDay: 0,
	totalHoliday: 0,
	totalClockedIn: 1,
	totalOnTime: 1,
	totalScheduledWorkDays: 1,
	totalCalendarDays: 1,
	totalCompanyEventDays: 0,
	totalEmployeesMissingSchedule: 0,
	totalClockedOut: 1,
	totalEarlyOut: 0,
	totalOvertime: 0,
	approvedOvertimeCount: 0,
	unapprovedOvertimeCount: 0,
	leaveTypeBreakdown: [],
	avgAttendanceRate: 100,
	utilizationRate: 100,
	totalMinutesWorked: 480,
	totalOvertimeMinutes: 0,
	totalUndertimeMinutes: 0,
	totalLateMinutes: 0,
};

const attendanceMetricsResponse = {
	metrics: {
		attendanceObligationDetailed: {
			metrics: metricsPayload,
			records: [attendanceRecord],
			dateRange: {
				from: "2026-06-25",
				to: "2026-06-25",
			},
			totalRecords: 1,
			departmentBreakdown: [],
			departmentPreviewRows: [],
		},
	},
};

const virtualAttendanceRecord = {
	...attendanceRecord,
	id: "attendance-virtual-1",
	employeeName: "Amina Reyes",
	timeIn: null,
	timeBreak: null,
	timeOut: null,
	status: "NOT_CLOCKED_IN",
	isManualEntry: false,
	notes: "Missing attendance",
	timesheetId: null,
	isVirtual: true,
};

const virtualAttendanceMetricsResponse = {
	metrics: {
		attendanceObligationDetailed: {
			metrics: metricsPayload,
			records: [virtualAttendanceRecord],
			dateRange: {
				from: "2026-06-25",
				to: "2026-06-25",
			},
			totalRecords: 1,
			departmentBreakdown: [],
			departmentPreviewRows: [],
		},
	},
};

vi.mock("react-router-dom", async () => {
	const actual = await vi.importActual<typeof import("react-router-dom")>(
		"react-router-dom",
	);
	return {
		...actual,
		useNavigate: () => mockUseNavigate,
	};
});

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => mockUseAuth(),
}));

vi.mock("~/contexts/socket-context", () => ({
	useSocket: () => mockUseSocket(),
}));

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => mockUseQueryClient(),
}));

vi.mock("~/lib/hooks/useAttendances", () => ({
	useImportAttendance: () => mockUseImportAttendance(),
	useCreateAttendanceCorrection: () => mockUseCreateAttendanceCorrection(),
	useCreateAttendanceBackfill: () => mockUseCreateAttendanceBackfill(),
}));

vi.mock("~/lib/hooks/useAttendanceImportProgress", () => ({
	useAttendanceImportProgress: (...args: unknown[]) => mockUseAttendanceImportProgress(...args),
}));

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: (...args: unknown[]) => mockUseDepartments(...args),
}));

vi.mock("~/lib/hooks/useSections", () => ({
	useSections: (...args: unknown[]) => mockUseSections(...args),
}));

vi.mock("~/lib/hooks/usePositions", () => ({
	usePositions: (...args: unknown[]) => mockUsePositions(...args),
}));

vi.mock("~/lib/hooks/useLevels", () => ({
	useLevels: (...args: unknown[]) => mockUseLevels(...args),
}));

vi.mock("~/lib/hooks/useEmployees", () => ({
	useEmployees: (...args: unknown[]) => mockUseEmployees(...args),
}));

vi.mock("~/lib/hooks/usePayrollPeriods", () => ({
	usePayrollPeriods: (...args: unknown[]) => mockUsePayrollPeriods(...args),
}));

vi.mock("~/lib/hooks/useMetrics", () => ({
	useAttendanceMetricsDetailed: (...args: unknown[]) =>
		mockUseAttendanceMetricsDetailed(...args),
	useLeaveBalanceMetrics: (...args: unknown[]) => mockUseLeaveBalanceMetrics(...args),
	queryKeys: {
		metrics: {
			all: ["metrics", "all"],
		},
	},
}));

vi.mock("~/components/atoms/DataTable", () => ({
	DataTable: ({ data, onView, renderActions, emptyMessage }: any) => {
		const firstRow = data?.[0];
		return (
			<div data-testid="attendance-table">
				{firstRow ? (
					<>
						<button type="button" onClick={() => onView?.(firstRow)}>
							Open first record
						</button>
						<div data-testid="attendance-actions">{renderActions?.(firstRow)}</div>
					</>
				) : emptyMessage ? (
					<div>{emptyMessage}</div>
				) : null}
			</div>
		);
	},
}));

vi.mock("~/components/ui/date-picker-range", () => ({
	DatePickerWithRange: () => <div data-testid="date-picker-range" />,
}));

vi.mock("~/components/organisms/shared/GenericImportModal", () => ({
	GenericImportModal: () => null,
}));

vi.mock("~/components/organisms/hr/AttendanceFixModal", () => ({
	AttendanceFixModal: (props: {
		open: boolean;
		attendanceId?: string | null;
		employeeName?: string;
	}) => {
		mockAttendanceFixModal(props);
		return props.open ? <div data-testid="attendance-fix-modal" /> : null;
	},
}));

vi.mock("./AttendanceDailyTrendSection", () => ({
	AttendanceDailyTrendSection: (props: any) => {
		mockAttendanceDailyTrendSection(props);
		return props.visible ? <div data-testid="attendance-daily-trend-section" /> : null;
	},
}));

const { AttendanceManagement } = await import("./attendance-management-template");

function AttendanceSearchProbe() {
	const [params] = useSearchParams();
	return <div data-testid="attendance-search">{params.toString()}</div>;
}

function renderAttendance(path: string) {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route
					path="/hr/attendance"
					element={
						<>
							<AttendanceSearchProbe />
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						</>
					}
				/>
			</Routes>
		</MemoryRouter>,
	);
}

describe("AttendanceManagement", () => {
	beforeEach(() => {
		mockUseNavigate.mockReset();
		mockAttendanceFixModal.mockReset();
		mockAttendanceDailyTrendSection.mockReset();
		mockUseAttendanceMetricsDetailed.mockClear();
		mockUseAuth.mockReturnValue({
			user: {
				organizationId: "org-1",
				role: "hris-hr-user",
				person: {
					organizationId: "org-1",
				},
			},
		});

		mockUseSocket.mockReturnValue({
			socket: null,
			isConnected: false,
		});

		mockUseQueryClient.mockReturnValue({
			invalidateQueries: mockInvalidateQueries,
		});

		mockUseImportAttendance.mockReturnValue({
			mutateAsync: vi.fn(),
		});

		mockUseCreateAttendanceCorrection.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});

		mockUseCreateAttendanceBackfill.mockReturnValue({
			mutateAsync: vi.fn(),
			isPending: false,
		});

		mockUseAttendanceImportProgress.mockReturnValue({
			progress: null,
			isPolling: false,
		});

		mockUseDepartments.mockReturnValue({
			data: {
				departments: [
					{ id: "dept-ops", name: "Operations" },
					{ id: "dept-hr", name: "Human Resources" },
				],
			},
		});

		mockUseSections.mockReturnValue({
			data: {
				sections: [
					{ id: "section-ops", name: "Operations Section", departmentId: "dept-ops" },
					{ id: "section-hr", name: "HR Section", departmentId: "dept-hr" },
				],
			},
		});

		mockUsePositions.mockReturnValue({
			data: {
				positions: [
					{
						id: "position-ops",
						title: "Operations Lead",
						sectionId: "section-ops",
						levels: [{ levelId: "level-ops-1" }],
					},
					{
						id: "position-hr",
						title: "HR Specialist",
						sectionId: "section-hr",
						levels: [{ levelId: "level-hr-1" }],
					},
				],
			},
		});

		mockUseLevels.mockReturnValue({
			data: {
				levels: [
					{ id: "level-ops-1", name: "Level 1", rank: 1 },
					{ id: "level-hr-1", name: "Level 2", rank: 2 },
				],
			},
		});

		mockUseEmployees.mockReturnValue({
			data: {
				data: [],
			},
		});

		mockUsePayrollPeriods.mockReturnValue({
			data: {
				payrollPeriods: [
					{
						id: "payroll-1",
						code: "P-001",
						name: "Payroll Period 1",
						startDate: "2026-06-01",
						endDate: "2026-06-30",
						_count: {
							attendanceObligations: 0,
							timesheets: 0,
						},
					},
				],
			},
		});

		mockUseAttendanceMetricsDetailed.mockReturnValue({
			data: attendanceMetricsResponse,
			isLoading: false,
		});

		mockUseLeaveBalanceMetrics.mockReturnValue({
			data: {
				metrics: {
					leaveBalanceMetrics: {
						employees: [],
					},
				},
			},
			isLoading: false,
		});
	});

	it("applies department, section, position, and level filters to attendance and leave metrics", async () => {
		render(
			<MemoryRouter
				initialEntries={[
					"/hr/attendance?view=list&search=Amina&department=dept-ops&section=section-ops&position=position-ops&level=level-ops-1&manager=manager-1&employee=emp-1&shiftType=DAY",
				]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByTestId("attendance-scope-filter-trigger"));
		expect(screen.getByLabelText("Department filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Section filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Position filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Level filter")).toBeInTheDocument();

		const matchingCall = mockUseAttendanceMetricsDetailed.mock.calls.find(
			(call: unknown[]) =>
				call[4] === "Amina" &&
				call[6] === "dept-ops" &&
				call[7] === "section-ops" &&
				call[8] === "position-ops" &&
				call[9] === "level-ops-1" &&
				call[10] === "manager-1" &&
				call[11] === "emp-1" &&
				call[12] === "DAY",
		);
		expect(matchingCall).to.exist;

		expect(mockUseLeaveBalanceMetrics).toHaveBeenCalledWith(
			expect.objectContaining({
				departmentId: "dept-ops",
				sectionId: "section-ops",
				positionId: "position-ops",
				levelId: "level-ops-1",
				reportToId: "manager-1",
				employeeId: "emp-1",
			}),
			expect.objectContaining({ enabled: true }),
		);
	});

	it("shows clocked-in over employees scheduled to work, not a punch-inflated work-day count", async () => {
		mockUseAttendanceMetricsDetailed.mockReturnValue({
			data: {
				metrics: {
					attendanceObligationDetailed: {
						metrics: {
							...metricsPayload,
							totalClockedIn: 2,
							totalClockedInObligated: 1,
							totalObligatedToWork: 33,
							totalScheduledWorkDays: 33,
							totalOnLeave: 4,
							utilizationRate: 3,
							avgAttendanceRate: 3,
						},
						records: [attendanceRecord],
						dateRange: {
							from: "2026-08-13",
							to: "2026-08-13",
						},
						totalRecords: 1,
						departmentBreakdown: [],
						departmentPreviewRows: [],
					},
				},
			},
			isLoading: false,
		});

		render(
			<MemoryRouter initialEntries={["/hr/attendance"]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("Attendance Utilization")).toBeInTheDocument();
		expect(screen.getAllByText("3%").length).toBe(1);
		expect(screen.getByText("clocked in")).toBeInTheDocument();
		expect(screen.queryByText("utilization rate")).not.toBeInTheDocument();
		expect(screen.getAllByText("of 33 scheduled to work").length).toBeGreaterThan(0);
		expect(screen.getByText("Absenteeism")).toBeInTheDocument();
		expect(screen.queryByText("Leave Balances")).not.toBeInTheDocument();
	});

	it("puts the clock-in rate inside the circle and does not duplicate it", async () => {
		mockUseAttendanceMetricsDetailed.mockReturnValue({
			data: {
				metrics: {
					attendanceObligationDetailed: {
						metrics: {
							...metricsPayload,
							totalClockedIn: 1,
							totalClockedInObligated: 1,
							totalObligatedToWork: 866,
							totalScheduledWorkDays: 866,
							utilizationRate: 0,
							avgAttendanceRate: 0,
						},
						records: [attendanceRecord],
						dateRange: { from: "2026-08-17", to: "2026-08-17" },
						totalRecords: 1,
						departmentBreakdown: [],
						departmentPreviewRows: [],
					},
				},
			},
			isLoading: false,
		});

		render(
			<MemoryRouter initialEntries={["/hr/attendance"]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByText("1%")).toBeInTheDocument();
		expect(screen.getByText("clocked in")).toBeInTheDocument();
		expect(screen.queryByText("<1%")).not.toBeInTheDocument();
		expect(screen.queryByText("utilization rate")).not.toBeInTheDocument();
	});

	it("shows the org filter bar on the default attendance route", async () => {
		render(
			<MemoryRouter initialEntries={["/hr/attendance"]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByTestId("attendance-scope-filter-trigger"));
		expect(screen.getByLabelText("Department filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Section filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Position filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Level filter")).toBeInTheDocument();
	});

	it("opens the clocked-in list from the overview and returns to the attendance route", () => {
		renderAttendance("/hr/attendance");

		expect(screen.queryByTestId("attendance-table")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /^Clocked in/i }));

		expect(screen.getByTestId("attendance-search").textContent).toContain("status=CLOCKED_IN");
		expect(screen.getByTestId("attendance-search").textContent).toContain("view=list");
		expect(screen.getByTestId("attendance-table")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("link", { name: /back to attendance overview/i }));

		expect(screen.getByTestId("attendance-search")).toHaveTextContent("");
		expect(screen.queryByTestId("attendance-table")).not.toBeInTheDocument();
		expect(screen.queryByRole("link", { name: /back to attendance overview/i })).not.toBeInTheDocument();
	});

	it("returns to the attendance overview when the active clocked-in filter is clicked again", () => {
		renderAttendance("/hr/attendance?status=CLOCKED_IN&view=list&page=1");

		expect(screen.getByTestId("attendance-table")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: /^Clocked in/i, pressed: true }));

		expect(screen.getByTestId("attendance-search")).toHaveTextContent("");
		expect(screen.queryByTestId("attendance-table")).not.toBeInTheDocument();
	});

	it("keeps date filters when returning from a clocked-in list", () => {
		renderAttendance("/hr/attendance?status=CLOCKED_IN&view=list&page=1&period=custom&from=2026-08-01&to=2026-08-15");

		fireEvent.click(screen.getByRole("link", { name: /back to attendance overview/i }));

		const search = screen.getByTestId("attendance-search").textContent || "";
		expect(search).toContain("period=custom");
		expect(search).toContain("from=2026-08-01");
		expect(search).toContain("to=2026-08-15");
		expect(search).not.toContain("status=");
		expect(search).not.toContain("view=list");
		expect(screen.queryByTestId("attendance-table")).not.toBeInTheDocument();
	});

	it("shows the Fix Attendance action in the record details modal", async () => {
		render(
			<MemoryRouter initialEntries={["/hr/attendance?view=list"]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
		</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open first record" }));

		const fixButton = await screen.findByRole("button", { name: "Fix Attendance" });
		expect(fixButton).toBeInTheDocument();
		fireEvent.click(fixButton);

		expect(mockAttendanceFixModal).toHaveBeenCalledWith(
			expect.objectContaining({
				open: true,
				attendanceId: "attendance-1",
				employeeName: "Amina Reyes",
			}),
		);
		expect(mockUseNavigate).not.toHaveBeenCalledWith(
			expect.stringContaining("/hr/time-corrections?"),
		);
	}, 20_000);

	it("opens backfill mode for virtual missing-attendance rows", async () => {
		mockUseAttendanceMetricsDetailed.mockImplementation((...args: unknown[]) => {
			const limit = Number(args[2]);
			return {
				data: limit === 1 ? attendanceMetricsResponse : virtualAttendanceMetricsResponse,
				isLoading: false,
			};
		});

		render(
			<MemoryRouter initialEntries={["/hr/attendance?view=list"]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
		</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open first record" }));

		const fixButton = await screen.findByRole("button", { name: "Fix Attendance" });
		fireEvent.click(fixButton);

		expect(mockAttendanceFixModal).toHaveBeenCalledWith(
			expect.objectContaining({
				open: true,
				attendanceId: null,
				employeeName: "Amina Reyes",
			}),
		);
		expect(mockUseNavigate).not.toHaveBeenCalledWith(
			expect.stringContaining("/hr/time-corrections?"),
		);
	}, 20_000);

	it("shows the embedded daily trend section for HR managers", async () => {
		mockUseAuth.mockReturnValue({
			user: {
				organizationId: "org-1",
				role: "hris-hr-manager",
				person: {
					organizationId: "org-1",
				},
			},
		});

		render(
			<MemoryRouter initialEntries={["/hr/attendance"]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByTestId("attendance-daily-trend-section")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("attendance-scope-filter-trigger"));
		expect(screen.getByLabelText("Department filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Section filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Position filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Level filter")).toBeInTheDocument();

		const latestCall = mockAttendanceDailyTrendSection.mock.calls.at(-1)?.[0];
		expect(latestCall?.title).toBe("Last 7 Days Trend by Department");
		expect(latestCall?.orgFilterControls).toBeUndefined();
	});

	it("renders the relocated org filters in the top filter bar for HR managers", async () => {
		mockUseAuth.mockReturnValue({
			user: {
				organizationId: "org-1",
				role: "hris-hr-manager",
				person: {
					organizationId: "org-1",
				},
			},
		});

		render(
			<MemoryRouter
				initialEntries={[
					"/hr/attendance?department=dept-ops&section=section-ops&position=position-ops&level=level-ops-1",
				]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getByTestId("attendance-daily-trend-section")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("attendance-scope-filter-trigger"));
		expect(screen.getByLabelText("Department filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Section filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Position filter")).toBeInTheDocument();
		expect(screen.getByLabelText("Level filter")).toBeInTheDocument();

		const latestCall = mockAttendanceDailyTrendSection.mock.calls.at(-1)?.[0];
		expect(latestCall?.title).toBe("Last 7 Days Trend by Department");
		expect(latestCall?.orgFilterControls).toBeUndefined();
	});

	it("keeps the embedded daily trend section hidden for HR users", async () => {
		mockUseAuth.mockReturnValue({
			user: {
				organizationId: "org-1",
				role: "hris-hr-user",
				person: {
					organizationId: "org-1",
				},
			},
		});

		render(
			<MemoryRouter initialEntries={["/hr/attendance"]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.queryByTestId("attendance-daily-trend-section")).not.toBeInTheDocument();
	});

	it("rolls a multi-day employee preview into one period total row", () => {
		const zenRollup = {
			...attendanceRecord,
			id: "period-rollup-zen",
			employeeRefId: "emp-zen",
			employeeId: "00010",
			employeeName: "Zen Andrei",
			departmentId: "dept-gahr",
			departmentName: "GA/HR",
			isPeriodRollup: true,
			periodTotals: {
				scheduled: 14,
				present: 5,
				late: 3,
				undertime: 1,
				absent: 9,
				onTime: 2,
			},
		};

		mockUseAttendanceMetricsDetailed.mockReturnValue({
			data: {
				metrics: {
					attendanceObligationDetailed: {
						metrics: {
							...metricsPayload,
							totalClockedIn: 121,
							totalClockedInObligated: 121,
							totalObligatedToWork: 11249,
							totalScheduledWorkDays: 11249,
							totalLate: 59,
							totalEarlyOut: 14,
						},
						records: [],
						dateRange: { from: "2026-08-11", to: "2026-08-25" },
						totalRecords: 12989,
						departmentBreakdown: [
							{
								departmentId: "dept-gahr",
								departmentName: "GA/HR",
								totalRecords: 14,
								employeeCount: 1,
								scheduled: 14,
								present: 5,
								late: 3,
								undertime: 1,
								absent: 9,
								leave: 0,
								missing: 9,
								overtimeHours: 0,
							},
						],
						departmentPreviewRows: [
							{
								departmentId: "dept-gahr",
								departmentName: "GA/HR",
								rows: [zenRollup],
							},
						],
					},
				},
			},
			isLoading: false,
		});

		render(
			<MemoryRouter initialEntries={["/hr/attendance"]}>
				<Routes>
					<Route
						path="/hr/attendance"
						element={
							<AttendanceManagement
								title="Attendance Overview"
								description="View, manage and import attendance records"
							/>
						}
					/>
				</Routes>
			</MemoryRouter>,
		);

		expect(screen.getAllByText("Zen Andrei")).to.have.length(1);
		expect(screen.getByText("period total")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "View days" })).toBeInTheDocument();
		expect(screen.getByText("Showing 1 of 1 employees")).toBeInTheDocument();
	});

	describe("Employee-day present threshold", () => {
		it("binds the threshold parameter to the URL when toggled", async () => {
			mockUseAttendanceMetricsDetailed.mockReturnValue({
				data: attendanceMetricsResponse,
				isLoading: false,
			});
			render(
				<MemoryRouter initialEntries={["/hr/attendance?view=list"]}>
					<Routes>
						<Route path="/hr/attendance" element={<AttendanceManagement title="Attendance Overview" description="View, manage and import attendance records" />} />
					</Routes>
				</MemoryRouter>,
			);
			
			// Open popover
			fireEvent.click(screen.getByTestId("attendance-scope-filter-trigger"));
			
			// Toggle switch
			const toggleSwitch = screen.getByRole("switch", { name: "Present > 10 days" });
			fireEvent.click(toggleSwitch);
			
			// Expect URL to have presentGt10Days=1 (mockUseAttendanceMetricsDetailed will be called with limit 10000 upon re-render)
			// Wait for the re-render and check if the badge shows 1 active filter
			expect(screen.getByTestId("active-filter-badge")).toHaveTextContent("1");
		});

		it("keeps the threshold toggle active from the deep link", () => {
			mockUseAttendanceMetricsDetailed.mockReturnValue({
				data: attendanceMetricsResponse,
				isLoading: false,
			});
			render(
				<MemoryRouter initialEntries={["/hr/attendance?view=list&presentGt10Days=1"]}>
					<Routes>
						<Route path="/hr/attendance" element={<AttendanceManagement title="Attendance Overview" description="View, manage and import attendance records" />} />
					</Routes>
				</MemoryRouter>,
			);
			
			// Badge should say 1 without opening popover
			expect(screen.getByTestId("active-filter-badge")).toHaveTextContent("1");
		});

		it("shows an empty state when no employees clear the threshold", async () => {
			mockUseAttendanceMetricsDetailed.mockReturnValue({
				data: {
					...attendanceMetricsResponse,
					metrics: {
						...attendanceMetricsResponse.metrics,
						attendanceObligationDetailed: {
							...attendanceMetricsResponse.metrics.attendanceObligationDetailed,
							records: [],
						}
					}
				}, // Empty state
				isLoading: false,
			});
			render(
				<MemoryRouter initialEntries={["/hr/attendance?view=list&presentGt10Days=1"]}>
					<Routes>
						<Route path="/hr/attendance" element={<AttendanceManagement title="Attendance Overview" description="View, manage and import attendance records" />} />
					</Routes>
				</MemoryRouter>,
			);
			
			expect(await screen.findByText(/No attendance records found/i)).toBeInTheDocument();
		});

		it("clears the threshold flag when clear-all is triggered", () => {
			mockUseAttendanceMetricsDetailed.mockReturnValue({
				data: attendanceMetricsResponse,
				isLoading: false,
			});
			render(
				<MemoryRouter initialEntries={["/hr/attendance?view=list&presentGt10Days=1"]}>
					<Routes>
						<Route path="/hr/attendance" element={<AttendanceManagement title="Attendance Overview" description="View, manage and import attendance records" />} />
					</Routes>
				</MemoryRouter>,
			);
			
			// Open popover
			fireEvent.click(screen.getByTestId("attendance-scope-filter-trigger"));
			
			const clearButton = screen.getByRole("button", { name: /Clear all filters/i });
			fireEvent.click(clearButton);
			
			// The badge should disappear because no active filters
			expect(screen.queryByTestId("active-filter-badge")).not.toBeInTheDocument();
		});
		
		it("widens the fetch limit when threshold is active to prevent page-slice undercounting", () => {
			mockUseAttendanceMetricsDetailed.mockReturnValue({
				data: attendanceMetricsResponse,
				isLoading: false,
			});
			render(
				<MemoryRouter initialEntries={["/hr/attendance?view=list&presentGt10Days=1"]}>
					<Routes>
						<Route path="/hr/attendance" element={<AttendanceManagement title="Attendance Overview" description="View, manage and import attendance records" />} />
					</Routes>
				</MemoryRouter>,
			);
			
			// The useAttendanceMetricsDetailed hook should be called with limit=10000
			const hasWidenLimitCall = mockUseAttendanceMetricsDetailed.mock.calls.some(
				(call: unknown[]) => call[2] === 10000
			);
			expect(hasWidenLimitCall).toBe(true);
		});
	});

	it("shows Hikvision UTC punches as Manila clock like Device Events", () => {
		const timeIn = "2026-08-17T05:40:36.000Z";
		expect(formatManilaClockTime(timeIn)).toBe("1:40 PM");
		expect(formatManilaClockTime(timeIn)).not.toBe("5:40 AM");
		expect(
			getClockInArrivalIndicator({
				timeIn,
				status: "INCOMPLETE",
				primaryMarker: "HOURS",
				lateHours: "0:00",
				scheduleSnapshot: {
					startTime: "08:00",
					endTime: "17:00",
					graceLateMinutes: 0,
					timeSlots: [{ type: "work", startTime: "08:00", endTime: "17:00" }],
				},
			})?.kind,
		).toBe("LATE");
	});
});


