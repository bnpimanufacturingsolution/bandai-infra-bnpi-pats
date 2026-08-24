// @ts-nocheck
import { Prisma, PrismaClient } from "../generated/prisma";
import { buildEmployeeFilter, getEmployeeName } from "./attendance-metrics-common.helper";
import { getDateKeyInBusinessTimeZone, readQueryRawUtcTimestamp } from "./attendance.helper";
import {
	computeAttendanceUtilizationRate,
	deriveAttendanceObligationDisplayStatus,
	type AttendanceObligationDisplayStatus,
} from "./attendance-obligation.helper";
import {
	applyScheduleArrivalToAttendanceRow,
	applyScheduledDayArrivalToRows,
	buildPeriodRollupAttendanceRow,
	buildVirtualScheduledAttendanceRow,
	countRegularScheduleWorkUtilization,
	pageMergedScheduledAttendanceRecords,
	pickScheduledDepartmentPreviewDays,
	pickScheduledDepartmentPreviewEmployees,
	rowMatchesComputedTimekeepingStatus,
	summarizeScheduledDepartmentBreakdown,
	summarizeScheduledDayTimekeeping,
	summarizeScheduledEmployeeBreakdown,
} from "./attendance-schedule-utilization.helper";
import { enrichAttendanceRecordsBatchWithLeaveHolidayContext } from "./day-context.helper";

export interface AttendanceDailyTrendDepartmentTotal {
	departmentId: string | null;
	departmentName: string;
	total: number;
}

export interface AttendanceDailyTrendDayBucket {
	businessDate: string;
	total: number;
	departmentBreakdown: AttendanceDailyTrendDepartmentTotal[];
}

export interface AttendanceDailyTrendByDepartmentResult {
	startDate: Date;
	endDate: Date;
	totalDays: number;
	totalRecords: number;
	departments: AttendanceDailyTrendDepartmentTotal[];
	series: AttendanceDailyTrendDayBucket[];
}

function timeStringToMinutes(value: unknown): number {
	const [hours, minutes] = String(value || "0:00")
		.split(":")
		.map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours * 60 + minutes;
}

function getZeroMetrics() {
	return {
		totalPresent: 0,
		totalAbsent: 0,
		totalNotClockedIn: 0,
		totalLate: 0,
		totalOnLeave: 0,
		totalRestDay: 0,
		totalHoliday: 0,
		totalHolidayDateCount: 0,
		totalWorkedOnRestDay: 0,
		totalWorkedOnHoliday: 0,
		totalClockedIn: 0,
		totalClockedInObligated: 0,
		totalObligatedToWork: 0,
		totalOnTime: 0,
		totalScheduledWorkDays: 0,
		totalCalendarDays: 0,
		totalCompanyEventDays: 0,
		totalEmployeesMissingSchedule: 0,
		totalClockedOut: 0,
		totalEarlyOut: 0,
		totalOvertime: 0,
		approvedOvertimeCount: 0,
		unapprovedOvertimeCount: 0,
		leaveTypeBreakdown: [],
		shiftTypeBreakdown: [],
		avgAttendanceRate: 0,
		utilizationRate: 0,
		totalMinutesWorked: 0,
		totalOvertimeMinutes: 0,
		totalUndertimeMinutes: 0,
		totalLateMinutes: 0,
	};
}

function normalizeSearch(value?: string | null) {
	return String(value || "")
		.trim()
		.toLowerCase();
}

async function resolveObligationEmployeeIds(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		search?: string;
		departmentId?: string;
		sectionId?: string;
		positionId?: string;
		levelId?: string;
		reportToId?: string;
		employeeId?: string;
	},
): Promise<string[] | null> {
	const searchQuery = normalizeSearch(params.search);
	const hasScope =
		Boolean(
			params.departmentId ||
				params.sectionId ||
				params.positionId ||
				params.levelId ||
				params.reportToId ||
				params.employeeId,
		) || Boolean(searchQuery);
	if (!hasScope) return null;

	const employeeWhere = buildEmployeeFilter(params.organizationId, {
		departmentId: params.departmentId,
		sectionId: params.sectionId,
		positionId: params.positionId,
		levelId: params.levelId,
		reportToId: params.reportToId,
		employeeId: params.employeeId,
	});

	const employees = await prisma.employee.findMany({
		where: employeeWhere,
		select: {
			id: true,
			employeeId: true,
			person: {
				select: {
					personalInfo: true,
				},
			},
		},
	});

	const searchTerms = searchQuery.split(/\s+/).filter(Boolean);
	const scopedEmployees = searchTerms.length
		? employees.filter((employee: any) => {
				const searchableText = [
					employee.employeeId,
					employee.id,
					getEmployeeName(employee),
					employee.person?.personalInfo?.firstName,
					employee.person?.personalInfo?.middleName,
					employee.person?.personalInfo?.lastName,
				]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return searchTerms.every((term) => searchableText.includes(term));
			})
		: employees;

	return scopedEmployees.map((employee: any) => String(employee.id));
}

function matchesStatus(
	status: AttendanceObligationDisplayStatus,
	storedStatus: string,
	row?: any,
	filter?: string,
) {
	if (!filter) return true;
	const normalized = String(filter).toUpperCase();
	const isLate =
		Array.isArray(row?.behaviorFlags) && row.behaviorFlags.includes("TARDINESS")
			? true
			: timeStringToMinutes(row?.lateHours) > 0;
	const isEarlyOut = timeStringToMinutes(row?.earlyOutHours) > 0;
	const isOvertime = timeStringToMinutes(row?.overtimeHours) > 0;
	const isClockedIn = status === "PRESENT" || status === "INCOMPLETE";
	const isClockedOut = Boolean(row?.timeOut);

	if (normalized === "ON_TIME") return isClockedIn && !isLate;
	if (normalized === "LATE") return isLate;
	if (normalized === "EARLY_OUT") return isEarlyOut;
	if (normalized === "OVERTIME") return isOvertime;
	if (normalized === "CLOCKED_IN") return isClockedIn;
	if (normalized === "CLOCKED_OUT") return isClockedOut;
	if (normalized === "MISSING_CLOCK_IN") return status === "ABSENT" || status === "NOT_CLOCKED_IN";
	if (normalized === "MISSING_SCHEDULE") {
		return getShiftTypeKey(row).toUpperCase() === "UNASSIGNED";
	}
	if (normalized === "WORKED_REST_DAY") {
		return isClockedIn && getShiftTypeKey(row).toUpperCase() === "OFF";
	}
	if (normalized === "WORKED_HOLIDAY") {
		const holidayEntries = Array.isArray(row?.holidayEntries) ? row.holidayEntries : [];
		return (
			isClockedIn &&
			(status === "HOLIDAY" ||
				row?.primaryMarker === "HOLIDAY" ||
				holidayEntries.length > 0)
		);
	}
	if (normalized.startsWith("LEAVE_TYPE:")) {
		const selectedLeaveType = normalized.replace("LEAVE_TYPE:", "").trim();
		if (status !== "LEAVE" || !selectedLeaveType) return false;
		const leaveEntries = Array.isArray(row?.leaveEntries) ? row.leaveEntries : [];
		const rowLeaveTypes = [
			row?.leaveType,
			...leaveEntries.map((entry: any) => entry?.leaveType),
			...leaveEntries.map((entry: any) => entry?.label),
		]
			.filter(Boolean)
			.map((value: any) => String(value).trim().toUpperCase());
		return rowLeaveTypes.some((value: string) => value === selectedLeaveType);
	}
	return status === normalized || storedStatus === normalized;
}

function getShiftTypeKey(row: any): string {
	const schedule = row?.scheduleSnapshot || row?.schedule || {};
	if (schedule?.isOff) return "OFF";
	return String(
		schedule?.shiftTypeId ||
			schedule?.shiftTypeCode ||
			schedule?.code ||
			schedule?.shiftTypeName ||
			schedule?.scheduleTemplateName ||
			schedule?.templateCode ||
			schedule?.templateName ||
			"UNASSIGNED",
	).trim();
}

function getShiftTypeLabel(row: any): string {
	const schedule = row?.scheduleSnapshot || row?.schedule || {};
	if (schedule?.isOff) return "Off";
	return String(
		schedule?.shiftTypeName ||
			schedule?.name ||
			schedule?.shiftTypeCode ||
			schedule?.code ||
			schedule?.scheduleTemplateName ||
			schedule?.templateName ||
			"Unassigned",
	).trim();
}

function matchesShiftType(row: any, filter?: string) {
	if (!filter || filter === "all") return true;
	const normalized = String(filter).trim().toUpperCase();
	if (!normalized) return true;

	const schedule = row?.scheduleSnapshot || row?.schedule || {};
	const candidates = [
		schedule?.isOff ? "OFF" : null,
		schedule?.shiftTypeId,
		schedule?.shiftTypeCode,
		schedule?.code,
		schedule?.shiftTypeName,
		schedule?.name,
		schedule?.scheduleTemplateName,
		schedule?.templateCode,
		schedule?.templateName,
	]
		.filter(Boolean)
		.map((value: any) => String(value).trim().toUpperCase());

	return candidates.includes(normalized);
}

function normalizeScheduleSnapshotForAttendancePayload(snapshot: any) {
	if (!snapshot || typeof snapshot !== "object") return snapshot || null;
	const shiftTypeCode = snapshot.shiftTypeCode || snapshot.code || null;
	const shiftTypeName = snapshot.shiftTypeName || snapshot.name || null;
	const scheduleTemplateId = snapshot.scheduleTemplateId || snapshot.templateId || null;
	const scheduleTemplateCode =
		snapshot.scheduleTemplateCode || snapshot.templateCode || null;
	const scheduleTemplateName =
		snapshot.scheduleTemplateName || snapshot.templateName || null;

	return {
		...snapshot,
		shiftTypeCode,
		shiftTypeName,
		scheduleTemplateId,
		scheduleTemplateCode,
		scheduleTemplateName,
	};
}

function toExtendedJsonObjectId(id: string) {
	return { $oid: id };
}

function toExtendedJsonDate(value: Date) {
	return { $date: value.toISOString() };
}

function fromMongoExtendedJson<T = unknown>(value: any): T {
	if (Array.isArray(value)) {
		return value.map((entry) => fromMongoExtendedJson(entry)) as T;
	}

	if (value && typeof value === "object") {
		if (typeof value.$oid === "string") {
			return value.$oid as T;
		}

		if (typeof value.$date === "string") {
			return new Date(value.$date) as T;
		}

		if (
			value.$date &&
			typeof value.$date === "object" &&
			typeof value.$date.$numberLong === "string"
		) {
			return new Date(Number(value.$date.$numberLong)) as T;
		}

		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, fromMongoExtendedJson(entry)]),
		) as T;
	}

	return value as T;
}

function getUtcDateKey(value: unknown): string {
	const raw =
		value && typeof value === "object" && "$date" in (value as any)
			? (value as any).$date
			: value;
	const parsed = raw instanceof Date ? raw : new Date(String(raw || ""));
	if (Number.isNaN(parsed.getTime())) return "";
	return parsed.toISOString().slice(0, 10);
}

function readRawDate(value: any): Date | null {
	const raw = value && typeof value === "object" && "$date" in value ? value.$date : value;
	const parsed = raw instanceof Date ? raw : new Date(String(raw || ""));
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isNextBusinessDay(
	baseDateKey: string | null | undefined,
	timeIn: Date | null,
	timeOut: Date | null,
) {
	if (!timeOut) return false;
	const baseKey = timeIn ? getDateKeyInBusinessTimeZone(timeIn) : String(baseDateKey || "");
	const outKey = getDateKeyInBusinessTimeZone(timeOut);
	return Boolean(baseKey && outKey && outKey > baseKey);
}

function readRawId(value: any): string | null {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (typeof value === "object" && typeof value.$oid === "string") return value.$oid;
	return String(value);
}

function buildTrendDepartmentKey(departmentId: string | null, departmentName: string) {
	return [
		String(departmentId || "").trim() || "unassigned",
		String(departmentName || "Unassigned").trim() || "Unassigned",
	].join("::");
}

function getBusinessDateKeys(startDate: Date, endDate: Date): string[] {
	const keys: string[] = [];
	const cursor = new Date(startDate);
	cursor.setUTCHours(0, 0, 0, 0);
	const end = new Date(endDate);
	end.setUTCHours(0, 0, 0, 0);

	while (cursor.getTime() <= end.getTime()) {
		keys.push(getDateKeyInBusinessTimeZone(cursor));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return keys;
}

function buildMissingScheduleEmployeeWhere(params: {
	organizationId: string;
	startDate: Date;
	endDate: Date;
	search?: string;
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeId?: string;
}) {
	const searchQuery = normalizeSearch(params.search);
	const baseFilter = buildEmployeeFilter(params.organizationId, {
		departmentId: params.departmentId,
		sectionId: params.sectionId,
		positionId: params.positionId,
		levelId: params.levelId,
		reportToId: params.reportToId,
		employeeId: params.employeeId,
	});
	return {
		...baseFilter,
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
			{
				OR: [
					{ embeddedSchedule: { equals: Prisma.DbNull } },
					{ embeddedSchedule: { equals: Prisma.JsonNull } },
					{ embeddedSchedule: { equals: null as any } },
				],
			},
			...(searchQuery
				? [
						{
							OR: [
								{ employeeId: { contains: searchQuery, mode: "insensitive" } },
								{
									person: {
										personalInfo: {
											path: ["firstName"],
											string_contains: searchQuery,
											mode: "insensitive",
										},
									},
								},
								{
									person: {
										personalInfo: {
											path: ["lastName"],
											string_contains: searchQuery,
											mode: "insensitive",
										},
									},
								},
							],
						},
					]
				: []),
		],
	};
}

async function countEmployeesMissingSchedule(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		startDate: Date;
		endDate: Date;
		search?: string;
		departmentId?: string;
		sectionId?: string;
		positionId?: string;
		levelId?: string;
		reportToId?: string;
		employeeId?: string;
	},
) {
	return prisma.employee.count({ where: buildMissingScheduleEmployeeWhere(params) });
}

async function getMissingScheduleEmployeeFacet(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		startDate: Date;
		endDate: Date;
		limit: number;
		page: number;
		search?: string;
		departmentId?: string;
		sectionId?: string;
		positionId?: string;
		levelId?: string;
		reportToId?: string;
		employeeId?: string;
	},
) {
	const where = buildMissingScheduleEmployeeWhere(params);
	const skip = (params.page - 1) * params.limit;
	const [totalRecords, employees] = await prisma.$transaction([
		prisma.employee.count({ where }),
		prisma.employee.findMany({
			where,
			select: {
				id: true,
				employeeId: true,
				departmentId: true,
				workforceSource: true,
				agencyId: true,
				reportToId: true,
				person: {
					select: {
						personalInfo: true,
					},
				},
				department: {
					select: {
						name: true,
					},
				},
			},
			orderBy: [{ employeeId: "asc" }, { updatedAt: "desc" }],
			skip,
			take: params.limit,
		}),
	]);
	const businessDate = getDateKeyInBusinessTimeZone(params.startDate);
	const records = employees.map((employee: any) => {
		const personalInfo = employee.person?.personalInfo || {};
		const employeeName =
			[personalInfo.firstName, personalInfo.middleName, personalInfo.lastName]
				.filter(Boolean)
				.join(" ")
				.trim() || employee.employeeId;

		return {
			id: `missing-schedule:${employee.id}:${businessDate}`,
			employeeRefId: employee.id,
			employeeId: employee.employeeId,
			employeeName,
			departmentId: employee.departmentId,
			departmentName: employee.department?.name || "Unassigned",
			reportToId: employee.reportToId,
			workforceSource: employee.workforceSource || "DIRECT",
			agencyId: employee.agencyId,
			date: businessDate,
			timeIn: null,
			timeBreak: null,
			timeOut: null,
			timeOutNextDay: false,
			status: "MISSING_SCHEDULE",
			storedStatus: "MISSING_SCHEDULE",
			phase: "PLANNED",
			attendanceId: null,
			timesheetId: null,
			timesheetlineId: null,
			createdAt: null,
			updatedAt: null,
			behaviorFlags: ["MISSING_SCHEDULE"],
			scheduleSnapshot: {
				shiftTypeCode: "UNASSIGNED",
				shiftTypeName: "Unassigned",
				scheduleTemplateCode: null,
				scheduleTemplateName: null,
			},
			hoursWorked: "0:00",
			regularHours: "0:00",
			overtimeHours: "0:00",
			undertimeHours: "0:00",
			lateHours: "0:00",
			earlyOutHours: "0:00",
			breakMinutes: 0,
			primaryMarker: "HOURS",
			isVirtual: true,
			isManualEntry: false,
			notes: "Employee has no assigned schedule for the selected range.",
		};
	});

	return { totalRecords, records };
}

function postgresTimeStringToMinutesExpression(columnSql: Prisma.Sql) {
	return Prisma.sql`
		CASE
			WHEN COALESCE(${columnSql}, '') ~ '^\\d+:\\d{1,2}$' THEN
				COALESCE(NULLIF(split_part(${columnSql}, ':', 1), '')::int, 0) * 60 +
				COALESCE(NULLIF(split_part(${columnSql}, ':', 2), '')::int, 0)
			WHEN COALESCE(${columnSql}, '') ~ '^\\d+h\\s*\\d+m$' THEN
				COALESCE(NULLIF(regexp_replace(${columnSql}, '^\\s*(\\d+)h.*$', '\\1'), '')::int, 0) * 60 +
				COALESCE(NULLIF(regexp_replace(${columnSql}, '^.*h\\s*(\\d+)m\\s*$', '\\1'), '')::int, 0)
			ELSE 0
		END
	`;
}

function buildPostgresStatusCondition(status?: string) {
	if (!status) return null;
	const normalized = String(status).trim().toUpperCase();
	if (!normalized) return null;

	if (normalized.startsWith("LEAVE_TYPE:")) {
		const leaveType = normalized.replace("LEAVE_TYPE:", "").trim();
		if (!leaveType) return null;
		return Prisma.sql`f."_displayStatus" = 'LEAVE' AND f."_metadataLeaveType" = ${leaveType}`;
	}

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

	return Prisma.sql`(f."_displayStatus" = ${normalized} OR f."_storedStatus" = ${normalized})`;
}

function buildPostgresShiftKeyExpression(alias: string) {
	const prefix = Prisma.raw(alias);
	return Prisma.sql`
		CASE
			WHEN ${prefix}."scheduleSnapshot"->>'isOff' = 'true' THEN 'OFF'
			ELSE COALESCE(
				NULLIF(${prefix}."scheduleSnapshot"->>'shiftTypeId', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'shiftTypeCode', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'code', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'shiftTypeName', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'scheduleTemplateName', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'templateCode', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'templateName', ''),
				'UNASSIGNED'
			)
		END
	`;
}

function buildPostgresShiftLabelExpression(alias: string) {
	const prefix = Prisma.raw(alias);
	return Prisma.sql`
		CASE
			WHEN ${prefix}."scheduleSnapshot"->>'isOff' = 'true' THEN 'Off'
			ELSE COALESCE(
				NULLIF(${prefix}."scheduleSnapshot"->>'shiftTypeName', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'name', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'shiftTypeCode', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'code', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'scheduleTemplateName', ''),
				NULLIF(${prefix}."scheduleSnapshot"->>'templateName', ''),
				'Unassigned'
			)
		END
	`;
}

function buildPostgresObligationFilterSql(params: {
	organizationId: string;
	startDate: Date;
	endDate: Date;
	search?: string;
	status?: string;
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeId?: string;
	employeeIds?: string[] | null;
	shiftType?: string;
}) {
	const conditions: Prisma.Sql[] = [
		Prisma.sql`ao."organizationId" = ${params.organizationId}`,
		Prisma.sql`ao."isDeleted" = false`,
		Prisma.sql`ao."date" >= ${params.startDate}`,
		Prisma.sql`ao."date" <= ${params.endDate}`,
		Prisma.sql`pp."organizationId" = ${params.organizationId}`,
		Prisma.sql`pp."isDeleted" = false`,
		Prisma.sql`COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD')) >= to_char(pp."startDate", 'YYYY-MM-DD')`,
		Prisma.sql`COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD')) <= to_char(pp."endDate", 'YYYY-MM-DD')`,
	];

	if (params.employeeIds?.length) {
		conditions.push(
			Prisma.sql`ao."employeeId" IN (${Prisma.join(params.employeeIds.map((id) => Prisma.sql`${id}`))})`,
		);
	}

	return Prisma.sql`${Prisma.join(conditions, " AND ")}`;
}

async function getPostgresObligationFacet(params: {
	prisma: PrismaClient;
	organizationId: string;
	startDate: Date;
	endDate: Date;
	limit: number;
	page: number;
	search?: string;
	status?: string;
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeId?: string;
	employeeIds?: string[] | null;
	shiftType?: string;
}) {
	const todayKey = getDateKeyInBusinessTimeZone(new Date());
	const skip = (params.page - 1) * params.limit;
	const whereSql = buildPostgresObligationFilterSql(params);
	const statusCondition = buildPostgresStatusCondition(params.status);
	const shiftType = String(params.shiftType || "").trim().toUpperCase();
	const postFilterConditions = [
		statusCondition,
		shiftType ? Prisma.sql`f."_shiftTypeKeyUpper" = ${shiftType}` : null,
	].filter(Boolean) as Prisma.Sql[];
	const postFilterSql =
		postFilterConditions.length > 0
			? Prisma.sql`WHERE ${Prisma.join(postFilterConditions, " AND ")}`
			: Prisma.empty;
	const shiftKeySql = buildPostgresShiftKeyExpression("d");
	const shiftLabelSql = buildPostgresShiftLabelExpression("d");

	const result = await params.prisma.$queryRaw<any[]>(Prisma.sql`
		WITH ranked AS (
			SELECT
				ao.*,
				COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD')) AS "_obligationDateKey",
				row_number() OVER (
					PARTITION BY ao."employeeId", COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD'))
					ORDER BY ao."date" DESC, pp."startDate" DESC, ao."updatedAt" DESC, ao."createdAt" DESC, ao."employeeNameSnapshot" ASC
				) AS "_rank"
			FROM "attendance_obligations" ao
			INNER JOIN "payroll_periods" pp ON pp."id" = ao."payrollPeriodId"
			WHERE ${whereSql}
		),
		deduped AS (
			SELECT * FROM ranked WHERE "_rank" = 1
		),
		enriched AS (
			SELECT
				d.*,
				UPPER(COALESCE(d."status", 'EXPECTED')) AS "_storedStatus",
				CASE
					WHEN UPPER(COALESCE(d."status", 'EXPECTED')) <> 'EXPECTED' THEN UPPER(COALESCE(d."status", 'EXPECTED'))
					WHEN d."_obligationDateKey" < ${todayKey} THEN 'ABSENT'
					WHEN d."_obligationDateKey" > ${todayKey} THEN 'SCHEDULED'
					ELSE 'NOT_CLOCKED_IN'
				END AS "_displayStatus",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."lateHours"`)} AS "_lateMinutes",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."earlyOutHours"`)} AS "_earlyOutMinutes",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."overtimeHours"`)} AS "_overtimeMinutes",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."hoursWorked"`)} AS "_hoursWorkedMinutes",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."undertimeHours"`)} AS "_undertimeMinutes",
				${shiftKeySql} AS "_shiftTypeKey",
				${shiftLabelSql} AS "_shiftTypeLabel",
				UPPER(COALESCE(d."metadata"->>'leaveType', 'LEAVE')) AS "_metadataLeaveType"
			FROM deduped d
		),
		filtered AS (
			SELECT
				e.*,
				UPPER(e."_shiftTypeKey") AS "_shiftTypeKeyUpper",
				(COALESCE(e."behaviorFlags", ARRAY[]::text[]) @> ARRAY['TARDINESS']::text[] OR e."_lateMinutes" > 0) AS "_isLate",
				(e."_earlyOutMinutes" > 0) AS "_isEarlyOut",
				(e."_overtimeMinutes" > 0) AS "_isOvertime",
				(e."_displayStatus" IN ('PRESENT', 'INCOMPLETE')) AS "_isClockedIn",
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
			ORDER BY "date" DESC, "updatedAt" DESC, "createdAt" DESC, "employeeNameSnapshot" ASC
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
				COUNT(*) FILTER (WHERE "_displayStatus" = 'ABSENT')::int AS "absent",
				COUNT(*) FILTER (WHERE "_displayStatus" = 'LEAVE')::int AS "leave",
				COUNT(*) FILTER (WHERE "_displayStatus" IN ('NOT_CLOCKED_IN', 'INCOMPLETE'))::int AS "missing",
				(COALESCE(SUM("_overtimeMinutes"), 0)::float / 60.0) AS "overtimeHours"
			FROM final_filtered
			GROUP BY "departmentIdSnapshot", "departmentNameSnapshot"
			ORDER BY COALESCE("departmentNameSnapshot", 'Unassigned') ASC
		),
		shift_type_breakdown AS (
			SELECT
				"_shiftTypeKey" AS "_id",
				MIN("_shiftTypeLabel") AS "label",
				COUNT(*)::int AS "total"
			FROM final_filtered
			GROUP BY "_shiftTypeKey"
			ORDER BY COUNT(*) DESC, MIN("_shiftTypeLabel") ASC
		),
		leave_type_breakdown AS (
			SELECT
				"_metadataLeaveType" AS "_id",
				COUNT(*)::int AS "total"
			FROM final_filtered
			WHERE "_displayStatus" = 'LEAVE'
			GROUP BY "_metadataLeaveType"
			ORDER BY COUNT(*) DESC, "_metadataLeaveType" ASC
		),
		metrics AS (
			SELECT
				COUNT(*) FILTER (WHERE "_isClockedIn")::int AS "totalPresent",
				COUNT(*) FILTER (WHERE "_displayStatus" = 'ABSENT')::int AS "totalAbsent",
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
			json_build_array(json_build_object('total', (SELECT COUNT(DISTINCT "_obligationDateKey")::int FROM final_filtered))) AS "calendarDays",
			COALESCE((SELECT json_agg(row_to_json(metrics)) FROM metrics), '[]'::json) AS "metrics",
			COALESCE((SELECT json_agg(row_to_json(shift_type_breakdown)) FROM shift_type_breakdown), '[]'::json) AS "shiftTypeBreakdown",
			COALESCE((SELECT json_agg(row_to_json(department_breakdown)) FROM department_breakdown), '[]'::json) AS "departmentBreakdown",
			COALESCE((SELECT json_agg(row_to_json(department_preview)) FROM department_preview), '[]'::json) AS "departmentPreviewRecords",
			COALESCE((SELECT json_agg(row_to_json(leave_type_breakdown)) FROM leave_type_breakdown), '[]'::json) AS "leaveTypeBreakdown"
	`);

	return result?.[0] || {};
}

async function getPostgresObligationTrendFacet(params: {
	prisma: PrismaClient;
	organizationId: string;
	startDate: Date;
	endDate: Date;
	search?: string;
	status?: string;
	departmentId?: string;
	reportToId?: string;
	employeeId?: string;
	shiftType?: string;
}) {
	const todayKey = getDateKeyInBusinessTimeZone(new Date());
	const whereSql = buildPostgresObligationFilterSql(params);
	const statusCondition = buildPostgresStatusCondition(params.status);
	const shiftType = String(params.shiftType || "").trim().toUpperCase();
	// Rest-day/off-day obligations exist for every scheduled employee whether or not
	// they were expected to work, so counting them here flattens the trend into a
	// constant headcount. Exclude them by default; an explicit status filter (e.g.
	// WORKED_REST_DAY) opts back in since the caller is asking for those rows specifically.
	const excludeOffDaysByDefault = !params.status ? Prisma.sql`f."_isOffDay" = false` : null;
	const postFilterConditions = [
		statusCondition,
		excludeOffDaysByDefault,
		shiftType ? Prisma.sql`f."_shiftTypeKeyUpper" = ${shiftType}` : null,
	].filter(Boolean) as Prisma.Sql[];
	const postFilterSql =
		postFilterConditions.length > 0
			? Prisma.sql`WHERE ${Prisma.join(postFilterConditions, " AND ")}`
			: Prisma.empty;
	const shiftKeySql = buildPostgresShiftKeyExpression("d");
	const shiftLabelSql = buildPostgresShiftLabelExpression("d");

	const result = await params.prisma.$queryRaw<any[]>(Prisma.sql`
		WITH ranked AS (
			SELECT
				ao.*,
				COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD')) AS "_obligationDateKey",
				row_number() OVER (
					PARTITION BY ao."employeeId", COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD'))
					ORDER BY ao."date" DESC, pp."startDate" DESC, ao."updatedAt" DESC, ao."createdAt" DESC, ao."employeeNameSnapshot" ASC
				) AS "_rank"
			FROM "attendance_obligations" ao
			INNER JOIN "payroll_periods" pp ON pp."id" = ao."payrollPeriodId"
			WHERE ${whereSql}
		),
		deduped AS (
			SELECT * FROM ranked WHERE "_rank" = 1
		),
		enriched AS (
			SELECT
				d.*,
				UPPER(COALESCE(d."status", 'EXPECTED')) AS "_storedStatus",
				CASE
					WHEN UPPER(COALESCE(d."status", 'EXPECTED')) <> 'EXPECTED' THEN UPPER(COALESCE(d."status", 'EXPECTED'))
					WHEN d."_obligationDateKey" < ${todayKey} THEN 'ABSENT'
					WHEN d."_obligationDateKey" > ${todayKey} THEN 'SCHEDULED'
					ELSE 'NOT_CLOCKED_IN'
				END AS "_displayStatus",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."lateHours"`)} AS "_lateMinutes",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."earlyOutHours"`)} AS "_earlyOutMinutes",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."overtimeHours"`)} AS "_overtimeMinutes",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."hoursWorked"`)} AS "_hoursWorkedMinutes",
				${postgresTimeStringToMinutesExpression(Prisma.sql`d."undertimeHours"`)} AS "_undertimeMinutes",
				${shiftKeySql} AS "_shiftTypeKey",
				${shiftLabelSql} AS "_shiftTypeLabel",
				UPPER(COALESCE(d."metadata"->>'leaveType', 'LEAVE')) AS "_metadataLeaveType"
			FROM deduped d
		),
		filtered AS (
			SELECT
				e.*,
				UPPER(e."_shiftTypeKey") AS "_shiftTypeKeyUpper",
				(COALESCE(e."behaviorFlags", ARRAY[]::text[]) @> ARRAY['TARDINESS']::text[] OR e."_lateMinutes" > 0) AS "_isLate",
				(e."_earlyOutMinutes" > 0) AS "_isEarlyOut",
				(e."_overtimeMinutes" > 0) AS "_isOvertime",
				(e."_displayStatus" IN ('PRESENT', 'INCOMPLETE')) AS "_isClockedIn",
				(e."timeOut" IS NOT NULL) AS "_isClockedOut",
				(UPPER(e."_shiftTypeKey") = 'OFF') AS "_isOffDay",
				(
					e."_displayStatus" = 'HOLIDAY' OR
					(
						jsonb_typeof(e."metadata"->'holidayEntries') = 'array' AND
						jsonb_array_length(e."metadata"->'holidayEntries') > 0
					)
				) AS "_isHoliday"
			FROM enriched e
		),
		final_filtered AS (
			SELECT * FROM filtered f
			${postFilterSql}
		),
		daily_department_breakdown AS (
			SELECT
				"_obligationDateKey" AS "businessDate",
				"departmentIdSnapshot" AS "departmentId",
				COALESCE("departmentNameSnapshot", 'Unassigned') AS "departmentName",
				COUNT(*)::int AS "total"
			FROM final_filtered
			GROUP BY "_obligationDateKey", "departmentIdSnapshot", "departmentNameSnapshot"
		),
		department_totals AS (
			SELECT
				"departmentIdSnapshot" AS "departmentId",
				COALESCE("departmentNameSnapshot", 'Unassigned') AS "departmentName",
				COUNT(*)::int AS "total"
			FROM final_filtered
			GROUP BY "departmentIdSnapshot", "departmentNameSnapshot"
		),
		day_totals AS (
			SELECT
				"_obligationDateKey" AS "businessDate",
				COUNT(*)::int AS "total"
			FROM final_filtered
			GROUP BY "_obligationDateKey"
		)
		SELECT
			COALESCE(
				(
					SELECT json_agg(row_to_json(daily_department_breakdown) ORDER BY "businessDate" ASC, "departmentName" ASC)
					FROM daily_department_breakdown
				),
				'[]'::json
			) AS "dailyDepartmentBreakdown",
			COALESCE(
				(
					SELECT json_agg(row_to_json(department_totals) ORDER BY "total" DESC, "departmentName" ASC)
					FROM department_totals
				),
				'[]'::json
			) AS "departmentTotals",
			COALESCE(
				(
					SELECT json_agg(row_to_json(day_totals) ORDER BY "businessDate" ASC)
					FROM day_totals
				),
				'[]'::json
			) AS "dayTotals",
			json_build_array(json_build_object('total', (SELECT COUNT(*)::int FROM final_filtered))) AS "totalRecords"
	`);

	return result?.[0] || {};
}

async function countCompanyEventDays(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
) {
	const events = await prisma.calendarItem.findMany({
		where: {
			organizationId,
			type: "COMPANY_EVENT",
			status: "ACTIVE",
			startDate: { lte: endDate },
			endDate: { gte: startDate },
		},
		select: {
			startDate: true,
			endDate: true,
		},
	});

	const rangeKeys = new Set(getBusinessDateKeys(startDate, endDate));
	const eventKeys = new Set<string>();
	for (const event of events) {
		const cursor = new Date(Math.max(startDate.getTime(), event.startDate.getTime()));
		cursor.setUTCHours(0, 0, 0, 0);
		const eventEnd = new Date(Math.min(endDate.getTime(), event.endDate.getTime()));
		eventEnd.setUTCHours(0, 0, 0, 0);

		while (cursor.getTime() <= eventEnd.getTime()) {
			const key = getDateKeyInBusinessTimeZone(cursor);
			if (rangeKeys.has(key)) eventKeys.add(key);
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
	}

	return eventKeys.size;
}

async function countHolidayDays(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
) {
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

	const rangeKeys = new Set(getBusinessDateKeys(startDate, endDate));
	const holidayKeys = new Set<string>();
	for (const holiday of holidays) {
		const cursor = new Date(Math.max(startDate.getTime(), holiday.startDate.getTime()));
		cursor.setUTCHours(0, 0, 0, 0);
		const holidayEnd = new Date(Math.min(endDate.getTime(), holiday.endDate.getTime()));
		holidayEnd.setUTCHours(0, 0, 0, 0);

		while (cursor.getTime() <= holidayEnd.getTime()) {
			const key = getDateKeyInBusinessTimeZone(cursor);
			if (rangeKeys.has(key)) holidayKeys.add(key);
			cursor.setUTCDate(cursor.getUTCDate() + 1);
		}
	}

	return holidayKeys.size;
}

async function countApprovedOvertimeDays(
	prisma: PrismaClient,
	params: {
		organizationId: string;
		startDate: Date;
		endDate: Date;
		employeeIds?: string[] | null;
		shiftType?: string;
	},
) {
	if (params.employeeIds && params.employeeIds.length === 0) {
		return 0;
	}
	const shiftType = String(params.shiftType || "")
		.trim()
		.toUpperCase();
	const conditions: Prisma.Sql[] = [
		Prisma.sql`tl."organizationId" = ${params.organizationId}`,
		Prisma.sql`tl."isDeleted" = false`,
		Prisma.sql`tl."isEffective" = true`,
		Prisma.sql`tl."date" >= ${params.startDate}`,
		Prisma.sql`tl."date" <= ${params.endDate}`,
		Prisma.sql`t."status" = 'APPROVED'`,
		Prisma.sql`t."isDeleted" = false`,
		Prisma.sql`${postgresTimeStringToMinutesExpression(Prisma.sql`tl."overtimeHours"`)} > 0`,
	];
	if (params.employeeIds?.length) {
		conditions.push(
			Prisma.sql`tl."employeeId" IN (${Prisma.join(params.employeeIds.map((id) => Prisma.sql`${id}`))})`,
		);
	}
	if (shiftType) {
		const shiftKeySql = buildPostgresShiftKeyExpression("tl");
		conditions.push(Prisma.sql`UPPER(${shiftKeySql}) = ${shiftType}`);
	}

	const rows = await prisma.$queryRaw<Array<{ total?: number }>>(Prisma.sql`
		SELECT COUNT(*)::int AS total
		FROM "timesheet_lines" tl
		INNER JOIN "timesheets" t ON t."id" = tl."timesheetId"
		WHERE ${Prisma.join(conditions, " AND ")}
	`);
	return Number(rows?.[0]?.total || 0);
}

function buildRawMatch(params: {
	organizationId: string;
	startDate: Date;
	endDate: Date;
	employeeId?: string;
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeIds?: string[] | null;
}) {
	return {
		organizationId: params.organizationId,
		isDeleted: false,
		date: {
			$gte: toExtendedJsonDate(params.startDate),
			$lte: toExtendedJsonDate(params.endDate),
		},
		...(params.employeeIds?.length
			? { employeeId: { $in: params.employeeIds.map((id) => toExtendedJsonObjectId(id)) } }
			: params.employeeId
				? { employeeId: toExtendedJsonObjectId(params.employeeId) }
				: {}),
	};
}

function mongoTimeStringToMinutesExpression(field: string) {
	return {
		$let: {
			vars: {
				parts: { $split: [{ $ifNull: [field, "0:00"] }, ":"] },
			},
			in: {
				$add: [
					{
						$multiply: [
							{
								$convert: {
									input: { $arrayElemAt: ["$$parts", 0] },
									to: "int",
									onError: 0,
									onNull: 0,
								},
							},
							60,
						],
					},
					{
						$convert: {
							input: { $arrayElemAt: ["$$parts", 1] },
							to: "int",
							onError: 0,
							onNull: 0,
						},
					},
				],
			},
		},
	};
}

function buildStatusMatch(status?: string) {
	if (!status) return null;
	const normalized = String(status).trim().toUpperCase();
	if (!normalized) return null;
	if (normalized.startsWith("LEAVE_TYPE:")) {
		const leaveType = normalized.replace("LEAVE_TYPE:", "").trim();
		if (!leaveType) return null;
		return {
			_displayStatus: "LEAVE",
			_metadataLeaveType: leaveType,
		};
	}
	if (normalized === "ON_TIME") return { _isClockedIn: true, _isLate: false };
	if (normalized === "LATE") return { _isLate: true };
	if (normalized === "EARLY_OUT") return { _isEarlyOut: true };
	if (normalized === "OVERTIME") return { _isOvertime: true };
	if (normalized === "CLOCKED_IN") return { _isClockedIn: true };
	if (normalized === "CLOCKED_OUT") return { _isClockedOut: true };
	if (normalized === "MISSING_CLOCK_IN")
		return { _displayStatus: { $in: ["ABSENT", "NOT_CLOCKED_IN"] } };
	if (normalized === "MISSING_SCHEDULE") return { _shiftTypeKeyUpper: "UNASSIGNED" };
	if (normalized === "WORKED_REST_DAY") return { _isClockedIn: true, _isOffDay: true };
	if (normalized === "WORKED_HOLIDAY") return { _isClockedIn: true, _isHoliday: true };
	return {
		$or: [{ _displayStatus: normalized }, { _storedStatus: normalized }],
	};
}

function buildObligationAggregationPipeline(params: {
	organizationId: string;
	startDate: Date;
	endDate: Date;
	limit: number;
	page: number;
	search?: string;
	status?: string;
	departmentId?: string;
	sectionId?: string;
	positionId?: string;
	levelId?: string;
	reportToId?: string;
	employeeId?: string;
	employeeIds?: string[] | null;
	shiftType?: string;
}) {
	const todayKey = getDateKeyInBusinessTimeZone(new Date());
	const searchQuery = normalizeSearch(params.search);
	const shiftType = String(params.shiftType || "")
		.trim()
		.toUpperCase();
	const skip = (params.page - 1) * params.limit;
	const statusMatch = buildStatusMatch(params.status);

	const pipeline: any[] = [
		{
			$match: buildRawMatch({
				organizationId: params.organizationId,
				startDate: params.startDate,
				endDate: params.endDate,
				employeeId: params.employeeId,
				departmentId: params.departmentId,
				sectionId: params.sectionId,
				positionId: params.positionId,
				levelId: params.levelId,
				reportToId: params.reportToId,
				employeeIds: params.employeeIds,
			}),
		},
		{
			$lookup: {
				from: "payroll_periods",
				localField: "payrollPeriodId",
				foreignField: "_id",
				as: "payrollPeriod",
			},
		},
		{ $unwind: "$payrollPeriod" },
		{
			$match: {
				"payrollPeriod.organizationId": params.organizationId,
				"payrollPeriod.isDeleted": false,
			},
		},
		{
			$addFields: {
				_obligationDateKey: {
					$ifNull: [
						"$businessDate",
						{
							$dateToString: {
								format: "%Y-%m-%d",
								date: "$date",
								timezone: "UTC",
							},
						},
					],
				},
				_periodStartKey: {
					$dateToString: {
						format: "%Y-%m-%d",
						date: "$payrollPeriod.startDate",
						timezone: "UTC",
					},
				},
				_periodEndKey: {
					$dateToString: {
						format: "%Y-%m-%d",
						date: "$payrollPeriod.endDate",
						timezone: "UTC",
					},
				},
			},
		},
		{
			$match: {
				$expr: {
					$and: [
						{ $gte: ["$_obligationDateKey", "$_periodStartKey"] },
						{ $lte: ["$_obligationDateKey", "$_periodEndKey"] },
					],
				},
			},
		},
		{
			$sort: {
				date: -1,
				"payrollPeriod.startDate": -1,
				updatedAt: -1,
				createdAt: -1,
				employeeNameSnapshot: 1,
			},
		},
		{
			$group: {
				_id: {
					employeeId: "$employeeId",
					businessDate: "$_obligationDateKey",
				},
				row: { $first: "$$ROOT" },
			},
		},
		{ $replaceRoot: { newRoot: "$row" } },
		{
			$addFields: {
				_storedStatus: { $toUpper: { $ifNull: ["$status", "EXPECTED"] } },
			},
		},
		{
			$addFields: {
				_displayStatus: {
					$cond: [
						{ $ne: ["$_storedStatus", "EXPECTED"] },
						"$_storedStatus",
						{
							$switch: {
								branches: [
									{
										case: { $lt: ["$_obligationDateKey", todayKey] },
										then: "ABSENT",
									},
									{
										case: { $gt: ["$_obligationDateKey", todayKey] },
										then: "SCHEDULED",
									},
								],
								default: "NOT_CLOCKED_IN",
							},
						},
					],
				},
				_lateMinutes: mongoTimeStringToMinutesExpression("$lateHours"),
				_earlyOutMinutes: mongoTimeStringToMinutesExpression("$earlyOutHours"),
				_overtimeMinutes: mongoTimeStringToMinutesExpression("$overtimeHours"),
				_hoursWorkedMinutes: mongoTimeStringToMinutesExpression("$hoursWorked"),
				_undertimeMinutes: mongoTimeStringToMinutesExpression("$undertimeHours"),
				_shiftTypeKey: {
					$toString: {
						$cond: [
							{ $eq: ["$scheduleSnapshot.isOff", true] },
							"OFF",
							{
								$ifNull: [
									"$scheduleSnapshot.shiftTypeId",
									{
										$ifNull: [
											"$scheduleSnapshot.shiftTypeCode",
											{
												$ifNull: [
													"$scheduleSnapshot.shiftTypeName",
													{
														$ifNull: [
															"$scheduleSnapshot.scheduleTemplateName",
															"UNASSIGNED",
														],
													},
												],
											},
										],
									},
								],
							},
						],
					},
				},
				_shiftTypeLabel: {
					$toString: {
						$cond: [
							{ $eq: ["$scheduleSnapshot.isOff", true] },
							"Off",
							{
								$ifNull: [
									"$scheduleSnapshot.shiftTypeName",
									{
										$ifNull: [
											"$scheduleSnapshot.shiftTypeCode",
											{
												$ifNull: [
													"$scheduleSnapshot.scheduleTemplateName",
													"Unassigned",
												],
											},
										],
									},
								],
							},
						],
					},
				},
				_metadataLeaveType: {
					$toUpper: {
						$toString: {
							$ifNull: ["$metadata.leaveType", "LEAVE"],
						},
					},
				},
			},
		},
		{
			$addFields: {
				_shiftTypeKeyUpper: { $toUpper: "$_shiftTypeKey" },
				_isLate: {
					$or: [
						{ $in: ["TARDINESS", { $ifNull: ["$behaviorFlags", []] }] },
						{ $gt: ["$_lateMinutes", 0] },
					],
				},
				_isEarlyOut: { $gt: ["$_earlyOutMinutes", 0] },
				_isOvertime: { $gt: ["$_overtimeMinutes", 0] },
				_isClockedIn: { $in: ["$_displayStatus", ["PRESENT", "INCOMPLETE"]] },
				_isClockedOut: { $ne: [{ $ifNull: ["$timeOut", null] }, null] },
				_isOffDay: { $eq: ["$_shiftTypeKeyUpper", "OFF"] },
				_isHoliday: {
					$or: [
						{ $eq: ["$_displayStatus", "HOLIDAY"] },
						{
							$gt: [
								{
									$size: {
										$cond: [
											{ $isArray: "$metadata.holidayEntries" },
											"$metadata.holidayEntries",
											[],
										],
									},
								},
								0,
							],
						},
					],
				},
			},
		},
		{
			$addFields: {
				_isObligatedWorkDay: {
					$and: [
						{
							$in: [
								"$_displayStatus",
								[
									"NOT_CLOCKED_IN",
									"ABSENT",
									"SCHEDULED",
									"PRESENT",
									"INCOMPLETE",
									"LATE",
									"HALF_DAY",
								],
							],
						},
						{
							$not: {
								$and: ["$_isClockedIn", "$_isOffDay"],
							},
						},
					],
				},
			},
		},
	];

	if (searchQuery) {
		pipeline.push({
			$match: {
				$or: [
					{ employeeCodeSnapshot: { $regex: searchQuery, $options: "i" } },
					{ employeeNameSnapshot: { $regex: searchQuery, $options: "i" } },
				],
			},
		});
	}
	if (statusMatch) pipeline.push({ $match: statusMatch });
	if (shiftType) pipeline.push({ $match: { _shiftTypeKeyUpper: shiftType } });

	pipeline.push({
		$facet: {
			records: [
				{
					$sort: {
						date: -1,
						updatedAt: -1,
						createdAt: -1,
						employeeNameSnapshot: 1,
					},
				},
				{ $skip: skip },
				{ $limit: params.limit },
			],
			departmentPreviewRecords: [
				{
					$sort: {
						date: -1,
						updatedAt: -1,
						createdAt: -1,
						employeeNameSnapshot: 1,
					},
				},
				{
					$setWindowFields: {
						partitionBy: {
							departmentId: "$departmentIdSnapshot",
							departmentName: "$departmentNameSnapshot",
						},
						sortBy: {
							date: -1,
						},
						output: {
							_departmentPreviewRank: { $documentNumber: {} },
						},
					},
				},
				{ $match: { _departmentPreviewRank: { $lte: 5 } } },
				{
					$group: {
						_id: {
							departmentId: "$departmentIdSnapshot",
							departmentName: "$departmentNameSnapshot",
						},
						rows: { $push: "$$ROOT" },
					},
				},
				{
					$project: {
						_id: 0,
						departmentId: "$_id.departmentId",
						departmentName: { $ifNull: ["$_id.departmentName", "Unassigned"] },
						rows: 1,
					},
				},
				{ $sort: { departmentName: 1 } },
			],
			totalRecords: [{ $count: "total" }],
			calendarDays: [{ $group: { _id: "$_obligationDateKey" } }, { $count: "total" }],
			metrics: [
				{
					$group: {
						_id: null,
						totalPresent: { $sum: { $cond: ["$_isClockedIn", 1, 0] } },
						totalAbsent: {
							$sum: { $cond: [{ $eq: ["$_displayStatus", "ABSENT"] }, 1, 0] },
						},
						totalNotClockedIn: {
							$sum: { $cond: [{ $eq: ["$_displayStatus", "NOT_CLOCKED_IN"] }, 1, 0] },
						},
						totalLate: { $sum: { $cond: ["$_isLate", 1, 0] } },
						totalOnLeave: {
							$sum: { $cond: [{ $eq: ["$_displayStatus", "LEAVE"] }, 1, 0] },
						},
						totalRestDay: {
							$sum: { $cond: [{ $eq: ["$_displayStatus", "REST_DAY"] }, 1, 0] },
						},
						totalHoliday: { $sum: { $cond: ["$_isHoliday", 1, 0] } },
						totalWorkedOnRestDay: {
							$sum: {
								$cond: [{ $and: ["$_isClockedIn", "$_isOffDay"] }, 1, 0],
							},
						},
						totalWorkedOnHoliday: {
							$sum: {
								$cond: [{ $and: ["$_isClockedIn", "$_isHoliday"] }, 1, 0],
							},
						},
						totalClockedIn: { $sum: { $cond: ["$_isClockedIn", 1, 0] } },
						totalClockedInObligated: {
							$sum: {
								$cond: [
									{ $and: ["$_isClockedIn", "$_isObligatedWorkDay"] },
									1,
									0,
								],
							},
						},
						totalClockedOut: { $sum: { $cond: ["$_isClockedOut", 1, 0] } },
						totalOnTime: {
							$sum: {
								$cond: [{ $and: ["$_isClockedIn", { $not: ["$_isLate"] }] }, 1, 0],
							},
						},
						totalScheduledWorkDays: {
							$sum: { $cond: ["$_isObligatedWorkDay", 1, 0] },
						},
						totalObligatedToWork: {
							$sum: { $cond: ["$_isObligatedWorkDay", 1, 0] },
						},
						totalEarlyOut: { $sum: { $cond: ["$_isEarlyOut", 1, 0] } },
						totalOvertime: { $sum: { $cond: ["$_isOvertime", 1, 0] } },
						totalMinutesWorked: { $sum: "$_hoursWorkedMinutes" },
						totalOvertimeMinutes: { $sum: "$_overtimeMinutes" },
						totalUndertimeMinutes: { $sum: "$_undertimeMinutes" },
						totalLateMinutes: { $sum: "$_lateMinutes" },
					},
				},
			],
			shiftTypeBreakdown: [
				{
					$group: {
						_id: "$_shiftTypeKey",
						label: { $first: "$_shiftTypeLabel" },
						total: { $sum: 1 },
					},
				},
				{ $sort: { total: -1, label: 1 } },
			],
			departmentBreakdown: [
				{
					$group: {
						_id: {
							id: "$departmentIdSnapshot",
							name: "$departmentNameSnapshot",
						},
						totalRecords: { $sum: 1 },
						employees: { $addToSet: "$employeeId" },
						scheduled: {
							$sum: {
								$cond: [
									{
										$not: [
											{
												$in: [
													"$_displayStatus",
													[
														"REST_DAY",
														"HOLIDAY",
														"CANCELLED",
														"SCHEDULED",
													],
												],
											},
										],
									},
									1,
									0,
								],
							},
						},
						present: { $sum: { $cond: ["$_isClockedIn", 1, 0] } },
						late: { $sum: { $cond: ["$_isLate", 1, 0] } },
						absent: { $sum: { $cond: [{ $eq: ["$_displayStatus", "ABSENT"] }, 1, 0] } },
						leave: { $sum: { $cond: [{ $eq: ["$_displayStatus", "LEAVE"] }, 1, 0] } },
						missing: {
							$sum: {
								$cond: [
									{ $in: ["$_displayStatus", ["NOT_CLOCKED_IN", "INCOMPLETE"]] },
									1,
									0,
								],
							},
						},
						overtimeMinutes: { $sum: "$_overtimeMinutes" },
					},
				},
				{
					$project: {
						_id: 0,
						departmentId: "$_id.id",
						departmentName: { $ifNull: ["$_id.name", "Unassigned"] },
						totalRecords: 1,
						employeeCount: { $size: "$employees" },
						scheduled: 1,
						present: 1,
						late: 1,
						absent: 1,
						leave: 1,
						missing: 1,
						overtimeHours: { $divide: ["$overtimeMinutes", 60] },
					},
				},
				{ $sort: { departmentName: 1 } },
			],
			leaveTypeBreakdown: [
				{ $match: { _displayStatus: "LEAVE" } },
				{
					$group: {
						_id: {
							$toUpper: {
								$toString: {
									$ifNull: ["$metadata.leaveType", "LEAVE"],
								},
							},
						},
						total: { $sum: 1 },
					},
				},
				{ $sort: { total: -1, _id: 1 } },
			],
		},
	});

	return pipeline;
}

export async function calculateAttendanceObligationDetailed(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	limit = 100,
	page = 1,
	search?: string,
	status?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
) {
	const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
	const safePage = Math.max(Number(page) || 1, 1);
	const employeeIds = await resolveObligationEmployeeIds(prisma, {
		organizationId,
		search,
		departmentId,
		sectionId,
		positionId,
		levelId,
		reportToId,
		employeeId,
	});
	if (String(status || "").trim().toUpperCase() === "MISSING_SCHEDULE") {
		const missingScheduleFacet = await getMissingScheduleEmployeeFacet(prisma, {
			organizationId,
			startDate,
			endDate,
			limit: safeLimit,
			page: safePage,
			search,
			departmentId,
			sectionId,
			positionId,
			levelId,
			reportToId,
			employeeId,
		});
		const metrics = {
			...getZeroMetrics(),
			totalCalendarDays: Math.max(1, getBusinessDateKeys(startDate, endDate).length),
			totalEmployeesMissingSchedule: missingScheduleFacet.totalRecords,
			shiftTypeBreakdown: [
				{
					shiftType: "UNASSIGNED",
					label: "Unassigned",
					total: missingScheduleFacet.totalRecords,
				},
			],
		};

		return {
			metrics,
			records: missingScheduleFacet.records,
			dateRange: {
				from: startDate.toISOString().split("T")[0],
				to: endDate.toISOString().split("T")[0],
			},
			totalRecords: missingScheduleFacet.totalRecords,
			departmentBreakdown: [],
			departmentPreviewRows: [],
		};
	}
	const normalizedStatus = String(status || "").trim().toUpperCase();
	const mergeScheduledNotClockedIn =
		normalizedStatus === "NOT_CLOCKED_IN" || normalizedStatus === "MISSING_CLOCK_IN";
	const mergeScheduledClockedIn =
		normalizedStatus === "CLOCKED_IN" ||
		normalizedStatus === "LATE" ||
		normalizedStatus === "ON_TIME" ||
		normalizedStatus === "EARLY_OUT";
	const mergeScheduledList = mergeScheduledNotClockedIn || mergeScheduledClockedIn;
	const scheduleUtilization = await countRegularScheduleWorkUtilization(prisma, {
		organizationId,
		startDate,
		endDate,
		departmentId,
		sectionId,
		positionId,
		levelId,
		reportToId,
		employeeId,
	});
	const skipObligationFacet = mergeScheduledClockedIn;
	const facet = skipObligationFacet
		? {
				records: [],
				totalRecords: [{ total: 0 }],
				calendarDays: [{ total: getBusinessDateKeys(startDate, endDate).length }],
				metrics: [],
				shiftTypeBreakdown: [],
				departmentBreakdown: [],
				departmentPreviewRecords: [],
				leaveTypeBreakdown: [],
			}
		: await getPostgresObligationFacet({
				prisma,
				organizationId,
				startDate,
				endDate,
				limit: mergeScheduledList ? 5000 : safeLimit,
				page: mergeScheduledList ? 1 : safePage,
				search,
				status,
				departmentId,
				sectionId,
				positionId,
				levelId,
				reportToId,
				employeeId,
				shiftType,
				employeeIds,
			});
	const rows = Array.isArray(facet.records) ? facet.records : [];

	const normalizeObligationRow = (row: any) => {
	const storedStatus = String(row.status || "EXPECTED").toUpperCase();
	const displayStatus = deriveAttendanceObligationDisplayStatus(row);
	const rowDate = readRawDate(row.date);
	const timeIn = readQueryRawUtcTimestamp(row.timeIn);
	const timeBreak = readQueryRawUtcTimestamp(row.timeBreak);
	const timeOut = readQueryRawUtcTimestamp(row.timeOut);
	const createdAt = readRawDate(row.createdAt);
	const updatedAt = readRawDate(row.updatedAt);
	const businessDateKey = row.businessDate || (rowDate ? getUtcDateKey(rowDate) : null);
	const scheduleSnapshot = normalizeScheduleSnapshotForAttendancePayload(
		row.scheduleSnapshot,
	);
	return applyScheduleArrivalToAttendanceRow({
			id: readRawId(row._id) || readRawId(row.id),
			employeeRefId: readRawId(row.employeeId),
			employeeId: row.employeeCodeSnapshot || readRawId(row.employeeId),
			employeeName: row.employeeNameSnapshot || readRawId(row.employeeId),
			departmentId: readRawId(row.departmentIdSnapshot),
			departmentName: row.departmentNameSnapshot || "Unassigned",
			workforceSource: row.workforceSourceSnapshot || "DIRECT",
			agencyId: readRawId(row.agencyIdSnapshot),
			date: businessDateKey,
			timeIn: timeIn ? timeIn.toISOString() : null,
			timeBreak: timeBreak ? timeBreak.toISOString() : null,
			timeOut: timeOut ? timeOut.toISOString() : null,
			timeOutNextDay: isNextBusinessDay(businessDateKey, timeIn, timeOut),
			status: displayStatus,
			storedStatus,
			phase: row.phase,
			attendanceId: readRawId(row.attendanceId),
			timesheetId: readRawId(row.timesheetId),
			timesheetlineId: readRawId(row.timesheetlineId),
			createdAt: createdAt ? createdAt.toISOString() : null,
			updatedAt: updatedAt ? updatedAt.toISOString() : null,
			behaviorFlags: Array.isArray(row.behaviorFlags) ? row.behaviorFlags : [],
			scheduleSnapshot,
			hoursWorked: row.hoursWorked || "0:00",
			regularHours: row.regularHours || "0:00",
			overtimeHours: row.overtimeHours || "0:00",
			undertimeHours: row.undertimeHours || "0:00",
			lateHours: row.lateHours || "0:00",
			earlyOutHours: row.earlyOutHours || "0:00",
			breakMinutes: row.breakMinutes ?? null,
			notes: null,
			isManualEntry: false,
			isVirtual: !row.attendanceId,
			primaryMarker:
				displayStatus === "ABSENT"
					? "ABSENT"
					: ["LEAVE", "REST_DAY", "HOLIDAY"].includes(displayStatus)
						? displayStatus
						: "HOURS",
			metadata: row.metadata || null,
		});
	};

	const normalizedRows = rows.map(normalizeObligationRow);
	const departmentPreviewRows = Array.isArray(facet.departmentPreviewRecords)
		? facet.departmentPreviewRecords.map((group: any) => ({
				departmentId: readRawId(group.departmentId),
				departmentName: String(group.departmentName || "Unassigned"),
				rows: Array.isArray(group.rows) ? group.rows.map(normalizeObligationRow) : [],
			}))
		: [];

	const rowsByEmployee = normalizedRows.reduce((acc: Map<string, any[]>, row: any) => {
		const employeeId = String(row.employeeRefId || "").trim();
		if (!employeeId) return acc;
		const records = acc.get(employeeId) || [];
		records.push(row);
		acc.set(employeeId, records);
		return acc;
	}, new Map<string, any[]>());

	for (const group of departmentPreviewRows) {
		for (const row of group.rows || []) {
			const employeeId = String(row.employeeRefId || "").trim();
			if (!employeeId) continue;
			const records = rowsByEmployee.get(employeeId) || [];
			records.push(row);
			rowsByEmployee.set(employeeId, records);
		}
	}

	const enrichedRowsByEmployee = await enrichAttendanceRecordsBatchWithLeaveHolidayContext(
		prisma,
		{
			organizationId,
			employeeRecords: Array.from(rowsByEmployee.entries()).map(([employeeId, records]) => ({
				employeeId,
				records,
			})),
		},
	);
	const enrichedRowById = new Map<string, any>();
	for (const employeeSet of enrichedRowsByEmployee) {
		for (const record of employeeSet.records || []) {
			if (record?.id) enrichedRowById.set(record.id, record);
		}
	}

	const enrichedRows = normalizedRows
		.map((row: any) => enrichedRowById.get(row.id) || row)
		.filter((row: any) => matchesStatus(row.status, row.storedStatus, row, status));
	const mergedSchedulePage = mergeScheduledList
		? pageMergedScheduledAttendanceRecords({
				existingRows: enrichedRows,
				scheduledDays: scheduleUtilization.scheduledDays,
				employeeIds,
				page: safePage,
				limit: safeLimit,
				mode: mergeScheduledClockedIn ? "clocked_in" : "not_clocked_in",
				keepRow: (row: any) =>
					mergeScheduledClockedIn
						? rowMatchesComputedTimekeepingStatus(row, status)
						: matchesStatus(row.status, row.storedStatus, row, status),
			})
		: null;
	const pagedRows = applyScheduledDayArrivalToRows(
		mergedSchedulePage?.records || enrichedRows,
		scheduleUtilization.scheduledDays,
	);
	const enrichedDepartmentPreviewRows = departmentPreviewRows.map((group: any) => ({
		...group,
		rows: (group.rows || [])
			.map((row: any) => enrichedRowById.get(row.id) || row)
			.filter((row: any) => matchesStatus(row.status, row.storedStatus, row, status)),
	}));

	const calendarDayCount = Number(facet.calendarDays?.[0]?.total || 0);
	const companyEventDayCount = await countCompanyEventDays(
		prisma,
		organizationId,
		startDate,
		endDate,
	);
	const holidayDateCount = await countHolidayDays(prisma, organizationId, startDate, endDate);
	const employeesMissingScheduleCount = await countEmployeesMissingSchedule(prisma, {
		organizationId,
		startDate,
		endDate,
		search,
		departmentId,
		sectionId,
		positionId,
		levelId,
		reportToId,
		employeeId,
	});

	const metrics = { ...getZeroMetrics(), ...(facet.metrics?.[0] || {}) };
	delete (metrics as any)._id;

	metrics.totalCalendarDays = calendarDayCount;
	metrics.totalCompanyEventDays = companyEventDayCount;
	metrics.totalHolidayDateCount = holidayDateCount;
	metrics.totalEmployeesMissingSchedule = employeesMissingScheduleCount;
	metrics.leaveTypeBreakdown = (facet.leaveTypeBreakdown || []).map((item: any) => ({
		leaveType: String(item._id || "LEAVE"),
		total: Number(item.total || 0),
	}));
	metrics.shiftTypeBreakdown = (facet.shiftTypeBreakdown || []).map((item: any) => ({
		shiftType: String(item._id || "UNASSIGNED"),
		label: String(item.label || item._id || "Unassigned"),
		total: Number(item.total || 0),
	}));
	let departmentBreakdown = (facet.departmentBreakdown || []).map((item: any) => ({
		departmentId: readRawId(item.departmentId),
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
	metrics.approvedOvertimeCount = await countApprovedOvertimeDays(prisma, {
		organizationId,
		startDate,
		endDate,
		employeeIds,
		shiftType,
	});
	metrics.unapprovedOvertimeCount = Math.max(
		0,
		metrics.totalOvertime - metrics.approvedOvertimeCount,
	);
	const obligatedToWork = scheduleUtilization.scheduledWorkDays;
	const clockedInObligated = scheduleUtilization.clockedInOnScheduledDays;
	const notClockedInObligated = scheduleUtilization.notClockedInOnScheduledDays;
	metrics.totalObligatedToWork = obligatedToWork;
	metrics.totalScheduledWorkDays = obligatedToWork;
	metrics.totalClockedInObligated = clockedInObligated;
	metrics.totalClockedIn = clockedInObligated;
	// Same population as the utilization over: scheduled regular days minus punches.
	// Do not keep the leftover obligation-row NOT_CLOCKED_IN count (was 76 vs 1706).
	metrics.totalNotClockedIn = notClockedInObligated;
	const scheduledTimekeeping = summarizeScheduledDayTimekeeping(
		scheduleUtilization.scheduledDays,
	);
	metrics.totalLate = scheduledTimekeeping.lateCount;
	metrics.totalOnTime = scheduledTimekeeping.onTimeCount;
	metrics.totalEarlyOut = scheduledTimekeeping.undertimeCount;
	metrics.totalLateMinutes = scheduledTimekeeping.lateMinutes;
	metrics.totalUndertimeMinutes = scheduledTimekeeping.undertimeMinutes;
	if (scheduledTimekeeping.clockedOutCount > 0) {
		metrics.totalClockedOut = scheduledTimekeeping.clockedOutCount;
	}
	metrics.utilizationRate = computeAttendanceUtilizationRate(
		clockedInObligated,
		obligatedToWork,
	);
	metrics.avgAttendanceRate = metrics.utilizationRate;
	const scheduledDeptStats = summarizeScheduledDepartmentBreakdown(
		scheduleUtilization.scheduledDays,
	);
	const scheduledDeptByKey = new Map(
		scheduledDeptStats.map((item) => [item.departmentId || item.departmentName, item]),
	);
	const useEmployeePeriodRollup =
		(calendarDayCount || getBusinessDateKeys(startDate, endDate).length) > 1;
	departmentBreakdown = departmentBreakdown.map((item: any) => {
		const computed = scheduledDeptByKey.get(item.departmentId || item.departmentName);
		if (!computed) {
			return { ...item, present: 0, late: 0, undertime: 0 };
		}
		return {
			...item,
			employeeCount: computed.employeeCount ?? item.employeeCount,
			scheduled: computed.scheduled,
			present: computed.present,
			late: computed.late,
			undertime: computed.undertime,
			...(useEmployeePeriodRollup
				? { absent: computed.notClockedIn, missing: computed.notClockedIn }
				: {}),
		};
	});
	for (const computed of scheduledDeptStats) {
		const key = computed.departmentId || computed.departmentName;
		const exists = departmentBreakdown.some(
			(item: any) => (item.departmentId || item.departmentName) === key,
		);
		if (exists) continue;
		departmentBreakdown.push({
			departmentId: computed.departmentId,
			departmentName: computed.departmentName,
			totalRecords: computed.scheduled,
			employeeCount: computed.employeeCount || computed.scheduled,
			scheduled: computed.scheduled,
			present: computed.present,
			late: computed.late,
			undertime: computed.undertime,
			absent: computed.notClockedIn,
			leave: 0,
			missing: computed.notClockedIn,
			overtimeHours: 0,
		});
	}
	const employeeRollups = useEmployeePeriodRollup
		? summarizeScheduledEmployeeBreakdown(scheduleUtilization.scheduledDays)
		: [];
	const previewDays = useEmployeePeriodRollup
		? []
		: pickScheduledDepartmentPreviewDays(scheduleUtilization.scheduledDays, 5);
	const previewByDept = new Map<string, any[]>();
	if (useEmployeePeriodRollup) {
		for (const rollup of pickScheduledDepartmentPreviewEmployees(employeeRollups, 5)) {
			const key = rollup.departmentId || rollup.departmentName || "Unassigned";
			const list = previewByDept.get(key) || [];
			list.push(buildPeriodRollupAttendanceRow(rollup));
			previewByDept.set(key, list);
		}
	} else {
		for (const day of previewDays) {
			const key = day.departmentId || day.departmentName || "Unassigned";
			const list = previewByDept.get(key) || [];
			list.push(applyScheduleArrivalToAttendanceRow(buildVirtualScheduledAttendanceRow(day)));
			previewByDept.set(key, list);
		}
	}
	const scheduledDepartmentPreviewRows = Array.from(previewByDept.entries()).map(
		([key, rows]) => ({
			departmentId: rows[0]?.departmentId || null,
			departmentName: rows[0]?.departmentName || key,
			rows,
		}),
	);

	return {
		metrics,
		records: pagedRows,
		dateRange: {
			from: getDateKeyInBusinessTimeZone(startDate),
			to: getDateKeyInBusinessTimeZone(endDate),
		},
		totalRecords: mergedSchedulePage
			? mergedSchedulePage.totalRecords
			: Number(facet.totalRecords?.[0]?.total || 0),
		departmentBreakdown,
		departmentPreviewRows: scheduledDepartmentPreviewRows,
	};
}

export async function calculateAttendanceObligationSummary(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	search?: string,
	status?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
) {
	const detailed = await calculateAttendanceObligationDetailed(
		prisma,
		organizationId,
		startDate,
		endDate,
		1,
		1,
		search,
		status,
		departmentId,
		sectionId,
		positionId,
		levelId,
		reportToId,
		employeeId,
		shiftType,
	);
	return detailed.metrics;
}

export async function calculateAttendanceDailyTrendByDepartment(
	prisma: PrismaClient,
	organizationId: string,
	startDate: Date,
	endDate: Date,
	search?: string,
	status?: string,
	departmentId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
): Promise<AttendanceDailyTrendByDepartmentResult> {
	const normalizedStartDate = new Date(startDate);
	normalizedStartDate.setUTCHours(0, 0, 0, 0);
	const normalizedEndDate = new Date(endDate);
	normalizedEndDate.setUTCHours(23, 59, 59, 999);

	if (normalizedStartDate.getTime() > normalizedEndDate.getTime()) {
		return {
			startDate: normalizedStartDate,
			endDate: normalizedEndDate,
			totalDays: 0,
			totalRecords: 0,
			departments: [],
			series: [],
		};
	}

	const facet = await getPostgresObligationTrendFacet({
		prisma,
		organizationId,
		startDate: normalizedStartDate,
		endDate: normalizedEndDate,
		search,
		status,
		departmentId,
		reportToId,
		employeeId,
		shiftType,
	});

	const rawDailyRows = Array.isArray((facet as any).dailyDepartmentBreakdown)
		? (facet as any).dailyDepartmentBreakdown
		: [];
	const rawDepartmentTotals = Array.isArray((facet as any).departmentTotals)
		? (facet as any).departmentTotals
		: [];
	const rawDayTotals = Array.isArray((facet as any).dayTotals) ? (facet as any).dayTotals : [];
	const totalRecords = Number((facet as any)?.totalRecords?.[0]?.total || 0);
	const dayKeys = getBusinessDateKeys(normalizedStartDate, normalizedEndDate);

	const departments = rawDepartmentTotals
		.map((item: any) => ({
			departmentId: item.departmentId || null,
			departmentName: String(item.departmentName || "Unassigned"),
			total: Number(item.total || 0),
		}))
		.sort((left: AttendanceDailyTrendDepartmentTotal, right: AttendanceDailyTrendDepartmentTotal) => {
			const totalDelta = right.total - left.total;
			if (totalDelta !== 0) return totalDelta;
			const nameDelta = left.departmentName.localeCompare(right.departmentName);
			if (nameDelta !== 0) return nameDelta;
			return String(left.departmentId || "").localeCompare(String(right.departmentId || ""));
		});

	const departmentMeta = departments.map((department) => ({
		...department,
		key: buildTrendDepartmentKey(department.departmentId, department.departmentName),
	}));
	const departmentByKey = new Map(
		departmentMeta.map((department) => [department.key, department] as const),
	);

	const departmentTotalsByDay = new Map<string, Map<string, number>>();
	for (const row of rawDailyRows) {
		const businessDate = String(row.businessDate || "").trim();
		if (!businessDate) continue;
		const departmentKey = buildTrendDepartmentKey(row.departmentId || null, row.departmentName);
		const total = Number(row.total || 0);

		if (!departmentByKey.has(departmentKey)) {
			const fallbackDepartment = {
				departmentId: row.departmentId || null,
				departmentName: String(row.departmentName || "Unassigned"),
				total,
				key: departmentKey,
			};
			departmentMeta.push(fallbackDepartment);
			departmentByKey.set(departmentKey, fallbackDepartment);
		}

		const bucket = departmentTotalsByDay.get(businessDate) || new Map<string, number>();
		bucket.set(departmentKey, total);
		departmentTotalsByDay.set(businessDate, bucket);
	}

	departmentMeta.sort((left, right) => {
		const totalDelta = right.total - left.total;
		if (totalDelta !== 0) return totalDelta;
		const nameDelta = left.departmentName.localeCompare(right.departmentName);
		if (nameDelta !== 0) return nameDelta;
		return String(left.departmentId || "").localeCompare(String(right.departmentId || ""));
	});

	const dayTotalsByDate = new Map(
		rawDayTotals.map((item: any) => [String(item.businessDate || "").trim(), Number(item.total || 0)]),
	);

	const series = dayKeys.map((businessDate) => {
		const dayDepartmentTotals = departmentTotalsByDay.get(businessDate) || new Map<string, number>();
		const departmentBreakdown = departmentMeta.map((department) => ({
			departmentId: department.departmentId,
			departmentName: department.departmentName,
			total: Number(dayDepartmentTotals.get(department.key) || 0),
		}));

		return {
			businessDate,
			total:
				dayTotalsByDate.get(businessDate) ??
				departmentBreakdown.reduce(
					(sum: number, item: AttendanceDailyTrendDepartmentTotal) => sum + item.total,
					0,
				),
			departmentBreakdown,
		};
	});

	return {
		startDate: normalizedStartDate,
		endDate: normalizedEndDate,
		totalDays: dayKeys.length,
		totalRecords,
		departments: departmentMeta.map(({ key: _key, ...department }) => department),
		series,
	};
}

export async function calculateAttendanceObligationTodayOpsSummary(
	prisma: PrismaClient,
	organizationId: string,
	targetDate: Date,
	search?: string,
	departmentId?: string,
	sectionId?: string,
	positionId?: string,
	levelId?: string,
	reportToId?: string,
	employeeId?: string,
	shiftType?: string,
) {
	const date = new Date(`${getDateKeyInBusinessTimeZone(targetDate)}T00:00:00.000Z`);
	const detailed = await calculateAttendanceObligationDetailed(
		prisma,
		organizationId,
		date,
		date,
		10000,
		1,
		search,
		undefined,
		departmentId,
		sectionId,
		positionId,
		levelId,
		reportToId,
		employeeId,
		shiftType,
	);
	const records = detailed.records;
	const companyEventDayCount = await countCompanyEventDays(prisma, organizationId, date, date);
	const holidayDateCount = await countHolidayDays(prisma, organizationId, date, date);
	const clockedInTodayCount = records.filter((record: any) =>
		["PRESENT", "INCOMPLETE"].includes(record.status),
	).length;
	const clockedOutTodayCount = records.filter((record: any) => Boolean(record.timeOut)).length;
	const lateRightNowCount = records.filter((record: any) =>
		record.behaviorFlags.includes("TARDINESS"),
	).length;
	const earlyOutTodayCount = records.filter(
		(record: any) => timeStringToMinutes(record.earlyOutHours) > 0,
	).length;
	const overtimeTodayCount = records.filter(
		(record: any) => timeStringToMinutes(record.overtimeHours) > 0,
	).length;
	return {
		businessDate: getDateKeyInBusinessTimeZone(targetDate),
		scheduledTodayCount: records.filter((record: any) =>
			["NOT_CLOCKED_IN", "PRESENT", "INCOMPLETE"].includes(record.status),
		).length,
		notYetInCount: records.filter((record: any) => record.status === "NOT_CLOCKED_IN").length,
		clockedInTodayCount,
		clockedOutTodayCount,
		onTimeTodayCount: Math.max(0, clockedInTodayCount - lateRightNowCount),
		lateRightNowCount,
		earlyOutTodayCount,
		overtimeTodayCount,
		approvedOvertimeCount: detailed.metrics.approvedOvertimeCount,
		unapprovedOvertimeCount: detailed.metrics.unapprovedOvertimeCount,
		approvedLeaveTodayCount: records.filter((record: any) => record.status === "LEAVE").length,
		workDayTodayCount: detailed.metrics.totalScheduledWorkDays,
		holidayDateCount,
		leaveTypeBreakdown: detailed.metrics.leaveTypeBreakdown,
		shiftTypeBreakdown: detailed.metrics.shiftTypeBreakdown,
		holidayTodayCount: records.filter(
			(record: any) =>
				record.status === "HOLIDAY" ||
				record.primaryMarker === "HOLIDAY" ||
				(Array.isArray(record.holidayEntries) && record.holidayEntries.length > 0),
		).length,
		restDayTodayCount: records.filter((record: any) => record.status === "REST_DAY").length,
		companyEventDayCount,
	};
}
