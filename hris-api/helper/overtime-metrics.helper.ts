/**
 * Overtime Metrics Helper
 * Calculates overtime metrics for employees
 * Follows Employee-first aggregation pattern from test script
 */

import { PrismaClient } from "../generated/prisma";
import { getEmployeeName, parseTimeToMinutes, buildEmployeeFilter } from "./attendance-metrics-common.helper";

export interface OvertimeMetricsEmployee {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	overtimeCount: number;
	totalOvertimeHours: number;
}

export interface OvertimeMetricsResponse {
	totalOvertimeHours: number;
	employeesWithOvertime: number;
	employees: OvertimeMetricsEmployee[];
}

/**
 * Calculate overtime metrics for employees within a date range
 * 
 * Follows test script pattern:
 * - Start from Employee model
 * - Filter attendances with overtimeHours not null
 * - Sum overtime hours for each employee
 * - Sort by total overtime hours descending
 *
 * @param prisma - Prisma client instance
 * @param organizationId - Organization ID
 * @param startDate - Start date of the period
 * @param endDate - End date of the period
 * @param departmentId - Optional department filter
 * @returns Overtime metrics
 */
export async function calculateOvertimeMetrics(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
): Promise<OvertimeMetricsResponse> {
	// Build employee filter (no employmentStatus filter per test script)
	const employeeWhere = buildEmployeeFilter(organizationId, departmentId);

	// Fetch employees with their overtime attendance records
	const employees = await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
			department: { select: { name: true } },
			attendances: {
				where: {
					isDeleted: false,
					date: { gte: startDate, lte: endDate },
				},
				select: {
					date: true,
					overtimeHours: true,
					overtimeMinutes: true,
				},
			},
		},
	});

	// Calculate overtime stats for each employee (minutes > 0 only; "0:00" excluded)
	const overtimeStats = employees
		.map((emp) => {
			let overtimeCount = 0;
			let totalOvertimeMinutes = 0;

			emp.attendances.forEach((att) => {
				const minutes =
					typeof att.overtimeMinutes === "number" &&
					Number.isFinite(att.overtimeMinutes) &&
					att.overtimeMinutes > 0
						? att.overtimeMinutes
						: parseTimeToMinutes(att.overtimeHours);
				if (minutes > 0) {
					overtimeCount++;
					totalOvertimeMinutes += minutes;
				}
			});

			return {
				id: emp.id,
				employeeId: emp.employeeId,
				name: getEmployeeName(emp),
				department: emp.department?.name || "N/A",
				overtimeCount,
				totalOvertimeHours: Math.round((totalOvertimeMinutes / 60) * 100) / 100,
			};
		})
		.filter((stat) => stat.totalOvertimeHours > 0);

	// Calculate totals
	const totalOvertimeHours = overtimeStats.reduce((sum, s) => sum + s.totalOvertimeHours, 0);

	// Sort by total overtime hours descending
	overtimeStats.sort((a, b) => b.totalOvertimeHours - a.totalOvertimeHours);

	return {
		totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
		employeesWithOvertime: overtimeStats.length,
		employees: overtimeStats,
	};
}
