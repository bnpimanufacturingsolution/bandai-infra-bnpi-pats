// @ts-nocheck
/**
 * Attendance Summary Helper
 * Aggregates attendance data for today, week, and month
 * Provides summary counts of present, absent, on leave, etc.
 */

import { PrismaClient } from "../generated/prisma";
import { getEffectiveEmploymentStartDate } from "./attendance.helper";
import {
	collectShiftTypeIdsFromEmployeeScheduleData,
	resolveEffectiveShiftFromEmployeeData,
} from "./employee-schedule.helper";

export interface AttendanceSummary {
	totalEmployees: number;
	present: number;
	absent: number;
	onLeave: number;
	restDay: number;
	late: number;
	undertime: number;
	overtime: number;
	notYetIn: number; // Employees who haven't clocked in yet (for today only)
	attendanceRate: number; // (present + onLeave) / totalEmployees * 100
}

export interface AttendanceSummaryReport {
	today: AttendanceSummary;
	thisWeek: AttendanceSummary;
	thisMonth: AttendanceSummary;
	generatedAt: Date;
}

/**
 * Get start and end of today
 */
function getTodayRange(): { start: Date; end: Date } {
	const now = new Date();
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	const end = new Date(now);
	end.setHours(23, 59, 59, 999);
	return { start, end };
}

/**
 * Get start and end of current week (Monday to Sunday)
 */
function getWeekRange(): { start: Date; end: Date } {
	const now = new Date();
	const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
	const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Adjust to Monday start

	const start = new Date(now);
	start.setDate(now.getDate() - diff);
	start.setHours(0, 0, 0, 0);

	const end = new Date(start);
	end.setDate(start.getDate() + 6);
	end.setHours(23, 59, 59, 999);

	return { start, end };
}

/**
 * Get start and end of current month
 */
function getMonthRange(): { start: Date; end: Date } {
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	start.setHours(0, 0, 0, 0);
	const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	end.setHours(23, 59, 59, 999);
	return { start, end };
}

/**
 * Calculate attendance summary for a specific date range
 */
async function calculateAttendanceSummary(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
	isToday: boolean = false,
): Promise<AttendanceSummary> {
	// Build employee filter
	const employeeWhere: any = {
		organizationId,
		isDeleted: false,
	};

	if (departmentId) {
		employeeWhere.departmentId = departmentId;
	}

	// Get all active employees
	const employees = await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			employeeId: true,
			employmentHireDate: true,
			employmentStartDate: true,
			employmentTerminationDate: true,
			embeddedSchedule: true,
			scheduleOverrides: {
				where: {
					isDeleted: false,
					date: { gte: startDate, lte: endDate },
				},
				include: {
					shiftType: true,
				},
			},
			attendances: {
				where: {
					isDeleted: false,
					date: { gte: startDate, lte: endDate },
				},
				select: {
					date: true,
					status: true,
					timeIn: true,
					behaviorFlags: true,
					lateHours: true,
					undertimeHours: true,
					overtimeHours: true,
				},
			},
		},
	});
	const shiftTypeIds = new Set<string>();
	for (const employee of employees) {
		for (const id of collectShiftTypeIdsFromEmployeeScheduleData(employee)) {
			shiftTypeIds.add(id);
		}
	}

	const shiftTypes =
		shiftTypeIds.size > 0
			? await prisma.shiftType.findMany({
					where: {
						organizationId,
						isDeleted: false,
						id: {
							in: Array.from(shiftTypeIds),
						},
					},
			  })
			: [];
	const shiftTypeById = new Map(shiftTypes.map((shiftType) => [String(shiftType.id), shiftType]));

	let totalEmployees = 0;
	let presentCount = 0;
	let absentCount = 0;
	let onLeaveCount = 0;
	let restDayCount = 0;
	let lateCount = 0;
	let undertimeCount = 0;
	let overtimeCount = 0;
	let notYetInCount = 0;

	const now = new Date();

	// Process each employee
	for (const emp of employees) {
		// Skip if not employed during this period
		const effectiveStartDate = getEffectiveEmploymentStartDate(emp);

		// Create attendance map for quick lookup
		const attendanceMap = new Map<string, any>();
		emp.attendances.forEach((att) => {
			if (att.date) {
				const dateKey = att.date.toISOString().split("T")[0];
				attendanceMap.set(dateKey, att);
			}
		});

		// Iterate through each day in the range
		const cursorDate = new Date(startDate);
		let hasWorkDay = false;

		while (cursorDate <= endDate) {
			const dayStart = new Date(cursorDate);
			const dayEnd = new Date(cursorDate);
			dayStart.setHours(0, 0, 0, 0);
			dayEnd.setHours(23, 59, 59, 999);
			const dateKey = cursorDate.toISOString().split("T")[0];

			if (effectiveStartDate && effectiveStartDate > dayEnd) {
				cursorDate.setDate(cursorDate.getDate() + 1);
				continue;
			}
			if (emp.employmentTerminationDate && emp.employmentTerminationDate < dayStart) {
				cursorDate.setDate(cursorDate.getDate() + 1);
				continue;
			}

			// Find effective shift for this day based on assignment + overrides
			const shift = resolveEffectiveShiftFromEmployeeData(emp, cursorDate, shiftTypeById);
			if (!shift || shift.isOff) {
				if (shift?.isOff) {
					restDayCount++;
				}
				cursorDate.setDate(cursorDate.getDate() + 1);
				continue;
			}

			// This is a work day
			hasWorkDay = true;

			const attendance = attendanceMap.get(dateKey);

			if (!attendance) {
				// No attendance record
				if (isToday && cursorDate.toDateString() === now.toDateString()) {
					// For today, if no record yet, mark as "not yet in"
					notYetInCount++;
				} else {
					// For past days, no record = absent
					absentCount++;
				}
			} else {
				// Has attendance record - check status
				if (attendance.status === "LEAVE") {
					onLeaveCount++;
				} else if (attendance.status === "INCOMPLETE") {
					presentCount++;
				} else if (attendance.status === "PRESENT" || attendance.timeIn) {
					presentCount++;

					// Check for late/undertime/overtime
					if (attendance.lateHours && attendance.lateHours !== "00:00") {
						lateCount++;
					}
					if (attendance.undertimeHours && attendance.undertimeHours !== "00:00") {
						undertimeCount++;
					}
					if (attendance.overtimeHours && attendance.overtimeHours !== "00:00") {
						overtimeCount++;
					}
				} else {
					// Other statuses still count as present
					presentCount++;
				}

			}

			cursorDate.setDate(cursorDate.getDate() + 1);
		}

		// Only count employees who have at least one work day in the period
		if (hasWorkDay) {
			totalEmployees++;
		}
	}

	// Calculate attendance rate
	const attendanceRate =
		totalEmployees > 0 ? ((presentCount + onLeaveCount) / totalEmployees) * 100 : 0;

	return {
		totalEmployees,
		present: presentCount,
		absent: absentCount,
		onLeave: onLeaveCount,
		restDay: restDayCount,
		late: lateCount,
		undertime: undertimeCount,
		overtime: overtimeCount,
		notYetIn: notYetInCount,
		attendanceRate: Math.round(attendanceRate * 100) / 100,
	};
}

/**
 * Get comprehensive attendance summary for today, this week, and this month
 */
export async function getAttendanceSummaryReport(
	prisma: PrismaClient,
	organizationId: string,
	departmentId?: string,
): Promise<AttendanceSummaryReport> {
	const todayRange = getTodayRange();
	const weekRange = getWeekRange();
	const monthRange = getMonthRange();

	console.log("[ATTENDANCE SUMMARY] Calculating for:", {
		today: todayRange,
		week: weekRange,
		month: monthRange,
	});

	const [today, thisWeek, thisMonth] = await Promise.all([
		calculateAttendanceSummary(
			prisma,
			organizationId,
			todayRange.start,
			todayRange.end,
			departmentId,
			true, // isToday flag
		),
		calculateAttendanceSummary(
			prisma,
			organizationId,
			weekRange.start,
			weekRange.end,
			departmentId,
		),
		calculateAttendanceSummary(
			prisma,
			organizationId,
			monthRange.start,
			monthRange.end,
			departmentId,
		),
	]);

	return {
		today,
		thisWeek,
		thisMonth,
		generatedAt: new Date(),
	};
}

/**
 * Get attendance summary for a custom date range
 */
export async function getCustomAttendanceSummary(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
): Promise<AttendanceSummary> {
	return calculateAttendanceSummary(prisma, organizationId, startDate, endDate, departmentId);
}

