// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import Approvals from "./approvals";
import type { ApprovedEditedDaysSummary, Timesheet } from "~/services/timesheet.service";
import type { Request } from "~/services/requests.service";

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
			role: "employee",
			metadata: {
				employee: { id: "manager-1" },
			},
		},
	}),
}));

vi.mock("~/components/molecules/RequestReviewModal", () => ({
	RequestReviewModal: () => null,
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

const timesheetRequest = {
	id: "req-1",
	code: "REQ-001",
	type: "TIMESHEET",
	currentWorkflowStateKey: "SUBMITTED",
	metadata: {
		timesheetAction: "SUBMISSION",
		timesheetId: "ts-1",
	},
	requester: {
		id: "emp-1",
		employeeId: "E001",
		person: {
			personalInfo: {
				firstName: "Jane",
				lastName: "Doe",
			},
		},
	},
	currentStepExecution: {
		id: "step-1",
		stepType: "APPROVAL",
		assigneeType: "MANAGER",
		assignee: { id: "manager-1" },
		assigneeId: "manager-1",
	},
} as unknown as Request;

const useTimesheetMock = vi.hoisted(() => vi.fn());
const useRequestsMock = vi.hoisted(() => vi.fn());
const useRequestMock = vi.hoisted(() => vi.fn());

vi.mock("~/lib/hooks/useTimesheets", () => ({
	useTimesheet: (...args: unknown[]) => useTimesheetMock(...args),
	useUpdateTimesheet: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("~/lib/hooks/useRequests", () => ({
	useRequests: (...args: unknown[]) => useRequestsMock(...args),
	useRequest: (...args: unknown[]) => useRequestMock(...args),
	useApproveRequest: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderApprovalsPage(initialEntry: string) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});

	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={[initialEntry]}>
				<Approvals />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("Manager approvals timesheet review modal wiring", () => {
	beforeEach(() => {
		timesheetViewModalMock.mockClear();
		useTimesheetMock.mockReturnValue({
			data: activeTimesheet,
			isLoading: false,
		});
		useRequestsMock.mockReturnValue({
			data: { requests: [timesheetRequest], pagination: { total: 1, page: 1, limit: 10, totalPages: 1 } },
			isLoading: false,
		});
		useRequestMock.mockReturnValue({
			data: timesheetRequest,
			isLoading: false,
		});
	});

	it("forwards approvedEditedDaysSummary into TimesheetViewModal during timesheet review", () => {
		renderApprovalsPage(
			"/employee/approvals/requests?action=timesheet.review&id=req-1",
		);

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
			approvalMode?: boolean;
			approvedEditedDaysSummary?: ApprovedEditedDaysSummary;
			isOpen?: boolean;
			timesheet?: Timesheet;
		};

		expect(modalProps?.isOpen).toBe(true);
		expect(modalProps?.approvalMode).toBe(true);
		expect(modalProps?.timesheet?.id).toBe("ts-1");
		expect(modalProps?.approvedEditedDaysSummary).toEqual(approvedEditedDaysSummary);
	});
});
