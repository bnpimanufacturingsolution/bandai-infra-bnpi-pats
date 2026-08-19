import { ATTENDANCE_CORRECTION_SUPERVISOR_THEN_HR_STEPS } from "../prisma/seeds/requestWorkflowCatalog";

const normalizeToken = (value?: string | null) =>
	String(value || "")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_");

export const ATTENDANCE_CORRECTION_WORKFLOW_CODE = "WF-ATTENDANCE-CORRECTION-DEFAULT";

export const ATTENDANCE_CORRECTION_HR_ROLES = new Set([
	"admin",
	"super_admin",
	"superadmin",
	"hris-admin",
	"hris-hr-manager",
	"hris-hr-user",
]);

export const isAttendanceCorrectionRequestType = (requestType?: string | null) =>
	normalizeToken(requestType) === "ATTENDANCE_CORRECTION";

export const isAttendanceCorrectionWorkflowCode = (code?: string | null) =>
	normalizeToken(code) === ATTENDANCE_CORRECTION_WORKFLOW_CODE;

export const isAttendanceCorrectionHrRole = (role?: string | null) => {
	const normalized = String(role || "")
		.trim()
		.toLowerCase();
	if (!normalized) return false;
	return (
		ATTENDANCE_CORRECTION_HR_ROLES.has(normalized) ||
		normalized.includes("hris-hr") ||
		normalized.includes("-hr-") ||
		normalized.endsWith("-hr")
	);
};

export const isPendingAttendanceCorrectionHrReviewStep = (step?: {
	stepType?: string | null;
	assigneeType?: string | null;
	stepName?: string | null;
	status?: string | null;
} | null) => {
	if (!step) return false;
	const status = normalizeToken(step.status);
	if (status && status !== "PENDING" && status !== "IN_PROGRESS") return false;
	if (normalizeToken(step.assigneeType) !== "HR") return false;
	const stepType = normalizeToken(step.stepType);
	const stepName = normalizeToken(step.stepName);
	return stepType === "TASK" || stepType === "APPROVAL" || stepName.includes("HR_REVIEW");
};

export const shouldAutoCompleteAttendanceCorrectionHrReview = (params: {
	requestType?: string | null;
	actingEmployeeRole?: string | null;
	nextStep?: {
		stepType?: string | null;
		assigneeType?: string | null;
		stepName?: string | null;
		status?: string | null;
	} | null;
}) =>
	isAttendanceCorrectionRequestType(params.requestType) &&
	isAttendanceCorrectionHrRole(params.actingEmployeeRole) &&
	isPendingAttendanceCorrectionHrReviewStep(params.nextStep);

export const normalizeAttendanceCorrectionWorkflowSteps = <T extends Record<string, any>>(
	_steps?: unknown,
): T[] => ATTENDANCE_CORRECTION_SUPERVISOR_THEN_HR_STEPS.map((step) => ({ ...step }) as unknown as T);
