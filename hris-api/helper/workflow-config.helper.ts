import {
	extractProvisioningState,
	mergeBrandingProvisioning,
	type ProvisioningWorkflowConfig,
	type ProvisioningWorkflowDomain,
	type ProvisioningWorkflowState,
	type ProvisioningWorkflowStep,
} from "./provisioning-state.helper";

export type {
	ProvisioningWorkflowConfig,
	ProvisioningWorkflowDomain,
	ProvisioningWorkflowState,
	ProvisioningWorkflowStep,
} from "./provisioning-state.helper";
import {
	DEFAULT_REQUEST_WORKFLOW_TEMPLATES,
	SEEDED_LIFECYCLE_STATES,
} from "../prisma/seeds/requestWorkflowCatalog";
import { WORKFORCE_REQUISITION_WORKFLOW_CODE } from "./workforce-recruitment.helper";
import {
	isScheduleChangeRequestType,
	isScheduleChangeWorkflowCode,
	normalizeScheduleChangeWorkflowStepsForHrApproval,
} from "./schedule-change-workflow.helper";
import {
	isAttendanceCorrectionRequestType,
	isAttendanceCorrectionWorkflowCode,
	normalizeAttendanceCorrectionWorkflowSteps,
} from "./attendance-correction-workflow.helper";
import {
	isOvertimeRequestType,
	isOvertimeWorkflowCode,
	isLeaderFiledOvertimeWorkflowCode,
	normalizeOvertimeWorkflowSteps,
} from "./overtime-workflow.helper";
import { isLeaderFiledAttendanceCorrectionWorkflowCode } from "./attendance-correction-workflow.helper";

export const REQUEST_WORKFLOW_CODES = {
	TIMESHEET_SUBMISSION: "WF-TIMESHEET-DEFAULT",
	TIMESHEET_EDIT_PERMISSION: "WF-TIMESHEET-EDIT-PERMISSION",
	OVERTIME_DEFAULT: "WF-OVERTIME-DEFAULT",
	OVERTIME_LEADER_FILED: "WF-OVERTIME-LEADER-FILED",
	TIMESHEET_LEADER_FILED: "WF-TIMESHEET-LEADER-FILED",
	ATTENDANCE_CORRECTION_LEADER_FILED: "WF-ATTENDANCE-CORRECTION-LEADER-FILED",
	PAYROLL_CORRECTION_DEFAULT: "WF-PAYROLL-CORRECTION-DEFAULT",
} as const;

const REQUISITION_WORKFLOW_CODES = [
	WORKFORCE_REQUISITION_WORKFLOW_CODE,
	"WF-RECRUITMENT-REQUISITION-DEFAULT",
] as const;

const REQUISITION_STATES: ProvisioningWorkflowState[] = [
	{ key: "OPEN", label: "Draft", order: 0, isTerminal: false },
	{ key: "SUBMITTED", label: "Submitted", order: 1, isTerminal: false },
	{ key: "FOR_APPROVAL", label: "For Approval", order: 2, isTerminal: false },
	{ key: "APPROVED", label: "Approved", order: 3, isTerminal: false },
	{ key: "COMPLETED", label: "Completed", order: 4, isTerminal: true },
	{ key: "REJECTED", label: "Rejected", order: 5, isTerminal: true },
	{ key: "CANCELLED", label: "Cancelled", order: 6, isTerminal: true },
] as const;

const APPLICANT_STATES: ProvisioningWorkflowState[] = [
	{ key: "APPLIED", label: "Applied", order: 0, isTerminal: false },
	{ key: "SCREENING", label: "Screening", order: 1, isTerminal: false },
	{ key: "INTERVIEW_SCHEDULING", label: "Interview Scheduling", order: 2, isTerminal: false },
	{ key: "INTERVIEW", label: "Interview", order: 3, isTerminal: false },
	{ key: "OFFER_APPROVAL", label: "Offer Approval", order: 4, isTerminal: false },
	{ key: "OFFER_SENT", label: "Offer Sent", order: 5, isTerminal: false },
	{ key: "ONBOARDING_READY", label: "Onboarding Ready", order: 6, isTerminal: false },
	{ key: "HIRED", label: "Hired", order: 7, isTerminal: true },
	{ key: "REJECTED", label: "Rejected", order: 8, isTerminal: true },
] as const;

const PAYSLIP_RELEASE_STATES: ProvisioningWorkflowState[] = [
	{ key: "GENERATED", label: "Generated", order: 0, isTerminal: false },
	{ key: "HR_REVIEW", label: "HR Review", order: 1, isTerminal: false },
	{ key: "FINANCE_APPROVED", label: "Finance Approved", order: 2, isTerminal: false },
	{ key: "RELEASED", label: "Released", order: 3, isTerminal: true },
	{ key: "HELD", label: "Held", order: 4, isTerminal: true },
	{ key: "CANCELLED", label: "Cancelled", order: 5, isTerminal: true },
] as const;

const cloneStates = (states: readonly ProvisioningWorkflowState[]): ProvisioningWorkflowState[] =>
	states.map((state) => ({ ...state }));

const cloneSteps = (steps: readonly ProvisioningWorkflowStep[]): ProvisioningWorkflowStep[] =>
	steps.map((step) => ({ ...step }));

const buildRecruitmentRequisitionSteps = (): ProvisioningWorkflowStep[] => [
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
		step_name: "System Completion",
		step_type: "TASK",
		assignee_type: "SYSTEM",
		is_required: true,
		state_on_enter: "APPROVED",
		state_on_complete: "COMPLETED",
		state_on_skip: "COMPLETED",
	},
];

const isRequisitionWorkflowCode = (code?: string | null) =>
	REQUISITION_WORKFLOW_CODES.includes(
		String(code || "")
			.trim()
			.toUpperCase() as (typeof REQUISITION_WORKFLOW_CODES)[number],
	);

const buildRecruitmentApplicantSteps = (): ProvisioningWorkflowStep[] => [
	{
		step_number: 1,
		step_name: "Application Intake",
		step_type: "SUBMISSION",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "APPLIED",
		state_on_complete: "SCREENING",
	},
	{
		step_number: 2,
		step_name: "Screening Review",
		step_type: "TASK",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "SCREENING",
		state_on_complete: "INTERVIEW_SCHEDULING",
	},
	{
		step_number: 3,
		step_name: "Interview Scheduling",
		step_type: "TASK",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "INTERVIEW_SCHEDULING",
		state_on_complete: "INTERVIEW",
	},
	{
		step_number: 4,
		step_name: "Interview Evaluation",
		step_type: "TASK",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "INTERVIEW",
		state_on_complete: "OFFER_APPROVAL",
	},
	{
		step_number: 5,
		step_name: "Offer Approval",
		step_type: "APPROVAL",
		assignee_type: "SUPERVISOR",
		is_required: true,
		state_on_enter: "OFFER_APPROVAL",
		state_on_approve: "OFFER_SENT",
		state_on_reject: "REJECTED",
	},
	{
		step_number: 6,
		step_name: "Contract Completion",
		step_type: "TASK",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "OFFER_SENT",
		state_on_complete: "ONBOARDING_READY",
	},
	{
		step_number: 7,
		step_name: "Hire Completion",
		step_type: "TASK",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "ONBOARDING_READY",
		state_on_complete: "HIRED",
	},
];

const buildPayslipReleaseSteps = (): ProvisioningWorkflowStep[] => [
	{
		step_number: 1,
		step_name: "Payslip Generated",
		step_type: "SUBMISSION",
		assignee_type: "SYSTEM",
		is_required: true,
		state_on_enter: "GENERATED",
		state_on_complete: "HR_REVIEW",
	},
	{
		step_number: 2,
		step_name: "HR Review",
		step_type: "APPROVAL",
		assignee_type: "HR",
		is_required: true,
		state_on_enter: "HR_REVIEW",
		state_on_approve: "FINANCE_APPROVED",
		state_on_reject: "HELD",
	},
	{
		step_number: 3,
		step_name: "Finance Release Approval",
		step_type: "APPROVAL",
		assignee_type: "SUPERVISOR",
		is_required: true,
		state_on_enter: "FINANCE_APPROVED",
		state_on_approve: "RELEASED",
		state_on_reject: "HELD",
	},
];

const DEFAULT_NON_REQUEST_WORKFLOW_CONFIGS: ProvisioningWorkflowConfig[] = [
	{
		code: WORKFORCE_REQUISITION_WORKFLOW_CODE,
		name: "Hiring Requisition Request Workflow",
		description:
			"Default hiring requisition request workflow: requester submission, HR approval, and system completion after job opening",
		domain: "REQUEST",
		requestType: "OTHER",
		states: cloneStates(REQUISITION_STATES),
		steps: buildRecruitmentRequisitionSteps(),
		isActive: true,
		isDefault: true,
	},
	{
		code: "WF-RECRUITMENT-REQUISITION-DEFAULT",
		name: "Recruitment Requisition Workflow",
		description:
			"Default requisition workflow: requester submission, HR approval, and system completion",
		domain: "RECRUITMENT",
		states: cloneStates(REQUISITION_STATES),
		steps: buildRecruitmentRequisitionSteps(),
		isActive: true,
		isDefault: true,
	},
	{
		code: "WF-RECRUITMENT-APPLICANT-DEFAULT",
		name: "Recruitment Applicant Workflow",
		description: "Default applicant workflow: intake, screening, interview, offer approval, onboarding, hire completion",
		domain: "RECRUITMENT",
		states: cloneStates(APPLICANT_STATES),
		steps: buildRecruitmentApplicantSteps(),
		isActive: true,
		isDefault: true,
	},
	{
		code: "WF-PAYSLIP-RELEASE-DEFAULT",
		name: "Payslip Release Workflow",
		description: "Default payslip release workflow: generation, HR review, finance release approval",
		domain: "PAYROLL",
		states: cloneStates(PAYSLIP_RELEASE_STATES),
		steps: buildPayslipReleaseSteps(),
		isActive: true,
		isDefault: true,
	},
];

const normalizeStates = (states: unknown): ProvisioningWorkflowState[] => {
	const source = Array.isArray(states) ? states : [];
	if (source.length === 0) {
		return cloneStates(SEEDED_LIFECYCLE_STATES as unknown as ProvisioningWorkflowState[]);
	}

	return source.map((item: any, index) => ({
		key: String(item?.key || `STATE_${index + 1}`).trim().toUpperCase(),
		label: String(item?.label || item?.key || `State ${index + 1}`).trim(),
		order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
		isTerminal: item?.isTerminal === true,
	}));
};

const normalizeSteps = (steps: unknown): ProvisioningWorkflowStep[] => {
	const source = Array.isArray(steps) ? steps : [];
	return source.map((item: any, index) => ({
		step_number: Number.isFinite(Number(item?.step_number))
			? Number(item.step_number)
			: index + 1,
		step_name: String(item?.step_name || `Step ${index + 1}`).trim(),
		step_type: (String(item?.step_type || "TASK").trim().toUpperCase() ||
			"TASK") as ProvisioningWorkflowStep["step_type"],
		assignee_type: (String(item?.assignee_type || "HR").trim().toUpperCase() ||
			"HR") as ProvisioningWorkflowStep["assignee_type"],
		is_required: item?.is_required !== false,
		state_on_enter: item?.state_on_enter ? String(item.state_on_enter).trim() : undefined,
		state_on_approve: item?.state_on_approve
			? String(item.state_on_approve).trim()
			: undefined,
		state_on_reject: item?.state_on_reject ? String(item.state_on_reject).trim() : undefined,
		state_on_complete: item?.state_on_complete
			? String(item.state_on_complete).trim()
			: undefined,
		state_on_skip: item?.state_on_skip ? String(item.state_on_skip).trim() : undefined,
	}));
};

export const normalizeWorkflowConfigRecord = (
	config?: Partial<ProvisioningWorkflowConfig>,
	fallback?: Partial<ProvisioningWorkflowConfig>,
): ProvisioningWorkflowConfig => {
	const source = config || {};
	const code = String(source.code || fallback?.code || "")
		.trim()
		.toUpperCase();
	const isRequisitionWorkflow = isRequisitionWorkflowCode(code);
	const requestType = source.requestType || fallback?.requestType || null;
	// Leader-filed workflows keep their catalog chain (manager→HR); the
	// self-service normalizers below must not flatten them.
	const isLeaderFiledWorkflow =
		isLeaderFiledOvertimeWorkflowCode(code) || isLeaderFiledAttendanceCorrectionWorkflowCode(code);
	const shouldNormalizeScheduleChangeWorkflow =
		!isLeaderFiledWorkflow &&
		(isScheduleChangeWorkflowCode(code) || isScheduleChangeRequestType(requestType));
	const shouldNormalizeAttendanceCorrectionWorkflow =
		!isLeaderFiledWorkflow &&
		(isAttendanceCorrectionWorkflowCode(code) || isAttendanceCorrectionRequestType(requestType));
	const shouldNormalizeOvertimeWorkflow =
		!isLeaderFiledWorkflow &&
		(isOvertimeWorkflowCode(code) || isOvertimeRequestType(requestType));
	const steps = isRequisitionWorkflow
		? buildRecruitmentRequisitionSteps()
		: shouldNormalizeAttendanceCorrectionWorkflow
			? normalizeAttendanceCorrectionWorkflowSteps(source.steps ?? fallback?.steps)
			: shouldNormalizeOvertimeWorkflow
				? normalizeOvertimeWorkflowSteps(source.steps ?? fallback?.steps)
			: normalizeSteps(source.steps ?? fallback?.steps);
	return {
		code,
		name: String(source.name || fallback?.name || code).trim(),
		description: String(source.description ?? fallback?.description ?? "").trim() || null,
		domain: (String(source.domain || fallback?.domain || "REQUEST").trim().toUpperCase() ||
			"REQUEST") as ProvisioningWorkflowDomain,
		requestType,
		states: isRequisitionWorkflow
			? cloneStates(REQUISITION_STATES)
			: normalizeStates(source.states ?? fallback?.states),
		steps: (shouldNormalizeScheduleChangeWorkflow
			? normalizeScheduleChangeWorkflowStepsForHrApproval(steps)
			: steps) as ProvisioningWorkflowStep[],
		isActive: source.isActive ?? fallback?.isActive ?? true,
		isDefault: source.isDefault ?? fallback?.isDefault ?? false,
		createdAt: source.createdAt || fallback?.createdAt,
		updatedAt: source.updatedAt || fallback?.updatedAt,
	};
};

export const getSeededWorkflowConfigs = (): ProvisioningWorkflowConfig[] => {
	const requestConfigs = DEFAULT_REQUEST_WORKFLOW_TEMPLATES.map((workflow) =>
		normalizeWorkflowConfigRecord({
			code: workflow.code,
			name: workflow.name,
			description: workflow.description,
			domain: "REQUEST",
			requestType: workflow.requestType,
			states: workflow.states as unknown as ProvisioningWorkflowState[],
			steps: workflow.steps as unknown as ProvisioningWorkflowStep[],
			isActive: true,
			isDefault: true,
		}),
	);

	return [...requestConfigs, ...DEFAULT_NON_REQUEST_WORKFLOW_CONFIGS].map((config) =>
		normalizeWorkflowConfigRecord(config),
	);
};

export const extractWorkflowConfigs = (branding: unknown): ProvisioningWorkflowConfig[] => {
	const provisioning = extractProvisioningState(branding);
	const source = Array.isArray(provisioning.workflowConfigs) ? provisioning.workflowConfigs : [];
	return source
		.map((config) => normalizeWorkflowConfigRecord(config))
		.filter((config) => Boolean(config.code));
};

export const mergeWithSeededWorkflowConfigs = (branding: unknown): ProvisioningWorkflowConfig[] => {
	const seeded = getSeededWorkflowConfigs();
	const stored = extractWorkflowConfigs(branding);
	const storedByCode = new Map(stored.map((config) => [config.code, config] as const));
	const merged = seeded.map((seededConfig) =>
		normalizeWorkflowConfigRecord(storedByCode.get(seededConfig.code), seededConfig),
	);

	for (const config of stored) {
		if (!storedByCode.has(config.code)) {
			continue;
		}
		if (!merged.find((item) => item.code === config.code)) {
			merged.push(normalizeWorkflowConfigRecord(config));
		}
	}

	return merged.sort((left, right) => {
		if (left.domain === right.domain) {
			return left.name.localeCompare(right.name);
		}
		return left.domain.localeCompare(right.domain);
	});
};

export const getWorkflowConfigByCode = (
	branding: unknown,
	code: string,
): ProvisioningWorkflowConfig | null => {
	const normalizedCode = String(code || "").trim().toUpperCase();
	if (!normalizedCode) return null;
	return (
		mergeWithSeededWorkflowConfigs(branding).find((config) => config.code === normalizedCode) ||
		null
	);
};

export const getRequestWorkflowConfig = (params: {
	branding: unknown;
	requestType?: string | null;
	preferredCode?: string | null;
}): ProvisioningWorkflowConfig | null => {
	const configs = mergeWithSeededWorkflowConfigs(params.branding).filter(
		(config) => config.domain === "REQUEST" && config.isActive,
	);
	const normalizedCode = String(params.preferredCode || "").trim().toUpperCase();
	if (normalizedCode) {
		return configs.find((config) => config.code === normalizedCode) || null;
	}

	const normalizedRequestType = String(params.requestType || "").trim().toUpperCase();
	const matches = configs.filter((config) => config.requestType === normalizedRequestType);
	if (matches.length === 1) {
		return matches[0];
	}

	return matches.find((config) => config.isDefault) || matches[0] || null;
};

export const setWorkflowConfigInBranding = (
	existingBranding: unknown,
	config: Partial<ProvisioningWorkflowConfig>,
): Record<string, any> => {
	const merged = mergeWithSeededWorkflowConfigs(existingBranding);
	const current = merged.find((item) => item.code === String(config.code || "").trim().toUpperCase());
	const next = normalizeWorkflowConfigRecord(config, current || undefined);
	const nextItems = [...merged.filter((item) => item.code !== next.code), next].sort((left, right) =>
		left.name.localeCompare(right.name),
	);
	return mergeBrandingProvisioning(existingBranding, {
		workflowConfigs: nextItems,
	});
};

export const removeWorkflowConfigFromBranding = (existingBranding: unknown, code: string) => {
	const normalizedCode = String(code || "").trim().toUpperCase();
	const seeded = getSeededWorkflowConfigs().find((config) => config.code === normalizedCode);
	if (seeded) {
		throw new Error("DEFAULT_WORKFLOW_CONFIG_CANNOT_BE_DELETED");
	}

	const nextItems = extractWorkflowConfigs(existingBranding).filter(
		(config) => config.code !== normalizedCode,
	);
	return mergeBrandingProvisioning(existingBranding, {
		workflowConfigs: nextItems,
	});
};

export const resetWorkflowConfigInBranding = (existingBranding: unknown, code: string) => {
	const normalizedCode = String(code || "").trim().toUpperCase();
	const seeded = getSeededWorkflowConfigs().find((config) => config.code === normalizedCode);
	if (!seeded) {
		throw new Error("DEFAULT_WORKFLOW_CONFIG_NOT_FOUND");
	}

	return setWorkflowConfigInBranding(existingBranding, seeded);
};

export const seedWorkflowConfigsInBranding = (existingBranding: unknown) =>
	mergeBrandingProvisioning(existingBranding, {
		workflowConfigs: mergeWithSeededWorkflowConfigs(existingBranding),
	});
