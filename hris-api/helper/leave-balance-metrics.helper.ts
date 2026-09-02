/**
 * Leave Balance Metrics Helper
 * Calculates leave balance metrics for employees
 * Follows Employee-first aggregation pattern from test script
 */

import { PrismaClient, Prisma } from "../generated/prisma";
import { getEmployeeName, buildEmployeeFilter } from "./attendance-metrics-common.helper";
import { calculateTardinessMetrics } from "./tardiness-metrics.helper";

export interface LeaveBalanceDetail {
	leaveType: string;
	totalEntitled: number;
	used: number;
	pending: number;
	available: number;
	carriedOver: number;
	periodStart?: string | null;
	periodEnd?: string | null;
}

export interface LeaveTardinessColumn {
	lateInstances: number;
	lateMinutes: number;
	undertimeInstances: number;
	undertimeMinutes: number;
}

export interface EmployeeLeaveBalance {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	tardiness: LeaveTardinessColumn;
	leaveBalances: LeaveBalanceDetail[];
}

export interface LeaveTypeSummary {
	leaveType: string;
	employeeCount: number;
	avgEntitled: number;
	avgUsed: number;
	avgAvailable: number;
	utilizationRate: number;
}

export interface LeaveBalanceMetricsResponse {
	totalEmployees: number;
	leaveTypeSummary: LeaveTypeSummary[];
	employees: EmployeeLeaveBalance[];
	tardinessPeriod: { from: string; to: string };
}

/**
 * Calculate leave balance metrics for employees
 * 
 * Follows test script pattern:
 * - Start from Employee model with embedded leaveBalances data
 * - Calculate leave type summary with utilization rates
 * - Display all leave types for each employee with full details
 * - No employmentStatus filter per test script
 *
 * @param prisma - Prisma client instance
 * @param organizationId - Organization ID
 * @param departmentId - Optional department filter
 * @returns Leave balance metrics
 */
export async function calculateLeaveBalanceMetrics(
	prisma: PrismaClient,
	organizationId: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
	leaveType?: string,
	periodFrom?: string,
	periodTo?: string,
): Promise<LeaveBalanceMetricsResponse> {
	// Build employee filter (no employmentStatus filter per test script)
	const employeeWhere: Prisma.EmployeeWhereInput = buildEmployeeFilter(
		organizationId,
		{
			departmentId,
			sectionId,
			positionId,
			levelId,
			reportToId,
			employeeId,
		},
	);

	// Fetch employees with their leave balances
	const employees = await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
			department: { select: { name: true } },
			leaveBalances: true,
			leaveBalancesLastUpdated: true,
		},
	});

	// Calculate leave type statistics
	const leaveTypeStats = new Map<
		string,
		{ totalEntitled: number; totalUsed: number; totalAvailable: number; count: number }
	>();

	const toDate = (value?: string | null) => {
		if (!value) return null;
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	};

	const hasPeriodFilter = !!periodFrom || !!periodTo;
	const periodFromDate = toDate(periodFrom);
	const periodToDate = toDate(periodTo);
	const normalizedLeaveType = leaveType ? String(leaveType).trim().toLowerCase() : undefined;

	const employeeLeaveBalances: EmployeeLeaveBalance[] = employees.map((emp) => {
		const leaveBalances = ((emp.leaveBalances as any[]) || []).filter((lb: any) => {
			const leaveTypeMatch = normalizedLeaveType
				? String(lb?.leaveType || "").trim().toLowerCase() === normalizedLeaveType
				: true;
			if (!leaveTypeMatch) return false;

			if (!hasPeriodFilter) return true;

			// Period overlap check:
			// include if (lbStart <= filterEnd) && (lbEnd >= filterStart)
			const lbStart = toDate(lb?.periodStart);
			const lbEnd = toDate(lb?.periodEnd);
			if (!lbStart && !lbEnd) return true;

			const effectiveStart = lbStart || lbEnd;
			const effectiveEnd = lbEnd || lbStart;
			if (!effectiveStart || !effectiveEnd) return true;

			if (periodFromDate && effectiveEnd < periodFromDate) return false;
			if (periodToDate && effectiveStart > periodToDate) return false;
			return true;
		});

		// Update leave type stats
		leaveBalances.forEach((lb: any) => {
			const type = lb.leaveType || "UNKNOWN";
			const existing = leaveTypeStats.get(type) || {
				totalEntitled: 0,
				totalUsed: 0,
				totalAvailable: 0,
				count: 0,
			};

			leaveTypeStats.set(type, {
				totalEntitled: existing.totalEntitled + (lb.totalEntitled || 0),
				totalUsed: existing.totalUsed + (lb.used || 0),
				totalAvailable: existing.totalAvailable + (lb.available || 0),
				count: existing.count + 1,
			});
		});

		return {
			id: emp.id,
			employeeId: emp.employeeId,
			name: getEmployeeName(emp),
			department: emp.department?.name || "N/A",
			leaveBalances: leaveBalances.map((lb: any) => ({
				leaveType: lb.leaveType || "UNKNOWN",
				totalEntitled: lb.totalEntitled || 0,
				used: lb.used || 0,
				pending: lb.pending || 0,
				available: lb.available || 0,
				carriedOver: lb.carriedOver || 0,
				periodStart: lb.periodStart || null,
				periodEnd: lb.periodEnd || null,
			})),
		};
	}).filter((emp) => emp.leaveBalances.length > 0 || (!normalizedLeaveType && !hasPeriodFilter));

	// Calculate leave type summary
	const leaveTypeSummary: LeaveTypeSummary[] = [];
	leaveTypeStats.forEach((stats, type) => {
		const avgEntitled = stats.count > 0 ? Math.round((stats.totalEntitled / stats.count) * 100) / 100 : 0;
		const avgUsed = stats.count > 0 ? Math.round((stats.totalUsed / stats.count) * 100) / 100 : 0;
		const avgAvailable = stats.count > 0 ? Math.round((stats.totalAvailable / stats.count) * 100) / 100 : 0;
		const utilizationRate =
			stats.totalEntitled > 0
				? Math.round((stats.totalUsed / stats.totalEntitled) * 10000) / 100
				: 0;

		leaveTypeSummary.push({
			leaveType: type,
			employeeCount: stats.count,
			avgEntitled,
			avgUsed,
			avgAvailable,
			utilizationRate,
		});
	});

	// Tardiness/UT columns (stage 5 interpretation): join the existing
	// tardiness metrics for the filtered period — defaulting to the current
	// calendar year when no period is given — onto employees-with-balance rows.
	const now = new Date();
	const rangeStart = periodFromDate || new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
	const rangeEnd = periodToDate || new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59));
	const tardiness = await calculateTardinessMetrics(
		prisma,
		organizationId,
		rangeStart,
		rangeEnd,
		departmentId,
	);
	const tardinessByEmployee = new Map<string, LeaveTardinessColumn>();
	for (const entry of tardiness.employees) {
		tardinessByEmployee.set(entry.id, {
			lateInstances: entry.tardinessCount,
			lateMinutes: entry.totalLateMinutes,
			undertimeInstances: entry.undertimeCount,
			undertimeMinutes: entry.totalUndertimeMinutes,
		});
	}

	return {
		totalEmployees: employeeLeaveBalances.length,
		leaveTypeSummary: leaveTypeSummary.sort((a, b) => a.leaveType.localeCompare(b.leaveType)),
		employees: employeeLeaveBalances.map((emp) => ({
			...emp,
			tardiness: tardinessByEmployee.get(emp.id) || {
				lateInstances: 0,
				lateMinutes: 0,
				undertimeInstances: 0,
				undertimeMinutes: 0,
			},
		})),
		tardinessPeriod: {
			from: rangeStart.toISOString().slice(0, 10),
			to: rangeEnd.toISOString().slice(0, 10),
		},
	};
}
