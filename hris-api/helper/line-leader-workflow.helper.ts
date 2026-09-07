/**
 * Leader-filed request workflows (2026-09-07 line-leader requirement).
 *
 * When a line leader files a request on behalf of a section member, the
 * mandatory approval chain is: manager → HR (the leader is the initiator, not
 * an approver). These templates use TARGET_DEPARTMENT_MANAGER so the manager
 * step resolves from the MEMBER's department/reportTo, not the leader's.
 *
 * These codes are exempt from the overtime/attendance-correction step
 * normalizers (which would otherwise flatten them back to the employee
 * self-service chains). Admin-side chain adjustability rides the existing
 * per-org workflow-config mechanism (D1).
 */

export const LEADER_FILED_OVERTIME_CODE = "WF-OVERTIME-LEADER-FILED";
export const LEADER_FILED_TIMESHEET_CODE = "WF-TIMESHEET-LEADER-FILED";
export const LEADER_FILED_ATTENDANCE_CORRECTION_CODE = "WF-ATTENDANCE-CORRECTION-LEADER-FILED";

export const LEADER_FILED_WORKFLOW_CODES = [
	LEADER_FILED_OVERTIME_CODE,
	LEADER_FILED_TIMESHEET_CODE,
	LEADER_FILED_ATTENDANCE_CORRECTION_CODE,
] as const;

export const isLeaderFiledWorkflowCode = (code?: string | null): boolean => {
	const normalized = String(code || "").trim().toUpperCase();
	return LEADER_FILED_WORKFLOW_CODES.some(
		(leaderCode) => String(leaderCode).toUpperCase() === normalized,
	);
};

/** The leader-filed workflow code for a supported request type, if any. */
export const getLeaderFiledWorkflowCode = (requestType?: string | null): string | null => {
	const normalized = String(requestType || "").trim().toUpperCase();
	switch (normalized) {
		case "OVERTIME":
			return LEADER_FILED_OVERTIME_CODE;
		case "TIMESHEET":
			return LEADER_FILED_TIMESHEET_CODE;
		case "ATTENDANCE_CORRECTION":
			return LEADER_FILED_ATTENDANCE_CORRECTION_CODE;
		default:
			return null;
	}
};

/** Manager approval step that resolves from the member's department/reportTo. */
export const LEADER_FILED_MANAGER_STEP = {
	step_number: 2,
	step_name: "Manager Approval",
	step_type: "APPROVAL",
	assignee_type: "TARGET_DEPARTMENT_MANAGER",
	is_required: true,
	state_on_enter: "SUBMITTED",
	state_on_approve: "FOR_APPROVAL",
	state_on_reject: "REJECTED",
} as const;

/** HR approval step (APPROVAL variant). */
export const LEADER_FILED_HR_APPROVAL_STEP = {
	step_number: 3,
	step_name: "HR Approval",
	step_type: "APPROVAL",
	assignee_type: "HR",
	is_required: true,
	state_on_enter: "FOR_APPROVAL",
	state_on_approve: "APPROVED",
	state_on_reject: "REJECTED",
} as const;

/** HR review step (TASK variant, mirrors the attendance-correction chain). */
export const LEADER_FILED_HR_REVIEW_TASK_STEP = {
	step_number: 3,
	step_name: "HR Review",
	step_type: "TASK",
	assignee_type: "HR",
	is_required: true,
	state_on_enter: "FOR_APPROVAL",
	state_on_complete: "APPROVED",
	state_on_skip: "APPROVED",
} as const;

export const LEADER_FILED_SUBMISSION_STEP = {
	step_number: 1,
	step_name: "Leader Submission",
	step_type: "SUBMISSION",
	assignee_type: "REQUESTER",
	is_required: true,
	state_on_enter: "OPEN",
	state_on_complete: "SUBMITTED",
} as const;

export const buildLeaderFiledCompletionStep = (stepName: string) => ({
	step_number: 4,
	step_name: stepName,
	step_type: "TASK",
	assignee_type: "SYSTEM",
	is_required: true,
	state_on_enter: "APPROVED",
	state_on_complete: "COMPLETED",
	state_on_skip: "COMPLETED",
});

export const LEADER_FILED_OVERTIME_STEPS = [
	LEADER_FILED_SUBMISSION_STEP,
	LEADER_FILED_MANAGER_STEP,
	LEADER_FILED_HR_APPROVAL_STEP,
	buildLeaderFiledCompletionStep("Overtime Completion"),
] as const;

export const LEADER_FILED_TIMESHEET_STEPS = [
	LEADER_FILED_SUBMISSION_STEP,
	LEADER_FILED_MANAGER_STEP,
	LEADER_FILED_HR_APPROVAL_STEP,
	buildLeaderFiledCompletionStep("Timesheet Completion"),
] as const;

export const LEADER_FILED_ATTENDANCE_CORRECTION_STEPS = [
	LEADER_FILED_SUBMISSION_STEP,
	LEADER_FILED_MANAGER_STEP,
	LEADER_FILED_HR_REVIEW_TASK_STEP,
	buildLeaderFiledCompletionStep("Attendance Correction Completion"),
] as const;
