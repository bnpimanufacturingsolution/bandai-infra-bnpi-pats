/**
 * Overtime Metrics Helper
 * Calculates actual overtime worked vs approved overtime from timesheets/requests
 */

import { PrismaClient, Prisma } from "../generated/prisma";
import { getEmployeeName, parseTimeToMinutes, buildEmployeeFilter } from "./attendance-metrics-common.helper";

export interface OvertimeMetricsEmployee {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	workforceSource: "DIRECT" | "AGENCY";
	overtimeCount: number;
	totalOvertimeHours: number;
	approvedOvertimeHours: number;
	unapprovedOvertimeHours: number;
	approvalStatus: "APPROVED" | "PARTIALLY_APPROVED" | "UNAPPROVED" | "NONE";
}

export interface OvertimeLaborSplit {
	totalOvertimeHours: number;
	employeesWithOvertime: number;
}

export interface OvertimeMetricsResponse {
	totalOvertimeHours: number;
	employeesWithOvertime: number;
	totalApprovedOvertimeHours: number;
	employeesWithApprovedOvertime: number;
	totalUnapprovedOvertimeHours: number;
	employeesWithUnapprovedOvertime: number;
	employees: OvertimeMetricsEmployee[];
	split: {
		direct: OvertimeLaborSplit;
		agency: OvertimeLaborSplit;
	};
}

const normalizeWorkforceSource = (value: unknown): "DIRECT" | "AGENCY" =>
	String(value || "").trim().toUpperCase() === "AGENCY" ? "AGENCY" : "DIRECT";

/**
 * Calculate overtime metrics (Actual OT vs Approved OT) for employees within a date range
 */
export async function calculateOvertimeMetrics(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
	workforceSource?: string,
): Promise<OvertimeMetricsResponse> {
	const employeeWhere = buildEmployeeFilter(organizationId, departmentId);

	// 1. Fetch active employees
	const employees = await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
			department: { select: { name: true } },
			workforceSource: true,
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

	// 2. Query actual overtime from attendance_obligations
	let obligationOtRows: any[] = [];
	try {
		obligationOtRows = await prisma.$queryRaw<any[]>(Prisma.sql`
			SELECT
				ao."employeeId",
				COUNT(*) FILTER (
					WHERE COALESCE(ao."overtimeMinutes", 0) > 0
					   OR (ao."overtimeHours" IS NOT NULL AND ao."overtimeHours" != '0:00' AND ao."overtimeHours" != '')
				) AS "otCount",
				SUM(
					COALESCE(ao."overtimeMinutes", 0) +
					CASE
						WHEN ao."overtimeHours" IS NOT NULL AND ao."overtimeHours" != '0:00' AND ao."overtimeHours" != '' THEN
							(SPLIT_PART(ao."overtimeHours", ':', 1)::int * 60 + COALESCE(NULLIF(SPLIT_PART(ao."overtimeHours", ':', 2), '')::int, 0))
						ELSE 0
					END
				) AS "totalOtMinutes"
			FROM "attendance_obligations" ao
			INNER JOIN "employees" e ON e."id" = ao."employeeId"
			WHERE e."organizationId" = ${organizationId}
			  AND e."isDeleted" = false
			  AND (${departmentId ? Prisma.sql`e."departmentId" = ${departmentId}` : Prisma.sql`TRUE`})
			  AND ao."date" >= ${startDate} AND ao."date" <= ${endDate}
			GROUP BY ao."employeeId"
		`);
	} catch (err) {
		console.warn("Failed to query attendance_obligations for overtime:", err);
	}

	const obligationOtMap = new Map<string, { otCount: number; totalOtMinutes: number }>();
	for (const row of obligationOtRows) {
		obligationOtMap.set(String(row.employeeId), {
			otCount: Number(row.otCount || 0),
			totalOtMinutes: Number(row.totalOtMinutes || 0),
		});
	}

	// 3. Query approved overtime from timesheet_lines & timesheets
	let approvedOtRows: any[] = [];
	try {
		approvedOtRows = await prisma.$queryRaw<any[]>(Prisma.sql`
			SELECT
				tl."employeeId",
				COUNT(*) AS "approvedCount",
				SUM(
					CASE
						WHEN tl."overtimeHours" IS NOT NULL AND tl."overtimeHours" != '0:00' AND tl."overtimeHours" != '' THEN
							(SPLIT_PART(tl."overtimeHours", ':', 1)::int * 60 + COALESCE(NULLIF(SPLIT_PART(tl."overtimeHours", ':', 2), '')::int, 0))
						ELSE 0
					END
				) AS "approvedMinutes"
			FROM "timesheet_lines" tl
			INNER JOIN "timesheets" t ON t."id" = tl."timesheetId"
			INNER JOIN "employees" e ON e."id" = tl."employeeId"
			WHERE tl."organizationId" = ${organizationId}
			  AND tl."isDeleted" = false
			  AND tl."isEffective" = true
			  AND tl."date" >= ${startDate}
			  AND tl."date" <= ${endDate}
			  AND t."status" = 'APPROVED'
			  AND t."isDeleted" = false
			  AND (${departmentId ? Prisma.sql`e."departmentId" = ${departmentId}` : Prisma.sql`TRUE`})
			GROUP BY tl."employeeId"
		`);
	} catch (err) {
		console.warn("Failed to query timesheet_lines for approved overtime:", err);
	}

	const approvedOtMap = new Map<string, { approvedCount: number; approvedMinutes: number }>();
	for (const row of approvedOtRows) {
		approvedOtMap.set(String(row.employeeId), {
			approvedCount: Number(row.approvedCount || 0),
			approvedMinutes: Number(row.approvedMinutes || 0),
		});
	}

	// 4. Calculate stats for each employee
	const overtimeStats: OvertimeMetricsEmployee[] = employees
		.map((emp) => {
			const obOt = obligationOtMap.get(emp.id);
			const appOt = approvedOtMap.get(emp.id);

			// Check direct attendances
			let directOtMinutes = 0;
			let directOtCount = 0;
			emp.attendances.forEach((att) => {
				const minutes =
					typeof att.overtimeMinutes === "number" &&
					Number.isFinite(att.overtimeMinutes) &&
					att.overtimeMinutes > 0
						? att.overtimeMinutes
						: parseTimeToMinutes(att.overtimeHours);
				if (minutes > 0) {
					directOtCount++;
					directOtMinutes += minutes;
				}
			});

			const totalOtMinutes = Math.max(obOt?.totalOtMinutes || 0, directOtMinutes, appOt?.approvedMinutes || 0);
			const otCount = Math.max(obOt?.otCount || 0, directOtCount, appOt?.approvedCount || 0);
			const approvedMinutes = appOt?.approvedMinutes || 0;
			const unapprovedMinutes = Math.max(0, totalOtMinutes - approvedMinutes);

			const totalOvertimeHours = Math.round((totalOtMinutes / 60) * 100) / 100;
			const approvedOvertimeHours = Math.round((approvedMinutes / 60) * 100) / 100;
			const unapprovedOvertimeHours = Math.round((unapprovedMinutes / 60) * 100) / 100;

			let approvalStatus: "APPROVED" | "PARTIALLY_APPROVED" | "UNAPPROVED" | "NONE" = "NONE";
			if (totalOvertimeHours > 0) {
				if (approvedOvertimeHours >= totalOvertimeHours) {
					approvalStatus = "APPROVED";
				} else if (approvedOvertimeHours > 0) {
					approvalStatus = "PARTIALLY_APPROVED";
				} else {
					approvalStatus = "UNAPPROVED";
				}
			}

			return {
				id: emp.id,
				employeeId: emp.employeeId,
				name: getEmployeeName(emp),
				department: emp.department?.name || "N/A",
				workforceSource: normalizeWorkforceSource(emp.workforceSource),
				overtimeCount: otCount,
				totalOvertimeHours,
				approvedOvertimeHours,
				unapprovedOvertimeHours,
				approvalStatus,
			};
		})
		.filter((stat) => stat.totalOvertimeHours > 0 || stat.approvedOvertimeHours > 0);

	// 5. Labor split
	const roundSplit = (rows: OvertimeMetricsEmployee[]): OvertimeLaborSplit => ({
		totalOvertimeHours:
			Math.round(rows.reduce((sum, s) => sum + s.totalOvertimeHours, 0) * 100) / 100,
		employeesWithOvertime: rows.length,
	});
	const split = {
		direct: roundSplit(overtimeStats.filter((s) => s.workforceSource === "DIRECT")),
		agency: roundSplit(overtimeStats.filter((s) => s.workforceSource === "AGENCY")),
	};

	// Optional labor filter
	const filteredStats =
		workforceSource === "AGENCY"
			? overtimeStats.filter((s) => s.workforceSource === "AGENCY")
			: workforceSource === "DIRECT"
				? overtimeStats.filter((s) => s.workforceSource === "DIRECT")
				: overtimeStats;

	// Calculate totals
	const totalOvertimeHours = Math.round(filteredStats.reduce((sum, s) => sum + s.totalOvertimeHours, 0) * 100) / 100;
	const totalApprovedOvertimeHours = Math.round(filteredStats.reduce((sum, s) => sum + s.approvedOvertimeHours, 0) * 100) / 100;
	const totalUnapprovedOvertimeHours = Math.round(filteredStats.reduce((sum, s) => sum + s.unapprovedOvertimeHours, 0) * 100) / 100;

	const employeesWithApprovedOvertime = filteredStats.filter((s) => s.approvedOvertimeHours > 0).length;
	const employeesWithUnapprovedOvertime = filteredStats.filter((s) => s.unapprovedOvertimeHours > 0).length;

	// Sort by total overtime hours descending
	filteredStats.sort((a, b) => b.totalOvertimeHours - a.totalOvertimeHours);

	return {
		totalOvertimeHours,
		employeesWithOvertime: filteredStats.length,
		totalApprovedOvertimeHours,
		employeesWithApprovedOvertime,
		totalUnapprovedOvertimeHours,
		employeesWithUnapprovedOvertime,
		employees: filteredStats,
		split,
	};
}
