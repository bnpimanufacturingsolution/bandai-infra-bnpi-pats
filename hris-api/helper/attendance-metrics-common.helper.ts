/**
 * Common Attendance Metrics Helper
 * Shared utilities and interfaces for all attendance metrics helpers
 * Follows DRY principles to eliminate code duplication
 */

import { PrismaClient, Prisma } from "../generated/prisma";

/**
 * Helper: Parse time string "HH:MM" to total minutes
 */
export function parseTimeToMinutes(timeStr: string | null): number {
	if (!timeStr) return 0;
	const [hours, minutes] = timeStr.split(":").map(Number);
	return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Helper: Get employee display name
 */
export function getEmployeeName(employee: any): string {
	if (!employee) return "UNKNOWN";
	if (employee.person?.personalInfo?.firstName && employee.person?.personalInfo?.lastName) {
		const firstName = employee.person.personalInfo.firstName.trim();
		const lastName = employee.person.personalInfo.lastName.trim();
		return `${firstName} ${lastName}`;
	}
	return employee.employeeId || employee.id || "UNKNOWN";
}

export interface EmployeeScopeFilter {
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeId?: string;
}

/**
 * Build base employee filter
 */
export function buildEmployeeFilter(
	organizationId: string,
	scopeOrDepartmentId?: string | EmployeeScopeFilter,
	reportToId?: string,
): Prisma.EmployeeWhereInput {
	const scope: EmployeeScopeFilter =
		typeof scopeOrDepartmentId === "object" && scopeOrDepartmentId !== null
			? scopeOrDepartmentId
			: {
					departmentId: scopeOrDepartmentId || undefined,
					reportToId,
				};

	const filter: Prisma.EmployeeWhereInput = {
		organizationId,
		isDeleted: false,
	};

	if (scope.departmentId) {
		filter.departmentId = scope.departmentId;
	}

	if (scope.sectionId) {
		filter.position = {
			sectionId: scope.sectionId,
		};
	}

	if (scope.positionId) {
		filter.positionId = scope.positionId;
	}

	if (scope.levelId) {
		filter.levelId = scope.levelId;
	}

	if (scope.reportToId) {
		filter.reportToId = scope.reportToId;
	}

	if (scope.employeeId) {
		filter.id = scope.employeeId;
	}

	return filter;
}
