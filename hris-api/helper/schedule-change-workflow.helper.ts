export const SCHEDULE_CHANGE_WORKFLOW_CODE = "WF-SCHEDULE-CHANGE-DEFAULT";
export const SCHEDULE_CHANGE_HR_APPROVAL_STEP_NUMBER = 3;
export const SCHEDULE_CHANGE_HR_APPROVAL_STEP_NAME = "HR Approval";

const normalizeToken = (value: unknown) =>
	String(value || "")
		.trim()
		.toUpperCase()
		.replace(/\s+/g, "_");

const normalizeLabel = (value: unknown) =>
	String(value || "")
		.trim()
		.toUpperCase()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ");

const getStepNumber = (step: Record<string, any>) =>
	Number(step.step_number ?? step.stepNumber ?? 0);

const getStepType = (step: Record<string, any>) =>
	normalizeToken(step.step_type ?? step.stepType);

const getAssigneeType = (step: Record<string, any>) =>
	normalizeToken(step.assignee_type ?? step.assigneeType);

const getStepName = (step: Record<string, any>) =>
	normalizeLabel(step.step_name ?? step.stepName);

export const isScheduleChangeRequestType = (requestType?: string | null) =>
	normalizeToken(requestType) === "SCHEDULE_CHANGE";

export const isScheduleChangeWorkflowCode = (code?: string | null) =>
	normalizeToken(code) === SCHEDULE_CHANGE_WORKFLOW_CODE;

const isScheduleChangeHrStepCandidate = (step: unknown) => {
	if (!step || typeof step !== "object" || Array.isArray(step)) {
		return false;
	}

	const record = step as Record<string, any>;
	if (getStepNumber(record) !== SCHEDULE_CHANGE_HR_APPROVAL_STEP_NUMBER) {
		return false;
	}
	if (getAssigneeType(record) !== "HR") {
		return false;
	}

	const stepName = getStepName(record);
	const stepType = getStepType(record);
	return (
		stepType === "TASK" ||
		stepType === "APPROVAL" ||
		stepName.includes("HR SCHEDULE") ||
		stepName === "HR APPROVAL"
	);
};

export const isStaleScheduleChangeHrTaskExecution = (step: unknown) => {
	if (!isScheduleChangeHrStepCandidate(step)) {
		return false;
	}

	return getStepType(step as Record<string, any>) === "TASK";
};

export function normalizeScheduleChangeWorkflowStepsForHrApproval<T extends Record<string, any>>(
	steps: unknown,
): T[] {
	const source = Array.isArray(steps) ? steps : [];

	return source.map((step) => {
		if (!isScheduleChangeHrStepCandidate(step)) {
			return step as T;
		}

		const {
			state_on_complete: _stateOnComplete,
			state_on_skip: _stateOnSkip,
			...rest
		} = step as Record<string, any>;

		return {
			...rest,
			step_number: SCHEDULE_CHANGE_HR_APPROVAL_STEP_NUMBER,
			step_name: SCHEDULE_CHANGE_HR_APPROVAL_STEP_NAME,
			step_type: "APPROVAL",
			assignee_type: "HR",
			is_required: rest.is_required !== false,
			state_on_enter: "FOR_APPROVAL",
			state_on_approve: "APPROVED",
			state_on_reject: "REJECTED",
		} as unknown as T;
	});
}

export const hasScheduleChangeWorkflowStepDrift = (steps: unknown) => {
	if (!Array.isArray(steps)) {
		return false;
	}

	return (
		JSON.stringify(steps) !==
		JSON.stringify(normalizeScheduleChangeWorkflowStepsForHrApproval(steps))
	);
};
