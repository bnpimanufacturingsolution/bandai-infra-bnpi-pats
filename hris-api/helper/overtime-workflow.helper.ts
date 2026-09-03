const normalizeToken = (value?: string | null) =>
	String(value || "")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_");

export const OVERTIME_WORKFLOW_CODE = "WF-OVERTIME-DEFAULT";

export const OVERTIME_HR_DIRECT_STEPS = [
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
] as const;

export const isOvertimeRequestType = (requestType?: string | null) =>
	normalizeToken(requestType) === "OVERTIME";

export const isOvertimeWorkflowCode = (code?: string | null) =>
	normalizeToken(code) === normalizeToken(OVERTIME_WORKFLOW_CODE);

export const normalizeOvertimeWorkflowSteps = <T extends Record<string, any>>(
	_steps?: unknown,
): T[] => OVERTIME_HR_DIRECT_STEPS.map((step) => ({ ...step }) as unknown as T);
