// @ts-nocheck
/**
 * Attendance Metrics Helper
 * Calculates attendance status summary (PRESENT, LEAVE, ABSENT) for a date range
 */

import { PrismaClient } from "../generated/prisma";
import { getEffectiveEmploymentStartDate } from "./attendance.helper";
import {
	collectShiftTypeIdsFromEmployeeScheduleData,
	resolveEffectiveShiftFromEmployeeData,
} from "./employee-schedule.helper";

/**
 * Calculate attendance status summary for a date range
 * This uses the exact same logic as the test-attendance-metrics.ts script
 */
export async function calculateAttendanceStatusSummary(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
): Promise<{ PRESENT: number; LEAVE: number; ABSENT: number }> {
	// Fetch all active employees (no hire date filter at query level)
	const employees = await prisma.employee.findMany({
		where: {
			organizationId,
			isDeleted: false,
		},
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
			person: {
				select: {
					personalInfo: true,
				},
			},
			attendances: {
				where: {
					isDeleted: false,
					date: { gte: startDate, lte: endDate },
				},
				select: { status: true, date: true },
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

	let present = 0;
	let leave = 0;
	let absent = 0;

	// Iterate through each day in the range
	const cursorDate = new Date(startDate);
	while (cursorDate <= endDate) {
		const dayStart = new Date(cursorDate);
		const dayEnd = new Date(cursorDate);
		dayStart.setHours(0, 0, 0, 0);
		dayEnd.setHours(23, 59, 59, 999);

		for (const emp of employees) {
			const effectiveStartDate = getEffectiveEmploymentStartDate(emp);
			if (effectiveStartDate && effectiveStartDate > dayEnd) continue;

			// Check if this is a work day for the employee
			const shift = resolveEffectiveShiftFromEmployeeData(emp, cursorDate, shiftTypeById);
			if (!shift || shift.isOff) continue;

			// Find attendance record for this day
			const attendance = emp.attendances.find((a) => {
				if (!a.date) return false;
				const d = new Date(a.date);
				return d >= dayStart && d <= dayEnd;
			});

			// Count based on attendance status
			if (!attendance) {
				// No attendance record on a work day = ABSENT
				absent++;
			} else if (attendance.status === "LEAVE") {
				leave++;
			} else {
				// PRESENT and INCOMPLETE are both considered present workday records
				present++;
			}
		}

		cursorDate.setDate(cursorDate.getDate() + 1);
	}

	return { PRESENT: present, LEAVE: leave, ABSENT: absent };
}

