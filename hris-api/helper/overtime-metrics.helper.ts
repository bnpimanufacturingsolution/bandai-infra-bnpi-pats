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
	workforceSource: "DIRECT" | "AGENCY";
	overtimeCount: number;
	totalOvertimeHours: number;
}

export interface OvertimeLaborSplit {
	totalOvertimeHours: number;
	employeesWithOvertime: number;
}

export interface OvertimeMetricsResponse {
	totalOvertimeHours: number;
	employeesWithOvertime: number;
	employees: OvertimeMetricsEmployee[];
	split: {
		direct: OvertimeLaborSplit;
		agency: OvertimeLaborSplit;
	};
}

const normalizeWorkforceSource = (value: unknown): "DIRECT" | "AGENCY" =>
	String(value || "").trim().toUpperCase() === "AGENCY" ? "AGENCY" : "DIRECT";

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
 * @param workforceSource - Optional labor split filter: "DIRECT" (non-AGENCY, incl. missing) or "AGENCY"; omit for all
 * @returns Overtime metrics
 */
export async function calculateOvertimeMetrics(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
	workforceSource?: string,
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
			workforceSource: normalizeWorkforceSource(emp.workforceSource),
			overtimeCount,
			totalOvertimeHours: Math.round((totalOvertimeMinutes / 60) * 100) / 100,
		};
	})
	.filter((stat) => stat.totalOvertimeHours > 0);

	// Labor split is always computed over the full (unfiltered) set so both
	// chips stay meaningful regardless of the active Direct/Agency filter.
	const roundSplit = (rows: OvertimeMetricsEmployee[]): OvertimeLaborSplit => ({
		totalOvertimeHours:
			Math.round(rows.reduce((sum, s) => sum + s.totalOvertimeHours, 0) * 100) / 100,
		employeesWithOvertime: rows.length,
	});
	const split = {
		direct: roundSplit(overtimeStats.filter((s) => s.workforceSource === "DIRECT")),
		agency: roundSplit(overtimeStats.filter((s) => s.workforceSource === "AGENCY")),
	};

	// Optional labor filter (canon: DIRECT = workforceSource is not AGENCY, incl. missing)
	const filteredStats =
		workforceSource === "AGENCY"
			? overtimeStats.filter((s) => s.workforceSource === "AGENCY")
			: workforceSource === "DIRECT"
				? overtimeStats.filter((s) => s.workforceSource === "DIRECT")
				: overtimeStats;

	// Calculate totals
	const totalOvertimeHours = filteredStats.reduce((sum, s) => sum + s.totalOvertimeHours, 0);

	// Sort by total overtime hours descending
	filteredStats.sort((a, b) => b.totalOvertimeHours - a.totalOvertimeHours);

	return {
		totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
		employeesWithOvertime: filteredStats.length,
		employees: filteredStats,
		split,
	};
}
