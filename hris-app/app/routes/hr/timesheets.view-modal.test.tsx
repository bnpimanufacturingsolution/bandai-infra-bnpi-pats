// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import TimesheetsPage from "./timesheets";
import type { ApprovedEditedDaysSummary, Timesheet } from "~/services/timesheet.service";

function renderTimesheetsPage(initialEntry: string) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={[initialEntry]}>
				<TimesheetsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

const timesheetViewModalMock = vi.hoisted(() =>
	vi.fn((props: Record<string, unknown>) => (
		<div data-testid="timesheet-view-modal">{props.isOpen ? "open" : "closed"}</div>
	)),
);

vi.mock("~/components/organisms/TimesheetViewModal", () => ({
	TimesheetViewModal: (props: Record<string, unknown>) => timesheetViewModalMock(props),
}));

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => ({
		user: {
			metadata: { employee: { id: "hr-1" } },
		},
	}),
}));

vi.mock("~/lib/hooks/useMetrics", () => ({
	useTimesheetStatistics: () => ({ data: undefined }),
}));

vi.mock("~/lib/hooks/usePayrollPeriods", () => ({
	usePayrollPeriods: () => ({
		data: {
			payrollPeriods: [
				{
					id: "period-1",
					code: "2026-06",
					name: "June 2026",
					startDate: "2026-06-01",
					endDate: "2026-06-30",
				},
			],
		},
	}),
}));

vi.mock("~/lib/hooks/useDepartments", () => ({
	useDepartments: () => ({ data: { departments: [] } }),
}));

vi.mock("~/lib/hooks/useSections", () => ({
	useSections: () => ({ data: { sections: [] } }),
}));

vi.mock("~/lib/hooks", () => ({
	useEmployees: () => ({ data: { employees: [] } }),
}));

vi.mock("~/components/molecules/EmployeeTableCell", () => ({
	EmployeeTableCell: () => <span>Employee</span>,
}));

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

const activeTimesheet = {
	id: "ts-1",
	code: "TS-001",
	organizationId: "org-1",
	employeeId: "emp-1",
	payrollPeriodId: "period-1",
	status: "SUBMITTED",
	isDeleted: false,
	createdAt: "2026-06-01T00:00:00.000Z",
	updatedAt: "2026-06-20T10:00:00.000Z",
	approvedEditedDaysSummary,
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

const useTimesheetMock = vi.hoisted(() => vi.fn());
const useTimesheetsMock = vi.hoisted(() => vi.fn());
const useHRTimesheetQueuesMock = vi.hoisted(() => vi.fn());

vi.mock("~/lib/hooks/useTimesheets", () => ({
	TIMESHEET_LIST_FIELDS: [],
	useTimesheets: (...args: unknown[]) => useTimesheetsMock(...args),
	useTimesheet: (...args: unknown[]) => useTimesheetMock(...args),
	useHRTimesheetQueues: (...args: unknown[]) => useHRTimesheetQueuesMock(...args),
	useLockPeriodTimesheets: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useSendTimesheetReminder: () => ({ mutate: vi.fn(), isPending: false }),
	useEnsurePeriodDrafts: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe("HR timesheets view modal wiring", () => {
	beforeEach(() => {
		timesheetViewModalMock.mockClear();
		useTimesheetMock.mockReturnValue({
			data: activeTimesheet,
			isLoading: false,
		});
		useTimesheetsMock.mockReturnValue({
			data: { timesheets: [], pagination: { total: 0, page: 1, limit: 10, totalPages: 0 } },
			isLoading: false,
		});
		useHRTimesheetQueuesMock.mockReturnValue({
			data: {
				timesheetSummary: {
					total: 0,
					draft: 0,
					submitted: 0,
					approved: 0,
					correction: 0,
				},
				timesheetQueues: {
					draft: { timesheets: [], count: 0 },
					submitted: { timesheets: [], count: 0 },
					correction: { timesheets: [], count: 0 },
					approved: { timesheets: [], count: 0 },
				},
			},
			isLoading: false,
		});
	});

	it("forwards approvedEditedDaysSummary from useTimesheet into TimesheetViewModal", () => {
		renderTimesheetsPage("/hr/timesheets?tab=active&action=view&id=ts-1");

		expect(useTimesheetMock).toHaveBeenCalledWith(
			"ts-1",
			expect.objectContaining({
				enabled: true,
				staleTime: 0,
				refetchOnMount: "always",
			}),
		);
		expect(screen.getByTestId("timesheet-view-modal")).toHaveTextContent("open");

		const modalProps = timesheetViewModalMock.mock.calls.at(-1)?.[0] as {
			approvedEditedDaysSummary?: ApprovedEditedDaysSummary;
			isOpen?: boolean;
			timesheet?: Timesheet;
		};

		expect(modalProps?.isOpen).toBe(true);
		expect(modalProps?.timesheet?.id).toBe("ts-1");
		expect(modalProps?.approvedEditedDaysSummary).toEqual(approvedEditedDaysSummary);
	});
});
