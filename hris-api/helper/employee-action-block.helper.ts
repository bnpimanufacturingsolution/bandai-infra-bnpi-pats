import type { Prisma, PrismaClient } from "../generated/prisma";

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

/**
 * Central employee self-service blocking contract.
 *
 * Blocks employee-initiated API/UI actions once employment is final or no longer active.
 * This is intentionally broad because the employee should no longer create new operational
 * work once HR has ended or suspended the employment relationship.
 *
 * Common actions blocked by this helper:
 * - Attendance/timekeeping: clock in, clock out, manual attendance marks, time corrections
 * - Timesheets: submit period timesheets, request edit permission, resubmit corrected days
 * - Requests: leave, document requests, resignation repeats, PAN/personnel actions, time requests
 * - Approvals: employee-manager approval/rejection work assigned to the blocked employee
 * - Employee documents: employee-side uploads/resubmissions that create new HR review work
 * - Dashboard/action-needed shortcuts: any quick action that would call protected employee APIs
 *
 * HR/admin users may still view or process the employee record from HR screens when their own
 * account is active. This helper is about the actor's ability to initiate self-service work,
 * not about hiding historical records from authorized HR users.
 *
 * Statuses blocked here:
 * - TERMINATED: company-ended employment
 * - RESIGNED: completed resignation process
 * - FORMER_EMPLOYEE: normalized former-worker state
 * - RETIRED: completed retirement state
 * - INACTIVE: temporarily inactive account that should not initiate work
 *
 * Statuses intentionally not blocked here:
 * - RESIGNATION_REQUESTED, SERVING_NOTICE, OFFBOARDING
 *
 * Those states still need final-day, clearance, document, and handoff actions until HR moves
 * the employee into a final/former status. Use this helper instead of scattered status checks.
 */
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

export type EmployeeSelfServiceBlockingStatus =
	(typeof EMPLOYEE_SELF_SERVICE_BLOCKING_STATUSES)[number];

export type EmployeeActionBlockResult = {
	blocked: boolean;
	status?: string | null;
	message?: string;
	reasonCode?: "EMPLOYEE_SELF_SERVICE_BLOCKED";
};

const BLOCKING_STATUS_SET = new Set<string>(EMPLOYEE_SELF_SERVICE_BLOCKING_STATUSES);

export const normalizeEmploymentStatus = (status?: string | null) =>
	String(status || "")
		.trim()
		.toUpperCase();

export const isEmployeeSelfServiceBlockedStatus = (status?: string | null) =>
	BLOCKING_STATUS_SET.has(normalizeEmploymentStatus(status));

export const getEmployeeActionBlock = (
	employee?: { employmentStatus?: string | null } | null,
): EmployeeActionBlockResult => {
	const status = normalizeEmploymentStatus(employee?.employmentStatus);
	if (!isEmployeeSelfServiceBlockedStatus(status)) {
		return { blocked: false, status: status || employee?.employmentStatus || null };
	}

	return {
		blocked: true,
		status,
		message: EMPLOYEE_SELF_SERVICE_BLOCK_MESSAGE,
		reasonCode: "EMPLOYEE_SELF_SERVICE_BLOCKED",
	};
};

export async function getEmployeeActionBlockById(
	prisma: PrismaExecutor,
	params: {
		employeeId: string;
		organizationId?: string | null;
	},
): Promise<EmployeeActionBlockResult> {
	const employee = await prisma.employee.findFirst({
		where: {
			id: params.employeeId,
			...(params.organizationId ? { organizationId: params.organizationId } : {}),
			isDeleted: false,
		},
		select: { employmentStatus: true },
	});

	return getEmployeeActionBlock(employee);
}

export function buildEmployeeActionBlockedPayload(block: EmployeeActionBlockResult) {
	return {
		message: block.message || EMPLOYEE_SELF_SERVICE_BLOCK_MESSAGE,
		error: "EMPLOYEE_SELF_SERVICE_BLOCKED",
		data: {
			employmentStatus: block.status || null,
			reasonCode: block.reasonCode || "EMPLOYEE_SELF_SERVICE_BLOCKED",
		},
	};
}
