export const HR_APPROVAL_ACTION_ROLES = new Set([
	"admin",
	"super_admin",
	"superadmin",
	"hris-admin",
	"hris-hr-manager",
	"hris-hr-user",
]);

export const ACTIVE_APPROVAL_ACTION_STATES = [
	"OPEN",
	"SUBMITTED",
	"FOR_APPROVAL",
	"IN_PROCESS",
	"APPROVED",
] as const;

type ApprovalActionRequest = {
	currentWorkflowStateKey?: string | null;
	currentStepExecution?: {
		stepType?: string | null;
		assigneeType?: string | null;
		assigneeId?: string | null;
		assignee?: { id?: string | null } | null;
	} | null;
} | null;

type ApprovalActionActor = {
	currentEmployeeId?: string | null;
	currentRole?: string | null;
	isHrActor?: boolean;
};

const getStepAssigneeId = (request: ApprovalActionRequest) =>
	request?.currentStepExecution?.assignee?.id ||
	request?.currentStepExecution?.assigneeId ||
	null;

export const isHrApprovalActionRole = (role?: string | null) => {
	const normalized = String(role || "")
		.trim()
		.toLowerCase();
	if (!normalized) return false;
	return (
		HR_APPROVAL_ACTION_ROLES.has(normalized) ||
		normalized.includes("hris-hr") ||
		normalized.includes("-hr-") ||
		normalized.endsWith("-hr")
	);
};

export const canActOnApprovalRequest = (
	request: ApprovalActionRequest,
	params: ApprovalActionActor,
): boolean => {
	if (!request?.currentStepExecution) return false;
	const state = String(request.currentWorkflowStateKey || "").toUpperCase();
	if (
		!ACTIVE_APPROVAL_ACTION_STATES.includes(
			state as (typeof ACTIVE_APPROVAL_ACTION_STATES)[number],
		)
	) {
		return false;
	}

	const assigneeType = String(request.currentStepExecution.assigneeType || "").toUpperCase();
	if (
		params.isHrActor &&
		isHrApprovalActionRole(params.currentRole) &&
		assigneeType === "HR"
	) {
		return true;
	}

	const currentEmployeeId = String(params.currentEmployeeId || "").trim();
	const assigneeId = getStepAssigneeId(request);
	return Boolean(currentEmployeeId && assigneeId && assigneeId === currentEmployeeId);
};

export const canRejectApprovalRequest = (
	request: ApprovalActionRequest,
	params: ApprovalActionActor,
): boolean => {
	if (!canActOnApprovalRequest(request, params)) return false;
	return String(request.currentStepExecution?.stepType || "").toUpperCase() !== "TASK";
};
