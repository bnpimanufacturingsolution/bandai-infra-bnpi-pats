// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getCompensatoryLeaveCredit, TimesheetViewModal } from "./TimesheetViewModal";
import { renderWithProviders } from "~/test/render";
import type { ApprovedEditedDaysSummary, Timesheet } from "~/services/timesheet.service";

vi.mock("react-router", async () => {
	const actual = await vi.importActual<typeof import("react-router")>("react-router");
	return {
		...actual,
		useNavigate: () => vi.fn(),
	};
});

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({
		user: {
			role: "hris-hr-manager",
			metadata: { employee: { id: "hr-1" } },
		},
	}),
}));

vi.mock("~/lib/hooks/useTimesheets", () => ({
	useNormalizeTimesheetBreakdownPreview: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

vi.mock("~/lib/hooks/useSchedules", () => ({
	useEmployeeScheduleCalendar: () => ({
		data: undefined,
		isLoading: false,
		isFetching: false,
	}),
}));

vi.mock("./TimesheetView", () => ({
	TimesheetView: ({ belowSummaryContent }: { belowSummaryContent?: React.ReactNode }) => (
		<div data-testid="timesheet-view">{belowSummaryContent}</div>
	),
}));

const timesheetCalendarApprovalMock = vi.hoisted(() =>
	vi.fn(({ breakdown }: { breakdown?: unknown[] }) => (
		<div data-testid="timesheet-calendar-approval" data-breakdown-length={breakdown?.length ?? 0} />
	)),
);

vi.mock("~/components/molecules/TimesheetCalendarApproval", () => ({
	TimesheetCalendarApproval: (props: { breakdown?: unknown[] }) =>
		timesheetCalendarApprovalMock(props),
	checkAllDaysReviewed: () => true,
	checkHasRejectedDays: () => false,
}));

vi.mock("~/components/molecules/TimesheetEmployeeCard", () => ({
	TimesheetEmployeeCard: () => <div data-testid="employee-card" />,
}));

vi.mock("~/components/molecules/TimesheetHoursOverview", () => ({
	TimesheetHoursOverview: () => <div data-testid="hours-overview" />,
}));

const baseCredit = {
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

const withCredit = (credit: Record<string, unknown>): Timesheet =>
	({
		metadata: { compensatoryLeaveCredit: credit },
	}) as unknown as Timesheet;

describe("getCompensatoryLeaveCredit", () => {
	it("returns the credit summary when the credit was actually applied", () => {
		const result = getCompensatoryLeaveCredit(withCredit({ ...baseCredit, creditApplied: true }));

		expect(result).toEqual({
			totalMinutes: 120,
			totalDays: 0.25,
			lineCount: 1,
			creditedAt: "2026-06-25T00:00:00.000Z",
			creditApplied: true,
			skipReason: undefined,
		});
	});

	it("treats legacy records without a creditApplied flag as applied (backward compatible)", () => {
		const result = getCompensatoryLeaveCredit(withCredit(baseCredit));

		expect(result).not.toBeNull();
		expect(result?.totalMinutes).toBe(120);
	});

	it("returns the skipped state instead of null when the backend explicitly skipped crediting", () => {
		const result = getCompensatoryLeaveCredit(
			withCredit({ ...baseCredit, creditApplied: false, skipReason: "NO_COMPENSATORY_LEAVE_POLICY" }),
		);

		expect(result).not.toBeNull();
		expect(result?.creditApplied).toBe(false);
		expect(result?.skipReason).toBe("NO_COMPENSATORY_LEAVE_POLICY");
	});

	it("returns null when there is no compensatory leave credit metadata at all", () => {
		expect(getCompensatoryLeaveCredit({ metadata: {} } as unknown as Timesheet)).toBeNull();
		expect(getCompensatoryLeaveCredit(null)).toBeNull();
	});

	it("returns null when there is no overtime (totalMinutes is 0), avoiding empty banners on regular timesheets", () => {
		const result = getCompensatoryLeaveCredit(
			withCredit({ ...baseCredit, totalMinutes: 0, lineCount: 0, creditApplied: false }),
		);
		expect(result).toBeNull();
	});
});

const approvedEditedDaysSummary: ApprovedEditedDaysSummary = {
	total: 1,
	items: [
		{
			entryId: "entry-1",
			timesheetId: "ts-1",
			date: "2026-06-15",
			periodLabel: "June 2026",
			sourcePeriodType: "PAST",
			approvedAt: "2026-06-20T10:00:00.000Z",
			changeType: "TIME",
			isManualEdit: true,
			changedFields: [
				{
					field: "hoursWorked",
					label: "Hours worked",
					before: "7:00",
					after: "8:00",
				},
			],
			dayPreview: {
				timeIn: "2026-06-15T09:00:00.000Z",
				timeOut: "2026-06-15T18:00:00.000Z",
				status: "PRESENT",
				hoursWorked: "8:00",
				regularHours: "8:00",
				overtimeHours: "0:00",
				undertimeHours: "0:00",
				lateHours: "0:00",
				earlyOutHours: "0:00",
				employeeNotes: null,
				approverNotes: null,
			},
		},
	],
};

const timesheetWithBreakdown = {
	id: "ts-1",
	code: "TS-001",
	organizationId: "org-1",
	employeeId: "emp-1",
	payrollPeriodId: "period-1",
	status: "SUBMITTED",
	isDeleted: false,
	createdAt: "2026-06-01T00:00:00.000Z",
	updatedAt: "2026-06-20T10:00:00.000Z",
	payrollPeriod: {
		id: "period-1",
		code: "2026-06",
		name: "June 2026",
		startDate: "2026-06-01",
		endDate: "2026-06-30",
		payDate: "2026-07-05",
		status: "OPEN",
	},
	breakdown: [
		{
			date: "2026-06-15",
			timeIn: "2026-06-15T09:00:00.000Z",
			timeOut: "2026-06-15T18:00:00.000Z",
			hoursWorked: "8:00",
			regularHours: "8:00",
			overtimeHours: "0:00",
			undertimeHours: "0:00",
			lateHours: "0:00",
			earlyOutHours: "0:00",
			status: "PRESENT",
			approvalStatus: "SUBMITTED",
			employeeNotes: null,
			approverNotes: null,
		},
	],
} as unknown as Timesheet;

describe("TimesheetViewModal approved edited days", () => {
	it("renders Recent Modified Days when approvedEditedDaysSummary is provided", () => {
		renderWithProviders(
			<TimesheetViewModal
				isOpen={true}
				onClose={() => {}}
				timesheet={timesheetWithBreakdown}
				approvedEditedDaysSummary={approvedEditedDaysSummary}
			/>,
		);

		expect(screen.getByText("Recent Modified Days")).toBeInTheDocument();
		expect(screen.getByText(/June 2026/)).toBeInTheDocument();
		expect(screen.getByText("15")).toBeInTheDocument();
	});

	it("renders Recent Modified Days in approval mode from approvedEditedDaysSummary", () => {
		renderWithProviders(
			<TimesheetViewModal
				isOpen={true}
				onClose={() => {}}
				timesheet={{
					...timesheetWithBreakdown,
					employee: {
						id: "emp-1",
						person: {
							personalInfo: {
								firstName: "Jane",
								lastName: "Doe",
							},
						},
					},
				}}
				approvalMode={true}
				approvedEditedDaysSummary={approvedEditedDaysSummary}
				onApprove={() => {}}
				onReject={() => {}}
			/>,
		);

		expect(screen.getByText("Recent Modified Days")).toBeInTheDocument();
		expect(screen.getByText("15")).toBeInTheDocument();
	});

	it("passes visibleBreakdown to TimesheetCalendarApproval in approval mode", () => {
		timesheetCalendarApprovalMock.mockClear();

		renderWithProviders(
			<TimesheetViewModal
				isOpen={true}
				onClose={() => {}}
				timesheet={{
					...timesheetWithBreakdown,
					employee: {
						id: "emp-1",
						person: {
							personalInfo: {
								firstName: "Jane",
								lastName: "Doe",
							},
						},
					},
				}}
				approvalMode={true}
				onApprove={() => {}}
				onReject={() => {}}
			/>,
		);

		expect(timesheetCalendarApprovalMock).toHaveBeenCalled();
		const calendarProps = timesheetCalendarApprovalMock.mock.calls.at(-1)?.[0] as {
			breakdown?: Array<{ hoursWorked?: string }>;
		};
		expect(calendarProps?.breakdown?.[0]?.hoursWorked).toBe("8:00");
	});

	it("prefers breakdown revisionSummary over approvedEditedDaysSummary in approval mode", () => {
		renderWithProviders(
			<TimesheetViewModal
				isOpen={true}
				onClose={() => {}}
				timesheet={{
					...timesheetWithBreakdown,
					breakdown: [
						{
							...timesheetWithBreakdown.breakdown[0],
							date: "2026-06-15",
							businessDate: "2026-06-15",
							hoursWorked: "9:00",
							revisionSummary: {
								isModified: true,
								isManualEdit: true,
								lineId: "line-rev-1",
								previousLineId: "line-prev-1",
								revisionNo: 2,
								ledgerType: "CORRECTION",
								editedAt: "2026-06-20T12:00:00.000Z",
								editedBy: "emp-1",
								editReason: null,
								changeType: "TIME",
								changedFields: [
									{
										field: "hoursWorked",
										label: "Hours worked",
										before: "8:00",
										after: "9:00",
									},
								],
							},
						},
					],
					employee: {
						id: "emp-1",
						person: {
							personalInfo: {
								firstName: "Jane",
								lastName: "Doe",
							},
						},
					},
				}}
				approvalMode={true}
				approvedEditedDaysSummary={{
					total: 1,
					items: [
						{
							entryId: "wrong-entry",
							timesheetId: "ts-1",
							date: "2026-07-13",
							periodLabel: "CORRECTION",
							sourcePeriodType: "PAST",
							approvedAt: "2026-07-06T10:00:00.000Z",
							changeType: "STATUS",
							dayPreview: {
								timeIn: null,
								timeOut: null,
								status: "ABSENT",
								hoursWorked: "0:00",
								regularHours: "0:00",
								overtimeHours: "0:00",
								undertimeHours: "0:00",
								lateHours: "0:00",
								earlyOutHours: "0:00",
								employeeNotes: null,
								approverNotes: null,
							},
						},
					],
				}}
				onApprove={() => {}}
				onReject={() => {}}
			/>,
		);

		expect(screen.getByText("Recent Modified Days")).toBeInTheDocument();
		expect(screen.getByText("15")).toBeInTheDocument();
		expect(screen.queryByText("13")).not.toBeInTheDocument();
	});

	it("renders revision changedFields in approval mode from breakdown revisionSummary", async () => {
		const user = userEvent.setup();
		const baseBreakdownDay = timesheetWithBreakdown.breakdown?.[0];
		if (!baseBreakdownDay) {
			throw new Error("Expected base breakdown day");
		}
		renderWithProviders(
			<TimesheetViewModal
				isOpen={true}
				onClose={() => {}}
				timesheet={{
					...timesheetWithBreakdown,
					breakdown: [
						{
							...baseBreakdownDay,
							timeIn: "2026-06-15T10:00:00.000Z",
							timeOut: "2026-06-15T19:00:00.000Z",
							hoursWorked: "9:00",
							revisionSummary: {
								isModified: true,
								isManualEdit: true,
								lineId: "line-rev-1",
								previousLineId: "line-prev-1",
								revisionNo: 2,
								ledgerType: "CORRECTION",
								editedAt: "2026-06-20T12:00:00.000Z",
								editedBy: "emp-1",
								editReason: "Corrected clock-in",
								changeType: "TIME",
								changedFields: [
									{
										field: "timeIn",
										label: "Time in",
										before: "2026-06-15T09:00:00.000Z",
										after: "2026-06-15T10:00:00.000Z",
									},
								],
							},
						},
					],
					employee: {
						id: "emp-1",
						person: {
							personalInfo: {
								firstName: "Jane",
								lastName: "Doe",
							},
						},
					},
				}}
				approvalMode={true}
				onApprove={() => {}}
				onReject={() => {}}
			/>,
		);

		expect(screen.getByText("Recent Modified Days")).toBeInTheDocument();
		expect(screen.getByText("15")).toBeInTheDocument();
		expect(screen.getByText("9h 0m")).toBeInTheDocument();
		expect(screen.getByText("Type:").parentElement).toHaveTextContent("Time");

		const dayButton = screen.getByText("15").closest('[role="button"]');
		if (dayButton) {
			await user.hover(dayButton);
		}
		expect(await screen.findByText("Time in")).toBeInTheDocument();
	});

	it("prioritizes meaningful edited days over spurious later-date revisions in approval mode", () => {
		const buildRevisionDay = (date: string, hoursWorked: string) => ({
			date,
			businessDate: date,
			timeIn: `${date}T09:00:00.000Z`,
			timeOut: `${date}T18:00:00.000Z`,
			hoursWorked,
			regularHours: hoursWorked,
			overtimeHours: "0:00",
			undertimeHours: "0:00",
			lateHours: "0:00",
			earlyOutHours: "0:00",
			status: "PRESENT",
			revisionSummary: {
				isModified: true,
				isManualEdit: true,
				lineId: `line-${date}`,
				previousLineId: `line-prev-${date}`,
				revisionNo: 2,
				ledgerType: "CORRECTION",
				editedAt: "2026-07-06T10:00:00.000Z",
				editedBy: "emp-1",
				editReason: null,
				changeType: "TIME" as const,
				changedFields: [
					{
						field: "hoursWorked",
						label: "Hours worked",
						before: "0:00",
						after: hoursWorked,
					},
				],
			},
		});

		renderWithProviders(
			<TimesheetViewModal
				isOpen={true}
				onClose={() => {}}
				timesheet={{
					...timesheetWithBreakdown,
					id: "ts-1",
					payrollPeriod: {
						id: "period-july",
						code: "2026-07",
						name: "July 2026",
						startDate: "2026-07-01",
						endDate: "2026-07-31",
						payDate: "2026-08-05",
						status: "OPEN",
					},
					breakdown: [
						buildRevisionDay("2026-07-01", "8:00"),
						buildRevisionDay("2026-07-02", "9:00"),
						{
							date: "2026-07-13",
							businessDate: "2026-07-13",
							hoursWorked: "0:00",
							regularHours: "0:00",
							overtimeHours: "0:00",
							undertimeHours: "0:00",
							lateHours: "0:00",
							earlyOutHours: "0:00",
							status: "ABSENT",
							revisionSummary: {
								isModified: true,
								lineId: "line-13",
								previousLineId: "line-prev-13",
								revisionNo: 2,
								ledgerType: "CORRECTION",
								editedAt: "2026-07-06T10:00:00.000Z",
								editedBy: "emp-1",
								editReason: null,
								changeType: "MIXED" as const,
								changedFields: [
									{
										field: "breakDisplay",
										label: "Break label",
										before: null,
										after: "No break",
									},
								],
							},
						},
					],
					employee: {
						id: "emp-1",
						person: {
							personalInfo: {
								firstName: "Jane",
								lastName: "Doe",
							},
						},
					},
				}}
				approvalMode={true}
				onApprove={() => {}}
				onReject={() => {}}
			/>,
		);

		expect(screen.getByText("1")).toBeInTheDocument();
		expect(screen.getByText("2")).toBeInTheDocument();
		expect(screen.queryByText("13")).not.toBeInTheDocument();
	});

	it("hides Recent Modified Days when approvedEditedDaysSummary items are not manual edits", () => {
		renderWithProviders(
			<TimesheetViewModal
				isOpen={true}
				onClose={() => {}}
				timesheet={timesheetWithBreakdown}
				approvedEditedDaysSummary={{
					total: 1,
					items: [
						{
							entryId: "auto-entry",
							timesheetId: "ts-1",
							date: "2026-07-13",
							periodLabel: "CORRECTION",
							sourcePeriodType: "PAST",
							approvedAt: "2026-07-06T10:00:00.000Z",
							changeType: "STATUS",
							changedFields: [
								{
									field: "status",
									label: "Status",
									before: "NOT_CLOCKED_IN",
									after: "ABSENT",
								},
							],
							dayPreview: {
								timeIn: null,
								timeOut: null,
								status: "ABSENT",
								hoursWorked: "0:00",
								regularHours: "0:00",
								overtimeHours: "0:00",
								undertimeHours: "0:00",
								lateHours: "0:00",
								earlyOutHours: "0:00",
								employeeNotes: null,
								approverNotes: null,
							},
						},
					],
				}}
			/>,
		);

		expect(screen.queryByText("Recent Modified Days")).not.toBeInTheDocument();
	});

	it("hides Recent Modified Days when only automatic revisions exist", () => {
		renderWithProviders(
			<TimesheetViewModal
				isOpen={true}
				onClose={() => {}}
				timesheet={{
					...timesheetWithBreakdown,
					id: "ts-1",
					breakdown: [
						{
							date: "2026-07-13",
							businessDate: "2026-07-13",
							hoursWorked: "0:00",
							regularHours: "0:00",
							overtimeHours: "0:00",
							undertimeHours: "0:00",
							lateHours: "0:00",
							earlyOutHours: "0:00",
							status: "ABSENT",
							revisionSummary: {
								isModified: true,
								lineId: "line-auto-13",
								previousLineId: "line-prev-13",
								revisionNo: 2,
								ledgerType: "CORRECTION",
								editedAt: "2026-07-06T10:00:00.000Z",
								editedBy: "emp-1",
								editReason: null,
								changeType: "MIXED",
								changedFields: [
									{
										field: "status",
										label: "Status",
										before: "NOT_CLOCKED_IN",
										after: "ABSENT",
									},
								],
							},
						},
					],
					employee: {
						id: "emp-1",
						person: {
							personalInfo: {
								firstName: "Jane",
								lastName: "Doe",
							},
						},
					},
				}}
				approvalMode={true}
				onApprove={() => {}}
				onReject={() => {}}
			/>,
		);

		expect(screen.queryByText("Recent Modified Days")).not.toBeInTheDocument();
	});
});
