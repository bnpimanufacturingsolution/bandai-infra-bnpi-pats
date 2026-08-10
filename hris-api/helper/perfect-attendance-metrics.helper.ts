/**
 * Perfect Attendance Metrics Helper
 * Calculates perfect attendance metrics (zero absences AND zero tardiness)
 * Follows Employee-first aggregation pattern from test script
 */

import { PrismaClient } from "../generated/prisma";
import {
	getEmployeeName,
	attendanceMinutesFromFields,
	buildEmployeeFilter,
} from "./attendance-metrics-common.helper";

export interface PerfectAttendanceEmployee {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	daysPresent: number;
	totalWorkDays: number;
	isPerfect: boolean;
}

export interface PerfectAttendanceMetrics {
	totalEmployees: number;
	perfectAttendanceCount: number;
	perfectAttendanceRate: number;
	averageAttendanceRate: number;
	employees: PerfectAttendanceEmployee[];
}

type AttendanceRow = {
	id: string;
	lateHours: string | null;
	undertimeHours: string | null;
	earlyOutHours?: string | null;
	lateMinutes?: number | null;
	undertimeMinutes?: number | null;
	earlyOutMinutes?: number | null;
	status: string | null;
};

function attendanceHasViolation(att: AttendanceRow): boolean {
	const status = String(att.status || "").toUpperCase();
	if (status === "LEAVE" || status === "ABSENT") {
		return true;
	}

	const lateMinutes = attendanceMinutesFromFields(att.lateHours, att.lateMinutes);
	const undertimeMinutes = attendanceMinutesFromFields(
		att.undertimeHours,
		att.undertimeMinutes,
	);
	const earlyOutMinutes = attendanceMinutesFromFields(
		att.earlyOutHours,
		att.earlyOutMinutes,
	);

	return lateMinutes > 0 || undertimeMinutes > 0 || earlyOutMinutes > 0;
}

function isPresentLike(att: AttendanceRow): boolean {
	const status = String(att.status || "").toUpperCase();
	if (status === "LEAVE" || status === "ABSENT") return false;
	return true;
}

/**
 * Calculate perfect attendance metrics for a specific date range
 * Perfect attendance = at least one in-period attendance, zero absences,
 * and zero tardiness / undertime / early-out (minutes > 0).
 *
 * Important: "0:00" hour strings are NOT violations (parse to 0 minutes).
 */
export async function calculatePerfectAttendanceMetrics(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
): Promise<PerfectAttendanceMetrics> {
	const employeeWhere = buildEmployeeFilter(organizationId, departmentId);

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
					id: true,
					lateHours: true,
					undertimeHours: true,
					earlyOutHours: true,
					lateMinutes: true,
					undertimeMinutes: true,
					earlyOutMinutes: true,
					status: true,
				},
			},
		},
	});

	// Period-scoped population: only employees who have attendance in the range.
	const employeesWithRecords = employees.filter((emp) => emp.attendances.length > 0);

	const results: PerfectAttendanceEmployee[] = employeesWithRecords.map((emp) => {
		const hasViolations = emp.attendances.some((att) => attendanceHasViolation(att));
		const daysPresent = emp.attendances.filter((att) => isPresentLike(att)).length;
		const totalWorkDays = emp.attendances.length;
		const isPerfect = totalWorkDays > 0 && !hasViolations;

		return {
			id: emp.id,
			employeeId: emp.employeeId,
			name: getEmployeeName(emp),
			department: emp.department?.name || "N/A",
			daysPresent,
			totalWorkDays,
			isPerfect,
		};
	});

	const perfectAttendance = results.filter((row) => row.isPerfect);
	const totalEmployees = results.length;
	const perfectPct =
		totalEmployees > 0 ? (perfectAttendance.length / totalEmployees) * 100 : 0;

	// Mean individual attendance rate among employees with records in period.
	const averageAttendanceRate =
		totalEmployees > 0
			? results.reduce((sum, row) => {
					const rate =
						row.totalWorkDays > 0 ? row.daysPresent / row.totalWorkDays : 0;
					return sum + rate;
				}, 0) /
				totalEmployees *
				100
			: 0;

	// Sort perfect employees first, then by days present desc for table UX.
	results.sort((a, b) => {
		if (a.isPerfect !== b.isPerfect) return a.isPerfect ? -1 : 1;
		return b.daysPresent - a.daysPresent;
	});

	return {
		totalEmployees,
		perfectAttendanceCount: perfectAttendance.length,
		perfectAttendanceRate: Math.round(perfectPct * 100) / 100,
		averageAttendanceRate: Math.round(averageAttendanceRate * 100) / 100,
		employees: results,
	};
}
