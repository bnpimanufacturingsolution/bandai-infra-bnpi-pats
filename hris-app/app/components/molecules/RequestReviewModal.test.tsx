// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestReviewModal } from "./RequestReviewModal";

const mockUseAuth = vi.fn();
const mockUseRequest = vi.fn();

vi.mock("~/lib/hooks/use-auth", () => ({
	useAuth: () => mockUseAuth(),
}));

vi.mock("~/lib/hooks/useRequests", () => ({
	useRequest: (...args: unknown[]) => mockUseRequest(...args),
}));

vi.mock("~/components/molecules/EmployeeTableCell", () => ({
	EmployeeTableCell: ({
		fullName,
		employeeId,
		profileId,
		avatar,
	}: {
		fullName?: string;
		employeeId?: string;
		profileId?: string | null;
		avatar?: string | null;
	}) => (
		<div data-testid="employee-profile-link" data-profile-id={profileId || ""}>
			{avatar !== undefined ? <span data-testid="employee-avatar" /> : null}
			{fullName || "Unknown Employee"} ({employeeId || "N/A"})
		</div>
	),
}));

const baseAttendanceCorrectionRequest = {
	id: "req-attendance-1",
	organizationId: "org-1",
	requesterId: "emp-requester-1",
	requester: {
		id: "emp-requester-1",
		employeeId: "EMP-001",
		person: {
			personalInfo: {
				firstName: "Ari",
				lastName: "Tan",
			},
		},
	},
	type: "ATTENDANCE_CORRECTION" as const,
	currentWorkflowStateKey: "SUBMITTED",
	startDate: "2026-06-25",
	endDate: "2026-06-25",
	description: "Correct missed punch",
	attachments: [],
	metadata: {
		date: "2026-06-25",
		adjustmentType: "MISSED_PUNCH",
		timeIn: "08:15",
		timeOut: "17:10",
		reason: "Forgot to clock out",
	},
	createdAt: "2026-06-25T08:00:00.000Z",
	updatedAt: "2026-06-25T08:00:00.000Z",
	currentStepExecution: {
		id: "step-1",
		stepName: "HR Review",
		stepType: "APPROVAL" as const,
		assigneeType: "HR" as const,
		status: "PENDING" as const,
		assigneeId: null,
		assignee: {
			id: "emp-hr-1",
			employeeId: "HR-001",
			person: {
				personalInfo: {
					firstName: "Jamie",
					lastName: "Lopez",
				},
			},
		},
	},
};

const baseLeaveRequest = {
	id: "req-leave-1",
	organizationId: "org-1",
	requesterId: "emp-requester-1",
	requester: {
		id: "emp-requester-1",
		employeeId: "EMP-001",
		person: {
			personalInfo: {
				firstName: "Ari",
				lastName: "Tan",
			},
		},
	},
	type: "LEAVE" as const,
	currentWorkflowStateKey: "APPROVED",
	startDate: "2026-06-10",
	endDate: "2026-06-10",
	description: "Sick leave due to fever",
	attachments: [],
	metadata: {
		leaveType: "SICK",
		totalDays: 1,
		leaveAttendanceReconciliation: {
			attendanceResults: [
				{
					dateKey: "2026-06-10",
					action: "converted",
					attendanceId: "attendance-leave-1",
					previousAttendanceId: "attendance-absent-1",
				},
			],
			timesheetResults: [
				{
					dateKey: "2026-06-10",
					action: "adjustment_required",
					timesheetId: "timesheet-1",
					reason: "TIMESHEET_SNAPSHOT_LOCKED",
				},
			],
		},
	},
	createdAt: "2026-06-10T08:00:00.000Z",
	updatedAt: "2026-06-10T08:00:00.000Z",
	currentStepExecution: null,
};

const baseTimeAdjustmentRequest = {
	id: "req-time-adjustment-1",
	organizationId: "org-1",
	requesterId: "emp-requester-1",
	requester: {
		id: "emp-requester-1",
		employeeId: "EMP-001",
		person: {
			personalInfo: {
				firstName: "Ari",
				lastName: "Tan",
			},
		},
	},
	type: "TIME_ADJUSTMENT" as const,
	currentWorkflowStateKey: "APPROVED",
	startDate: "2026-06-10",
	endDate: "2026-06-10",
	description: "Adjust time for missed punch",
	attachments: [],
	metadata: {
		date: "2026-06-10",
		adjustmentType: "MISSED_PUNCH",
		reason: "Forgot to clock out",
		timeAdjustmentReconciliation: {
			attendanceResults: [
				{
					dateKey: "2026-06-10",
					action: "refreshed",
					attendanceId: "attendance-effective-1",
					previousAttendanceId: "attendance-raw-1",
				},
			],
			timesheetResults: [
				{
					dateKey: "2026-06-10",
					action: "adjustment_required",
					timesheetId: "timesheet-1",
					reason: "TIMESHEET_SNAPSHOT_LOCKED",
				},
			],
		},
	},
	createdAt: "2026-06-10T08:00:00.000Z",
	updatedAt: "2026-06-10T08:00:00.000Z",
	currentStepExecution: null,
};

describe("RequestReviewModal", () => {
	beforeEach(() => {
		mockUseAuth.mockReturnValue({
			user: {
				role: "hris-hr-user",
				metadata: {
					employee: {
						id: "emp-hr-1",
						role: "hris-hr-user",
					},
				},
			},
		});
		mockUseRequest.mockReturnValue({ data: null });
	});

	it("renders the attendance correction review path for HR approvers", () => {
		render(
			<RequestReviewModal
				open
				onOpenChange={vi.fn()}
				request={baseAttendanceCorrectionRequest as any}
				onApprove={vi.fn()}
				onReject={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(screen.getByText(/Before Attendance Record/i)).toBeInTheDocument();
		expect(screen.getByText(/Submitted correction/i)).toBeInTheDocument();
		expect(screen.getByText("Status: Submitted")).toBeInTheDocument();
		expect(screen.getByText("Approval updates attendance source records that may affect timesheets and payroll.")).toBeInTheDocument();
		expect(screen.getAllByText("Attendance Correction").length).toBeGreaterThan(0);
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
		expect(screen.getAllByText("Forgot to clock out")).toHaveLength(2);
		expect(screen.getByText("Missed Punch")).toBeInTheDocument();
		expect(screen.getByText("8:15 AM")).toBeInTheDocument();
		expect(screen.getByText("5:10 PM")).toBeInTheDocument();
	});

	it("shows Complete Task when HR Review is a pending TASK", () => {
		render(
			<RequestReviewModal
				open
				onOpenChange={vi.fn()}
				request={{
					...baseAttendanceCorrectionRequest,
					currentWorkflowStateKey: "APPROVED",
					currentStepExecution: {
						...baseAttendanceCorrectionRequest.currentStepExecution,
						stepType: "TASK",
					},
				} as any}
				onApprove={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(screen.getByRole("button", { name: "Complete Task" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
	});

	it("shows approved leave conversion and timesheet adjustment details when reconciliation metadata exists", () => {
		render(
			<RequestReviewModal
				open
				onOpenChange={vi.fn()}
				request={baseLeaveRequest as any}
				onApprove={vi.fn()}
				onReject={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(screen.getByText("Attendance Impact")).toBeInTheDocument();
		expect(screen.getByText("Converted 2026-06-10 to Sick Leave")).toBeInTheDocument();
		expect(screen.getByText("Timesheet Follow-up")).toBeInTheDocument();
		expect(
			screen.getByText("Adjustment required for 2026-06-10 (locked timesheet snapshot)."),
		).toBeInTheDocument();
	});

	it("does not show leave conversion follow-up before approval or after rejection", () => {
		const { rerender } = render(
			<RequestReviewModal
				open
				onOpenChange={vi.fn()}
				request={{
					...baseLeaveRequest,
					currentWorkflowStateKey: "SUBMITTED",
				} as any}
				onApprove={vi.fn()}
				onReject={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(screen.queryByText("Attendance Impact")).not.toBeInTheDocument();
		expect(screen.queryByText("Timesheet Follow-up")).not.toBeInTheDocument();

		rerender(
			<RequestReviewModal
				open
				onOpenChange={vi.fn()}
				request={{
					...baseLeaveRequest,
					currentWorkflowStateKey: "REJECTED",
				} as any}
				onApprove={vi.fn()}
				onReject={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(screen.queryByText("Attendance Impact")).not.toBeInTheDocument();
		expect(screen.queryByText("Timesheet Follow-up")).not.toBeInTheDocument();
	});

	it("shows timesheet follow-up details for an approved time adjustment with reconciliation metadata", () => {
		render(
			<RequestReviewModal
				open
				onOpenChange={vi.fn()}
				request={baseTimeAdjustmentRequest as any}
				onApprove={vi.fn()}
				onReject={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(screen.getByText("Timesheet Follow-up")).toBeInTheDocument();
		expect(
			screen.getByText("Adjustment required for 2026-06-10 (locked timesheet snapshot)."),
		).toBeInTheDocument();
	});

	it("does not show timesheet follow-up for a time adjustment before approval", () => {
		render(
			<RequestReviewModal
				open
				onOpenChange={vi.fn()}
				request={{
					...baseTimeAdjustmentRequest,
					currentWorkflowStateKey: "SUBMITTED",
				} as any}
				onApprove={vi.fn()}
				onReject={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(screen.queryByText("Timesheet Follow-up")).not.toBeInTheDocument();
	});

	it("compact variant hides impact panel and shows consolidated details", () => {
		render(
			<RequestReviewModal
				variant="compact"
				hideEmployeeProfile
				open
				onOpenChange={vi.fn()}
				request={
					{
						...baseLeaveRequest,
						code: "REQ-123",
						currentWorkflowStateKey: "COMPLETED",
					} as any
				}
				skipRequestFetch
			/>,
		);

		expect(screen.getByText("Leave Request")).toBeInTheDocument();
		expect(screen.getByText("REQ-123")).toBeInTheDocument();
		expect(screen.getByText("Details")).toBeInTheDocument();
		expect(screen.getByText("Reason")).toBeInTheDocument();
		expect(screen.getByText("Completed on")).toBeInTheDocument();
		expect(screen.getByText("Sick leave due to fever")).toBeInTheDocument();
		expect(screen.queryByText("Request impact")).not.toBeInTheDocument();
		expect(screen.queryByText("Fields changing")).not.toBeInTheDocument();
		expect(screen.queryByText("If action is completed")).not.toBeInTheDocument();
		expect(screen.queryByText("Justification")).not.toBeInTheDocument();
	});

	it("compact variant collapses workflow timeline for terminal requests by default", () => {
		render(
			<RequestReviewModal
				variant="compact"
				hideEmployeeProfile
				open
				onOpenChange={vi.fn()}
				request={
					{
						...baseLeaveRequest,
						currentWorkflowStateKey: "COMPLETED",
						stepExecutions: [
							{
								id: "step-1",
								stepNumber: 1,
								stepName: "Manager Approval",
								stepType: "APPROVAL",
								assigneeType: "SUPERVISOR",
								status: "COMPLETED",
								completedAt: "2026-06-10T10:00:00.000Z",
							},
						],
					} as any
				}
				skipRequestFetch
			/>,
		);

		expect(screen.getByText("Workflow timeline")).toBeInTheDocument();
		expect(screen.queryByText("Manager Approval")).not.toBeInTheDocument();
	});

	it("compact approval view shows employee profile even when request is already completed", () => {
		render(
			<RequestReviewModal
				variant="compact"
				open
				onOpenChange={vi.fn()}
				request={
					{
						...baseLeaveRequest,
						code: "REQ-789",
						currentWorkflowStateKey: "COMPLETED",
					} as any
				}
				skipRequestFetch
			/>,
		);

		expect(screen.getByTestId("employee-profile-link")).toHaveAttribute(
			"data-profile-id",
			"emp-requester-1",
		);
		expect(screen.getByTestId("employee-profile-link")).toHaveTextContent("Ari Tan");
		expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
	});

	it("compact reviewer variant shows requester, actions, and hides impact panel", () => {
		render(
			<RequestReviewModal
				variant="compact"
				open
				onOpenChange={vi.fn()}
				request={
					{
						...baseLeaveRequest,
						code: "REQ-456",
						currentWorkflowStateKey: "SUBMITTED",
						currentStepExecution: {
							id: "step-1",
							stepName: "Manager Approval",
							stepType: "APPROVAL",
							assigneeType: "SUPERVISOR",
							status: "PENDING",
							assignee: {
								id: "emp-mgr-1",
								employeeId: "MGR-001",
								person: {
									personalInfo: {
										firstName: "Pat",
										lastName: "Reyes",
									},
								},
							},
						},
					} as any
				}
				onApprove={vi.fn()}
				onReject={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(screen.getByTestId("employee-profile-link")).toHaveAttribute(
			"data-profile-id",
			"emp-requester-1",
		);
		expect(screen.getByTestId("employee-avatar")).toBeInTheDocument();
		expect(screen.getByTestId("employee-profile-link")).toHaveTextContent("Ari Tan");
		expect(screen.getByText("Current step")).toBeInTheDocument();
		expect(screen.getByText("Manager Approval")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
		expect(screen.queryByText("Request impact")).not.toBeInTheDocument();
		expect(screen.queryByText("Fields changing")).not.toBeInTheDocument();
	});

	it("compact variant shows employee-typed reason for timesheet edit permission requests", () => {
		render(
			<RequestReviewModal
				variant="compact"
				open
				onOpenChange={vi.fn()}
				request={
					{
						id: "req-timesheet-edit-1",
						organizationId: "org-1",
						requesterId: "emp-requester-1",
						requester: baseLeaveRequest.requester,
						type: "TIMESHEET",
						currentWorkflowStateKey: "SUBMITTED",
						description: "Timesheet edit permission request",
						notes: "Need to fix overtime entries from last Friday",
						metadata: {
							timesheetAction: "EDIT_PERMISSION",
							reason: "Need to fix overtime entries from last Friday",
							payrollPeriodCode: "2026-06-P1",
						},
						createdAt: "2026-06-10T08:00:00.000Z",
						updatedAt: "2026-06-10T08:00:00.000Z",
					} as any
				}
				onApprove={vi.fn()}
				onReject={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(
			screen.getByText("Need to fix overtime entries from last Friday"),
		).toBeInTheDocument();
		expect(screen.queryByText("Timesheet edit permission request")).not.toBeInTheDocument();
	});

	it("compact reviewer variant shows what changes for attendance corrections", () => {
		render(
			<RequestReviewModal
				variant="compact"
				open
				onOpenChange={vi.fn()}
				request={baseAttendanceCorrectionRequest as any}
				onApprove={vi.fn()}
				onReject={vi.fn()}
				skipRequestFetch
			/>,
		);

		expect(screen.getByText("What changes")).toBeInTheDocument();
		expect(screen.getByText("Attendance Record")).toBeInTheDocument();
		expect(screen.queryByText("Fields changing")).not.toBeInTheDocument();
	});
});
