import { PrismaClient } from "../generated/prisma";
import {
	getBusinessDayBounds,
	getDateKeyInBusinessTimeZone,
	getEffectiveEmploymentStartDate,
} from "./attendance.helper";
import { buildEmployeeFilter, type EmployeeScopeFilter } from "./attendance-metrics-common.helper";
import {
	deriveAttendanceObligationDisplayStatus,
	getMeaningfulEmploymentTermination,
} from "./attendance-obligation.helper";
import {
	collectShiftTypeIdsFromEmployeeScheduleData,
	resolveEffectiveShiftFromEmployeeData,
} from "./employee-schedule.helper";
import {
	buildClockInArrivalFields,
	hasEvaluableScheduleWindow,
} from "./timekeeping.helper";

const CLOCKED_IN_STATUSES = new Set(["PRESENT", "INCOMPLETE"]);

export type ScheduledWorkDay = {
	employeeRefId: string;
	employeeCode: string;
	employeeName: string;
	departmentId: string | null;
	departmentName: string;
	workforceSource: string;
	agencyId: string | null;
	reportToId: string | null;
	date: string;
	clockedIn: boolean;
	timeIn?: Date | string | null;
	timeOut?: Date | string | null;
	attendanceStatus?: string | null;
	scheduleSnapshot: any;
};

export type RegularScheduleUtilization = {
	scheduledWorkDays: number;
	clockedInOnScheduledDays: number;
	notClockedInOnScheduledDays: number;
	restDays: number;
	missingScheduleDays: number;
	scheduledDays: ScheduledWorkDay[];
};

function toDateOnlyUtc(value: Date): Date {
	return new Date(`${getDateKeyInBusinessTimeZone(value)}T00:00:00.000Z`);
}

function toRequestedDateOnlyUtc(value: Date): Date {
	// dateFrom/dateTo are converted to UTC start/end of that calendar day.
	// 2026-08-17T23:59:59.999Z is still 8/17 in the request, but already 8/18
	// in Asia/Manila. Iterate the requested UTC dates, not the next local day.
	return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function eachBusinessDate(startDate: Date, endDate: Date): Date[] {
	const dates: Date[] = [];
	let cursor = toRequestedDateOnlyUtc(startDate);
	const end = toRequestedDateOnlyUtc(endDate);
	while (cursor.getTime() <= end.getTime()) {
		dates.push(new Date(cursor));
		cursor = new Date(cursor);
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return dates;
}

function isClockedInAttendance(attendance?: {
	timeIn?: Date | string | null;
	status?: string | null;
} | null): boolean {
	if (!attendance) return false;
	if (attendance.timeIn) return true;
	return CLOCKED_IN_STATUSES.has(String(attendance.status || "").toUpperCase());
}

export function summarizeRegularScheduleUtilization(params: {
	employees: Array<{
		id?: string;
		employeeId?: string | null;
		workforceSource?: string | null;
		agencyId?: string | null;
		reportToId?: string | null;
		departmentId?: string | null;
		department?: { id?: string | null; name?: string | null } | null;
		person?: {
			personalInfo?: {
				firstName?: string | null;
				middleName?: string | null;
				lastName?: string | null;
			} | null;
		} | null;
		employmentHireDate?: Date | string | null;
		employmentStartDate?: Date | string | null;
		employmentTerminationDate?: Date | string | null;
		embeddedSchedule?: unknown;
		scheduleOverrides?: unknown[];
		attendances?: Array<{
			date?: Date | string | null;
			timeIn?: Date | string | null;
			timeOut?: Date | string | null;
			status?: string | null;
		}>;
	}>;
	shiftTypeById: Map<string, any>;
	dates: Date[];
}): RegularScheduleUtilization {
	const summary: RegularScheduleUtilization = {
		scheduledWorkDays: 0,
		clockedInOnScheduledDays: 0,
		notClockedInOnScheduledDays: 0,
		restDays: 0,
		missingScheduleDays: 0,
		scheduledDays: [],
	};

	for (const employee of params.employees) {
		const effectiveStart = getEffectiveEmploymentStartDate(employee as any);
		const termination = getMeaningfulEmploymentTermination(employee);
		const attendanceByDate = new Map<string, any>();
		for (const attendance of employee.attendances || []) {
			const key = attendance.timeIn
				? getDateKeyInBusinessTimeZone(new Date(attendance.timeIn))
				: attendance.date
					? getDateKeyInBusinessTimeZone(new Date(attendance.date))
					: "";
			if (!key) continue;
			attendanceByDate.set(key, attendance);
		}

		for (const date of params.dates) {
			const day = toDateOnlyUtc(date);
			if (effectiveStart && toDateOnlyUtc(effectiveStart).getTime() > day.getTime()) continue;
			if (termination && termination.getTime() < day.getTime()) continue;

			const shift = resolveEffectiveShiftFromEmployeeData(employee, day, params.shiftTypeById);
			if (!shift) {
				summary.missingScheduleDays += 1;
				continue;
			}
			if (shift.isOff) {
				summary.restDays += 1;
				continue;
			}

			summary.scheduledWorkDays += 1;
			const dateKey = getDateKeyInBusinessTimeZone(day);
			const personalInfo = employee.person?.personalInfo || {};
			const employeeName =
				[personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
					.filter(Boolean)
					.join(" ")
					.trim() ||
				String(employee.employeeId || employee.id || "").trim();
			const attendance = attendanceByDate.get(dateKey);
			const clockedIn = isClockedInAttendance(attendance);
			summary.scheduledDays.push({
				employeeRefId: String(employee.id || ""),
				employeeCode: String(employee.employeeId || "").trim(),
				employeeName,
				departmentId: employee.departmentId || employee.department?.id || null,
				departmentName: String(employee.department?.name || "Unassigned"),
				workforceSource: employee.workforceSource || "DIRECT",
				agencyId: employee.agencyId || null,
				reportToId: employee.reportToId || null,
				date: dateKey,
				clockedIn,
				timeIn: attendance?.timeIn || null,
				timeOut: attendance?.timeOut || null,
				attendanceStatus: attendance?.status || null,
				scheduleSnapshot: shift,
			});
			if (clockedIn) {
				summary.clockedInOnScheduledDays += 1;
			} else {
				summary.notClockedInOnScheduledDays += 1;
			}
		}
	}

	return summary;
}

const SCHEDULE_UTILIZATION_CACHE_MS = 30_000;
const scheduleUtilizationCache = new Map<
	string,
	{ expiresAt: number; value: RegularScheduleUtilization }
>();

function scheduleUtilizationCacheKey(
	params: {
		organizationId: string;
		startDate: Date;
		endDate: Date;
	} & EmployeeScopeFilter,
) {
	return [
		params.organizationId,
		getDateKeyInBusinessTimeZone(params.startDate),
		getDateKeyInBusinessTimeZone(params.endDate),
		params.departmentId || "",
		params.sectionId || "",
		params.positionId || "",
		params.levelId || "",
		params.reportToId || "",
		params.employeeId || "",
	].join("|");
}

export async function countRegularScheduleWorkUtilization(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		startDate: Date;
		endDate: Date;
	} & EmployeeScopeFilter,
): Promise<RegularScheduleUtilization> {
	const cacheKey = scheduleUtilizationCacheKey(params);
	const cached = scheduleUtilizationCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.value;
	}
	const employeeWhere = {
		...buildEmployeeFilter(params.organizationId, {
			departmentId: params.departmentId,
			sectionId: params.sectionId,
			positionId: params.positionId,
			levelId: params.levelId,
			reportToId: params.reportToId,
			employeeId: params.employeeId,
		}),
		AND: [
			{
				OR: [
					{ employmentStartDate: null },
					{ employmentStartDate: { lte: params.endDate } },
				],
			},
			{
				OR: [
					{ employmentStatus: { in: ["ACTIVE", "ONBOARDING"] as any } },
					{ employmentTerminationDate: { gte: params.startDate } },
				],
			},
		],
	};

	const startBounds = getBusinessDayBounds(params.startDate);
	const endBounds = getBusinessDayBounds(params.endDate);
	const [employees, attendances] = await Promise.all([
		prisma.employee.findMany({
			where: employeeWhere,
			select: {
				id: true,
				employeeId: true,
				workforceSource: true,
				agencyId: true,
				reportToId: true,
				departmentId: true,
				department: {
					select: {
						id: true,
						name: true,
					},
				},
				person: {
					select: {
						personalInfo: true,
					},
				},
				employmentHireDate: true,
				employmentStartDate: true,
				employmentTerminationDate: true,
				embeddedSchedule: true,
				scheduleOverrides: {
					where: {
						isDeleted: false,
						date: { gte: params.startDate, lte: params.endDate },
					},
					include: { shiftType: true },
				},
			},
		}),
		prisma.attendance.findMany({
			where: {
				organizationId: params.organizationId,
				isDeleted: false,
				OR: [
					{ date: { gte: params.startDate, lte: params.endDate } },
					{ timeIn: { gte: startBounds.start, lte: endBounds.end } },
				],
			},
			select: {
				employeeId: true,
				date: true,
				timeIn: true,
				timeOut: true,
				status: true,
			},
		}),
	]);
	const attendancesByEmployeeId = new Map<string, any[]>();
	for (const attendance of attendances) {
		const list = attendancesByEmployeeId.get(attendance.employeeId) || [];
		list.push(attendance);
		attendancesByEmployeeId.set(attendance.employeeId, list);
	}
	const employeesWithAttendance = employees.map((employee) => ({
		...employee,
		attendances: attendancesByEmployeeId.get(employee.id) || [],
	}));

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
						organizationId: params.organizationId,
						isDeleted: false,
						id: { in: Array.from(shiftTypeIds) },
					},
				})
			: [];

	const value = summarizeRegularScheduleUtilization({
		employees: employeesWithAttendance,
		shiftTypeById: new Map(shiftTypes.map((shiftType) => [String(shiftType.id), shiftType])),
		dates: eachBusinessDate(params.startDate, params.endDate),
	});
	scheduleUtilizationCache.set(cacheKey, {
		expiresAt: Date.now() + SCHEDULE_UTILIZATION_CACHE_MS,
		value,
	});
	return value;
}

function dateFromBusinessKey(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00.000Z`);
}

export function applyScheduleArrivalToAttendanceRow<T extends Record<string, any>>(
	row: T,
	scheduleFallback?: any,
): T {
	const dateKey = String(row?.date || "");
	const date = dateKey ? dateFromBusinessKey(dateKey) : new Date();
	const preferredSchedule = hasEvaluableScheduleWindow(row?.scheduleSnapshot, date)
		? row.scheduleSnapshot
		: scheduleFallback || row?.scheduleSnapshot;
	const arrival = buildClockInArrivalFields({
		timeIn: row?.timeIn || null,
		timeOut: row?.timeOut || null,
		schedule: preferredSchedule || null,
		date,
	});
	if (!arrival.evaluable) {
		return {
			...row,
			scheduleSnapshot: preferredSchedule || row?.scheduleSnapshot || null,
			computationMeta: {
				...(row?.computationMeta || {}),
				evaluatedFromSchedule: false,
			},
		};
	}
	const existingFlags = Array.isArray(row?.behaviorFlags) ? row.behaviorFlags : [];
	const hasClockOut = Boolean(row?.timeOut);
	return {
		...row,
		scheduleSnapshot: preferredSchedule || row?.scheduleSnapshot || null,
		lateHours: arrival.lateHours,
		...(hasClockOut
			? {
					hoursWorked: arrival.hoursWorked,
					earlyOutHours: arrival.earlyOutHours,
					undertimeHours: arrival.undertimeHours,
				}
			: {}),
		behaviorFlags: Array.from(new Set([...existingFlags, ...arrival.behaviorFlags])),
		computationMeta: {
			...(row?.computationMeta || {}),
			rawLateMinutes: arrival.rawLateMinutes,
			gracePeriodMinutes: arrival.gracePeriodMinutes,
			withinGrace: arrival.withinGrace,
			evaluatedFromSchedule: true,
			earlyOutMinutes: arrival.earlyOutMinutes,
			undertimeMinutes: arrival.undertimeMinutes,
			hoursWorkedMinutes: arrival.hoursWorkedMinutes,
		},
	};
}

export function buildVirtualScheduledAttendanceRow(day: ScheduledWorkDay) {
	if (day.clockedIn) {
		const stored = String(day.attendanceStatus || "").toUpperCase();
		const status = CLOCKED_IN_STATUSES.has(stored)
			? stored
			: day.timeOut
				? "PRESENT"
				: "INCOMPLETE";
		return applyScheduleArrivalToAttendanceRow({
			id: `scheduled:${day.employeeRefId}:${day.date}`,
			employeeRefId: day.employeeRefId,
			employeeId: day.employeeCode || day.employeeRefId,
			employeeName: day.employeeName,
			departmentId: day.departmentId,
			departmentName: day.departmentName,
			workforceSource: day.workforceSource,
			agencyId: day.agencyId,
			reportToId: day.reportToId,
			date: day.date,
			timeIn: day.timeIn || null,
			timeBreak: null,
			timeOut: day.timeOut || null,
			timeOutNextDay: false,
			status,
			storedStatus: status,
			phase: "ACTIVE",
			attendanceId: null,
			timesheetId: null,
			timesheetlineId: null,
			createdAt: null,
			updatedAt: null,
			behaviorFlags: [],
			scheduleSnapshot: day.scheduleSnapshot,
			hoursWorked: "0:00",
			regularHours: "0:00",
			overtimeHours: "0:00",
			undertimeHours: "0:00",
			lateHours: "0:00",
			earlyOutHours: "0:00",
			breakMinutes: null,
			notes: "Scheduled work day with clock-in from attendance",
			isManualEntry: false,
			isVirtual: true,
			primaryMarker: "HOURS",
			metadata: { source: "EMPLOYEE_REGULAR_SCHEDULE" },
		});
	}
	const displayStatus = deriveAttendanceObligationDisplayStatus({
		status: "EXPECTED",
		businessDate: day.date,
	});
	return {
		id: `scheduled:${day.employeeRefId}:${day.date}`,
		employeeRefId: day.employeeRefId,
		employeeId: day.employeeCode || day.employeeRefId,
		employeeName: day.employeeName,
		departmentId: day.departmentId,
		departmentName: day.departmentName,
		workforceSource: day.workforceSource,
		agencyId: day.agencyId,
		reportToId: day.reportToId,
		date: day.date,
		timeIn: null,
		timeBreak: null,
		timeOut: null,
		timeOutNextDay: false,
		status: displayStatus,
		storedStatus: "EXPECTED",
		phase: "ACTIVE",
		attendanceId: null,
		timesheetId: null,
		timesheetlineId: null,
		createdAt: null,
		updatedAt: null,
		behaviorFlags: [],
		scheduleSnapshot: day.scheduleSnapshot,
		hoursWorked: "0:00",
		regularHours: "0:00",
		overtimeHours: "0:00",
		undertimeHours: "0:00",
		lateHours: "0:00",
		earlyOutHours: "0:00",
		breakMinutes: null,
		notes: "Scheduled regular work day with no clock-in yet",
		isManualEntry: false,
		isVirtual: true,
		primaryMarker: displayStatus === "ABSENT" ? "ABSENT" : "NOT_CLOCKED_IN",
		metadata: { source: "EMPLOYEE_REGULAR_SCHEDULE" },
	};
}

export type ScheduledDayTimekeepingSummary = {
	lateCount: number;
	onTimeCount: number;
	undertimeCount: number;
	clockedOutCount: number;
	lateMinutes: number;
	undertimeMinutes: number;
};

export type ScheduledDepartmentBreakdown = {
	departmentId: string | null;
	departmentName: string;
	scheduled: number;
	present: number;
	late: number;
	undertime: number;
	notClockedIn: number;
	employeeCount: number;
};

export type ScheduledEmployeePeriodTotals = {
	scheduled: number;
	present: number;
	late: number;
	undertime: number;
	absent: number;
	onTime: number;
};

export type ScheduledEmployeeRollup = ScheduledEmployeePeriodTotals & {
	employeeRefId: string;
	employeeCode: string;
	employeeName: string;
	departmentId: string | null;
	departmentName: string;
	workforceSource: string;
	agencyId: string | null;
	reportToId: string | null;
	firstDate: string;
	lastDate: string;
	latestDay: ScheduledWorkDay | null;
};

function scheduledDayArrival(day: ScheduledWorkDay) {
	return buildClockInArrivalFields({
		timeIn: day.timeIn || null,
		timeOut: day.timeOut || null,
		schedule: day.scheduleSnapshot,
		date: dateFromBusinessKey(day.date),
	});
}

export function summarizeScheduledDepartmentBreakdown(
	scheduledDays: ScheduledWorkDay[],
): ScheduledDepartmentBreakdown[] {
	const byKey = new Map<string, ScheduledDepartmentBreakdown & { employees: Set<string> }>();
	for (const day of scheduledDays) {
		const departmentName = day.departmentName || "Unassigned";
		const key = day.departmentId || departmentName;
		const bucket = byKey.get(key) || {
			departmentId: day.departmentId,
			departmentName,
			scheduled: 0,
			present: 0,
			late: 0,
			undertime: 0,
			notClockedIn: 0,
			employeeCount: 0,
			employees: new Set<string>(),
		};
		bucket.scheduled += 1;
		if (day.employeeRefId) bucket.employees.add(day.employeeRefId);
		if (day.clockedIn) {
			bucket.present += 1;
			const arrival = scheduledDayArrival(day);
			if (arrival.evaluable && arrival.lateMinutes > 0) bucket.late += 1;
			if (day.timeOut) {
				const undertimeMinutes = Math.max(arrival.undertimeMinutes, arrival.earlyOutMinutes);
				if (undertimeMinutes > 0) bucket.undertime += 1;
			}
		} else {
			bucket.notClockedIn += 1;
		}
		byKey.set(key, bucket);
	}
	return Array.from(byKey.values()).map(({ employees, ...bucket }) => ({
		...bucket,
		employeeCount: employees.size,
	}));
}

export function summarizeScheduledEmployeeBreakdown(
	scheduledDays: ScheduledWorkDay[],
): ScheduledEmployeeRollup[] {
	const byEmployee = new Map<string, ScheduledEmployeeRollup>();
	for (const day of scheduledDays) {
		if (!day.employeeRefId) continue;
		const bucket = byEmployee.get(day.employeeRefId) || {
			employeeRefId: day.employeeRefId,
			employeeCode: day.employeeCode,
			employeeName: day.employeeName,
			departmentId: day.departmentId,
			departmentName: day.departmentName,
			workforceSource: day.workforceSource,
			agencyId: day.agencyId,
			reportToId: day.reportToId,
			scheduled: 0,
			present: 0,
			late: 0,
			undertime: 0,
			absent: 0,
			onTime: 0,
			firstDate: day.date,
			lastDate: day.date,
			latestDay: day,
		};
		bucket.scheduled += 1;
		if (day.date < bucket.firstDate) bucket.firstDate = day.date;
		if (day.date > bucket.lastDate) bucket.lastDate = day.date;
		if (!bucket.latestDay || day.date >= bucket.latestDay.date) {
			bucket.latestDay = day;
		}
		if (day.clockedIn) {
			bucket.present += 1;
			if (!bucket.latestDay?.clockedIn || day.date >= String(bucket.latestDay.date || "")) {
				bucket.latestDay = day;
			}
			const arrival = scheduledDayArrival(day);
			if (arrival.evaluable && arrival.lateMinutes > 0) bucket.late += 1;
			else if (arrival.evaluable) bucket.onTime += 1;
			if (day.timeOut) {
				const undertimeMinutes = Math.max(arrival.undertimeMinutes, arrival.earlyOutMinutes);
				if (undertimeMinutes > 0) bucket.undertime += 1;
			}
		} else {
			bucket.absent += 1;
		}
		byEmployee.set(day.employeeRefId, bucket);
	}
	return Array.from(byEmployee.values());
}

export function pickScheduledDepartmentPreviewEmployees(
	rollups: ScheduledEmployeeRollup[],
	limit = 5,
): ScheduledEmployeeRollup[] {
	const byDept = new Map<string, ScheduledEmployeeRollup[]>();
	for (const rollup of rollups) {
		const key = rollup.departmentId || rollup.departmentName || "Unassigned";
		const list = byDept.get(key) || [];
		list.push(rollup);
		byDept.set(key, list);
	}
	const picked: ScheduledEmployeeRollup[] = [];
	for (const list of byDept.values()) {
		const ranked = [...list].sort((left, right) => {
			if (left.present !== right.present) return right.present - left.present;
			if (left.late !== right.late) return right.late - left.late;
			return String(left.employeeName || "").localeCompare(String(right.employeeName || ""));
		});
		picked.push(...ranked.slice(0, limit));
	}
	return picked;
}

export function buildPeriodRollupAttendanceRow(rollup: ScheduledEmployeeRollup) {
	const sourceDay =
		rollup.latestDay ||
		({
			employeeRefId: rollup.employeeRefId,
			employeeCode: rollup.employeeCode,
			employeeName: rollup.employeeName,
			departmentId: rollup.departmentId,
			departmentName: rollup.departmentName,
			workforceSource: rollup.workforceSource,
			agencyId: rollup.agencyId,
			reportToId: rollup.reportToId,
			date: rollup.lastDate,
			clockedIn: rollup.present > 0,
			timeIn: null,
			timeOut: null,
			scheduleSnapshot: null,
		} as ScheduledWorkDay);
	const row = buildVirtualScheduledAttendanceRow(sourceDay);
	return {
		...row,
		id: `period-rollup:${rollup.employeeRefId}`,
		isPeriodRollup: true,
		notes: `Period totals ${rollup.firstDate} to ${rollup.lastDate}`,
		periodTotals: {
			scheduled: rollup.scheduled,
			present: rollup.present,
			late: rollup.late,
			undertime: rollup.undertime,
			absent: rollup.absent,
			onTime: rollup.onTime,
		} satisfies ScheduledEmployeePeriodTotals,
	};
}

export function pickScheduledDepartmentPreviewDays(
	scheduledDays: ScheduledWorkDay[],
	limit = 5,
): ScheduledWorkDay[] {
	const byDept = new Map<string, ScheduledWorkDay[]>();
	for (const day of scheduledDays) {
		const key = day.departmentId || day.departmentName || "Unassigned";
		const list = byDept.get(key) || [];
		list.push(day);
		byDept.set(key, list);
	}
	const picked: ScheduledWorkDay[] = [];
	for (const list of byDept.values()) {
		const ranked = [...list].sort((left, right) => {
			if (left.clockedIn !== right.clockedIn) return left.clockedIn ? -1 : 1;
			return String(left.employeeName || "").localeCompare(String(right.employeeName || ""));
		});
		picked.push(...ranked.slice(0, limit));
	}
	return picked;
}

export function summarizeScheduledDayTimekeeping(
	scheduledDays: ScheduledWorkDay[],
): ScheduledDayTimekeepingSummary {
	const summary: ScheduledDayTimekeepingSummary = {
		lateCount: 0,
		onTimeCount: 0,
		undertimeCount: 0,
		clockedOutCount: 0,
		lateMinutes: 0,
		undertimeMinutes: 0,
	};
	for (const day of scheduledDays) {
		if (!day.clockedIn || !day.timeIn) continue;
		const arrival = buildClockInArrivalFields({
			timeIn: day.timeIn,
			timeOut: day.timeOut || null,
			schedule: day.scheduleSnapshot,
			date: dateFromBusinessKey(day.date),
		});
		if (!arrival.evaluable) continue;
		if (arrival.lateMinutes > 0) {
			summary.lateCount += 1;
			summary.lateMinutes += arrival.lateMinutes;
		} else {
			summary.onTimeCount += 1;
		}
		if (!day.timeOut) continue;
		summary.clockedOutCount += 1;
		const undertimeMinutes = Math.max(arrival.undertimeMinutes, arrival.earlyOutMinutes);
		if (undertimeMinutes > 0) {
			summary.undertimeCount += 1;
			summary.undertimeMinutes += undertimeMinutes;
		}
	}
	return summary;
}

function durationStringToMinutes(value?: string | null): number {
	const text = String(value || "0:00");
	const [hours, minutes] = text.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return Math.max(0, hours * 60 + minutes);
}

export function rowMatchesComputedTimekeepingStatus(
	row: {
		timeIn?: Date | string | null;
		lateHours?: string | null;
		earlyOutHours?: string | null;
		undertimeHours?: string | null;
	},
	status?: string | null,
): boolean {
	const normalized = String(status || "").trim().toUpperCase();
	if (normalized === "LATE") return durationStringToMinutes(row.lateHours) > 0;
	if (normalized === "ON_TIME") {
		return Boolean(row.timeIn) && durationStringToMinutes(row.lateHours) <= 0;
	}
	if (normalized === "EARLY_OUT") {
		return (
			durationStringToMinutes(row.earlyOutHours) > 0 ||
			durationStringToMinutes(row.undertimeHours) > 0
		);
	}
	return true;
}

export function applyScheduledDayArrivalToRows<T extends Record<string, any>>(
	rows: T[],
	scheduledDays: ScheduledWorkDay[],
): T[] {
	const byKey = new Map(
		scheduledDays.map((day) => [`${day.employeeRefId}:${day.date}`, day]),
	);
	return rows.map((row) => {
		const day = byKey.get(
			`${String(row?.employeeRefId || "").trim()}:${String(row?.date || "")}`,
		);
		return applyScheduleArrivalToAttendanceRow(row, day?.scheduleSnapshot);
	});
}

export function mergeScheduledAttendanceRecords(
	existingRows: Array<{ employeeRefId?: string | null; date?: string | null }>,
	scheduledDays: ScheduledWorkDay[],
	employeeIds?: string[] | null,
) {
	const allowedIds = Array.isArray(employeeIds) ? new Set(employeeIds) : null;
	const existingKeys = new Set(
		existingRows.map((row) => `${String(row.employeeRefId || "").trim()}:${String(row.date || "")}`),
	);
	const virtualRows = [];
	for (const day of scheduledDays) {
		if (!day.employeeRefId || !day.date) continue;
		if (day.clockedIn) continue;
		if (allowedIds && !allowedIds.has(day.employeeRefId)) continue;
		const key = `${day.employeeRefId}:${day.date}`;
		if (existingKeys.has(key)) continue;
		virtualRows.push(buildVirtualScheduledAttendanceRow(day));
	}
	return [...existingRows, ...virtualRows];
}

export function pageMergedScheduledAttendanceRecords<
	T extends {
		employeeRefId?: string | null;
		date?: string | null;
		employeeName?: string | null;
	},
>(params: {
	existingRows: T[];
	scheduledDays: ScheduledWorkDay[];
	employeeIds?: string[] | null;
	page: number;
	limit: number;
	mode?: "not_clocked_in" | "clocked_in";
	keepRow?: (row: T | ReturnType<typeof buildVirtualScheduledAttendanceRow>) => boolean;
}) {
	const mode = params.mode || "not_clocked_in";
	const allowedIds = Array.isArray(params.employeeIds) ? new Set(params.employeeIds) : null;
	const existingByKey = new Map(
		params.existingRows.map((row) => [
			`${String(row.employeeRefId || "").trim()}:${String(row.date || "")}`,
			row,
		]),
	);
	const scheduledRows: Array<T | ReturnType<typeof buildVirtualScheduledAttendanceRow>> = [];
	for (const day of params.scheduledDays) {
		if (!day.employeeRefId || !day.date) continue;
		if (mode === "clocked_in" ? !day.clockedIn : day.clockedIn) continue;
		if (allowedIds && !allowedIds.has(day.employeeRefId)) continue;
		const existing = existingByKey.get(`${day.employeeRefId}:${day.date}`);
		scheduledRows.push(
			existing
				? applyScheduleArrivalToAttendanceRow(existing, day.scheduleSnapshot)
				: buildVirtualScheduledAttendanceRow(day),
		);
	}
	const kept = params.keepRow
		? scheduledRows.filter((row) => params.keepRow!(row))
		: scheduledRows;
	const sorted = [...kept].sort((left, right) => {
		const dateCmp = String(right.date || "").localeCompare(String(left.date || ""));
		if (dateCmp !== 0) return dateCmp;
		return String(left.employeeName || "").localeCompare(String(right.employeeName || ""));
	});
	const safeLimit = Math.min(Math.max(Number(params.limit) || 100, 1), 500);
	const safePage = Math.max(Number(params.page) || 1, 1);
	const skip = (safePage - 1) * safeLimit;
	return {
		records: sorted.slice(skip, skip + safeLimit),
		totalRecords: sorted.length,
	};
}
