/**
 * Manhours metrics (spec gap M2.4 — "manhour reference", operator definition
 * 2026-08-26: a man-hour equals one hour of work done by one person).
 *
 * Source of truth: the Attendance ledger (`totalMinutesWorked`, already net of
 * breaks and auto-calculated from timeIn/timeOut/schedule). Rows with no
 * timeOut yet are excluded until closed.
 */
import type { PrismaClient } from "../generated/prisma";
import { getEmployeeName, buildEmployeeFilter } from "./attendance-metrics-common.helper";

export interface ManhoursEmployeeRow {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	daysWorked: number;
	totalMinutes: number;
	totalHours: number;
}

export interface ManhoursDepartmentRow {
	department: string;
	employees: number;
	totalMinutes: number;
	totalHours: number;
}

const round1 = (value: number) => Math.round(Number(value || 0) * 10) / 10;

export async function calculateManhoursMetrics(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
) {
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
					timeOut: { not: null },
				},
				select: { date: true, totalMinutesWorked: true },
			},
		},
	});

	const departmentMap = new Map<string, { employees: number; totalMinutes: number }>();
	const employeeRows: ManhoursEmployeeRow[] = [];

	for (const emp of employees) {
		let totalMinutes = 0;
		let daysWorked = 0;
		for (const attendance of emp.attendances) {
			const minutes = Number(attendance.totalMinutesWorked || 0);
			if (minutes > 0) {
				totalMinutes += minutes;
				daysWorked += 1;
			}
		}
		if (daysWorked === 0) continue;

		const row: ManhoursEmployeeRow = {
			id: emp.id,
			employeeId: emp.employeeId,
			name: getEmployeeName(emp),
			department: emp.department?.name || "No Department",
			daysWorked,
			totalMinutes,
			totalHours: round1(totalMinutes / 60),
		};
		employeeRows.push(row);

		const bucket =
			departmentMap.get(row.department) || { employees: 0, totalMinutes: 0 };
		bucket.employees += 1;
		bucket.totalMinutes += totalMinutes;
		departmentMap.set(row.department, bucket);
	}

	employeeRows.sort(
		(a, b) => b.totalMinutes - a.totalMinutes || a.employeeId.localeCompare(b.employeeId),
	);

	const departments = Array.from(departmentMap.entries())
		.map(([department, bucket]) => ({
			department,
			employees: bucket.employees,
			totalMinutes: bucket.totalMinutes,
			totalHours: round1(bucket.totalMinutes / 60),
		}))
		.sort((a, b) => b.totalHours - a.totalHours);

	return {
		period: {
			from: startDate.toISOString().slice(0, 10),
			to: endDate.toISOString().slice(0, 10),
		},
		definition:
			"One man-hour equals one hour of work done by one person (operator definition 2026-08-26). Hours come from Attendance totalMinutesWorked (net of breaks).",
		grandTotals: {
			employees: employeeRows.length,
			daysWorked: employeeRows.reduce((sum, row) => sum + row.daysWorked, 0),
			totalMinutes: employeeRows.reduce((sum, row) => sum + row.totalMinutes, 0),
			totalHours: round1(employeeRows.reduce((sum, row) => sum + row.totalHours, 0)),
		},
		employees: employeeRows,
		departments,
	};
}
