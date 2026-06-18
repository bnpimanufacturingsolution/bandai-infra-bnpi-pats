/**
 * Perfect Attendance Metrics Helper
 * Calculates perfect attendance metrics (zero absences AND zero tardiness)
 * Follows Employee-first aggregation pattern from test script
 */

import { PrismaClient } from "../generated/prisma";
import { findShiftForDay } from "./schedule.helper";
import { getEmployeeName, parseTimeToMinutes, buildEmployeeFilter } from "./attendance-metrics-common.helper";

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

/**
 * Calculate perfect attendance metrics for a specific date range
 * Perfect attendance = zero absences AND zero tardiness/undertime/early out
 * 
 * Follows test script pattern:
 * - Start from Employee model
 * - Filter attendances with violations (lateHours, undertimeHours, status LEAVE)
 * - Employees with zero violations have perfect attendance
 *
 * @param prisma - Prisma client instance
 * @param organizationId - Organization ID
 * @param startDate - Start date of the period (normalized to start of day)
 * @param endDate - End date of the period (normalized to end of day)
 * @param departmentId - Optional department filter
 * @returns Perfect attendance metrics
 */
export async function calculatePerfectAttendanceMetrics(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
): Promise<PerfectAttendanceMetrics> {
	// Build employee filter (no employmentStatus filter per test script)
	const employeeWhere = buildEmployeeFilter(organizationId, departmentId);

	// Fetch employees with their attendance records
	// We need TWO queries:
	// 1. Attendances WITH violations (to exclude)
	// 2. ALL attendances (to ensure they have records)
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
					status: true,
				},
			},
		},
	});

	// Filter employees with perfect attendance:
	// - Must have at least 1 attendance record
	// - Must have zero violations (no late, undertime, or leave)
	const perfectAttendance = employees.filter((emp) => {
		if (emp.attendances.length === 0) return false; // No records = not perfect
		
		// Check if any attendance has violations
		const hasViolations = emp.attendances.some(
			(att) => att.lateHours || att.undertimeHours || att.status === "LEAVE"
		);
		
		return !hasViolations;
	});

	const perfectPct = employees.length > 0 
		? (perfectAttendance.length / employees.length) * 100 
		: 0;

	// Map to response format
	const results: PerfectAttendanceEmployee[] = employees.map((emp) => {
		const hasViolations = emp.attendances.some(
			(att) => att.lateHours || att.undertimeHours || att.status === "LEAVE"
		);
		const isPerfect = emp.attendances.length > 0 && !hasViolations;

		return {
			id: emp.id,
			employeeId: emp.employeeId,
			name: getEmployeeName(emp),
			department: emp.department?.name || "N/A",
			daysPresent: emp.attendances.length,
			totalWorkDays: emp.attendances.length, // Simplified: count all attendance records
			isPerfect,
		};
	});

	return {
		totalEmployees: employees.length,
		perfectAttendanceCount: perfectAttendance.length,
		perfectAttendanceRate: Math.round(perfectPct * 100) / 100,
		averageAttendanceRate: 0, // Not calculated in simplified version
		employees: results,
	};
}
