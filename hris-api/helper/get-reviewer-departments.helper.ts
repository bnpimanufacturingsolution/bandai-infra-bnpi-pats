import { prisma } from "../config/database";

interface GetReviewerDepartmentsParams {
	requesterId: string;
	requesterRole: string;
}

/**
 * Determines which departments should review a request based on the requester's role.
 *
 * Role-based reviewer logic:
 * - EMPLOYEE (hris-employee): Only HR department (employee's reportTo handles direct approval)
 * - EMPLOYEE MANAGER (hris-employee-manager): HR department only
 * - HR USER (hris-hr-user): HR department only
 * - HR MANAGER (hris-hr-manager): No reviewers needed (auto-approved)
 *
 * Note: Employee reviewers (reportTo) are handled separately in the request controller
 *
 * @param params - Object containing requesterId and requesterRole
 * @returns Array of department IDs that must review the request
 */
export async function getReviewerDepartments({
	requesterId,
	requesterRole,
}: GetReviewerDepartmentsParams): Promise<string[]> {
	const reviewerDepartmentIds: string[] = [];

	// HR MANAGER role - no reviewers needed
	if (requesterRole === "hris-hr-manager") {
		return reviewerDepartmentIds;
	}

	// Get HR department (needed for all roles except HR MANAGER)
	const hrDepartment = await prisma.department.findFirst({
		where: {
			name: "Human Resources",
			isDeleted: false,
		},
		select: {
			id: true,
		},
	});

	if (!hrDepartment) {
		throw new Error(
			"HR department 'Human Resources' not found. Please ensure the HR department exists in the system.",
		);
	}

	// For all roles, only HR department reviews
	// Employee's direct manager (reportTo) is added as an employee reviewer in the controller
	reviewerDepartmentIds.push(hrDepartment.id);

	return reviewerDepartmentIds;
}
