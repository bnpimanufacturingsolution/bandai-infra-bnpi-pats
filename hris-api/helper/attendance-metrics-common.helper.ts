/**
 * Common Attendance Metrics Helper
 * Shared utilities and interfaces for all attendance metrics helpers
 * Follows DRY principles to eliminate code duplication
 */

import { PrismaClient } from "../generated/prisma";

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

/**
 * Base employee filter interface
 */
export interface BaseEmployeeFilter {
	organizationId: string;
	isDeleted: boolean;
	departmentId?: string;
	reportToId?: string;
	id?: string;
}

/**
 * Build base employee filter
 */
export function buildEmployeeFilter(
	organizationId: string,
	departmentId?: string,
	reportToId?: string,
): BaseEmployeeFilter {
	const filter: BaseEmployeeFilter = {
		organizationId,
		isDeleted: false,
	};

	if (departmentId) {
		filter.departmentId = departmentId;
	}

	if (reportToId) {
		filter.reportToId = reportToId;
	}

	return filter;
}
