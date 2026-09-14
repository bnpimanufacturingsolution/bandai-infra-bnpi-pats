export const SEEDED_LIFECYCLE_STATES = [
	{ key: "OPEN", label: "Open", order: 0, isTerminal: false },
	{ key: "SUBMITTED", label: "Submitted", order: 1, isTerminal: false },
	{ key: "FOR_APPROVAL", label: "For Approval", order: 2, isTerminal: false },
	{ key: "APPROVED", label: "Approved", order: 3, isTerminal: false },
	{ key: "COMPLETED", label: "Completed", order: 4, isTerminal: true },
	{ key: "REJECTED", label: "Rejected", order: 5, isTerminal: true },
	{ key: "CANCELLED", label: "Cancelled", order: 6, isTerminal: true },
] as const;

import {
	LEADER_FILED_OVERTIME_STEPS,
	LEADER_FILED_TIMESHEET_STEPS,
	LEADER_FILED_ATTENDANCE_CORRECTION_STEPS,
} from "../../helper/line-leader-workflow.helper";

const buildPanSteps = (finalStepName = "Personnel Action Completion") => [
	{
		step_number: 1,
		step_name: "Requester Submission",
		step_type: "SUBMISSION",
		assignee_type: "REQUESTER",
		is_required: true,
		state_on_enter: "OPEN",
		state_on_complete: "SUBMITTED",
	},
	{
		step_number: 2,
		step_name: "Target Department Manager Approval",
		step_type: "APPROVAL",
		assignee_type: "TARGET_DEPARTMENT_MANAGER",
		is_required: true,
		state_on_enter: "SUBMITTED",
		state_on_approve: "FOR_APPROVAL",
		state_on_reject: "REJECTED",
	},
	{
		step_number: 3,
		step_name: "HR Approval",
		step_type: "APPROVAL",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "FOR_APPROVAL",
		state_on_approve: "APPROVED",
		state_on_reject: "REJECTED",
	},
	{
		step_number: 4,
		step_name: finalStepName,
		step_type: "TASK",
		assignee_type: "SYSTEM",
		is_required: true,
		state_on_enter: "APPROVED",
		state_on_complete: "COMPLETED",
		state_on_skip: "COMPLETED",
	},
];

const buildApprovalSteps = (finalStepName = "Request Completion") => [
	{
		step_number: 1,
		step_name: "Employee Submission",
		step_type: "SUBMISSION",
		assignee_type: "REQUESTER",
		is_required: true,
		state_on_enter: "OPEN",
		state_on_complete: "SUBMITTED",
	},
	{
		step_number: 2,
		step_name: "Manager Approval",
		step_type: "APPROVAL",
		assignee_type: "SUPERVISOR",
		is_required: true,
		state_on_enter: "SUBMITTED",
		state_on_approve: "APPROVED",
		state_on_reject: "REJECTED",
	},
	{
		step_number: 3,
		step_name: finalStepName,
		step_type: "TASK",
		assignee_type: "SYSTEM",
		is_required: true,
		state_on_enter: "APPROVED",
		state_on_complete: "COMPLETED",
		state_on_skip: "COMPLETED",
	},
];

const buildSupervisorThenHrReviewSteps = (
	hrStepName = "HR Review",
	finalStepName = "Request Completion",
) => [
	{
		step_number: 1,
		step_name: "Employee Submission",
		step_type: "SUBMISSION",
		assignee_type: "REQUESTER",
		is_required: true,
		state_on_enter: "OPEN",
		state_on_complete: "SUBMITTED",
	},
	{
		step_number: 2,
		step_name: "Manager Approval",
		step_type: "APPROVAL",
		assignee_type: "SUPERVISOR",
		is_required: true,
		state_on_enter: "SUBMITTED",
		state_on_approve: "FOR_APPROVAL",
		state_on_reject: "REJECTED",
	},
	{
		step_number: 3,
		step_name: hrStepName,
		step_type: "TASK",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "FOR_APPROVAL",
		state_on_complete: "APPROVED",
	},
	{
		step_number: 4,
		step_name: finalStepName,
		step_type: "TASK",
		assignee_type: "SYSTEM",
		is_required: true,
		state_on_enter: "APPROVED",
		state_on_complete: "COMPLETED",
		state_on_skip: "COMPLETED",
	},
];

export const ATTENDANCE_CORRECTION_SUPERVISOR_THEN_HR_STEPS =
	buildSupervisorThenHrReviewSteps(
		"HR Review",
		"Attendance Correction Completion",
	);

const buildHrOnlyApprovalSteps = (finalStepName = "Request Completion") => [
	{
		step_number: 1,
		step_name: "HR Submission",
		step_type: "SUBMISSION",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "OPEN",
		state_on_complete: "SUBMITTED",
	},
	{
		step_number: 2,
		step_name: "HR Approval",
		step_type: "APPROVAL",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "SUBMITTED",
		state_on_approve: "APPROVED",
		state_on_reject: "REJECTED",
	},
	{
		step_number: 3,
		step_name: finalStepName,
		step_type: "TASK",
		assignee_type: "SYSTEM",
		is_required: true,
		state_on_enter: "APPROVED",
		state_on_complete: "COMPLETED",
		state_on_skip: "COMPLETED",
	},
];

const buildResignationSteps = () => [
	{
		step_number: 1,
		step_name: "Employee Submission",
		step_type: "SUBMISSION",
		assignee_type: "REQUESTER",
		is_required: true,
		state_on_enter: "OPEN",
		state_on_complete: "SUBMITTED",
	},
	{
		step_number: 2,
		step_name: "HR Review & Approval",
		step_type: "APPROVAL",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "SUBMITTED",
		state_on_approve: "APPROVED",
		state_on_reject: "REJECTED",
	},
	{
		step_number: 3,
		step_name: "Offboarding Completion",
		step_type: "TASK",
		assignee_type: "SYSTEM",
		is_required: true,
		state_on_enter: "APPROVED",
		state_on_complete: "COMPLETED",
		state_on_skip: "COMPLETED",
	},
];

const buildScheduleChangeSteps = () => [
	{
		step_number: 1,
		step_name: "Employee Submission",
		step_type: "SUBMISSION",
		assignee_type: "REQUESTER",
		is_required: true,
		state_on_enter: "OPEN",
		state_on_complete: "SUBMITTED",
	},
	{
		step_number: 2,
		step_name: "Manager Approval",
		step_type: "APPROVAL",
		assignee_type: "SUPERVISOR",
		is_required: true,
		state_on_enter: "SUBMITTED",
		state_on_approve: "FOR_APPROVAL",
		state_on_reject: "REJECTED",
	},
	{
		step_number: 3,
		step_name: "HR Approval",
		step_type: "APPROVAL",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "FOR_APPROVAL",
		state_on_approve: "APPROVED",
		state_on_reject: "REJECTED",
	},
	{
		step_number: 4,
		step_name: "Schedule Change Completion",
		step_type: "TASK",
		assignee_type: "SYSTEM",
		is_required: true,
		state_on_enter: "APPROVED",
		state_on_complete: "COMPLETED",
		state_on_skip: "COMPLETED",
	},
];

export const DEFAULT_REQUEST_WORKFLOW_TEMPLATES = [
	{
		code: "WF-PAN-REGULARIZATION",
		name: "PAN Regularization Workflow",
		requestType: "REGULARIZATION",
		description: "PAN workflow: HR submission, HR approval, personnel action completion",
		steps: buildPanSteps("Regularization Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-PAN-PROMOTION",
		name: "PAN Promotion Workflow",
		requestType: "PROMOTION",
		description: "PAN workflow: HR submission, HR approval, personnel action completion",
		steps: buildPanSteps("Promotion Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-PAN-SALARY-CHANGE",
		name: "PAN Salary Change Workflow",
		requestType: "SALARY_CHANGE",
		description: "PAN workflow: manager submission, line manager approval, HR approval, salary change completion",
		steps: buildPanSteps("Salary Change Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-PAN-TRANSFER",
		name: "PAN Transfer Workflow",
		requestType: "TRANSFER",
		description: "PAN workflow: HR submission, HR approval, personnel action completion",
		steps: buildPanSteps("Transfer Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-PAN-TERMINATION",
		name: "PAN Termination Workflow",
		requestType: "TERMINATION",
		description: "PAN workflow: HR submission, HR approval, offboarding completion",
		steps: buildPanSteps("Termination Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-PAN-LEAVE-CONVERSION",
		name: "PAN Leave Conversion Workflow",
		requestType: "LEAVE_CONVERSION",
		description: "PAN workflow: HR submission, HR approval, leave conversion completion",
		steps: buildPanSteps("Leave Conversion Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-RESIGNATION-DEFAULT",
		name: "Resignation Workflow",
		requestType: "RESIGNATION",
		description: "Resignation workflow: employee submit, HR review, offboarding completion",
		steps: buildResignationSteps(),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-ATTENDANCE-CORRECTION-DEFAULT",
		name: "Attendance Correction Workflow",
		requestType: "ATTENDANCE_CORRECTION",
		description:
			"Attendance correction workflow: employee submit, supervisor (report-to) approval, then HR review",
		steps: ATTENDANCE_CORRECTION_SUPERVISOR_THEN_HR_STEPS,
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-LEAVE-DEFAULT",
		name: "Leave Request Workflow",
		requestType: "LEAVE",
		description:
			"Default leave workflow: employee submit, manager approval, leave completion",
		steps: buildApprovalSteps("Leave Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-SCHEDULE-CHANGE-DEFAULT",
		name: "Schedule Change Workflow",
		requestType: "SCHEDULE_CHANGE",
		description:
			"Schedule change workflow: employee submit, manager approval, HR schedule update, system completion",
		steps: buildScheduleChangeSteps(),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-DOCUMENT-DEFAULT",
		name: "Document Request Workflow",
		requestType: "DOCUMENT_REQUEST",
		description:
			"Default document workflow: employee submit, manager review, HR generation, document release",
		steps: [
			{
				step_number: 1,
				step_name: "Employee Submission",
				step_type: "SUBMISSION",
				assignee_type: "REQUESTER",
				is_required: true,
				state_on_enter: "OPEN",
				state_on_complete: "SUBMITTED",
			},
			{
				step_number: 2,
				step_name: "Manager Approval",
				step_type: "APPROVAL",
				assignee_type: "SUPERVISOR",
				is_required: false,
				state_on_enter: "SUBMITTED",
				state_on_approve: "SUBMITTED",
				state_on_skip: "SUBMITTED",
				state_on_reject: "REJECTED",
			},
			{
				step_number: 3,
				step_name: "HR Review & Document Generation",
				step_type: "TASK",
				assignee_type: "HR",
				is_required: true,
				state_on_enter: "SUBMITTED",
				state_on_complete: "APPROVED",
			},
			{
				step_number: 4,
				step_name: "Document Release & Completion",
				step_type: "TASK",
				assignee_type: "SYSTEM",
				is_required: true,
				state_on_enter: "APPROVED",
				state_on_complete: "COMPLETED",
				state_on_skip: "COMPLETED",
			},
		],
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-TIMESHEET-DEFAULT",
		name: "Timesheet Submission Workflow",
		requestType: "TIMESHEET",
		description:
			"Timesheet submission workflow: employee submit, manager approval, request completion",
		steps: buildApprovalSteps("Timesheet Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-TIMESHEET-EDIT-PERMISSION",
		name: "Timesheet Edit Permission Workflow",
		requestType: "TIMESHEET",
		description:
			"Timesheet edit-permission workflow: employee submission, manager approval, request completion",
		steps: buildApprovalSteps("Edit Permission Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-OVERTIME-DEFAULT",
		name: "Overtime Approval Workflow",
		requestType: "OVERTIME",
		description:
			"Overtime approval workflow: employee submission, HR approval, then payable OT on the timesheet",
		steps: [
			{
				step_number: 1,
				step_name: "Employee Submission",
				step_type: "SUBMISSION",
				assignee_type: "REQUESTER",
				is_required: true,
				state_on_enter: "OPEN",
				state_on_complete: "SUBMITTED",
			},
			{
				step_number: 2,
				step_name: "HR Approval",
				step_type: "APPROVAL",
				assignee_type: "HR",
				is_required: true,
				state_on_enter: "SUBMITTED",
				state_on_approve: "APPROVED",
				state_on_reject: "REJECTED",
			},
			{
				step_number: 3,
				step_name: "Overtime Completion",
				step_type: "TASK",
				assignee_type: "SYSTEM",
				is_required: true,
				state_on_enter: "APPROVED",
				state_on_complete: "COMPLETED",
				state_on_skip: "COMPLETED",
			},
		],
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-PAYROLL-CORRECTION-DEFAULT",
		name: "Payroll Correction Workflow",
		requestType: "PAYROLL_CORRECTION",
		description:
			"Post-payroll timesheet correction: employee submission, manager approval, READY for next payroll apply",
		steps: buildApprovalSteps("Payroll Correction Completion"),
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		// Leader-filed OT (2026-09-07 line-leader requirement; 2026-09-08 operator
		// decision: manager is the FINAL approver — no HR step): the line leader
		// files for a section member; chain resolves from the MEMBER's manager.
		code: "WF-OVERTIME-LEADER-FILED",
		name: "Overtime Approval Workflow (Line Leader Filed)",
		requestType: "OVERTIME",
		description:
			"Line leader files overtime for a section member: leader submission, member's manager approval (final), then payable OT on the member's timesheet",
		steps: LEADER_FILED_OVERTIME_STEPS,
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		code: "WF-TIMESHEET-LEADER-FILED",
		name: "Timesheet Adjustment Workflow (Line Leader Filed)",
		requestType: "TIMESHEET",
		description:
			"Line leader files a timesheet adjustment for a section member: leader submission, member's manager approval, HR approval, completion",
		steps: LEADER_FILED_TIMESHEET_STEPS,
		states: SEEDED_LIFECYCLE_STATES,
	},
	{
		// Leader-filed attendance/timesheet adjustment (2026-09-09 operator
		// direction: "the adjusted need to approve by the section manager like
		// how the ot and early ot being filed") — mirrors OT: the line leader
		// files for a section member; the member's manager is the FINAL
		// approver; the SYSTEM task applies the correction to the member's
		// attendance. No HR step.
		code: "WF-ATTENDANCE-CORRECTION-LEADER-FILED",
		name: "Attendance Correction Workflow (Line Leader Filed)",
		requestType: "ATTENDANCE_CORRECTION",
		description:
			"Line leader files a timesheet adjustment for a section member: leader submission, member's manager approval (final, applies to the member's attendance), completion",
		steps: LEADER_FILED_ATTENDANCE_CORRECTION_STEPS,
		states: SEEDED_LIFECYCLE_STATES,
	},
] as const;

export const getRequestWorkflowTemplate = (params: {
	code?: string | null;
	requestType?: string | null;
}) => {
	const normalizedCode = String(params.code || "").trim().toUpperCase();
	const normalizedRequestType = String(params.requestType || "").trim().toUpperCase();

	if (normalizedCode) {
		const byCode = DEFAULT_REQUEST_WORKFLOW_TEMPLATES.find(
			(workflow) => workflow.code === normalizedCode,
		);
		if (byCode) {
			return byCode;
		}
	}

	if (!normalizedRequestType) {
		return null;
	}

	const matches = DEFAULT_REQUEST_WORKFLOW_TEMPLATES.filter(
		(workflow) => workflow.requestType === normalizedRequestType,
	);
	return matches.length === 1 ? matches[0] : null;
};
