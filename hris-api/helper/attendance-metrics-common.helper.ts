/**
 * Common Attendance Metrics Helper
 * Shared utilities and interfaces for all attendance metrics helpers
 * Follows DRY principles to eliminate code duplication
 */

import { PrismaClient, Prisma } from "../generated/prisma";

/**
 * Helper: Parse time string "HH:MM" (or "H:MM:SS") to total minutes.
 * Treats "0:00", empty, and non-numeric junk as 0 — never truthy-string traps.
 */
export function parseTimeToMinutes(timeStr: string | null | undefined): number {
	if (timeStr == null) return 0;
	const raw = String(timeStr).trim();
	if (!raw || raw === "0" || raw === "0:00" || raw === "00:00") return 0;

	const parts = raw.split(":").map((part) => Number(part));
	if (parts.some((part) => Number.isNaN(part))) return 0;

	const [hours = 0, minutes = 0] = parts;
	const total = (hours || 0) * 60 + (minutes || 0);
	return total > 0 ? total : 0;
}

/**
 * Prefer numeric minute fields when present; fall back to HH:MM strings.
 * Used by attendance report metrics so "0:00" never counts as a violation.
 */
export function attendanceMinutesFromFields(
	hoursField?: string | null,
	minutesField?: number | null,
): number {
	if (typeof minutesField === "number" && Number.isFinite(minutesField) && minutesField > 0) {
		return Math.round(minutesField);
	}
	return parseTimeToMinutes(hoursField);
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
