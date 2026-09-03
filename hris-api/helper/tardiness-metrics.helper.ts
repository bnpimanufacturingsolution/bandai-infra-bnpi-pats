/**
 * Tardiness, Undertime & Early Out Metrics Helper
 * Calculates tardiness, undertime, and early out metrics for employees
 * Follows Employee-first aggregation pattern from test script
 */

import { PrismaClient } from "../generated/prisma";
import {
	getEmployeeName,
	attendanceMinutesFromFields,
	buildEmployeeFilter,
} from "./attendance-metrics-common.helper";

export interface TardinessEmployee {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	tardinessCount: number;
	totalLateMinutes: number;
	avgLateMinutes: number;
	maxLateMinutes: number;
	undertimeCount: number;
	totalUndertimeMinutes: number;
	earlyOutCount: number;
	totalEarlyOutMinutes: number;
}

export interface TardinessMetrics {
	employeesWithIssues: number;
	totalTardinessInstances: number;
	totalLateHours: number;
	totalUndertimeInstances: number;
	totalUndertimeHours: number;
	totalEarlyOutInstances: number;
	totalEarlyOutHours: number;
	employees: TardinessEmployee[];
}

/**
 * Calculate tardiness, undertime, and early out metrics for a date range
 * 
 * Follows test script pattern:
 * - Start from Employee model
 * - Aggregate attendance records with lateHours, undertimeHours, earlyOutHours
 * - Calculate totals for each violation type
 * - Sort by total violation minutes (late + undertime + early out)
 *
 * @param prisma - Prisma client instance
 * @param organizationId - Organization ID
 * @param startDate - Start date of the period
 * @param endDate - End date of the period
 * @param departmentId - Optional department filter
 * @returns Tardiness metrics
 */
export async function calculateTardinessMetrics(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
): Promise<TardinessMetrics> {
	// Build employee filter (no employmentStatus filter per test script)
	const employeeWhere = buildEmployeeFilter(organizationId, departmentId);

	// Fetch employees with their attendance records
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
					lateHours: true,
					undertimeHours: true,
					earlyOutHours: true,
					lateMinutes: true,
					undertimeMinutes: true,
					earlyOutMinutes: true,
				},
			},
		},
	});

	// Calculate stats for each employee
	const tardinessStats = employees.map((emp) => {
		let tardinessCount = 0;
		let undertimeCount = 0;
		let earlyOutCount = 0;
		let totalLateMinutes = 0;
		let maxLateMinutes = 0;
		let totalUndertimeMinutes = 0;
		let totalEarlyOutMinutes = 0;

		emp.attendances.forEach((att) => {
			const lateMinutes = attendanceMinutesFromFields(att.lateHours, att.lateMinutes);
			const undertimeMinutes = attendanceMinutesFromFields(
				att.undertimeHours,
				att.undertimeMinutes,
			);
			const earlyOutMinutes = attendanceMinutesFromFields(
				att.earlyOutHours,
				att.earlyOutMinutes,
			);

			if (lateMinutes > 0) {
				tardinessCount++;
				totalLateMinutes += lateMinutes;
				if (lateMinutes > maxLateMinutes) maxLateMinutes = lateMinutes;
			}
			if (undertimeMinutes > 0) {
				undertimeCount++;
				totalUndertimeMinutes += undertimeMinutes;
			}
			if (earlyOutMinutes > 0) {
				earlyOutCount++;
				totalEarlyOutMinutes += earlyOutMinutes;
			}
		});

		const avgLateMinutes =
			tardinessCount > 0 ? Math.round((totalLateMinutes / tardinessCount) * 100) / 100 : 0;

		return {
			id: emp.id,
			employeeId: emp.employeeId,
			name: getEmployeeName(emp),
			department: emp.department?.name || "N/A",
			tardinessCount,
			totalLateMinutes,
			avgLateMinutes,
			maxLateMinutes,
			undertimeCount,
			totalUndertimeMinutes,
			earlyOutCount,
			totalEarlyOutMinutes,
		};
	}).filter((stat) => 
		stat.tardinessCount > 0 || 
		stat.undertimeCount > 0 || 
		stat.earlyOutCount > 0
	);

	// Calculate totals
	const totalTardiness = tardinessStats.reduce((sum, s) => sum + s.tardinessCount, 0);
	const totalUndertime = tardinessStats.reduce((sum, s) => sum + s.undertimeCount, 0);
	const totalEarlyOut = tardinessStats.reduce((sum, s) => sum + s.earlyOutCount, 0);
	const totalLateHours = tardinessStats.reduce((sum, s) => sum + s.totalLateMinutes, 0) / 60;
	const totalUndertimeHours = tardinessStats.reduce((sum, s) => sum + s.totalUndertimeMinutes, 0) / 60;
	const totalEarlyOutHours = tardinessStats.reduce((sum, s) => sum + s.totalEarlyOutMinutes, 0) / 60;

	// Sort by total violation minutes (late + undertime + early out)
	tardinessStats.sort((a, b) => {
		const aTotal = a.totalLateMinutes + a.totalUndertimeMinutes + a.totalEarlyOutMinutes;
		const bTotal = b.totalLateMinutes + b.totalUndertimeMinutes + b.totalEarlyOutMinutes;
		return bTotal - aTotal;
	});

	return {
		employeesWithIssues: tardinessStats.length,
		totalTardinessInstances: totalTardiness,
		totalLateHours: Math.round(totalLateHours * 100) / 100,
		totalUndertimeInstances: totalUndertime,
		totalUndertimeHours: Math.round(totalUndertimeHours * 100) / 100,
		totalEarlyOutInstances: totalEarlyOut,
		totalEarlyOutHours: Math.round(totalEarlyOutHours * 100) / 100,
		employees: tardinessStats,
	};
}
