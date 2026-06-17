export const EMPLOYEE_SELF_SERVICE_BLOCKING_STATUSES = [
	"TERMINATED",
	"RESIGNED",
	"FORMER_EMPLOYEE",
	"RETIRED",
	"INACTIVE",
] as const;

export const EMPLOYEE_SELF_SERVICE_BLOCK_MESSAGE =
	"Your employee self-service actions are blocked because your employment is no longer active. Please contact HR for further assistance.";

export const ACCOUNT_DEACTIVATED_MESSAGE =
	"Your account has been deactivated due to termination or resignation. Please contact HR for further assistance.";

const BLOCKING_STATUS_SET = new Set<string>(EMPLOYEE_SELF_SERVICE_BLOCKING_STATUSES);

export function normalizeEmploymentStatus(status?: string | null) {
	return String(status || "")
		.trim()
		.toUpperCase();
}

export function isEmployeeSelfServiceBlockedStatus(status?: string | null) {
	return BLOCKING_STATUS_SET.has(normalizeEmploymentStatus(status));
}

export function isEmployeeOnboardingStatus(status?: string | null) {
	return normalizeEmploymentStatus(status) === "ONBOARDING";
}

export function shouldRouteToEmployeeOnboarding(metadata?: {
	isFirstLogin?: boolean | null;
	employee?: { employmentStatus?: string | null } | null;
} | null) {
	return (
		isEmployeeOnboardingStatus(metadata?.employee?.employmentStatus) &&
		metadata?.isFirstLogin !== false
	);
}

export function getEmployeeActionBlock(employee?: { employmentStatus?: string | null } | null) {
	const status = normalizeEmploymentStatus(employee?.employmentStatus);
	if (!isEmployeeSelfServiceBlockedStatus(status)) {
		return { blocked: false, status: status || employee?.employmentStatus || null };
	}

	return {
		blocked: true,
		status,
		message: EMPLOYEE_SELF_SERVICE_BLOCK_MESSAGE,
		reasonCode: "EMPLOYEE_SELF_SERVICE_BLOCKED" as const,
	};
}
