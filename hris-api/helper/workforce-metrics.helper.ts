// @ts-nocheck
/**
 * Workforce Metrics Helper
 * Focused workforce reporting for no-work reports, daily active manpower,
 * and agency attendance summaries.
 */

import { PrismaClient } from "../generated/prisma";
import { buildEmployeeFilter, getEmployeeName } from "./attendance-metrics-common.helper";
import {
	collectShiftTypeIdsFromEmployeeScheduleData,
	resolveEffectiveShiftFromEmployeeData,
} from "./employee-schedule.helper";

export interface WorkforceEmployeeRow {
	id: string;
	employeeId: string;
	name: string;
	department: string;
	position: string;
	employer?: string;
	status?: string;
}

export interface NoWorkReportResult {
	date: Date;
	totalEmployeesConsidered: number;
	noWorkCount: number;
	employees: WorkforceEmployeeRow[];
}

export interface DailyActiveManpowerResult {
	date: Date;
	totalEmployeesConsidered: number;
	activeManpowerCount: number;
	employees: WorkforceEmployeeRow[];
}

export interface AgencyAttendanceSummaryItem {
	agency: string;
	totalAgencyEmployees: number;
	scheduledWorkDays: number;
	activeManpower: number;
	noWorkReportCount: number;
	leaveCount: number;
	attendanceRate: number;
}

export interface AgencyAttendanceSummaryResult {
	startDate: Date;
	endDate: Date;
	totalAgencies: number;
	items: AgencyAttendanceSummaryItem[];
}

export interface WorkforceMetricsReport {
	noWorkReport: NoWorkReportResult;
	dailyActiveManpower: DailyActiveManpowerResult;
	agencyAttendanceSummary: AgencyAttendanceSummaryResult;
}

export interface DirectIndirectDepartmentSummaryItem {
	department: string;
	directEmployees: number;
	indirectEmployees: number;
	directScheduledWorkDays: number;
	indirectScheduledWorkDays: number;
	directActiveManpower: number;
	indirectActiveManpower: number;
	directNoWorkCount: number;
	indirectNoWorkCount: number;
	directAttendanceRate: number;
	indirectAttendanceRate: number;
}

export interface DirectIndirectLaborSummaryResult {
	startDate: Date;
	endDate: Date;
	totalDirectEmployees: number;
	totalIndirectEmployees: number;
	directScheduledWorkDays: number;
	indirectScheduledWorkDays: number;
	directActiveManpower: number;
	indirectActiveManpower: number;
	directNoWorkCount: number;
	indirectNoWorkCount: number;
	items: DirectIndirectDepartmentSummaryItem[];
}

type WorkforceEmployeeRecord = {
	id: string;
	employeeId: string;
	workforceSource?: string | null;
	employer?: { name?: string | null } | null;
	department?: { name?: string | null } | null;
	position?: { title?: string | null } | null;
	person?: {
		personalInfo?: {
			firstName?: string | null;
			lastName?: string | null;
		} | null;
	} | null;
	embeddedSchedule?: any;
	scheduleOverrides?: any[];
	attendances: Array<{
		date?: Date | null;
		status?: string | null;
		timeIn?: Date | null;
	}>;
};

function getDayRange(date: Date) {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);
	const end = new Date(date);
	end.setHours(23, 59, 59, 999);
	return { start, end };
}

function normalizeStartOfDay(date: Date) {
	const normalized = new Date(date);
	normalized.setHours(0, 0, 0, 0);
	return normalized;
}

function normalizeEndOfDay(date: Date) {
	const normalized = new Date(date);
	normalized.setHours(23, 59, 59, 999);
	return normalized;
}

function getDateKey(date: Date) {
	return normalizeStartOfDay(date).toISOString().split("T")[0];
}

function isScheduledWorkDay(
	employee: WorkforceEmployeeRecord,
	date: Date,
	shiftTypeById: Map<string, any>,
) {
	const shift = resolveEffectiveShiftFromEmployeeData(employee, date, shiftTypeById);
	return !!shift && !shift.isOff && Array.isArray(shift.timeSlots) && shift.timeSlots.length > 0;
}

function hasAttendanceActivity(attendance?: WorkforceEmployeeRecord["attendances"][number]) {
	return (
		!!attendance &&
		(attendance.status === "PRESENT" || attendance.status === "INCOMPLETE" || !!attendance.timeIn)
	);
}

function isLeaveAttendance(attendance?: WorkforceEmployeeRecord["attendances"][number]) {
	return !!attendance && attendance.status === "LEAVE";
}

function mapEmployeeRow(
	employee: WorkforceEmployeeRecord,
	status?: string,
): WorkforceEmployeeRow {
	return {
		id: employee.id,
		employeeId: employee.employeeId,
		name: getEmployeeName(employee),
		department: employee.department?.name || "N/A",
		position: employee.position?.title || "N/A",
		employer: employee.employer?.name || undefined,
		status,
	};
}

async function fetchEmployeesWithAttendance(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
	reportToId?: string,
	agencyOnly = false,
): Promise<WorkforceEmployeeRecord[]> {
	const baseFilter = buildEmployeeFilter(organizationId, departmentId, reportToId);
	const employeeFilter = agencyOnly
		? { ...baseFilter, workforceSource: "AGENCY" as const }
		: baseFilter;

	return prisma.employee.findMany({
		where: employeeFilter,
		select: {
			id: true,
			employeeId: true,
			workforceSource: true,
			employer: true,
			embeddedSchedule: true,
			department: { select: { name: true } },
			position: { select: { title: true } },
			person: { select: { personalInfo: true } },
			scheduleOverrides: {
				where: { isDeleted: false },
				select: {
					id: true,
					date: true,
					shiftTypeId: true,
					createdAt: true,
					updatedAt: true,
					shiftType: {
						select: {
							id: true,
							code: true,
							name: true,
							isOff: true,
							isOvernight: true,
							timeSlots: true,
						},
					},
				},
			},
			attendances: {
				where: {
					isDeleted: false,
					date: {
						gte: startDate,
						lte: endDate,
					},
				},
				select: {
					date: true,
					status: true,
					timeIn: true,
				},
			},
		},
	});
}

async function buildShiftTypeLookup(
	prisma: PrismaClient,
	organizationId: string,
	employees: WorkforceEmployeeRecord[],
): Promise<Map<string, any>> {
	const ids = new Set<string>();
	for (const employee of employees) {
		for (const id of collectShiftTypeIdsFromEmployeeScheduleData(employee)) {
			ids.add(String(id));
		}
	}
	if (ids.size === 0) return new Map<string, any>();

	const shiftTypes = await prisma.shiftType.findMany({
		where: {
			organizationId,
			isDeleted: false,
			id: { in: Array.from(ids) },
		},
		select: {
			id: true,
			code: true,
			name: true,
			isOff: true,
			isOvernight: true,
			timeSlots: true,
		},
	});

	return new Map(shiftTypes.map((item) => [String(item.id), item]));
}

export async function calculateNoWorkReport(
	prisma: PrismaClient,
	organizationId: string,
	targetDate: Date,
	departmentId?: string,
	reportToId?: string,
): Promise<NoWorkReportResult> {
	const { start, end } = getDayRange(targetDate);
	const employees = await fetchEmployeesWithAttendance(
		prisma,
		organizationId,
		start,
		end,
		departmentId,
		reportToId,
	);
	const shiftTypeById = await buildShiftTypeLookup(prisma, organizationId, employees);

	const noWorkEmployees = employees
		.filter((employee) => isScheduledWorkDay(employee, targetDate, shiftTypeById))
		.filter((employee) => employee.attendances.length === 0)
		.map((employee) => mapEmployeeRow(employee, "NO_WORK_REPORT"));

	return {
		date: normalizeStartOfDay(targetDate),
		totalEmployeesConsidered: employees.length,
		noWorkCount: noWorkEmployees.length,
		employees: noWorkEmployees,
	};
}

export async function calculateDailyActiveManpower(
	prisma: PrismaClient,
	organizationId: string,
	targetDate: Date,
	departmentId?: string,
	reportToId?: string,
): Promise<DailyActiveManpowerResult> {
	const { start, end } = getDayRange(targetDate);
	const employees = await fetchEmployeesWithAttendance(
		prisma,
		organizationId,
		start,
		end,
		departmentId,
		reportToId,
	);
	const shiftTypeById = await buildShiftTypeLookup(prisma, organizationId, employees);

	const activeEmployees = employees
		.filter((employee) => isScheduledWorkDay(employee, targetDate, shiftTypeById))
		.filter((employee) =>
			employee.attendances.some((attendance) => hasAttendanceActivity(attendance)),
		)
		.map((employee) => mapEmployeeRow(employee, "ACTIVE_MANPOWER"));

	return {
		date: normalizeStartOfDay(targetDate),
		totalEmployeesConsidered: employees.length,
		activeManpowerCount: activeEmployees.length,
		employees: activeEmployees,
	};
}

export async function calculateAgencyAttendanceSummary(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
	reportToId?: string,
): Promise<AgencyAttendanceSummaryResult> {
	const normalizedStartDate = normalizeStartOfDay(startDate);
	const normalizedEndDate = normalizeEndOfDay(endDate);
	const employees = await fetchEmployeesWithAttendance(
		prisma,
		organizationId,
		normalizedStartDate,
		normalizedEndDate,
		departmentId,
		reportToId,
		true,
	);
	const shiftTypeById = await buildShiftTypeLookup(prisma, organizationId, employees);

	const agencyMap = new Map<string, AgencyAttendanceSummaryItem>();

	for (const employee of employees) {
		const agencyName = employee.employer?.name?.trim();
		if (!agencyName) continue;

		if (!agencyMap.has(agencyName)) {
			agencyMap.set(agencyName, {
				agency: agencyName,
				totalAgencyEmployees: 0,
				scheduledWorkDays: 0,
				activeManpower: 0,
				noWorkReportCount: 0,
				leaveCount: 0,
				attendanceRate: 0,
			});
		}

		const agencyItem = agencyMap.get(agencyName)!;
		agencyItem.totalAgencyEmployees += 1;

		const attendanceByDate = new Map<string, WorkforceEmployeeRecord["attendances"][number]>();
		for (const attendance of employee.attendances) {
			if (attendance.date) {
				attendanceByDate.set(getDateKey(attendance.date), attendance);
			}
		}

		const cursor = new Date(normalizedStartDate);
		while (cursor <= normalizedEndDate) {
			if (!isScheduledWorkDay(employee, cursor, shiftTypeById)) {
				cursor.setDate(cursor.getDate() + 1);
				continue;
			}

			agencyItem.scheduledWorkDays += 1;
			const attendance = attendanceByDate.get(getDateKey(cursor));

			if (!attendance) {
				agencyItem.noWorkReportCount += 1;
			} else if (isLeaveAttendance(attendance)) {
				agencyItem.leaveCount += 1;
			} else if (hasAttendanceActivity(attendance)) {
				agencyItem.activeManpower += 1;
			} else {
				agencyItem.noWorkReportCount += 1;
			}

			cursor.setDate(cursor.getDate() + 1);
		}
	}

	const items = Array.from(agencyMap.values())
		.map((item) => ({
			...item,
			attendanceRate:
				item.scheduledWorkDays > 0
					? Math.round(
							(((item.activeManpower + item.leaveCount) / item.scheduledWorkDays) * 100) *
								100,
					  ) / 100
					: 0,
		}))
		.sort((a, b) => a.agency.localeCompare(b.agency));

	return {
		startDate: normalizedStartDate,
		endDate: normalizedEndDate,
		totalAgencies: items.length,
		items,
	};
}

function getLaborBucket(workforceSource?: string | null): "DIRECT" | "INDIRECT" {
	return String(workforceSource || "DIRECT").toUpperCase() === "AGENCY"
		? "INDIRECT"
		: "DIRECT";
}

export async function calculateDirectIndirectLaborSummary(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	departmentId?: string,
	reportToId?: string,
	laborType?: string,
): Promise<DirectIndirectLaborSummaryResult> {
	const normalizedStartDate = normalizeStartOfDay(startDate);
	const normalizedEndDate = normalizeEndOfDay(endDate);
	const employees = await fetchEmployeesWithAttendance(
		prisma,
		organizationId,
		normalizedStartDate,
		normalizedEndDate,
		departmentId,
		reportToId,
	);
	const shiftTypeById = await buildShiftTypeLookup(prisma, organizationId, employees);

	const normalizedLaborType = String(laborType || "ALL").toUpperCase();
	const departmentMap = new Map<
		string,
		{
			department: string;
			directEmployees: number;
			indirectEmployees: number;
			directScheduledWorkDays: number;
			indirectScheduledWorkDays: number;
			directActiveManpower: number;
			indirectActiveManpower: number;
			directNoWorkCount: number;
			indirectNoWorkCount: number;
		}
	>();

	const seenByDepartment = new Map<string, Set<string>>();
	const ensureDepartment = (departmentName: string) => {
		if (!departmentMap.has(departmentName)) {
			departmentMap.set(departmentName, {
				department: departmentName,
				directEmployees: 0,
				indirectEmployees: 0,
				directScheduledWorkDays: 0,
				indirectScheduledWorkDays: 0,
				directActiveManpower: 0,
				indirectActiveManpower: 0,
				directNoWorkCount: 0,
				indirectNoWorkCount: 0,
			});
		}
		if (!seenByDepartment.has(departmentName)) {
			seenByDepartment.set(departmentName, new Set<string>());
		}
		return {
			departmentItem: departmentMap.get(departmentName)!,
			seenEmployeeIds: seenByDepartment.get(departmentName)!,
		};
	};

	for (const employee of employees) {
		const bucket = getLaborBucket(employee.workforceSource);
		if (
			(normalizedLaborType === "DIRECT" && bucket !== "DIRECT") ||
			(normalizedLaborType === "INDIRECT" && bucket !== "INDIRECT")
		) {
			continue;
		}

		const departmentName = employee.department?.name?.trim() || "Unassigned";
		const { departmentItem, seenEmployeeIds } = ensureDepartment(departmentName);
		if (!seenEmployeeIds.has(employee.id)) {
			seenEmployeeIds.add(employee.id);
			if (bucket === "DIRECT") {
				departmentItem.directEmployees += 1;
			} else {
				departmentItem.indirectEmployees += 1;
			}
		}

		const attendanceByDate = new Map<string, WorkforceEmployeeRecord["attendances"][number]>();
		for (const attendance of employee.attendances) {
			if (attendance.date) {
				attendanceByDate.set(getDateKey(attendance.date), attendance);
			}
		}

		const cursor = new Date(normalizedStartDate);
		while (cursor <= normalizedEndDate) {
			if (!isScheduledWorkDay(employee, cursor, shiftTypeById)) {
				cursor.setDate(cursor.getDate() + 1);
				continue;
			}

			const attendance = attendanceByDate.get(getDateKey(cursor));
			if (bucket === "DIRECT") {
				departmentItem.directScheduledWorkDays += 1;
				if (!attendance) {
					departmentItem.directNoWorkCount += 1;
				} else if (isLeaveAttendance(attendance) || hasAttendanceActivity(attendance)) {
					departmentItem.directActiveManpower += 1;
				} else {
					departmentItem.directNoWorkCount += 1;
				}
			} else {
				departmentItem.indirectScheduledWorkDays += 1;
				if (!attendance) {
					departmentItem.indirectNoWorkCount += 1;
				} else if (isLeaveAttendance(attendance) || hasAttendanceActivity(attendance)) {
					departmentItem.indirectActiveManpower += 1;
				} else {
					departmentItem.indirectNoWorkCount += 1;
				}
			}

			cursor.setDate(cursor.getDate() + 1);
		}
	}

	const items = Array.from(departmentMap.values())
		.map((item) => ({
			...item,
			directAttendanceRate:
				item.directScheduledWorkDays > 0
					? Math.round(
							(item.directActiveManpower / item.directScheduledWorkDays) * 100 * 100,
					  ) / 100
					: 0,
			indirectAttendanceRate:
				item.indirectScheduledWorkDays > 0
					? Math.round(
							(item.indirectActiveManpower / item.indirectScheduledWorkDays) *
								100 *
								100,
					  ) / 100
					: 0,
		}))
		.sort((a, b) => a.department.localeCompare(b.department));

	const totals = items.reduce(
		(acc, item) => {
			acc.totalDirectEmployees += item.directEmployees;
			acc.totalIndirectEmployees += item.indirectEmployees;
			acc.directScheduledWorkDays += item.directScheduledWorkDays;
			acc.indirectScheduledWorkDays += item.indirectScheduledWorkDays;
			acc.directActiveManpower += item.directActiveManpower;
			acc.indirectActiveManpower += item.indirectActiveManpower;
			acc.directNoWorkCount += item.directNoWorkCount;
			acc.indirectNoWorkCount += item.indirectNoWorkCount;
			return acc;
		},
		{
			totalDirectEmployees: 0,
			totalIndirectEmployees: 0,
			directScheduledWorkDays: 0,
			indirectScheduledWorkDays: 0,
			directActiveManpower: 0,
			indirectActiveManpower: 0,
			directNoWorkCount: 0,
			indirectNoWorkCount: 0,
		},
	);

	return {
		startDate: normalizedStartDate,
		endDate: normalizedEndDate,
		...totals,
		items,
	};
}

export async function getWorkforceMetricsReport(
	prisma: PrismaClient,
	organizationId: string,
	targetDate: Date,
	departmentId?: string,
	reportToId?: string,
): Promise<WorkforceMetricsReport> {
	const normalizedDate = normalizeStartOfDay(targetDate);

	const [noWorkReport, dailyActiveManpower, agencyAttendanceSummary] = await Promise.all([
		calculateNoWorkReport(prisma, organizationId, normalizedDate, departmentId, reportToId),
		calculateDailyActiveManpower(prisma, organizationId, normalizedDate, departmentId, reportToId),
		calculateAgencyAttendanceSummary(
			prisma,
			organizationId,
			normalizedDate,
			normalizedDate,
			departmentId,
			reportToId,
		),
	]);

	return {
		noWorkReport,
		dailyActiveManpower,
		agencyAttendanceSummary,
	};
}
