import { Prisma, PrismaClient } from "../generated/prisma";
import {
	getBusinessDayBounds,
	getAttendanceEmployeeDisplayName,
	getDateKeyInBusinessTimeZone,
} from "./attendance.helper";
import { buildEmployeeFilter } from "./attendance-metrics-common.helper";
import { deriveGracePeriodStatus, formatMinutesAsTime } from "./timekeeping.helper";

export interface AttendanceRecord {
	id: string;
	employeeRefId?: string;
	employeeId: string;
	employeeName: string;
	departmentId?: string | null;
	departmentName?: string | null;
	workforceSource?: "DIRECT" | "AGENCY";
	agencyId?: string | null;
	agencyName?: string | null;
	agencyCode?: string | null;
	date: string;
	timeIn: string | null;
	timeBreak: string | null;
	timeOut: string | null;
	isOvernight?: boolean | null;
	timeOutNextDay?: boolean | null;
	status: string;
	behaviorFlags?: string[];
	computationMeta?: {
		rawLateMinutes?: number | null;
		gracePeriodMinutes?: number | null;
		withinGrace?: boolean | null;
		[key: string]: unknown;
	} | null;
	hoursWorked: string | null;
	regularHours: string | null;
	overtimeHours: string | null;
	undertimeHours: string | null;
	lateHours: string | null;
	earlyOutHours: string | null;
	breakMinutes: number | null;
	isManualEntry: boolean;
	notes: string | null;
	timesheetId: string | null;
	isVirtual: boolean;
	primaryMarker?: "HOLIDAY" | "LEAVE" | "REST_DAY" | "ABSENT" | "HOURS";
	leaveType?: string | null;
	leaveEntries?: Array<{
		requestId?: string;
		leaveType: string;
		label: string;
		durationUnit?: string;
		halfDaySession?: string;
		startDate?: string;
		endDate?: string;
	}>;
	holidayEntries?: Array<{
		calendarItemId: string;
		title: string;
		startDate: string;
		endDate: string;
		tags?: string[];
	}>;
}

export interface AttendanceMetrics {
	totalPresent: number;
	totalAbsent: number;
	totalNotClockedIn?: number;
	totalLate: number;
	totalOnLeave: number;
	totalRestDay: number;
	totalHoliday?: number;
	totalClockedIn?: number;
	totalClockedOut?: number;
	totalOnTime?: number;
	totalEarlyOut?: number;
	totalOvertime?: number;
	totalScheduledWorkDays?: number;
	totalCalendarDays?: number;
	approvedOvertimeCount?: number;
	unapprovedOvertimeCount?: number;
	avgAttendanceRate: number;
	utilizationRate?: number;
	totalMinutesWorked: number;
	totalOvertimeMinutes: number;
	totalUndertimeMinutes: number;
	totalLateMinutes: number;
}

export interface AttendanceMetricsResponse {
	metrics: AttendanceMetrics;
	records: AttendanceRecord[];
	dateRange: {
		from: string;
		to: string;
	};
	totalRecords: number;
	departmentBreakdown?: Array<{
		departmentId: string | null;
		departmentName: string;
		totalRecords: number;
		employeeCount: number;
		scheduled: number;
		present: number;
		late: number;
		absent: number;
		leave: number;
		missing: number;
		overtimeHours: number;
	}>;
	departmentPreviewRows?: Array<{
		departmentId: string | null;
		departmentName: string;
		rows: AttendanceRecord[];
	}>;
}

export interface AttendanceTodayOpsSummary {
	businessDate: string;
	scheduledTodayCount: number;
	notYetInCount: number;
	lateRightNowCount: number;
	approvedLeaveTodayCount: number;
}

export type AttendanceTimesheetLineSummary = AttendanceMetrics;

type MetricsEmployee = {
	id: string;
	employeeId: string;
	organizationId: string;
	workforceSource?: "DIRECT" | "AGENCY" | null;
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
	employmentHireDate?: Date | null;
	employmentStartDate?: Date | null;
};

type TimesheetLineAttendanceRow = {
	id: string;
	employeeId: string;
	attendanceId?: string | null;
	date?: Date | null;
	timeIn?: Date | null;
	timeBreak?: Date | null;
	timeOut?: Date | null;
	status?: string | null;
	behaviorFlags?: string[] | null;
	scheduleSnapshot?: any;
	totalMinutesWorked?: number | null;
	regularMinutes?: number | null;
	overtimeMinutes?: number | null;
	undertimeMinutes?: number | null;
	lateMinutes?: number | null;
	earlyOutMinutes?: number | null;
	hoursWorked?: string | null;
	regularHours?: string | null;
	overtimeHours?: string | null;
	undertimeHours?: string | null;
	lateHours?: string | null;
	earlyOutHours?: string | null;
	breakMinutes?: number | null;
	isManualEntry?: boolean | null;
	notes?: string | null;
	timesheetId?: string | null;
	createdAt?: Date | null;
	updatedAt?: Date | null;
	employeeCodeSnapshot?: string | null;
	employeeNameSnapshot?: string | null;
	departmentIdSnapshot?: string | null;
	departmentNameSnapshot?: string | null;
	reportToIdSnapshot?: string | null;
	workforceSourceSnapshot?: "DIRECT" | "AGENCY" | null;
	agencyIdSnapshot?: string | null;
	isVirtual?: boolean | null;
	primaryMarker?: string | null;
};

type MaterializedAttendanceRecord = AttendanceRecord & {
	__metrics: {
		totalMinutesWorked: number;
		overtimeMinutes: number;
		undertimeMinutes: number;
		lateMinutes: number;
		isLate: boolean;
		latestEventAtMs: number;
	};
};

function toExtendedJsonObjectId(id: string) {
	return { $oid: id };
}

function toExtendedJsonDate(value: Date) {
	return { $date: value.toISOString() };
}

function readRawNumber(value: any): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") return Number(value) || 0;
	if (value && typeof value === "object") {
		if (typeof value.$numberInt === "string") return Number(value.$numberInt) || 0;
		if (typeof value.$numberLong === "string") return Number(value.$numberLong) || 0;
		if (typeof value.$numberDouble === "string") return Number(value.$numberDouble) || 0;
	}
	return 0;
}

function readRawDate(value: any): Date | null {
	const raw = value && typeof value === "object" && "$date" in value ? value.$date : value;
	if (!raw) return null;
	const parsed = raw instanceof Date ? raw : new Date(String(raw));
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function fetchPersistedTimesheetLineRows(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		startDateUTC: Date;
		endDateUTC: Date;
		status?: string;
		limit?: number;
		page?: number;
		searchQuery?: string;
		departmentId?: string;
		sectionId?: string;
		positionId?: string;
		levelId?: string;
		reportToId?: string;
		employeeId?: string;
	},
): Promise<{ rows: TimesheetLineAttendanceRow[]; totalRecords: number }> {
	const safeLimit = Math.max(1, Number(params.limit) || 100);
	const safePage = Math.max(1, Number(params.page) || 1);
	const skip = (safePage - 1) * safeLimit;
	const scopedEmployeeIds = await resolveTimesheetLineEmployeeIds(prisma, params);
	const where = buildTimesheetLineSummaryWhere(params, scopedEmployeeIds);

	const [totalRecords, rows] = await Promise.all([
		(prisma as any).timesheetline.count({ where }),
		(prisma as any).timesheetline.findMany({
			where,
			select: {
				id: true,
				employeeId: true,
				attendanceId: true,
				date: true,
				timeIn: true,
				timeBreak: true,
				timeOut: true,
				status: true,
				behaviorFlags: true,
				scheduleSnapshot: true,
				hoursWorked: true,
				regularHours: true,
				overtimeHours: true,
				undertimeHours: true,
				lateHours: true,
				earlyOutHours: true,
				breakMinutes: true,
				isManualEntry: true,
				isVirtual: true,
				notes: true,
				timesheetId: true,
				createdAt: true,
				updatedAt: true,
				employeeCodeSnapshot: true,
				employeeNameSnapshot: true,
				departmentIdSnapshot: true,
				departmentNameSnapshot: true,
				reportToIdSnapshot: true,
				workforceSourceSnapshot: true,
				agencyIdSnapshot: true,
				primaryMarker: true,
			},
			orderBy: [
				{ date: "desc" },
				{ updatedAt: "desc" },
				{ createdAt: "desc" },
			],
			skip,
			take: safeLimit,
		}),
	]);

	return { rows, totalRecords };
}

function toUTCStartOfDay(date: Date): Date {
	const normalized = new Date(date);
	normalized.setUTCHours(0, 0, 0, 0);
	return normalized;
}

function toUTCEndOfDay(date: Date): Date {
	const normalized = new Date(date);
	normalized.setUTCHours(23, 59, 59, 999);
	return normalized;
}

function toUTCDateKey(date: Date): string {
	return date.toISOString().split("T")[0];
}

function formatTimeForDisplay(value?: Date | null): string | null {
	if (!value) return null;
	return new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Manila",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	}).format(value);
}

function parseDisplayTimeToMinutes(value?: string | null): number {
	if (!value) return -1;
	const normalized = String(value).trim().toUpperCase();
	const match = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
	if (!match) return -1;

	let hours = Number(match[1]);
	const minutes = Number(match[2]);
	const meridiem = match[3];

	if (Number.isNaN(hours) || Number.isNaN(minutes)) return -1;
	if (meridiem === "AM" && hours === 12) hours = 0;
	if (meridiem === "PM" && hours !== 12) hours += 12;

	return hours * 60 + minutes;
}

function parseDurationToMinutes(value?: string | null): number {
	if (!value) return 0;
	const normalized = String(value).trim();
	const match = normalized.match(/^(-?\d+)(?::(\d{1,2}))?$/);
	if (!match) return 0;
	const hours = Number(match[1]);
	const minutes = Number(match[2] || 0);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
	return hours * 60 + Math.sign(hours || 1) * minutes;
}

function appendAndCondition(where: any, condition: any) {
	where.AND = Array.isArray(where.AND) ? [...where.AND, condition] : [condition];
}

function parseSearchTerms(searchQuery?: string): string[] {
	return String(searchQuery || "").trim().split(/\s+/).filter(Boolean);
}

async function resolveTimesheetLineEmployeeIds(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		searchQuery?: string;
		departmentId?: string;
		sectionId?: string;
		positionId?: string;
		levelId?: string;
		reportToId?: string;
		employeeId?: string;
	},
): Promise<string[] | null> {
	const searchTerms = parseSearchTerms(params.searchQuery);
	const hasScopeFilter =
		Boolean(
			params.departmentId ||
				params.sectionId ||
				params.positionId ||
				params.levelId ||
				params.reportToId ||
				params.employeeId,
		) || searchTerms.length > 0;
	if (!hasScopeFilter) return null;

	const employeeWhere = buildEmployeeFilter(params.organizationId, {
		departmentId: params.departmentId,
		sectionId: params.sectionId,
		positionId: params.positionId,
		levelId: params.levelId,
		reportToId: params.reportToId,
		employeeId: params.employeeId,
	});

	const employees = (await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			employeeId: true,
			organizationId: true,
			workforceSource: true,
			agencyId: true,
			reportToId: true,
			departmentId: true,
			positionId: true,
			levelId: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
		},
	})) as MetricsEmployee[];

	const scopedEmployees = searchTerms.length
		? employees.filter((employee) => matchesSearch(employee, searchTerms))
		: employees;

	return scopedEmployees.map((employee) => String(employee.id));
}

function buildTimesheetLineSummaryWhere(params: {
	organizationId: string;
	startDateUTC: Date;
	endDateUTC: Date;
	searchQuery?: string;
	status?: string;
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeId?: string;
}, employeeIds: string[] | null = null) {
	const where: any = {
		organizationId: params.organizationId,
		isDeleted: false,
		isEffective: true,
		date: {
			gte: params.startDateUTC,
			lte: params.endDateUTC,
		},
	};

	const normalizedStatus = String(params.status || "").trim().toUpperCase();
	if (
		normalizedStatus === "INCOMPLETE" ||
		normalizedStatus === "LEAVE" ||
		normalizedStatus === "REST_DAY" ||
		normalizedStatus === "NOT_CLOCKED_IN"
	) {
		where.status = normalizedStatus;
	} else if (normalizedStatus === "PRESENT") {
		where.status = { in: ["PRESENT", "INCOMPLETE"] };
	} else if (normalizedStatus === "ABSENT") {
		where.status = { in: ["ABSENT", "NOT_CLOCKED_IN"] };
	} else if (normalizedStatus === "ON_LEAVE") {
		where.status = "LEAVE";
	} else if (normalizedStatus === "SCHEDULED_TODAY") {
		where.status = { not: "REST_DAY" };
	} else if (normalizedStatus === "LATE") {
		appendAndCondition(where, { lateHours: { not: null } });
		appendAndCondition(where, { lateHours: { notIn: ["", "0:00", "00:00", "0h 0m"] } });
	}

	if (employeeIds) {
		appendAndCondition(where, { employeeId: { in: employeeIds } });
	}

	return where;
}

function buildTimesheetLineRawMatch(params: {
	organizationId: string;
	startDateUTC: Date;
	endDateUTC: Date;
	searchQuery?: string;
	status?: string;
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeId?: string;
	employeeIds?: string[] | null;
}) {
	const match: Record<string, any> = {
		organizationId: params.organizationId,
		isDeleted: false,
		isEffective: true,
		date: {
			$gte: toExtendedJsonDate(params.startDateUTC),
			$lte: toExtendedJsonDate(params.endDateUTC),
		},
	};

	const normalizedStatus = String(params.status || "").trim().toUpperCase();
	if (
		normalizedStatus === "INCOMPLETE" ||
		normalizedStatus === "LEAVE" ||
		normalizedStatus === "REST_DAY" ||
		normalizedStatus === "NOT_CLOCKED_IN"
	) {
		match.status = normalizedStatus;
	} else if (normalizedStatus === "PRESENT") {
		match.status = { $in: ["PRESENT", "INCOMPLETE"] };
	} else if (normalizedStatus === "ABSENT") {
		match.status = { $in: ["ABSENT", "NOT_CLOCKED_IN"] };
	} else if (normalizedStatus === "ON_LEAVE") {
		match.status = "LEAVE";
	} else if (normalizedStatus === "SCHEDULED_TODAY") {
		match.status = { $ne: "REST_DAY" };
	} else if (normalizedStatus === "LATE") {
		match.lateHours = { $nin: [null, "", "0:00", "00:00", "0h 0m"] };
	}

	if (params.employeeIds) {
		match.employeeId = { $in: params.employeeIds.map((id) => toExtendedJsonObjectId(id)) };
	}

	return match;
}

function getZeroAttendanceMetrics(): AttendanceMetrics {
	return {
		totalPresent: 0,
		totalAbsent: 0,
		totalLate: 0,
		totalOnLeave: 0,
		totalRestDay: 0,
		avgAttendanceRate: 0,
		totalMinutesWorked: 0,
		totalOvertimeMinutes: 0,
		totalUndertimeMinutes: 0,
		totalLateMinutes: 0,
	};
}

function getLatestAttendanceActivityMinutes(record: MaterializedAttendanceRecord): number {
	const timeInMinutes = parseDisplayTimeToMinutes(record.timeIn);
	let timeBreakMinutes = parseDisplayTimeToMinutes(record.timeBreak);
	let timeOutMinutes = parseDisplayTimeToMinutes(record.timeOut);

	if (timeInMinutes >= 12 * 60) {
		if (timeBreakMinutes >= 0 && timeBreakMinutes < timeInMinutes) {
			timeBreakMinutes += 24 * 60;
		}
		if (timeOutMinutes >= 0 && timeOutMinutes < timeInMinutes) {
			timeOutMinutes += 24 * 60;
		}
	}

	return Math.max(timeInMinutes, timeBreakMinutes, timeOutMinutes);
}

function getLatestDateTimeMs(...values: Array<Date | null | undefined>): number {
	return values.reduce((latest, value) => {
		const time = value instanceof Date ? value.getTime() : 0;
		return Number.isFinite(time) ? Math.max(latest, time) : latest;
	}, 0);
}

function isNextBusinessDay(left?: Date | null, right?: Date | null): boolean {
	if (!left || !right) return false;
	return getDateKeyInBusinessTimeZone(right) > getDateKeyInBusinessTimeZone(left);
}

function getAttendanceRecencyPriority(record: MaterializedAttendanceRecord): number {
	switch (String(record.status || "").toUpperCase()) {
		case "NOT_CLOCKED_IN":
			return 0;
		case "INCOMPLETE":
			return 1;
		case "ABSENT":
			return 2;
		case "LEAVE":
			return 3;
		case "LATE":
			return 4;
		case "PRESENT":
			return 5;
		case "REST_DAY":
			return 6;
		default:
			return 7;
	}
}

function getOpenClockPriority(record: MaterializedAttendanceRecord): number {
	return record.timeIn && !record.timeOut ? 0 : 1;
}

function derivePrimaryMarker(status: string): AttendanceRecord["primaryMarker"] {
	if (status === "LEAVE") return "LEAVE";
	if (status === "REST_DAY") return "REST_DAY";
	if (status === "ABSENT") return "ABSENT";
	return "HOURS";
}

function matchesSearch(employee: MetricsEmployee, searchTerms: string[]): boolean {
	if (!searchTerms.length) return true;

	const displayName = getAttendanceEmployeeDisplayName(employee as any);
	const searchableText = [
		employee.employeeId,
		employee.id,
		displayName,
		employee.person?.personalInfo?.firstName,
		employee.person?.personalInfo?.middleName,
		employee.person?.personalInfo?.lastName,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

	return searchTerms.every((term) => searchableText.includes(term.toLowerCase()));
}

function matchesStatus(record: MaterializedAttendanceRecord, normalizedStatus: string): boolean {
	if (!normalizedStatus) return true;
	if (normalizedStatus === "SCHEDULED_TODAY") {
		return record.status !== "REST_DAY";
	}
	if (normalizedStatus === "LATE") return record.__metrics.isLate;
	if (normalizedStatus === "PRESENT") {
		return record.status === "PRESENT" || record.status === "INCOMPLETE";
	}
	if (normalizedStatus === "LEAVE" || normalizedStatus === "ON_LEAVE") {
		return record.status === "LEAVE";
	}
	if (normalizedStatus === "ABSENT") {
		return record.status === "ABSENT" || record.status === "NOT_CLOCKED_IN";
	}
	return record.status === normalizedStatus;
}

function sortAttendanceRecords(left: MaterializedAttendanceRecord, right: MaterializedAttendanceRecord) {
	const dateDelta = right.date.localeCompare(left.date);
	if (dateDelta !== 0) return dateDelta;
	const eventDelta = right.__metrics.latestEventAtMs - left.__metrics.latestEventAtMs;
	if (eventDelta !== 0) return eventDelta;
	const openClockDelta = getOpenClockPriority(left) - getOpenClockPriority(right);
	if (openClockDelta !== 0) return openClockDelta;
	const activityDelta =
		getLatestAttendanceActivityMinutes(right) - getLatestAttendanceActivityMinutes(left);
	if (activityDelta !== 0) return activityDelta;
	const priorityDelta =
		getAttendanceRecencyPriority(left) - getAttendanceRecencyPriority(right);
	if (priorityDelta !== 0) return priorityDelta;
	const employeeDelta = left.employeeId.localeCompare(right.employeeId);
	if (employeeDelta !== 0) return employeeDelta;
	return left.id.localeCompare(right.id);
}

function stripMaterializedRecord(record: MaterializedAttendanceRecord): AttendanceRecord {
	const { __metrics: _metrics, ...rest } = record;
	return rest;
}

function normalizeRealAttendanceRecord(
	record: TimesheetLineAttendanceRow,
	employee: MetricsEmployee,
): MaterializedAttendanceRecord {
	const attendanceDate = readRawDate(record.date) || new Date();
	const timeInDate = readRawDate(record.timeIn);
	const timeBreakDate = readRawDate(record.timeBreak);
	const timeOutDate = readRawDate(record.timeOut);
	const status = String(record.status || "PRESENT").toUpperCase();
	const lateMinutes = Number(record.lateMinutes || 0);
	const effectiveLateMinutes = lateMinutes || parseDurationToMinutes(record.lateHours);
	const graceStatus = deriveGracePeriodStatus(
		timeInDate,
		record.scheduleSnapshot || null,
		attendanceDate,
	);
	const employeeCode = String(
		record.employeeCodeSnapshot || employee.employeeId || employee.id || "",
	).trim();
	const employeeName =
		String(record.employeeNameSnapshot || "").trim() ||
		getAttendanceEmployeeDisplayName(employee as any) ||
		employeeCode ||
		"Unknown Employee";

	return {
		id: String(record.attendanceId || record.id || ""),
		employeeRefId: employee.id,
		employeeId: employeeCode || "UNKNOWN",
		employeeName,
		departmentId: record.departmentIdSnapshot || employee.departmentId || null,
		departmentName:
			record.departmentNameSnapshot || employee.department?.name || "Unassigned",
		workforceSource: (record.workforceSourceSnapshot ||
			employee.workforceSource ||
			"DIRECT") as "DIRECT" | "AGENCY",
		agencyId: record.agencyIdSnapshot || employee.agencyId || null,
		agencyName: null,
		agencyCode: null,
		date: getDateKeyInBusinessTimeZone(attendanceDate),
		timeIn: formatTimeForDisplay(timeInDate),
		timeBreak: formatTimeForDisplay(timeBreakDate),
		timeOut: formatTimeForDisplay(timeOutDate),
		isOvernight: Boolean((record.scheduleSnapshot as any)?.isOvernight),
		timeOutNextDay: isNextBusinessDay(timeInDate || attendanceDate, timeOutDate),
		status,
		behaviorFlags: Array.isArray(record.behaviorFlags) ? record.behaviorFlags : [],
		computationMeta: {
			rawLateMinutes: graceStatus.rawLateMinutes || effectiveLateMinutes,
			gracePeriodMinutes: graceStatus.gracePeriodMinutes,
			withinGrace: graceStatus.withinGrace,
		},
		hoursWorked: record.hoursWorked || formatMinutesAsTime(Number(record.totalMinutesWorked || 0)),
		regularHours: record.regularHours || formatMinutesAsTime(Number(record.regularMinutes || 0)),
		overtimeHours: record.overtimeHours || formatMinutesAsTime(Number(record.overtimeMinutes || 0)),
		undertimeHours: record.undertimeHours || formatMinutesAsTime(Number(record.undertimeMinutes || 0)),
		lateHours: record.lateHours || formatMinutesAsTime(effectiveLateMinutes),
		earlyOutHours:
			record.earlyOutHours || formatMinutesAsTime(Number(record.earlyOutMinutes || 0)),
		breakMinutes: Number(record.breakMinutes || 0),
		isManualEntry: Boolean(record.isManualEntry),
		notes: record.notes || null,
		timesheetId: record.timesheetId || null,
		isVirtual: Boolean(record.isVirtual),
		primaryMarker: (record.primaryMarker as AttendanceRecord["primaryMarker"]) || derivePrimaryMarker(status),
		leaveType: status === "LEAVE" ? "LEAVE" : null,
		leaveEntries: [],
		holidayEntries: [],
		__metrics: {
			totalMinutesWorked: Number(record.totalMinutesWorked || 0) || parseDurationToMinutes(record.hoursWorked),
			overtimeMinutes: Number(record.overtimeMinutes || 0) || parseDurationToMinutes(record.overtimeHours),
			undertimeMinutes: Number(record.undertimeMinutes || 0) || parseDurationToMinutes(record.undertimeHours),
			lateMinutes: effectiveLateMinutes,
			isLate: effectiveLateMinutes > 0,
			latestEventAtMs: getLatestDateTimeMs(
				readRawDate(record.updatedAt),
				readRawDate(record.createdAt),
			),
		},
	};
}

export async function calculateAttendanceMetricsDetailed(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	limit: number = 100,
	page: number = 1,
	searchQuery?: string,
	status?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
): Promise<AttendanceMetricsResponse> {
	const startDateUTC = toUTCStartOfDay(startDate);
	const { end: manilaTodayEndOfDay } = getBusinessDayBounds(new Date());
	const endDateUTC = toUTCEndOfDay(
		endDate.getTime() <= manilaTodayEndOfDay.getTime() ? endDate : manilaTodayEndOfDay,
	);
	const normalizedStatus = String(status || "").trim().toUpperCase();
	const safeLimit = Math.max(1, Number(limit) || 100);
	const safePage = Math.max(1, Number(page) || 1);

	if (startDateUTC.getTime() > endDateUTC.getTime()) {
		return {
			metrics: getZeroAttendanceMetrics(),
			records: [],
			dateRange: {
				from: toUTCDateKey(startDateUTC),
				to: toUTCDateKey(endDateUTC),
			},
			totalRecords: 0,
			departmentBreakdown: [],
			departmentPreviewRows: [],
		};
	}

	const facet = await getPostgresTimesheetLineFacet({
		prisma,
		organizationId,
		startDateUTC,
		endDateUTC,
		limit: safeLimit,
		page: safePage,
		status: normalizedStatus,
		searchQuery,
		departmentId,
		sectionId,
		positionId,
		levelId,
		reportToId,
		employeeId,
		shiftType,
		employeeIds: await resolveTimesheetLineEmployeeIds(prisma, {
			organizationId,
			searchQuery,
			departmentId,
			sectionId,
			positionId,
			levelId,
			reportToId,
			employeeId,
		}),
	});
	const timesheetLineRows = Array.isArray(facet.records) ? facet.records : [];
	const totalRecords = Number(facet.totalRecords?.[0]?.total || 0);

	const materializedRecords: MaterializedAttendanceRecord[] = [];
	for (const row of timesheetLineRows) {
		const employee: MetricsEmployee = {
			id: String(row.employeeId || ""),
			employeeId: String(row.employeeCodeSnapshot || row.employeeId || ""),
			organizationId,
			workforceSource: row.workforceSourceSnapshot || "DIRECT",
			agencyId: row.agencyIdSnapshot || null,
			departmentId: row.departmentIdSnapshot || null,
			reportToId: row.reportToIdSnapshot || null,
			department: {
				id: row.departmentIdSnapshot || null,
				name: row.departmentNameSnapshot || "Unassigned",
			},
		};
		const record = normalizeRealAttendanceRecord(row, employee);
		if (matchesStatus(record, normalizedStatus)) {
			materializedRecords.push(record);
		}
	}

	const normalizeDepartmentGroupRow = (row: TimesheetLineAttendanceRow) => {
		const employee: MetricsEmployee = {
			id: String(row.employeeId || ""),
			employeeId: String(row.employeeCodeSnapshot || row.employeeId || ""),
			organizationId,
			workforceSource: row.workforceSourceSnapshot || "DIRECT",
			agencyId: row.agencyIdSnapshot || null,
			departmentId: row.departmentIdSnapshot || null,
			reportToId: row.reportToIdSnapshot || null,
			department: {
				id: row.departmentIdSnapshot || null,
				name: row.departmentNameSnapshot || "Unassigned",
			},
		};
		return stripMaterializedRecord(normalizeRealAttendanceRecord(row, employee));
	};
	const departmentPreviewRows = (facet.departmentPreviewRecords || []).map((group: any) => ({
		departmentId: group.departmentId || null,
		departmentName: String(group.departmentName || "Unassigned"),
		rows: Array.isArray(group.rows) ? group.rows.map(normalizeDepartmentGroupRow) : [],
	}));
	const departmentBreakdown = (facet.departmentBreakdown || []).map((item: any) => ({
		departmentId: item.departmentId || null,
		departmentName: String(item.departmentName || "Unassigned"),
		totalRecords: Number(item.totalRecords || 0),
		employeeCount: Number(item.employeeCount || 0),
		scheduled: Number(item.scheduled || 0),
		present: Number(item.present || 0),
		late: Number(item.late || 0),
		absent: Number(item.absent || 0),
		leave: Number(item.leave || 0),
		missing: Number(item.missing || 0),
		overtimeHours: Number(item.overtimeHours || 0),
	}));

	const sortedRecords = materializedRecords.sort(sortAttendanceRecords);
	const pagedRecords = sortedRecords.map(stripMaterializedRecord);
	const metrics = { ...getZeroAttendanceMetrics(), ...(facet.metrics?.[0] || {}) };
	delete (metrics as any)._id;
	(metrics as any).totalCalendarDays = Number(facet.calendarDays?.[0]?.total || 0);
	(metrics as any).totalCompanyEventDays = 0;
	(metrics as any).leaveTypeBreakdown = [];
	(metrics as any).shiftTypeBreakdown = (facet.shiftTypeBreakdown || []).map((item: any) => ({
		shiftType: String(item.shiftType || "UNASSIGNED"),
		label: String(item.label || item.shiftType || "Unassigned"),
		total: Number(item.total || 0),
	}));
	(metrics as any).approvedOvertimeCount = Number((metrics as any).totalOvertime || 0);
	(metrics as any).unapprovedOvertimeCount = 0;
	const obligatedToWork = Number(
		(metrics as any).totalObligatedToWork || (metrics as any).totalScheduledWorkDays || 0,
	);
	const clockedInObligated = Number(
		(metrics as any).totalClockedInObligated ?? (metrics as any).totalClockedIn ?? 0,
	);
	(metrics as any).totalObligatedToWork = obligatedToWork;
	(metrics as any).totalScheduledWorkDays = obligatedToWork;
	(metrics as any).totalClockedInObligated = clockedInObligated;
	(metrics as any).utilizationRate =
		obligatedToWork > 0 ? Math.round((clockedInObligated / obligatedToWork) * 100) : 0;
	(metrics as any).avgAttendanceRate = (metrics as any).utilizationRate;

	return {
		metrics,
		records: pagedRecords,
		dateRange: {
			from: toUTCDateKey(startDateUTC),
			to: toUTCDateKey(endDateUTC),
		},
		totalRecords,
		departmentBreakdown,
		departmentPreviewRows,
	};
}

function postgresDurationStringToMinutesExpression(columnSql: Prisma.Sql) {
	return Prisma.sql`
		CASE
			WHEN COALESCE(${columnSql}, '') ~ '^-?\\d+:\\d{1,2}$' THEN
				COALESCE(NULLIF(split_part(${columnSql}, ':', 1), '')::int, 0) * 60 +
				(CASE WHEN split_part(${columnSql}, ':', 1) LIKE '-%' THEN -1 ELSE 1 END) *
				COALESCE(NULLIF(split_part(${columnSql}, ':', 2), '')::int, 0)
			WHEN COALESCE(${columnSql}, '') ~ '^-?\\d+h\\s*\\d+m$' THEN
				COALESCE(NULLIF(regexp_replace(${columnSql}, '^\\s*(-?\\d+)h.*$', '\\1'), '')::int, 0) * 60 +
				(CASE WHEN ${columnSql} LIKE '-%' THEN -1 ELSE 1 END) *
				COALESCE(NULLIF(regexp_replace(${columnSql}, '^.*h\\s*(\\d+)m\\s*$', '\\1'), '')::int, 0)
			ELSE 0
		END
	`;
}

function buildPostgresTimesheetLineFilterSql(params: {
	organizationId: string;
	startDateUTC: Date;
	endDateUTC: Date;
	employeeIds?: string[] | null;
}) {
	const conditions: Prisma.Sql[] = [
		Prisma.sql`tl."organizationId" = ${params.organizationId}`,
		Prisma.sql`tl."isDeleted" = false`,
		Prisma.sql`tl."isEffective" = true`,
		Prisma.sql`tl."date" >= ${params.startDateUTC}`,
		Prisma.sql`tl."date" <= ${params.endDateUTC}`,
	];

	if (params.employeeIds?.length) {
		conditions.push(
			Prisma.sql`tl."employeeId" IN (${Prisma.join(params.employeeIds.map((id) => Prisma.sql`${id}`))})`,
		);
	}

	return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

function buildPostgresTimesheetLineStatusCondition(status?: string) {
	const normalized = String(status || "").trim().toUpperCase();
	if (!normalized) return null;

	if (normalized === "ON_TIME") return Prisma.sql`f."_isClockedIn" = true AND f."_isLate" = false`;
	if (normalized === "LATE") return Prisma.sql`f."_isLate" = true`;
	if (normalized === "EARLY_OUT") return Prisma.sql`f."_isEarlyOut" = true`;
	if (normalized === "OVERTIME") return Prisma.sql`f."_isOvertime" = true`;
	if (normalized === "CLOCKED_IN") return Prisma.sql`f."_isClockedIn" = true`;
	if (normalized === "CLOCKED_OUT") return Prisma.sql`f."_isClockedOut" = true`;
	if (normalized === "MISSING_CLOCK_IN")
		return Prisma.sql`f."_displayStatus" IN ('ABSENT', 'NOT_CLOCKED_IN')`;
	if (normalized === "MISSING_SCHEDULE")
		return Prisma.sql`f."_shiftTypeKeyUpper" = 'UNASSIGNED'`;
	if (normalized === "WORKED_REST_DAY")
		return Prisma.sql`f."_isClockedIn" = true AND f."_isOffDay" = true`;
	if (normalized === "WORKED_HOLIDAY")
		return Prisma.sql`f."_isClockedIn" = true AND f."_isHoliday" = true`;
	if (normalized === "PRESENT")
		return Prisma.sql`f."_displayStatus" IN ('PRESENT', 'INCOMPLETE')`;
	if (normalized === "ABSENT")
		return Prisma.sql`f."_displayStatus" IN ('ABSENT', 'NOT_CLOCKED_IN')`;
	if (normalized === "ON_LEAVE") return Prisma.sql`f."_displayStatus" = 'LEAVE'`;
	if (normalized === "SCHEDULED_TODAY") return Prisma.sql`f."_displayStatus" <> 'REST_DAY'`;
	if (normalized.startsWith("LEAVE_TYPE:")) return Prisma.sql`f."_displayStatus" = 'LEAVE'`;

	return Prisma.sql`f."_displayStatus" = ${normalized}`;
}

async function getPostgresTimesheetLineFacet(params: {
	prisma: PrismaClient;
	organizationId: string;
	startDateUTC: Date;
	endDateUTC: Date;
	limit: number;
	page: number;
	searchQuery?: string;
	status?: string;
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeId?: string;
	shiftType?: string;
	employeeIds?: string[] | null;
}) {
	const skip = (params.page - 1) * params.limit;
	const whereSql = buildPostgresTimesheetLineFilterSql(params);
	const statusCondition = buildPostgresTimesheetLineStatusCondition(params.status);
	const shiftType = String(params.shiftType || "").trim().toUpperCase();
	const postFilterConditions = [
		statusCondition,
		shiftType ? Prisma.sql`f."_shiftTypeKeyUpper" = ${shiftType}` : null,
	].filter(Boolean) as Prisma.Sql[];
	const postFilterSql =
		postFilterConditions.length > 0
			? Prisma.sql`WHERE ${Prisma.join(postFilterConditions, " AND ")}`
			: Prisma.empty;

	const result = await params.prisma.$queryRaw<any[]>(Prisma.sql`
		WITH enriched AS (
			SELECT
				tl.*,
				UPPER(COALESCE(tl."status", 'PRESENT')) AS "_displayStatus",
				${postgresDurationStringToMinutesExpression(Prisma.sql`tl."lateHours"`)} AS "_lateMinutes",
				${postgresDurationStringToMinutesExpression(Prisma.sql`tl."earlyOutHours"`)} AS "_earlyOutMinutes",
				${postgresDurationStringToMinutesExpression(Prisma.sql`tl."overtimeHours"`)} AS "_overtimeMinutes",
				${postgresDurationStringToMinutesExpression(Prisma.sql`tl."hoursWorked"`)} AS "_hoursWorkedMinutes",
				${postgresDurationStringToMinutesExpression(Prisma.sql`tl."undertimeHours"`)} AS "_undertimeMinutes",
				CASE
					WHEN tl."scheduleSnapshot"->>'isOff' = 'true' THEN 'OFF'
					ELSE COALESCE(
						NULLIF(tl."scheduleSnapshot"->>'shiftTypeId', ''),
						NULLIF(tl."scheduleSnapshot"->>'shiftTypeCode', ''),
						NULLIF(tl."scheduleSnapshot"->>'shiftTypeName', ''),
						NULLIF(tl."scheduleSnapshot"->>'scheduleTemplateName', ''),
						'UNASSIGNED'
					)
				END AS "_shiftTypeKey",
				CASE
					WHEN tl."scheduleSnapshot"->>'isOff' = 'true' THEN 'Off'
					ELSE COALESCE(
						NULLIF(tl."scheduleSnapshot"->>'shiftTypeName', ''),
						NULLIF(tl."scheduleSnapshot"->>'shiftTypeCode', ''),
						NULLIF(tl."scheduleSnapshot"->>'scheduleTemplateName', ''),
						'Unassigned'
					)
				END AS "_shiftTypeLabel"
			FROM "timesheet_lines" tl
			WHERE ${whereSql}
		),
		filtered AS (
			SELECT
				e.*,
				UPPER(e."_shiftTypeKey") AS "_shiftTypeKeyUpper",
				(COALESCE(e."behaviorFlags", ARRAY[]::text[]) @> ARRAY['TARDINESS']::text[] OR e."_lateMinutes" > 0) AS "_isLate",
				(e."_earlyOutMinutes" > 0) AS "_isEarlyOut",
				(e."_overtimeMinutes" > 0) AS "_isOvertime",
				(e."timeIn" IS NOT NULL) AS "_isClockedIn",
				(e."timeOut" IS NOT NULL) AS "_isClockedOut",
				(UPPER(e."_shiftTypeKey") = 'OFF') AS "_isOffDay",
				(
					e."_displayStatus" = 'HOLIDAY' OR
					(
						jsonb_typeof(e."metadata"->'holidayEntries') = 'array' AND
						jsonb_array_length(e."metadata"->'holidayEntries') > 0
					)
				) AS "_isHoliday",
				(
					e."_displayStatus" IN (
						'NOT_CLOCKED_IN',
						'ABSENT',
						'SCHEDULED',
						'PRESENT',
						'INCOMPLETE',
						'LATE',
						'HALF_DAY'
					)
					AND NOT (
						e."_displayStatus" IN ('PRESENT', 'INCOMPLETE')
						AND UPPER(COALESCE(e."_shiftTypeKey", '')) = 'OFF'
					)
				) AS "_isObligatedWorkDay"
			FROM enriched e
		),
		final_filtered AS (
			SELECT * FROM filtered f
			${postFilterSql}
		),
		paged_records AS (
			SELECT *
			FROM final_filtered
			ORDER BY "date" DESC, "updatedAt" DESC, "createdAt" DESC
			OFFSET ${skip}
			LIMIT ${params.limit}
		),
		department_preview_ranked AS (
			SELECT
				f.*,
				row_number() OVER (
					PARTITION BY f."departmentIdSnapshot", f."departmentNameSnapshot"
					ORDER BY f."date" DESC, f."updatedAt" DESC, f."createdAt" DESC, f."employeeNameSnapshot" ASC
				) AS "_departmentPreviewRank"
			FROM final_filtered f
		),
		department_preview AS (
			SELECT
				"departmentIdSnapshot" AS "departmentId",
				COALESCE("departmentNameSnapshot", 'Unassigned') AS "departmentName",
				json_agg(row_to_json(department_preview_ranked) ORDER BY "date" DESC, "updatedAt" DESC, "createdAt" DESC, "employeeNameSnapshot" ASC) AS rows
			FROM department_preview_ranked
			WHERE "_departmentPreviewRank" <= 5
			GROUP BY "departmentIdSnapshot", "departmentNameSnapshot"
			ORDER BY COALESCE("departmentNameSnapshot", 'Unassigned') ASC
		),
		department_breakdown AS (
			SELECT
				"departmentIdSnapshot" AS "departmentId",
				COALESCE("departmentNameSnapshot", 'Unassigned') AS "departmentName",
				COUNT(*)::int AS "totalRecords",
				COUNT(DISTINCT "employeeId")::int AS "employeeCount",
				COUNT(*) FILTER (WHERE "_displayStatus" NOT IN ('REST_DAY', 'HOLIDAY', 'CANCELLED', 'SCHEDULED'))::int AS "scheduled",
				COUNT(*) FILTER (WHERE "_isClockedIn")::int AS "present",
				COUNT(*) FILTER (WHERE "_isLate")::int AS "late",
				COUNT(*) FILTER (WHERE "_displayStatus" IN ('ABSENT', 'NOT_CLOCKED_IN'))::int AS "absent",
				COUNT(*) FILTER (WHERE "_displayStatus" = 'LEAVE')::int AS "leave",
				COUNT(*) FILTER (WHERE "_displayStatus" IN ('NOT_CLOCKED_IN', 'INCOMPLETE'))::int AS "missing",
				(COALESCE(SUM("_overtimeMinutes"), 0)::float / 60.0) AS "overtimeHours"
			FROM final_filtered
			GROUP BY "departmentIdSnapshot", "departmentNameSnapshot"
			ORDER BY COALESCE("departmentNameSnapshot", 'Unassigned') ASC
		),
		shift_type_breakdown AS (
			SELECT
				"_shiftTypeKey" AS "shiftType",
				MIN("_shiftTypeLabel") AS "label",
				COUNT(*)::int AS "total"
			FROM final_filtered
			GROUP BY "_shiftTypeKey"
			ORDER BY COUNT(*) DESC, MIN("_shiftTypeLabel") ASC
		),
		metrics AS (
			SELECT
				COUNT(*) FILTER (WHERE "_isClockedIn")::int AS "totalPresent",
				COUNT(*) FILTER (WHERE "_displayStatus" IN ('ABSENT', 'NOT_CLOCKED_IN'))::int AS "totalAbsent",
				COUNT(*) FILTER (WHERE "_displayStatus" = 'NOT_CLOCKED_IN')::int AS "totalNotClockedIn",
				COUNT(*) FILTER (WHERE "_isLate")::int AS "totalLate",
				COUNT(*) FILTER (WHERE "_displayStatus" = 'LEAVE')::int AS "totalOnLeave",
				COUNT(*) FILTER (WHERE "_displayStatus" = 'REST_DAY')::int AS "totalRestDay",
				COUNT(*) FILTER (WHERE "_isHoliday")::int AS "totalHoliday",
				COUNT(*) FILTER (WHERE "_isClockedIn" AND "_isOffDay")::int AS "totalWorkedOnRestDay",
				COUNT(*) FILTER (WHERE "_isClockedIn" AND "_isHoliday")::int AS "totalWorkedOnHoliday",
				COUNT(*) FILTER (WHERE "_isClockedIn")::int AS "totalClockedIn",
				COUNT(*) FILTER (WHERE "_isClockedIn" AND "_isObligatedWorkDay")::int AS "totalClockedInObligated",
				COUNT(*) FILTER (WHERE "_isClockedOut")::int AS "totalClockedOut",
				COUNT(*) FILTER (WHERE "_isClockedIn" AND NOT "_isLate")::int AS "totalOnTime",
				COUNT(*) FILTER (WHERE "_isObligatedWorkDay")::int AS "totalScheduledWorkDays",
				COUNT(*) FILTER (WHERE "_isObligatedWorkDay")::int AS "totalObligatedToWork",
				COUNT(*) FILTER (WHERE "_isEarlyOut")::int AS "totalEarlyOut",
				COUNT(*) FILTER (WHERE "_isOvertime")::int AS "totalOvertime",
				COALESCE(SUM("_hoursWorkedMinutes"), 0)::int AS "totalMinutesWorked",
				COALESCE(SUM("_overtimeMinutes"), 0)::int AS "totalOvertimeMinutes",
				COALESCE(SUM("_undertimeMinutes"), 0)::int AS "totalUndertimeMinutes",
				COALESCE(SUM("_lateMinutes"), 0)::int AS "totalLateMinutes"
			FROM final_filtered
		)
		SELECT
			COALESCE((SELECT json_agg(row_to_json(paged_records)) FROM paged_records), '[]'::json) AS "records",
			json_build_array(json_build_object('total', (SELECT COUNT(*)::int FROM final_filtered))) AS "totalRecords",
			json_build_array(json_build_object('total', (SELECT COUNT(DISTINCT to_char("date", 'YYYY-MM-DD'))::int FROM final_filtered))) AS "calendarDays",
			COALESCE((SELECT json_agg(row_to_json(metrics)) FROM metrics), '[]'::json) AS "metrics",
			COALESCE((SELECT json_agg(row_to_json(shift_type_breakdown)) FROM shift_type_breakdown), '[]'::json) AS "shiftTypeBreakdown",
			COALESCE((SELECT json_agg(row_to_json(department_breakdown)) FROM department_breakdown), '[]'::json) AS "departmentBreakdown",
			COALESCE((SELECT json_agg(row_to_json(department_preview)) FROM department_preview), '[]'::json) AS "departmentPreviewRecords"
	`);

	return result?.[0] || {};
}

export async function calculateAttendanceTimesheetLineSummary(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	searchQuery?: string,
	status?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
): Promise<AttendanceTimesheetLineSummary> {
	const startDateUTC = toUTCStartOfDay(startDate);
	const { end: manilaTodayEndOfDay } = getBusinessDayBounds(new Date());
	const endDateUTC = toUTCEndOfDay(
		endDate.getTime() <= manilaTodayEndOfDay.getTime() ? endDate : manilaTodayEndOfDay,
	);

	if (startDateUTC.getTime() > endDateUTC.getTime()) {
		return getZeroAttendanceMetrics();
	}

	const result = await (prisma as any).timesheetline.aggregateRaw({
		pipeline: [
			{
				$match: buildTimesheetLineRawMatch({
					organizationId,
					startDateUTC,
					endDateUTC,
					searchQuery,
					status,
					departmentId,
					sectionId,
					positionId,
					levelId,
					reportToId,
					employeeId,
				}),
			},
			{
				$facet: {
					statusCounts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
					lateCount: [
						{ $match: { lateHours: { $nin: [null, "", "0:00", "00:00", "0h 0m"] } } },
						{ $count: "count" },
					],
					employeeRates: [
						{
							$group: {
								_id: "$employeeId",
								present: {
									$sum: {
										$cond: [{ $in: ["$status", ["PRESENT", "INCOMPLETE"]] }, 1, 0],
									},
								},
								leave: { $sum: { $cond: [{ $eq: ["$status", "LEAVE"] }, 1, 0] } },
								absent: {
									$sum: {
										$cond: [{ $in: ["$status", ["ABSENT", "NOT_CLOCKED_IN"]] }, 1, 0],
									},
								},
							},
						},
						{
							$project: {
								rate: {
									$cond: [
										{ $gt: [{ $add: ["$present", "$leave", "$absent"] }, 0] },
										{
											$multiply: [
												{
													$divide: [
														{ $add: ["$present", "$leave"] },
														{ $add: ["$present", "$leave", "$absent"] },
													],
												},
												100,
											],
										},
										0,
									],
								},
							},
						},
						{ $group: { _id: null, avgAttendanceRate: { $avg: "$rate" } } },
					],
				},
			},
		] as any,
	});

	const summary = Array.isArray(result) ? result[0] || {} : {};
	const statusCounts = Array.isArray(summary.statusCounts) ? summary.statusCounts : [];
	const countByStatus = new Map<string, number>(
		statusCounts.map((entry: any) => [
			String(entry._id || "").toUpperCase(),
			readRawNumber(entry.count),
		]),
	);
	const avgAttendanceRate =
		Math.round(readRawNumber(summary.employeeRates?.[0]?.avgAttendanceRate) * 100) / 100;

	return {
		totalPresent:
			(countByStatus.get("PRESENT") || 0) + (countByStatus.get("INCOMPLETE") || 0),
		totalAbsent:
			(countByStatus.get("ABSENT") || 0) + (countByStatus.get("NOT_CLOCKED_IN") || 0),
		totalLate: readRawNumber(summary.lateCount?.[0]?.count),
		totalOnLeave: countByStatus.get("LEAVE") || 0,
		totalRestDay: countByStatus.get("REST_DAY") || 0,
		avgAttendanceRate,
		totalMinutesWorked: 0,
		totalOvertimeMinutes: 0,
		totalUndertimeMinutes: 0,
		totalLateMinutes: 0,
	};
}

export async function calculateAttendanceTodayOpsSummary(
	prisma: PrismaClient,
	organizationId: string,
	targetDate: Date,
	searchQuery?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
): Promise<AttendanceTodayOpsSummary> {
	const startDateUTC = toUTCStartOfDay(targetDate);
	const { end: manilaTodayEndOfDay } = getBusinessDayBounds(new Date());
	const endDateUTC = toUTCEndOfDay(
		targetDate.getTime() <= manilaTodayEndOfDay.getTime() ? targetDate : manilaTodayEndOfDay,
	);
	const normalizedSearchQuery = String(searchQuery || "").trim();
	const searchTerms = normalizedSearchQuery.split(/\s+/).filter(Boolean);
	const shouldLoadPersonForSearch = searchTerms.length > 0;

	const employeeWhere = buildEmployeeFilter(organizationId, {
		departmentId,
		sectionId,
		positionId,
		levelId,
		reportToId,
		employeeId,
	});

	const employees = (await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			employeeId: true,
			organizationId: true,
			workforceSource: true,
			agencyId: true,
			reportToId: true,
			departmentId: true,
			positionId: true,
			levelId: true,
			employmentHireDate: true,
			employmentStartDate: true,
			person: shouldLoadPersonForSearch
				? {
						select: {
							personalInfo: true,
						},
					}
				: false,
		},
	})) as MetricsEmployee[];

	const scopedEmployees = employees.filter((employee) => matchesSearch(employee, searchTerms));

	if (!scopedEmployees.length) {
		return {
			businessDate: toUTCDateKey(startDateUTC),
			scheduledTodayCount: 0,
			notYetInCount: 0,
			lateRightNowCount: 0,
			approvedLeaveTodayCount: 0,
		};
	}

	let scheduledTodayCount = 0;
	let notYetInCount = 0;
	let lateRightNowCount = 0;
	let approvedLeaveTodayCount = 0;

	const todayDateKey = getDateKeyInBusinessTimeZone(startDateUTC);
	const employeeById = new Map(scopedEmployees.map((employee) => [String(employee.id), employee]));
	const { rows: timesheetLineRows } = await fetchPersistedTimesheetLineRows(prisma, {
		organizationId,
		startDateUTC,
		endDateUTC,
		limit: 100000,
		searchQuery,
		departmentId,
		sectionId,
		positionId,
		levelId,
		reportToId,
		employeeId,
	});

	for (const row of timesheetLineRows) {
		if (!row.date || getDateKeyInBusinessTimeZone(row.date) !== todayDateKey) continue;
		const employee = employeeById.get(String(row.employeeId));
		if (!employee) continue;
		const normalizedRecord = normalizeRealAttendanceRecord(row, employee);
		const effectiveStatus = normalizedRecord.status;

		if (effectiveStatus !== "REST_DAY") {
			scheduledTodayCount += 1;
		}
		if (effectiveStatus === "NOT_CLOCKED_IN") {
			notYetInCount += 1;
		}
		if (
			Boolean(normalizedRecord.timeIn) &&
			!Boolean(normalizedRecord.computationMeta?.withinGrace) &&
			normalizedRecord.__metrics.lateMinutes > 0
		) {
			lateRightNowCount += 1;
		}
		if (effectiveStatus === "LEAVE") {
			approvedLeaveTodayCount += 1;
		}
	}

	return {
		businessDate: todayDateKey,
		scheduledTodayCount,
		notYetInCount,
		lateRightNowCount,
		approvedLeaveTodayCount,
	};
}
