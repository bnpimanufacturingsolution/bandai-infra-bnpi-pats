/**
 * Perfect Attendance Metrics Helper
 * Calculates perfect attendance metrics (100% presence on all scheduled obligations, zero absences, zero tardiness, and zero undertime)
 * Evaluates the entire cut-off / monthly date range against every employee's expected schedule work days.
 */

import { PrismaClient, Prisma } from "../generated/prisma";
import {
	getEmployeeName,
	attendanceMinutesFromFields,
	buildEmployeeFilter,
} from "./attendance-metrics-common.helper";
import { getDateKeyInBusinessTimeZone } from "./attendance.helper";

export interface PerfectAttendanceEmployee {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	daysPresent: number;
	totalWorkDays: number;
	isPerfect: boolean;
	lateMinutes?: number;
	undertimeMinutes?: number;
	absentDays?: number;
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

export function attendanceHasViolation(att: AttendanceRow): boolean {
	const status = String(att.status || "").toUpperCase();
	if (status === "LEAVE" || status === "ABSENT" || status === "NOT_CLOCKED_IN") {
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

export function isPresentLike(att: AttendanceRow): boolean {
	const status = String(att.status || "").toUpperCase();
	if (status === "LEAVE" || status === "ABSENT" || status === "NOT_CLOCKED_IN") return false;
	return true;
}

function countExpectedBusinessWorkdays(
	startDate: Date,
	endDate: Date,
	holidayDateKeys: Set<string>,
): number {
	const cursor = new Date(startDate);
	cursor.setUTCHours(0, 0, 0, 0);
	const end = new Date(endDate);
	end.setUTCHours(0, 0, 0, 0);
	let count = 0;

	while (cursor.getTime() <= end.getTime()) {
		const dayOfWeek = cursor.getUTCDay(); // 0 = Sun, 6 = Sat
		const dateKey = getDateKeyInBusinessTimeZone(cursor);
		// Regular work days: Monday (1) to Friday (5), excluding holidays
		if (dayOfWeek >= 1 && dayOfWeek <= 5 && !holidayDateKeys.has(dateKey)) {
			count++;
		}
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return count;
}

/**
 * Calculate perfect attendance metrics for a specific cut-off date range.
 *
 * Perfect attendance requirement:
 * 1. Employee must have scheduled work obligations in the cut-off (scheduledWorkDays > 0).
 * 2. On EVERY scheduled workday:
 *    - The employee must be Present (clocked in).
 *    - Must NOT have unexcused absence (absentDays === 0).
 *    - Must NOT be tardy / late (totalLateMinutes === 0).
 *    - Must NOT have undertime / early out (totalUndertimeMinutes === 0).
 *    - Must NOT be on leave.
 * 3. daysPresent === totalWorkDays (100% presence on scheduled work days with zero violations).
 */
export async function calculatePerfectAttendanceMetrics(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
): Promise<PerfectAttendanceMetrics> {
	const employeeWhere = buildEmployeeFilter(organizationId, departmentId);

	// 1. Fetch active employees in scope
	const employees = await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
			department: { select: { id: true, name: true } },
		},
	});

	if (employees.length === 0) {
		return {
			totalEmployees: 0,
			perfectAttendanceCount: 0,
			perfectAttendanceRate: 0,
			averageAttendanceRate: 0,
			employees: [],
		};
	}

	// 2. Fetch active holidays in date range
	const holidays = await prisma.calendarItem.findMany({
		where: {
			organizationId,
			type: "HOLIDAY",
			status: "ACTIVE",
			startDate: { lte: endDate },
			endDate: { gte: startDate },
		},
		select: {
			startDate: true,
			endDate: true,
		},
	});

	const holidayDateKeys = new Set<string>();
	for (const h of holidays) {
		const cur = new Date(Math.max(startDate.getTime(), h.startDate.getTime()));
		cur.setUTCHours(0, 0, 0, 0);
		const hEnd = new Date(Math.min(endDate.getTime(), h.endDate.getTime()));
		hEnd.setUTCHours(0, 0, 0, 0);
		while (cur.getTime() <= hEnd.getTime()) {
			holidayDateKeys.add(getDateKeyInBusinessTimeZone(cur));
			cur.setUTCDate(cur.getUTCDate() + 1);
		}
	}

	// Calculate calendar business workdays across [startDate, endDate]
	const calendarBusinessWorkdays = Math.max(
		1,
		countExpectedBusinessWorkdays(startDate, endDate, holidayDateKeys),
	);

	// 3. Query obligation aggregations from PostgreSQL
	let obligationRows: any[] = [];
	try {
		obligationRows = await prisma.$queryRaw<any[]>(Prisma.sql`
			WITH ranked AS (
				SELECT
					ao.*,
					COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD')) AS "_obligationDateKey",
					row_number() OVER (
						PARTITION BY ao."employeeId", COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD'))
						ORDER BY ao."date" DESC, pp."startDate" DESC, ao."updatedAt" DESC, ao."createdAt" DESC
					) AS "_rank"
				FROM "attendance_obligations" ao
				INNER JOIN "payroll_periods" pp ON pp."id" = ao."payrollPeriodId"
				INNER JOIN "employees" e ON e."id" = ao."employeeId"
				WHERE e."organizationId" = ${organizationId}
				  AND e."isDeleted" = false
				  AND (${departmentId ? Prisma.sql`e."departmentId" = ${departmentId}` : Prisma.sql`TRUE`})
				  AND ao."date" >= ${startDate} AND ao."date" <= ${endDate}
			),
			deduped AS (
				SELECT * FROM ranked WHERE "_rank" = 1
			)
			SELECT
				"employeeId",
				COUNT(*) AS "totalObligations",
				COUNT(*) FILTER (
					WHERE UPPER(COALESCE("status", '')) != 'REST_DAY'
					  AND UPPER(COALESCE("scheduleSnapshot"->>'shiftType', '')) != 'OFF'
				) AS "scheduledWorkDays",
				COUNT(*) FILTER (
					WHERE "timeIn" IS NOT NULL
				) AS "daysPresent",
				COUNT(*) FILTER (
					WHERE "timeIn" IS NOT NULL
					  AND UPPER(COALESCE("status", '')) NOT IN ('ABSENT', 'NOT_CLOCKED_IN', 'LEAVE')
					  AND COALESCE("lateMinutes", 0) = 0
					  AND COALESCE("undertimeMinutes", 0) = 0
					  AND COALESCE("earlyOutMinutes", 0) = 0
					  AND ("lateHours" IS NULL OR "lateHours" = '0:00' OR "lateHours" = '')
					  AND ("undertimeHours" IS NULL OR "undertimeHours" = '0:00' OR "undertimeHours" = '')
					  AND ("earlyOutHours" IS NULL OR "earlyOutHours" = '0:00' OR "earlyOutHours" = '')
				) AS "daysPresentOnTime",
				COUNT(*) FILTER (
					WHERE UPPER(COALESCE("status", '')) IN ('ABSENT', 'NOT_CLOCKED_IN', 'LEAVE')
					   OR ("timeIn" IS NULL AND "timeOut" IS NULL
						   AND UPPER(COALESCE("status", '')) != 'REST_DAY'
						   AND UPPER(COALESCE("scheduleSnapshot"->>'shiftType', '')) != 'OFF')
				) AS "absentDays",
				SUM(COALESCE("lateMinutes", 0)) AS "totalLateMinutes",
				SUM(COALESCE("undertimeMinutes", 0) + COALESCE("earlyOutMinutes", 0)) AS "totalUndertimeMinutes"
			FROM deduped
			GROUP BY "employeeId"
		`);
	} catch (err) {
		console.warn("calculatePerfectAttendanceMetrics: failed to query attendance_obligations, falling back to direct attendance query:", err);
	}

	const obligationMap = new Map<string, any>();
	for (const row of obligationRows) {
		obligationMap.set(String(row.employeeId), row);
	}

	// 4. Fallback direct attendance fetch
	const employeesNeedingDirect = employees.filter((emp) => !obligationMap.has(emp.id));
	const directAttendances = employeesNeedingDirect.length > 0
		? await prisma.attendance.findMany({
				where: {
					isDeleted: false,
					employeeId: { in: employeesNeedingDirect.map((e) => e.id) },
					date: { gte: startDate, lte: endDate },
				},
				select: {
					id: true,
					employeeId: true,
					lateHours: true,
					undertimeHours: true,
					earlyOutHours: true,
					lateMinutes: true,
					undertimeMinutes: true,
					earlyOutMinutes: true,
					status: true,
				},
			})
		: [];

	const directAttendanceByEmp = new Map<string, any[]>();
	for (const att of directAttendances) {
		const list = directAttendanceByEmp.get(att.employeeId) || [];
		list.push(att);
		directAttendanceByEmp.set(att.employeeId, list);
	}

	// 5. Build per-employee metrics evaluated against the full date range
	const results: PerfectAttendanceEmployee[] = [];

	for (const emp of employees) {
		const ob = obligationMap.get(emp.id);

		if (ob) {
			const rawScheduledWorkDays = Number(ob.scheduledWorkDays || 0);
			// Total scheduled workdays for the entire date range
			const totalWorkDays = Math.max(rawScheduledWorkDays, calendarBusinessWorkdays);
			const daysPresent = Number(ob.daysPresent || 0);
			const daysPresentOnTime = Number(ob.daysPresentOnTime || 0);
			const recordedAbsentDays = Number(ob.absentDays || 0);
			const unrecordedMissingDays = Math.max(0, totalWorkDays - daysPresent);
			const totalAbsentDays = Math.max(recordedAbsentDays, unrecordedMissingDays);
			const totalLateMinutes = Number(ob.totalLateMinutes || 0);
			const totalUndertimeMinutes = Number(ob.totalUndertimeMinutes || 0);

			// Perfect Attendance across whole date range: 100% presence on ALL scheduled days in range, zero late, zero undertime, zero absences
			const isPerfect =
				totalWorkDays > 0 &&
				daysPresentOnTime === totalWorkDays &&
				totalAbsentDays === 0 &&
				totalLateMinutes === 0 &&
				totalUndertimeMinutes === 0;

			results.push({
				id: emp.id,
				employeeId: emp.employeeId,
				name: getEmployeeName(emp),
				department: emp.department?.name || "N/A",
				daysPresent,
				totalWorkDays,
				isPerfect,
				lateMinutes: totalLateMinutes,
				undertimeMinutes: totalUndertimeMinutes,
				absentDays: totalAbsentDays,
			});
		} else {
			// Direct attendance fallback
			const empAtts = directAttendanceByEmp.get(emp.id) || [];
			const hasViolations = empAtts.some((att) => attendanceHasViolation(att));
			const daysPresent = empAtts.filter((att) => isPresentLike(att)).length;
			const totalWorkDays = calendarBusinessWorkdays;
			const isPerfect = totalWorkDays > 0 && !hasViolations && daysPresent === totalWorkDays;
			const absentDays = Math.max(0, totalWorkDays - daysPresent);

			results.push({
				id: emp.id,
				employeeId: emp.employeeId,
				name: getEmployeeName(emp),
				department: emp.department?.name || "N/A",
				daysPresent,
				totalWorkDays,
				isPerfect,
				absentDays,
			});
		}
	}

	// Active employees in roster
	const activeResults = results.filter((r) => r.totalWorkDays > 0);
	const perfectAttendance = activeResults.filter((row) => row.isPerfect);
	const totalEmployees = activeResults.length;
	const perfectPct =
		totalEmployees > 0 ? (perfectAttendance.length / totalEmployees) * 100 : 0;

	// Mean individual attendance rate among employees with records in period
	const averageAttendanceRate =
		totalEmployees > 0
			? activeResults.reduce((sum, row) => {
					const rate =
						row.totalWorkDays > 0 ? Math.min(row.daysPresent / row.totalWorkDays, 1) : 0;
					return sum + rate;
				}, 0) /
				totalEmployees *
				100
			: 0;

	// Sort perfect employees first, then by days present desc
	activeResults.sort((a, b) => {
		if (a.isPerfect !== b.isPerfect) return a.isPerfect ? -1 : 1;
		if (b.daysPresent !== a.daysPresent) return b.daysPresent - a.daysPresent;
		return a.name.localeCompare(b.name);
	});

	return {
		totalEmployees,
		perfectAttendanceCount: perfectAttendance.length,
		perfectAttendanceRate: Math.round(perfectPct * 100) / 100,
		averageAttendanceRate: Math.round(averageAttendanceRate * 100) / 100,
		employees: activeResults,
	};
}
