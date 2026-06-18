import { Prisma, PrismaClient } from "../generated/prisma";
import {
	collectShiftTypeIdsFromEmployeeScheduleData,
	resolveEffectiveShiftFromEmployeeData,
} from "../helper/employee-schedule.helper";
import {
	buildTimesheetDaySnapshotMetadata,
	writeEffectiveTimesheetLine,
} from "../helper/timesheet-line-version.helper";
import {
	assertSafeMigrationExecution,
	resolveExecutionMode,
	summarizeIdempotentBackfillRun,
} from "./migration/script-safety";

const { resolveEmployeeScheduleSnapshotForDate } = require("./bnpi-demo-attendance-proof.cjs");
const prisma = new PrismaClient();

const getArg = (name: string) => {
	const prefix = `--${name}=`;
	return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const getNumberArg = (name: string, fallback: number) => {
	const value = Number(getArg(name));
	return Number.isFinite(value) && value > 0 ? value : fallback;
};

const toDateOnlyUtc = (value: string | Date) => {
	const date = value instanceof Date ? new Date(value) : new Date(value);
	if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${String(value)}`);
	date.setUTCHours(0, 0, 0, 0);
	return date;
};

const dateKey = (value: Date) => value.toISOString().slice(0, 10);

const hasFlag = (name: string) => process.argv.slice(2).includes(`--${name}`);

const minutesToHours = (minutes: number) =>
	`${Math.floor(Math.max(0, minutes) / 60)}:${String(Math.max(0, minutes) % 60).padStart(2, "0")}`;

const parseHours = (value: unknown) => {
	const match = String(value || "0:00").match(/^(\d+):(\d{2})$/);
	if (!match) return 0;
	return Number(match[1]) * 60 + Number(match[2]);
};

const chunk = <T>(items: T[], size: number) => {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
};

const mapWithConcurrency = async <T>(
	items: T[],
	concurrency: number,
	callback: (item: T) => Promise<void>,
) => {
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			await callback(items[currentIndex]);
		}
	});
	await Promise.all(workers);
};

const dateTimeToMinutes = (value: Date | null | undefined) => {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.getTime();
};

const workedMinutesFromClock = (line: { timeIn?: Date | null; timeOut?: Date | null }, breakMinutes: number) => {
	const start = dateTimeToMinutes(line.timeIn);
	const end = dateTimeToMinutes(line.timeOut);
	if (start === null || end === null || end <= start) return null;
	return Math.max(0, Math.round((end - start) / 60000) - Math.max(0, breakMinutes));
};

const splitWorkedMinutes = (workedMinutes: number, scheduledRegularMinutes: number) => {
	const regularMinutes = Math.min(Math.max(0, workedMinutes), Math.max(0, scheduledRegularMinutes));
	return {
		regularMinutes,
		overtimeMinutes: Math.max(0, workedMinutes - regularMinutes),
	};
};

const timeTextToMinutes = (value?: string | null) => {
	const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
};

const durationFromSlot = (slot: any) => {
	const start = timeTextToMinutes(slot?.startTime);
	const end = timeTextToMinutes(slot?.endTime);
	if (start === null || end === null) return 0;
	return Math.max(0, (end <= start ? end + 24 * 60 : end) - start);
};

const deriveRegularMinutesFromSlots = (timeSlots: any[]) =>
	(Array.isArray(timeSlots) ? timeSlots : [])
		.filter((slot) => String(slot?.type || "").toLowerCase() === "work")
		.reduce((total, slot) => total + durationFromSlot(slot), 0);

const deriveBreakMinutesFromSlots = (timeSlots: any[]) =>
	(Array.isArray(timeSlots) ? timeSlots : [])
		.filter((slot) => String(slot?.type || "").toLowerCase() === "break")
		.reduce((total, slot) => total + durationFromSlot(slot), 0);

const getSourceRows = (metadata: any): unknown[] => {
	if (Array.isArray(metadata?.sourceRows)) return metadata.sourceRows;
	if (Array.isArray(metadata?.day?.schedule?.sourceRows)) return metadata.day.schedule.sourceRows;
	return [];
};

const getNextDate = (value: Date) => {
	const next = new Date(value);
	next.setUTCDate(next.getUTCDate() + 1);
	return next;
};

const eachDateInclusive = (from: Date, to: Date) => {
	const dates: Date[] = [];
	let cursor = toDateOnlyUtc(from);
	const end = toDateOnlyUtc(to);
	while (cursor <= end) {
		dates.push(new Date(cursor));
		cursor = getNextDate(cursor);
	}
	return dates;
};

const getHolidayKeys = async (organizationId: string, from: Date, to: Date) => {
	const rows = await (prisma as any).calendarItem.findMany({
		where: {
			organizationId,
			type: "HOLIDAY",
			status: "ACTIVE",
			startDate: { lte: to },
			endDate: { gte: from },
		},
		select: { startDate: true, endDate: true },
	});
	const keys = new Set<string>();
	for (const row of rows) {
		let cursor = toDateOnlyUtc(row.startDate);
		const end = toDateOnlyUtc(row.endDate);
		while (cursor <= end) {
			keys.add(dateKey(cursor));
			cursor = getNextDate(cursor);
		}
	}
	return keys;
};

const explainFastPathIndexes = async () => {
	const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
		SELECT indexname
		FROM pg_indexes
		WHERE schemaname = current_schema()
			AND tablename = 'timesheet_lines'
			AND indexname IN (
				'timesheet_lines_organizationId_payrollPeriodId_date_isDelet_idx',
				'timesheet_lines_organizationId_timesheetId_date_isEffective_idx'
			)
	`;
	const names = new Set(rows.map((row) => row.indexname));
	return {
		payrollPeriodScan:
			names.has("timesheet_lines_organizationId_payrollPeriodId_date_isDelet_idx"),
		timesheetAggregate:
			names.has("timesheet_lines_organizationId_timesheetId_date_isEffective_idx"),
	};
};

const aggregateEffectiveLineTotals = async (organizationId: string, timesheetIds: string[]) => {
	if (!timesheetIds.length) return [];
	return prisma.$queryRaw<
		Array<{
			timesheetId: string;
			totalDays: number | bigint;
			worked: number | bigint;
			regular: number | bigint;
			overtime: number | bigint;
			undertime: number | bigint;
			late: number | bigint;
			earlyOut: number | bigint;
		}>
	>`
		WITH line_minutes AS (
			SELECT
				"timesheetId",
				CASE WHEN COALESCE("hoursWorked", '0:00') ~ '^[0-9]+:[0-9]{2}$'
					THEN split_part(COALESCE("hoursWorked", '0:00'), ':', 1)::int * 60
						+ split_part(COALESCE("hoursWorked", '0:00'), ':', 2)::int
					ELSE 0
				END AS worked,
				CASE WHEN COALESCE("regularHours", '0:00') ~ '^[0-9]+:[0-9]{2}$'
					THEN split_part(COALESCE("regularHours", '0:00'), ':', 1)::int * 60
						+ split_part(COALESCE("regularHours", '0:00'), ':', 2)::int
					ELSE 0
				END AS regular,
				CASE WHEN COALESCE("overtimeHours", '0:00') ~ '^[0-9]+:[0-9]{2}$'
					THEN split_part(COALESCE("overtimeHours", '0:00'), ':', 1)::int * 60
						+ split_part(COALESCE("overtimeHours", '0:00'), ':', 2)::int
					ELSE 0
				END AS overtime,
				CASE WHEN COALESCE("undertimeHours", '0:00') ~ '^[0-9]+:[0-9]{2}$'
					THEN split_part(COALESCE("undertimeHours", '0:00'), ':', 1)::int * 60
						+ split_part(COALESCE("undertimeHours", '0:00'), ':', 2)::int
					ELSE 0
				END AS undertime,
				CASE WHEN COALESCE("lateHours", '0:00') ~ '^[0-9]+:[0-9]{2}$'
					THEN split_part(COALESCE("lateHours", '0:00'), ':', 1)::int * 60
						+ split_part(COALESCE("lateHours", '0:00'), ':', 2)::int
					ELSE 0
				END AS late,
				CASE WHEN COALESCE("earlyOutHours", '0:00') ~ '^[0-9]+:[0-9]{2}$'
					THEN split_part(COALESCE("earlyOutHours", '0:00'), ':', 1)::int * 60
						+ split_part(COALESCE("earlyOutHours", '0:00'), ':', 2)::int
					ELSE 0
				END AS "earlyOut"
			FROM timesheet_lines
			WHERE "organizationId" = ${organizationId}
				AND "isDeleted" = false
				AND "isEffective" = true
				AND "timesheetId" IN (${Prisma.join(timesheetIds)})
		)
		SELECT
			"timesheetId",
			COUNT(*)::int AS "totalDays",
			COALESCE(SUM(worked), 0)::int AS worked,
			COALESCE(SUM(regular), 0)::int AS regular,
			COALESCE(SUM(overtime), 0)::int AS overtime,
			COALESCE(SUM(undertime), 0)::int AS undertime,
			COALESCE(SUM(late), 0)::int AS late,
			COALESCE(SUM("earlyOut"), 0)::int AS "earlyOut"
		FROM line_minutes
		GROUP BY "timesheetId"
	`;
};

const buildSnapshot = (resolvedShift: any, previousSnapshot: any) => {
	const timeSlots = Array.isArray(resolvedShift.timeSlots)
		? resolvedShift.timeSlots
		: previousSnapshot?.timeSlots || [];
	const regularMinutes = resolvedShift.isOff
		? 0
		: Math.round(
				Number.isFinite(Number(resolvedShift.regularMinutes))
					? Number(resolvedShift.regularMinutes)
					: Number(resolvedShift.shiftHour || resolvedShift.regularHours || 0) * 60 ||
							deriveRegularMinutesFromSlots(timeSlots),
			);
	const breakMinutes = resolvedShift.isOff
		? 0
		: Number.isFinite(Number(resolvedShift.breakMinutes))
			? Number(resolvedShift.breakMinutes)
			: deriveBreakMinutesFromSlots(timeSlots) || Number(previousSnapshot?.breakMinutes || 0);
	return {
		...(previousSnapshot && typeof previousSnapshot === "object" ? previousSnapshot : {}),
		source: "BNPI_DM4_SATURDAY_SCHEDULE_REPAIR",
		scheduleCode:
			resolvedShift.scheduleCode ||
			resolvedShift.shiftTypeCode ||
			previousSnapshot?.scheduleCode ||
			"SCHEDULE",
		scheduleName:
			resolvedShift.scheduleName ||
			resolvedShift.scheduleTemplateName ||
			resolvedShift.shiftTypeName ||
			previousSnapshot?.scheduleName ||
			"Schedule",
		scheduleTemplateId: resolvedShift.scheduleTemplateId || previousSnapshot?.scheduleTemplateId || null,
		shiftTypeId: resolvedShift.shiftTypeId || previousSnapshot?.shiftTypeId || null,
		shiftTypeCode: resolvedShift.shiftTypeCode || previousSnapshot?.shiftTypeCode || null,
		shiftTypeName: resolvedShift.shiftTypeName || previousSnapshot?.shiftTypeName || null,
		templateDay: resolvedShift.templateDay ?? previousSnapshot?.templateDay ?? null,
		cycleDays: resolvedShift.cycleDays ?? previousSnapshot?.cycleDays ?? null,
		isOff: Boolean(resolvedShift.isOff),
		isOvernight: Boolean(resolvedShift.isOvernight),
		timeSlots,
		breakMinutes,
		regularMinutes,
		regularHours: regularMinutes / 60,
		startTime: resolvedShift.startTime || previousSnapshot?.startTime || null,
		endTime: resolvedShift.endTime || previousSnapshot?.endTime || null,
	};
};

async function main() {
	const executionMode = resolveExecutionMode();
	try {
		assertSafeMigrationExecution({
			scriptName: "repair-bnpi-dm4-saturday-schedules",
			execute: executionMode.execute,
			databaseTargets: [
				{
					label: "PG_DATABASE_URL",
					url: process.env.PG_DATABASE_URL,
					requiredForExecute: true,
				},
			],
		});
	} catch (error) {
		const allowLocalHrisNew = hasFlag("allow-local-hris-new");
		const allowActiveLocalDb = hasFlag("allow-active-local-db");
		const pgUrl = process.env.PG_DATABASE_URL || "";
		const parsed = pgUrl ? new URL(pgUrl) : null;
		const databaseName = parsed?.pathname.replace(/^\//, "").split("?")[0] || "";
		const isLocalDatabase =
			parsed && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
		const isLocalHrisNew =
			isLocalDatabase && /^hris-new\d*$/i.test(databaseName);
		const isBlockedDatabaseName =
			/^hris$/i.test(databaseName) ||
			/^hris-new$/i.test(databaseName) ||
			/prod|production|stage|staging|uat|shared|dev/i.test(databaseName);
		const isExplicitActiveLocalTarget =
			isLocalDatabase && allowActiveLocalDb && !isBlockedDatabaseName;
		if (
			!executionMode.execute ||
			!((allowLocalHrisNew && isLocalHrisNew) || isExplicitActiveLocalTarget)
		) {
			throw error;
		}
		console.warn(
			isExplicitActiveLocalTarget
				? `repair-bnpi-dm4-saturday-schedules: explicit --allow-active-local-db override accepted for local database ${databaseName}.`
				: "repair-bnpi-dm4-saturday-schedules: explicit --allow-local-hris-new override accepted for local hris-new.",
		);
	}

	const organizationCode = getArg("orgCode") || "bnei";
	const periodCode = getArg("periodCode");
	const organization = await prisma.organization.findUnique({
		where: { code: organizationCode },
		select: { id: true, code: true, name: true },
	});
	if (!organization) throw new Error(`Organization not found: ${organizationCode}`);

	const periods = await prisma.payrollPeriod.findMany({
		where: {
			organizationId: organization.id,
			isDeleted: false,
			...(periodCode && periodCode !== "all" ? { code: periodCode } : {}),
		},
		select: { id: true, code: true, startDate: true, endDate: true },
		orderBy: { startDate: "asc" },
	});
	if (!periods.length) throw new Error(`Payroll period not found: ${periodCode || "all"}`);
	const periodIds = periods.map((period) => period.id);
	const fromDate = periods.reduce((min, period) => period.startDate < min ? period.startDate : min, periods[0].startDate);
	const toDate = periods.reduce((max, period) => period.endDate > max ? period.endDate : max, periods[0].endDate);

	const holidayKeys = await getHolidayKeys(organization.id, fromDate, toDate);
	const fastPathIndexes = await explainFastPathIndexes();
	const batchSize = getNumberArg("batchSize", 500);
	const updateConcurrency = Math.min(getNumberArg("updateConcurrency", 6), 16);
	const lineWhere = {
		organizationId: organization.id,
		isDeleted: false,
		isEffective: true,
		payrollPeriodId: { in: periodIds },
		timesheet: {
			isDeleted: false,
			status: { in: ["SUBMITTED", "APPROVED", "REVISED", "REJECTED"] as any },
		},
	};
	const lineSelect = {
		id: true,
		employeeId: true,
		timesheetId: true,
		payrollPeriodId: true,
		attendanceId: true,
		date: true,
		status: true,
		timeIn: true,
		timeBreak: true,
		timeOut: true,
		scheduleSnapshot: true,
		metadata: true,
		hoursWorked: true,
		regularHours: true,
		overtimeHours: true,
		breakMinutes: true,
		employeeCodeSnapshot: true,
		attendanceObligations: { select: { id: true, phase: true, metadata: true }, take: 1 },
		timesheet: {
			select: {
				code: true,
				status: true,
				employeePayroll: { select: { isPaid: true } },
			},
		},
	};

	let scanned = 0;
	let repaired = 0;
	let skippedNoChange = 0;
	let skippedNoWorkSchedule = 0;
	let skippedPaid = 0;
	const samples: any[] = [];
	const touchedTimesheetIds = new Set<string>();
	let cursorId: string | undefined;

	while (true) {
		const lines = await prisma.timesheetline.findMany({
			where: {
				...lineWhere,
			},
			select: lineSelect,
			take: batchSize,
			...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
			orderBy: { id: "asc" },
		});
		if (!lines.length) break;
		cursorId = lines[lines.length - 1].id;

		const batchEmployeeIds = Array.from(new Set(lines.map((line) => line.employeeId)));
		const batchFromDate = lines.reduce((min, line) => line.date < min ? line.date : min, lines[0].date);
		const batchToDate = lines.reduce((max, line) => line.date > max ? line.date : max, lines[0].date);
		const batchEmployees = await prisma.employee.findMany({
			where: {
				organizationId: organization.id,
				id: { in: batchEmployeeIds },
				isDeleted: false,
			},
			select: {
				id: true,
				employeeId: true,
				embeddedSchedule: true,
				employmentStartDate: true,
				employmentHireDate: true,
				scheduleOverrides: {
					where: {
						organizationId: organization.id,
						isDeleted: false,
						date: { gte: batchFromDate, lte: batchToDate },
					},
					select: {
						id: true,
						date: true,
						shiftTypeId: true,
						shiftSnapshot: true,
						isDeleted: true,
						createdAt: true,
						updatedAt: true,
					},
				},
				scheduleHistoryRecords: {
					where: { organizationId: organization.id },
					orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
					select: {
						effectiveAt: true,
						createdAt: true,
						beforeSchedule: true,
						afterSchedule: true,
					},
				},
			},
		});
		const batchShiftTypeIds = Array.from(
			new Set(batchEmployees.flatMap((employee) => collectShiftTypeIdsFromEmployeeScheduleData(employee))),
		);
		const batchShiftTypes = batchShiftTypeIds.length
			? await (prisma as any).shiftType.findMany({
					where: {
						organizationId: organization.id,
						isDeleted: false,
						id: { in: batchShiftTypeIds },
					},
				})
			: [];
		const batchShiftTypeById = new Map<string, any>(
			batchShiftTypes.map((shiftType: any) => [String(shiftType.id), shiftType]),
		);
		const batchEmployeeById = new Map(batchEmployees.map((employee) => [employee.id, employee]));

		for (const line of lines) {
		scanned += 1;
		const scheduleEmployee = batchEmployeeById.get(line.employeeId);
		let resolvedShift = resolveEffectiveShiftFromEmployeeData(
			scheduleEmployee,
			line.date,
			batchShiftTypeById,
		);
		if (!resolvedShift) {
			const migrationResolved = resolveEmployeeScheduleSnapshotForDate(scheduleEmployee, line.date);
			if (migrationResolved) {
				resolvedShift = migrationResolved;
			}
		}
		const obligation = line.attendanceObligations?.[0] || null;
		if (!resolvedShift) {
			const noScheduleMetadata = {
				...(line.metadata && typeof line.metadata === "object" && !Array.isArray(line.metadata)
					? line.metadata
					: {}),
				scheduleRepair: {
					source: "repair-bnpi-dm4-saturday-schedules",
					code: "NO_EMPLOYEE_SCHEDULE",
					repairedAt: new Date().toISOString(),
					previousStatus: line.status,
				},
			};
			const hasNoScheduleChange =
				line.status !== "NO_SCHEDULE" ||
				line.hoursWorked !== "0:00" ||
				line.regularHours !== "0:00" ||
				line.overtimeHours !== "0:00" ||
				Boolean(line.scheduleSnapshot);
			if (hasNoScheduleChange && executionMode.execute) {
				await prisma.$transaction([
					prisma.timesheetline.update({
						where: { id: line.id },
						data: {
							status: "NO_SCHEDULE",
							primaryMarker: "NO_SCHEDULE",
							scheduleSnapshot: Prisma.JsonNull,
							hoursWorked: "0:00",
							regularHours: "0:00",
							overtimeHours: "0:00",
							undertimeHours: "0:00",
							lateHours: "0:00",
							earlyOutHours: "0:00",
							breakMinutes: 0,
							metadata: noScheduleMetadata as any,
							notes:
								"BNPI DM4 repair: employee has no source-backed schedule assignment for this date.",
						},
					}),
					...(obligation?.id
						? [
								prisma.attendanceObligation.update({
									where: { id: obligation.id },
									data: {
										status: "NO_SCHEDULE",
										scheduleSnapshot: Prisma.JsonNull,
										scheduleFingerprint: null,
										hoursWorked: "0:00",
										regularHours: "0:00",
										overtimeHours: "0:00",
										undertimeHours: "0:00",
										lateHours: "0:00",
										earlyOutHours: "0:00",
										breakMinutes: 0,
										metadata: {
											...(obligation.metadata &&
											typeof obligation.metadata === "object" &&
											!Array.isArray(obligation.metadata)
												? obligation.metadata
												: {}),
											scheduleRepair: noScheduleMetadata.scheduleRepair,
										} as any,
									},
								}),
							]
						: []),
				]);
			}
			if (hasNoScheduleChange) {
				repaired += 1;
				touchedTimesheetIds.add(line.timesheetId);
			} else {
				skippedNoChange += 1;
			}
			skippedNoWorkSchedule += 1;
			if (samples.length < 25) {
				samples.push({
					employeeId: scheduleEmployee?.employeeId || line.employeeCodeSnapshot,
					date: dateKey(line.date),
					timesheetCode: line.timesheet.code,
					from: {
						status: line.status,
						hoursWorked: line.hoursWorked,
						scheduleCode: (line.scheduleSnapshot as any)?.scheduleCode,
					},
					to: "NO_SCHEDULE",
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					scheduleCode: null,
				});
			}
			continue;
		}

		const key = dateKey(line.date);
		const isHoliday = line.status === "HOLIDAY" || holidayKeys.has(key);
		const nextSnapshot = buildSnapshot(resolvedShift, line.scheduleSnapshot);
		const metadata = line.metadata as any;
		const sourceRows = getSourceRows(metadata);
		const isBiometric =
			String(metadata?.sourceKind || metadata?.day?.schedule?.sourceKind || "") === "biometric_punch";
		const breakMinutes = resolvedShift.isOff ? 0 : Math.max(0, Number(nextSnapshot.breakMinutes || 0));
		const actualWorkedMinutes = workedMinutesFromClock(line, breakMinutes);
		const hasCompleteClock = actualWorkedMinutes !== null && (!isBiometric || sourceRows.length >= 2);
		const nextStatus = isHoliday
			? "HOLIDAY"
			: resolvedShift.isOff
				? "REST_DAY"
				: hasCompleteClock
					? "PRESENT"
					: "ABSENT";
		const nextMinutes = hasCompleteClock ? actualWorkedMinutes : 0;
		const nextSplit = splitWorkedMinutes(nextMinutes, Number(nextSnapshot.regularMinutes || 0));
		const nextHours = minutesToHours(nextMinutes);
		const nextRegularHours = minutesToHours(nextSplit.regularMinutes);
		const nextOvertimeHours = minutesToHours(nextSplit.overtimeMinutes);
		const nextBreakMinutes = hasCompleteClock
			? breakMinutes
			: resolvedShift.isOff
				? 0
				: Number(line.breakMinutes || breakMinutes || 0);
		const nextTimeBreak = nextBreakMinutes > 0 ? line.timeBreak || null : null;
		const previousSnapshot = {
			status: line.status,
			hoursWorked: line.hoursWorked,
			regularHours: line.regularHours,
			overtimeHours: line.overtimeHours,
			breakMinutes: line.breakMinutes,
			timeBreak: line.timeBreak,
			scheduleCode: (line.scheduleSnapshot as any)?.scheduleCode,
			isOff: (line.scheduleSnapshot as any)?.isOff,
		};
		const hasChange =
			line.status !== nextStatus ||
			line.hoursWorked !== nextHours ||
			line.regularHours !== nextRegularHours ||
			line.overtimeHours !== nextOvertimeHours ||
			Number(line.breakMinutes || 0) !== nextBreakMinutes ||
			String(line.timeBreak || "") !== String(nextTimeBreak || "") ||
			(line.scheduleSnapshot as any)?.scheduleCode !== nextSnapshot.scheduleCode ||
			Boolean((line.scheduleSnapshot as any)?.isOff) !== Boolean(nextSnapshot.isOff);
		if (!hasChange) {
			skippedNoChange += 1;
			continue;
		}
		const nextMetadata = {
			...(line.metadata && typeof line.metadata === "object" && !Array.isArray(line.metadata)
				? line.metadata
				: {}),
			saturdayScheduleRepair: {
				source: "repair-bnpi-dm4-saturday-schedules",
				repairedAt: new Date().toISOString(),
				previous: previousSnapshot,
				nextStatus,
				nextHoursWorked: nextHours,
			},
			totalMinutes: nextMinutes,
			regularMinutes: nextSplit.regularMinutes,
			overtimeMinutes: nextSplit.overtimeMinutes,
			breakMinutes: nextBreakMinutes,
		};

		if (executionMode.execute) {
			await prisma.$transaction([
				prisma.timesheetline.update({
					where: { id: line.id },
					data: {
						status: nextStatus,
						primaryMarker: nextStatus,
						scheduleSnapshot: nextSnapshot,
						timeBreak: nextTimeBreak,
						hoursWorked: nextHours,
						regularHours: nextRegularHours,
						overtimeHours: nextOvertimeHours,
						undertimeHours: "0:00",
						lateHours: "0:00",
						earlyOutHours: "0:00",
						breakMinutes: nextBreakMinutes,
						metadata: nextMetadata as any,
						notes:
							hasCompleteClock
								? "BNPI DM4 repair: hours recalculated from imported biometric time in/out."
								: nextStatus === "HOLIDAY"
									? "BNPI DM4 repair: holiday status preserved; no complete source clock pair."
									: "BNPI DM4 repair: no complete source clock pair; marked absent/rest according to employee schedule.",
					},
				}),
				...(obligation?.id
					? [
							prisma.attendanceObligation.update({
								where: { id: obligation.id },
								data: {
						status: nextStatus,
						scheduleSnapshot: nextSnapshot,
						scheduleFingerprint: nextSnapshot.scheduleCode,
						timeBreak: nextTimeBreak,
						hoursWorked: nextHours,
									regularHours: nextRegularHours,
									overtimeHours: nextOvertimeHours,
									undertimeHours: "0:00",
									lateHours: "0:00",
									earlyOutHours: "0:00",
									breakMinutes: nextBreakMinutes,
									metadata: {
										...(obligation.metadata &&
										typeof obligation.metadata === "object" &&
										!Array.isArray(obligation.metadata)
											? obligation.metadata
											: {}),
										saturdayScheduleRepair: nextMetadata.saturdayScheduleRepair,
									} as any,
								},
							}),
						]
					: []),
				...(line.attendanceId
					? [
							prisma.attendance.update({
								where: { id: line.attendanceId },
								data: {
									scheduleSnapshot: nextSnapshot,
									timeBreak: nextTimeBreak,
									hoursWorked: nextHours,
									regularHours: nextRegularHours,
									overtimeHours: nextOvertimeHours,
									undertimeHours: "0:00",
									lateHours: "0:00",
									earlyOutHours: "0:00",
									breakMinutes: nextBreakMinutes,
									notes:
										hasCompleteClock
											? "BNPI DM4 repair: hours recalculated from imported biometric time in/out."
											: nextStatus === "HOLIDAY"
												? "BNPI DM4 repair: holiday status preserved; no complete source clock pair."
												: "BNPI DM4 repair: no complete source clock pair; marked absent/rest according to employee schedule.",
								},
							}),
						]
					: []),
			]);
		}
		repaired += 1;
		touchedTimesheetIds.add(line.timesheetId);
		if (samples.length < 25) {
				samples.push({
				employeeId: scheduleEmployee?.employeeId || line.employeeCodeSnapshot,
				date: key,
				timesheetCode: line.timesheet.code,
				from: previousSnapshot,
				to: nextStatus,
				hoursWorked: nextHours,
				regularHours: nextRegularHours,
				overtimeHours: nextOvertimeHours,
				scheduleCode: nextSnapshot.scheduleCode,
			});
		}
	}
	}

	let materializedMissingLines = 0;
	const timesheets = await prisma.timesheet.findMany({
		where: {
			organizationId: organization.id,
			isDeleted: false,
			payrollPeriodId: { in: periodIds },
			status: { in: ["SUBMITTED", "APPROVED", "REVISED", "REJECTED"] as any },
		},
		select: {
			id: true,
			code: true,
			employeeId: true,
			payrollPeriodId: true,
			timesheetlines: {
				where: { isDeleted: false, isEffective: true },
				select: { date: true },
			},
		},
	});
	const timesheetEmployeeIds = Array.from(new Set(timesheets.map((timesheet) => timesheet.employeeId)));
	const employees = await prisma.employee.findMany({
		where: {
			organizationId: organization.id,
			id: { in: timesheetEmployeeIds },
			isDeleted: false,
		},
		select: {
			id: true,
			employeeId: true,
			embeddedSchedule: true,
			employmentStartDate: true,
			employmentHireDate: true,
			reportToId: true,
			workforceSource: true,
			agencyId: true,
			person: { select: { personalInfo: true } },
			departmentId: true,
			department: { select: { name: true } },
			scheduleOverrides: {
				where: {
					organizationId: organization.id,
					isDeleted: false,
					date: { gte: fromDate, lte: toDate },
				},
				select: {
					id: true,
					date: true,
					shiftTypeId: true,
					shiftSnapshot: true,
					isDeleted: true,
					createdAt: true,
					updatedAt: true,
				},
			},
			scheduleHistoryRecords: {
				where: { organizationId: organization.id },
				orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
				select: {
					effectiveAt: true,
					createdAt: true,
					beforeSchedule: true,
					afterSchedule: true,
				},
			},
		},
	});
	const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
	const shiftTypeIds = Array.from(
		new Set(employees.flatMap((employee) => collectShiftTypeIdsFromEmployeeScheduleData(employee))),
	);
	const shiftTypes = shiftTypeIds.length
		? await (prisma as any).shiftType.findMany({
				where: {
					organizationId: organization.id,
					isDeleted: false,
					id: { in: shiftTypeIds },
				},
			})
		: [];
	const shiftTypeById = new Map<string, any>(
		shiftTypes.map((shiftType: any) => [String(shiftType.id), shiftType]),
	);
	const attendances = await prisma.attendance.findMany({
		where: {
			organizationId: organization.id,
			employeeId: { in: timesheetEmployeeIds },
			date: { gte: fromDate, lte: toDate },
			isDeleted: false,
			isEffective: true,
		},
		orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
	});
	const attendanceByEmployeeDate = new Map<string, any>();
	for (const attendance of attendances) {
		if (!attendance.date) continue;
		const attendanceKey = `${attendance.employeeId}:${dateKey(attendance.date)}`;
		if (!attendanceByEmployeeDate.has(attendanceKey)) {
			attendanceByEmployeeDate.set(attendanceKey, attendance);
		}
	}
	const obligations = await (prisma as any).attendanceObligation.findMany({
		where: {
			organizationId: organization.id,
			employeeId: { in: timesheetEmployeeIds },
			payrollPeriodId: { in: periodIds },
			date: { gte: fromDate, lte: toDate },
			isDeleted: false,
		},
		select: { id: true, employeeId: true, payrollPeriodId: true, date: true, metadata: true },
	});
	const obligationByEmployeePeriodDate = new Map<string, any>(
		obligations.map((obligation: any) => [
			`${obligation.employeeId}:${obligation.payrollPeriodId}:${dateKey(obligation.date)}`,
			obligation,
		]),
	);
	const periodById = new Map(periods.map((period) => [period.id, period]));

	for (const timesheet of timesheets) {
		const period = periodById.get(timesheet.payrollPeriodId);
		const employee = employeeById.get(timesheet.employeeId);
		if (!period || !employee) continue;
		const existingDateKeys = new Set(timesheet.timesheetlines.map((line) => dateKey(line.date)));
		for (const date of eachDateInclusive(period.startDate, period.endDate)) {
			const key = dateKey(date);
			if (existingDateKeys.has(key)) continue;
			let resolvedShift = resolveEffectiveShiftFromEmployeeData(employee, date, shiftTypeById);
			if (!resolvedShift) {
				const migrationResolved = resolveEmployeeScheduleSnapshotForDate(employee, date);
				if (migrationResolved) resolvedShift = migrationResolved;
			}
			const attendance = attendanceByEmployeeDate.get(`${timesheet.employeeId}:${key}`);
			const isHoliday = holidayKeys.has(key);
			const nextSnapshot = resolvedShift
				? buildSnapshot(resolvedShift, attendance?.scheduleSnapshot || null)
				: null;
			const breakMinutes = resolvedShift?.isOff
				? 0
				: Math.max(0, Number(nextSnapshot?.breakMinutes || 0));
			const actualWorkedMinutes = attendance ? workedMinutesFromClock(attendance, breakMinutes) : null;
			const hasCompleteClock = actualWorkedMinutes !== null;
			const status = isHoliday
				? "HOLIDAY"
				: !resolvedShift
					? "NO_SCHEDULE"
					: resolvedShift.isOff
						? "REST_DAY"
						: hasCompleteClock
							? String(attendance?.status || "PRESENT").toUpperCase()
							: "ABSENT";
			const totalMinutes = hasCompleteClock ? actualWorkedMinutes : 0;
			const splitMinutes = splitWorkedMinutes(totalMinutes, Number(nextSnapshot?.regularMinutes || 0));
			const metadata = buildTimesheetDaySnapshotMetadata({
				baseMetadata: {
					source: "repair-bnpi-dm4-saturday-schedules",
					scheduleRepair: {
						source: "repair-bnpi-dm4-saturday-schedules",
						code: resolvedShift ? "MISSING_LINE_MATERIALIZED" : "NO_EMPLOYEE_SCHEDULE",
						repairedAt: new Date().toISOString(),
					},
					totalMinutes,
					regularMinutes: splitMinutes.regularMinutes,
					overtimeMinutes: splitMinutes.overtimeMinutes,
					breakMinutes,
				},
				source: {
					type: attendance?.id ? "ATTENDANCE" : "MANUAL_BREAKDOWN",
					id: attendance?.id || null,
					status,
					reason: "DM4_TIMESHEET_LINE_REPAIR",
				},
				marker:
					status === "HOLIDAY" ||
					status === "REST_DAY" ||
					status === "ABSENT" ||
					status === "NO_SCHEDULE"
						? status
						: "HOURS",
				schedule: nextSnapshot,
				snapshottedAt: new Date(),
			});
			if (executionMode.execute) {
				const employeeName = [
					(employee.person?.personalInfo as any)?.firstName,
					(employee.person?.personalInfo as any)?.lastName,
				]
					.filter(Boolean)
					.join(" ")
					.trim();
				const line = await writeEffectiveTimesheetLine(prisma, {
					organizationId: organization.id,
					timesheetId: timesheet.id,
					date,
					versionMode: "update",
					ledgerType: "SYSTEM_REBUILD",
					data: {
						organizationId: organization.id,
						employeeId: timesheet.employeeId,
						payrollPeriodId: timesheet.payrollPeriodId,
						timesheetId: timesheet.id,
						attendanceId: attendance?.id || null,
						date,
						timeIn: attendance?.timeIn || null,
						timeBreak: attendance?.timeBreak || null,
						timeOut: attendance?.timeOut || null,
						status,
						behaviorFlags: Array.isArray(attendance?.behaviorFlags)
							? attendance.behaviorFlags
							: [],
						scheduleSnapshot: nextSnapshot || Prisma.JsonNull,
						hoursWorked: minutesToHours(totalMinutes),
						regularHours: minutesToHours(splitMinutes.regularMinutes),
						overtimeHours: minutesToHours(splitMinutes.overtimeMinutes),
						undertimeHours: "0:00",
						lateHours: "0:00",
						earlyOutHours: "0:00",
						breakMinutes,
						metadata: metadata as any,
						primaryMarker: status,
						isManualEntry: false,
						isVirtual: !attendance?.id,
						employeeCodeSnapshot: employee.employeeId,
						employeeNameSnapshot: employeeName || employee.employeeId,
						departmentIdSnapshot: employee.departmentId || null,
						departmentNameSnapshot: employee.department?.name || null,
						reportToIdSnapshot: employee.reportToId || null,
						workforceSourceSnapshot: employee.workforceSource || null,
						agencyIdSnapshot: employee.agencyId || null,
						notes:
							status === "ABSENT"
								? "BNPI DM4 repair: scheduled workday with no attendance evidence; marked absent."
								: status === "REST_DAY"
									? "BNPI DM4 repair: scheduled off/rest day materialized."
									: status === "NO_SCHEDULE"
										? "BNPI DM4 repair: no source-backed schedule assignment for this date."
										: "BNPI DM4 repair: missing timesheet day materialized.",
						isDeleted: false,
					},
				});
				const obligation = obligationByEmployeePeriodDate.get(
					`${timesheet.employeeId}:${timesheet.payrollPeriodId}:${key}`,
				);
				if (obligation?.id) {
					await (prisma as any).attendanceObligation.update({
						where: { id: obligation.id },
						data: {
							timesheetId: timesheet.id,
							timesheetlineId: line.id,
							status,
							scheduleSnapshot: nextSnapshot || Prisma.JsonNull,
							scheduleFingerprint: nextSnapshot?.scheduleCode || null,
							hoursWorked: minutesToHours(totalMinutes),
							regularHours: minutesToHours(splitMinutes.regularMinutes),
							overtimeHours: minutesToHours(splitMinutes.overtimeMinutes),
							undertimeHours: "0:00",
							lateHours: "0:00",
							earlyOutHours: "0:00",
							breakMinutes,
							metadata: {
								...(obligation.metadata &&
								typeof obligation.metadata === "object" &&
								!Array.isArray(obligation.metadata)
									? obligation.metadata
									: {}),
								scheduleRepair: (metadata as any).scheduleRepair,
							} as any,
						},
					});
				}
			}
			materializedMissingLines += 1;
			repaired += 1;
			touchedTimesheetIds.add(timesheet.id);
			if (samples.length < 25) {
				samples.push({
					employeeId: employee.employeeId,
					date: key,
					timesheetCode: timesheet.code,
					from: { status: "MISSING_LINE" },
					to: status,
					hoursWorked: minutesToHours(totalMinutes),
					regularHours: minutesToHours(splitMinutes.regularMinutes),
					overtimeHours: minutesToHours(splitMinutes.overtimeMinutes),
					scheduleCode: nextSnapshot?.scheduleCode || null,
				});
			}
		}
	}

	if (executionMode.execute) {
		const touchedIds = Array.from(touchedTimesheetIds);
		for (const timesheetIdChunk of chunk(touchedIds, 500)) {
			const aggregateRows = await aggregateEffectiveLineTotals(organization.id, timesheetIdChunk);
			await mapWithConcurrency(aggregateRows, updateConcurrency, async (totals) => {
				await prisma.timesheet.update({
					where: { id: totals.timesheetId },
				data: {
						totalDays: Number(totals.totalDays),
						totalHoursWorked: minutesToHours(Number(totals.worked)),
						totalRegularHours: minutesToHours(Number(totals.regular)),
						totalOvertimeHours: minutesToHours(Number(totals.overtime)),
						totalUndertimeHours: minutesToHours(Number(totals.undertime)),
						totalLateHours: minutesToHours(Number(totals.late)),
						totalEarlyOutHours: minutesToHours(Number(totals.earlyOut)),
						metadata: {
							lineAggregateRepair: {
								source: "repair-bnpi-dm4-saturday-schedules",
								repairedAt: new Date().toISOString(),
								totalMinutesWorked: Number(totals.worked),
								totalRegularMinutes: Number(totals.regular),
								totalOvertimeMinutes: Number(totals.overtime),
								totalUndertimeMinutes: Number(totals.undertime),
								totalLateMinutes: Number(totals.late),
								totalEarlyOutMinutes: Number(totals.earlyOut),
							},
						} as any,
					},
				});
			});
		}
	}

	console.log(
		JSON.stringify(
			{
				organization,
				periods: periods.map((period) => ({
					id: period.id,
					code: period.code,
					startDate: dateKey(period.startDate),
					endDate: dateKey(period.endDate),
				})),
				dryRun: executionMode.dryRun,
				fastPathIndexes,
				batchSize,
				updateConcurrency,
				scanned,
				repaired,
				materializedMissingLines,
				skippedNoChange,
				skippedNoWorkSchedule,
				skippedPaid,
				samples,
				idempotency: summarizeIdempotentBackfillRun({
					scanned,
					created: 0,
					updated: repaired,
					skippedExisting: skippedNoChange + skippedNoWorkSchedule + skippedPaid,
					failures: 0,
					dryRun: executionMode.dryRun,
				}),
			},
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
