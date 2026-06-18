import { Prisma, type PrismaClient } from "../generated/prisma";

const BUSINESS_TIME_ZONE = "Asia/Manila";
const BUSINESS_UTC_OFFSET_MINUTES = 8 * 60;
const ELIGIBLE_STATUSES = ["ACTIVE", "ONBOARDING"];

type RepairParams = {
	organizationId: string;
	employeeIds?: string[];
	currentOnly?: boolean;
	prepareTimesheetDrafts?: boolean;
	fromDate?: Date | string;
	toDate?: Date | string;
	onProgress?: (progress: Record<string, any>) => void | Promise<void>;
	onRowEvents?: (rows: Array<{
		employeeCode: string;
		employeeName: string;
		businessDate: string;
		payrollPeriodCode: string;
		status: string;
		scheduleCode?: string | null;
	}>) => void | Promise<void>;
};

const toDateOnlyUtc = (value: Date | string) => {
	const parsed = value instanceof Date ? value : new Date(`${value}T00:00:00.000Z`);
	const date = new Date(parsed);
	date.setUTCHours(0, 0, 0, 0);
	return date;
};

const normalizeEndDate = (date: Date) => {
	const end = new Date(date);
	end.setUTCHours(23, 59, 59, 999);
	return end;
};

const nextDate = (date: Date) => {
	const next = new Date(date);
	next.setUTCDate(next.getUTCDate() + 1);
	return next;
};

const dateKey = (date: Date) => toDateOnlyUtc(date).toISOString().slice(0, 10);

const unwrapJsonSetEnvelope = (value: any) =>
	value?.set && typeof value.set === "object" && !Array.isArray(value.set) ? value.set : value;

const getPatternDay = (date: Date) => {
	const day = date.getUTCDay();
	return day === 0 ? 7 : day;
};

const getExpectedDateTime = (businessDate: string, time?: string | null) => {
	if (!time) return null;
	const [hours, minutes] = String(time).split(":").map(Number);
	if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
	return new Date(
		Date.UTC(
			Number(businessDate.slice(0, 4)),
			Number(businessDate.slice(5, 7)) - 1,
			Number(businessDate.slice(8, 10)),
			hours,
			minutes,
			0,
			0,
		) -
			BUSINESS_UTC_OFFSET_MINUTES * 60 * 1000,
	);
};

const getEmployeeName = (employee: any) => {
	const info = employee.person?.personalInfo || {};
	return [info.firstName, info.middleName, info.lastName]
		.map((part) => String(part || "").trim())
		.filter(Boolean)
		.join(" ") || employee.employeeId;
};

const getShiftForDate = (employee: any, date: Date) => {
	const schedule = unwrapJsonSetEnvelope(employee.embeddedSchedule);
	const pattern = Array.isArray(schedule?.pattern) ? schedule.pattern : [];
	const patternDay = pattern.find((item: any) => Number(item?.day) === getPatternDay(date));
	const snapshot = patternDay?.shiftSnapshot || null;
	if (!snapshot) return null;
	const workWindow = getWorkWindow(snapshot);
	return {
		...snapshot,
		source: "template",
		startTime: snapshot.startTime || workWindow.startTime || null,
		endTime: snapshot.endTime || workWindow.endTime || null,
		shiftTypeId: patternDay?.shiftTypeId || snapshot.shiftTypeId || null,
		shiftTypeCode: snapshot.shiftTypeCode || snapshot.code || null,
		shiftTypeName: snapshot.shiftTypeName || snapshot.name || null,
		scheduleTemplateId: schedule?.templateId || snapshot.scheduleTemplateId || null,
		scheduleTemplateCode:
			snapshot.scheduleTemplateCode || schedule?.templateCode || snapshot.templateCode || null,
		scheduleTemplateName:
			snapshot.scheduleTemplateName || schedule?.templateName || snapshot.templateName || null,
		templateId: schedule?.templateId || null,
		templateCode: schedule?.templateCode || null,
		templateName: schedule?.templateName || null,
	};
};

const getWorkWindow = (snapshot: any) => {
	const workSlots = Array.isArray(snapshot?.timeSlots)
		? snapshot.timeSlots.filter((slot: any) => String(slot?.type || "work").toLowerCase() === "work")
		: [];
	if (!workSlots.length) return { startTime: null, endTime: null };
	return {
		startTime: workSlots[0]?.startTime || null,
		endTime: workSlots[workSlots.length - 1]?.endTime || null,
	};
};

const buildScheduleFingerprint = (snapshot: any) =>
	[
		snapshot?.scheduleTemplateCode || snapshot?.templateCode,
		snapshot?.shiftTypeCode || snapshot?.code,
		snapshot?.startTime,
		snapshot?.endTime,
		snapshot?.isOff ? "off" : "work",
	]
		.filter(Boolean)
		.join(":") || null;

const countPeriodDays = (period: { startDate: Date; endDate: Date }) => {
	let count = 0;
	for (let cursor = toDateOnlyUtc(period.startDate); cursor <= toDateOnlyUtc(period.endDate); cursor = nextDate(cursor)) {
		count += 1;
	}
	return count;
};

export async function ensureDm3ScheduleBackedAttendanceObligations(
	prisma: PrismaClient,
	params: RepairParams,
) {
	const targetDate = toDateOnlyUtc(params.fromDate || new Date());
	const currentPeriodOnly =
		params.currentOnly !== false && !params.fromDate && !params.toDate;
	const periodWhere: any = {
		organizationId: params.organizationId,
		isDeleted: false,
		status: { in: ["OPEN", "PROCESSING"] },
	};
	if (currentPeriodOnly) {
		periodWhere.startDate = { lte: normalizeEndDate(targetDate) };
		periodWhere.endDate = { gte: targetDate };
	} else {
		if (params.fromDate) periodWhere.endDate = { gte: toDateOnlyUtc(params.fromDate) };
		if (params.toDate) periodWhere.startDate = { lte: normalizeEndDate(toDateOnlyUtc(params.toDate)) };
	}

	const periods = await prisma.payrollPeriod.findMany({
		where: periodWhere,
		select: { id: true, code: true, startDate: true, endDate: true, payFrequency: true },
		orderBy: { startDate: "asc" },
	});
	const employees = await prisma.employee.findMany({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			...(params.employeeIds?.length ? { id: { in: params.employeeIds } } : {}),
			employmentStatus: { in: ELIGIBLE_STATUSES as any },
			NOT: { embeddedSchedule: { equals: null as any } },
		},
		select: {
			id: true,
			employeeId: true,
			employmentStartDate: true,
			employmentHireDate: true,
			payFrequency: true,
			embeddedSchedule: true,
			departmentId: true,
			reportToId: true,
			workforceSource: true,
			agencyId: true,
			person: { select: { personalInfo: true } },
			department: { select: { name: true } },
		},
		orderBy: { employeeId: "asc" },
	});

	const existingBefore = await (prisma as any).attendanceObligation.count({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			payrollPeriodId: { in: periods.map((period) => period.id) },
			...(params.employeeIds?.length ? { employeeId: { in: params.employeeIds } } : {}),
		},
	});

	const rows: any[] = [];
	let skippedPayFrequency = 0;
	const expectedScheduledEmployeeDays = periods.reduce(
		(total, period) => total + countPeriodDays(period) * employees.length,
		0,
	);
	await params.onProgress?.({
		status: periods.length === 0 ? "BLOCKED" : employees.length === 0 ? "BLOCKED" : "GOAL_LOCKED",
		periodsProcessed: periods.length,
		periods: periods.map((period) => ({
			id: period.id,
			code: period.code,
			startDate: dateKey(period.startDate),
			endDate: dateKey(period.endDate),
			days: countPeriodDays(period),
		})),
		employeesWithSchedules: employees.length,
		targetBatches: periods.reduce((total, period) => total + countPeriodDays(period), 0),
		expectedScheduledEmployeeDays,
		processedBatches: 0,
		processedEmployeeDays: 0,
		inserted: 0,
	});
	for (const period of periods) {
		for (const employee of employees) {
			if (period.payFrequency && employee.payFrequency !== period.payFrequency) {
				skippedPayFrequency += 1;
				continue;
			}
			const employmentStart = employee.employmentStartDate || employee.employmentHireDate;
			let cursor = toDateOnlyUtc(period.startDate);
			const end = toDateOnlyUtc(period.endDate);
			while (cursor <= end) {
				if (employmentStart && cursor < toDateOnlyUtc(employmentStart)) {
					cursor = nextDate(cursor);
					continue;
				}
				const shift = getShiftForDate(employee, cursor);
				if (!shift) {
					cursor = nextDate(cursor);
					continue;
				}
				const businessDate = dateKey(cursor);
				const workWindow = getWorkWindow(shift);
				rows.push({
					organizationId: params.organizationId,
					employeeId: employee.id,
					payrollPeriodId: period.id,
					date: cursor,
					businessDate,
					timezone: BUSINESS_TIME_ZONE,
					status: shift.isOff ? "REST_DAY" : "EXPECTED",
					phase: businessDate <= dateKey(new Date()) ? "ACTIVE" : "PLANNED",
					expectedStartAt: getExpectedDateTime(businessDate, workWindow.startTime),
					expectedEndAt: getExpectedDateTime(businessDate, workWindow.endTime),
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					undertimeHours: "0:00",
					lateHours: "0:00",
					earlyOutHours: "0:00",
					breakMinutes: shift.breakMinutes ?? null,
					behaviorFlags: [],
					scheduleSnapshot: shift,
					scheduleFingerprint: buildScheduleFingerprint(shift),
					source: "DM3_ATTENDANCE_OBLIGATION_MATERIALIZATION",
					metadata: {
						reason: "DM3.2 schedule-backed attendance obligation materialization",
						sourceOfTruth: "Employee.embeddedSchedule",
					},
					employeeCodeSnapshot: employee.employeeId,
					employeeNameSnapshot: getEmployeeName(employee),
					departmentIdSnapshot: employee.departmentId,
					departmentNameSnapshot: employee.department?.name || null,
					reportToIdSnapshot: employee.reportToId,
					workforceSourceSnapshot: employee.workforceSource,
					agencyIdSnapshot: employee.agencyId,
					isDeleted: false,
				});
				cursor = nextDate(cursor);
			}
		}
	}

	let inserted = 0;
	let updated = 0;
	let processedBatches = 0;
	for (let i = 0; i < rows.length; i += 1000) {
		const batch = rows.slice(i, i + 1000);
		for (const row of batch) {
			const existing = await (prisma as any).attendanceObligation.findUnique({
				where: {
					organizationId_employeeId_payrollPeriodId_date: {
						organizationId: row.organizationId,
						employeeId: row.employeeId,
						payrollPeriodId: row.payrollPeriodId,
						date: row.date,
					},
				},
				select: {
					id: true,
					attendanceId: true,
					timeIn: true,
					phase: true,
					metadata: true,
				},
			});
			if (!existing) {
				await (prisma as any).attendanceObligation.create({ data: row });
				inserted += 1;
				continue;
			}
			const hasClockEvidence = Boolean(existing.attendanceId || existing.timeIn);
			await (prisma as any).attendanceObligation.update({
				where: { id: existing.id },
				data: {
					expectedStartAt: row.expectedStartAt,
					expectedEndAt: row.expectedEndAt,
					breakMinutes: row.breakMinutes,
					scheduleSnapshot: row.scheduleSnapshot,
					scheduleFingerprint: row.scheduleFingerprint,
					employeeCodeSnapshot: row.employeeCodeSnapshot,
					employeeNameSnapshot: row.employeeNameSnapshot,
					departmentIdSnapshot: row.departmentIdSnapshot,
					departmentNameSnapshot: row.departmentNameSnapshot,
					reportToIdSnapshot: row.reportToIdSnapshot,
					workforceSourceSnapshot: row.workforceSourceSnapshot,
					agencyIdSnapshot: row.agencyIdSnapshot,
					...(hasClockEvidence
						? {}
						: {
								status: row.status,
								phase: row.phase,
								hoursWorked: row.hoursWorked,
								regularHours: row.regularHours,
								overtimeHours: row.overtimeHours,
								undertimeHours: row.undertimeHours,
								lateHours: row.lateHours,
								earlyOutHours: row.earlyOutHours,
								behaviorFlags: row.behaviorFlags,
								source: row.source,
						  }),
					metadata: {
						...((existing.metadata && typeof existing.metadata === "object")
							? existing.metadata
							: {}),
						...row.metadata,
						dm3ScheduleMaterializedAt: new Date().toISOString(),
					},
				},
			});
			updated += 1;
		}
		processedBatches += 1;
		await params.onRowEvents?.(
			batch.map((row) => {
				const period = periods.find((candidate) => candidate.id === row.payrollPeriodId);
				return {
					employeeCode: row.employeeCodeSnapshot,
					employeeName: row.employeeNameSnapshot,
					businessDate: row.businessDate,
					payrollPeriodCode: period?.code || "",
					status: row.status,
					scheduleCode: row.scheduleSnapshot?.templateCode || row.scheduleSnapshot?.code || null,
				};
			}),
		);
		await params.onProgress?.({
			status: "RUNNING",
			periodsProcessed: periods.length,
			employeesWithSchedules: employees.length,
			targetBatches: Math.ceil(rows.length / 1000),
			processedBatches,
			expectedScheduledEmployeeDays,
			processedEmployeeDays: Math.min(rows.length, i + 1000),
			candidateRows: rows.length,
			inserted,
			updated,
		});
	}

	const existingAfter = await (prisma as any).attendanceObligation.count({
		where: {
			organizationId: params.organizationId,
			isDeleted: false,
			payrollPeriodId: { in: periods.map((period) => period.id) },
			...(params.employeeIds?.length ? { employeeId: { in: params.employeeIds } } : {}),
		},
	});
	const blockerReason =
		periods.length === 0
			? "Schedule assignments imported, but attendance obligations need an open payroll period."
			: employees.length === 0
				? "No employees with schedule assignments were imported."
				: null;
	let timesheetDrafts: Record<string, any> | null = null;
	if (periods.length > 0 && params.prepareTimesheetDrafts === true) {
		timesheetDrafts = await prepareDm3ScheduleBackedTimesheetDrafts(prisma, {
			organizationId: params.organizationId,
			employeeIds: params.employeeIds,
			currentOnly: currentPeriodOnly,
			fromDate: params.fromDate,
			toDate: params.toDate,
		});
		await params.onProgress?.({
			status: "RUNNING",
			timesheetDrafts,
		});
	}

	return {
		status: blockerReason ? "BLOCKED" : "COMPLETED",
		blockerReason,
		periodsProcessed: periods.length,
		periods: periods.map((period) => ({
			id: period.id,
			code: period.code,
			startDate: dateKey(period.startDate),
			endDate: dateKey(period.endDate),
			days: countPeriodDays(period),
		})),
		employeesWithSchedules: employees.length,
		candidateRows: rows.length,
		inserted,
		updated,
		existingBefore,
		existingAfter,
		expectedScheduledEmployeeDays,
		remainingScheduledGap: Math.max(0, expectedScheduledEmployeeDays - existingAfter),
		timesheetDrafts,
		skippedPayFrequency,
		targetBatches: Math.ceil(rows.length / 1000),
		processedBatches,
	};
}

export async function prepareDm3ScheduleBackedTimesheetDrafts(
	prisma: PrismaClient,
	params: Omit<RepairParams, "onProgress" | "onRowEvents" | "prepareTimesheetDrafts">,
) {
	const targetDate = toDateOnlyUtc(params.fromDate || new Date());
	const currentPeriodOnly =
		params.currentOnly !== false && !params.fromDate && !params.toDate;
	const periodWhere: any = {
		organizationId: params.organizationId,
		isDeleted: false,
		status: { in: ["OPEN", "PROCESSING"] },
	};
	if (currentPeriodOnly) {
		periodWhere.startDate = { lte: normalizeEndDate(targetDate) };
		periodWhere.endDate = { gte: targetDate };
	} else {
		if (params.fromDate) periodWhere.endDate = { gte: toDateOnlyUtc(params.fromDate) };
		if (params.toDate) periodWhere.startDate = { lte: normalizeEndDate(toDateOnlyUtc(params.toDate)) };
	}

	const targetPeriods = await prisma.payrollPeriod.findMany({
		where: periodWhere,
		select: { id: true, code: true },
		orderBy: { startDate: "asc" },
	});
	if (targetPeriods.length === 0) {
		return {
			status: "BLOCKED",
			blockerReason: "Timesheet draft headers need an open payroll period.",
			periodsProcessed: 0,
			eligibleEmployees: 0,
			existing: 0,
			created: 0,
			refreshed: 0,
			remainingDraftsToPrepare: 0,
			results: [],
		};
	}

	const employeeIds = Array.from(new Set((params.employeeIds || []).filter(Boolean)));
	const employeeFilter = employeeIds.length
		? Prisma.sql`AND e."id" IN (${Prisma.join(employeeIds)})`
		: Prisma.empty;
	const periodIds = targetPeriods.map((period) => period.id);
	const draftResults = await prisma.$queryRaw<Array<{
		payrollPeriodId: string;
		payrollPeriodCode: string;
		eligibleEmployees: bigint | number;
		existing: bigint | number;
		created: bigint | number;
		remainingDraftsToPrepare: bigint | number;
	}>>(Prisma.sql`
		WITH target_periods AS (
			SELECT p."id", p."code", p."payFrequency", p."endDate"
			FROM "payroll_periods" p
			WHERE p."organizationId" = ${params.organizationId}
				AND p."isDeleted" = false
				AND p."id" IN (${Prisma.join(periodIds)})
		),
		eligible AS (
			SELECT
				p."id" AS "payrollPeriodId",
				p."code" AS "payrollPeriodCode",
				e."id" AS "employeeId"
			FROM target_periods p
			JOIN "employees" e
				ON e."organizationId" = ${params.organizationId}
				AND e."isDeleted" = false
				AND e."employmentStatus" IN ('ACTIVE', 'ONBOARDING')
				AND (p."payFrequency" IS NULL OR e."payFrequency" = p."payFrequency")
				AND (e."employmentStartDate" IS NULL OR e."employmentStartDate" <= p."endDate")
				${employeeFilter}
		),
		existing_before AS (
			SELECT t."payrollPeriodId", COUNT(*)::int AS "existing"
			FROM "timesheets" t
			JOIN eligible e
				ON e."payrollPeriodId" = t."payrollPeriodId"
				AND e."employeeId" = t."employeeId"
			WHERE t."organizationId" = ${params.organizationId}
				AND t."isDeleted" = false
			GROUP BY t."payrollPeriodId"
		),
		inserted AS (
			INSERT INTO "timesheets" (
				"id",
				"code",
				"organizationId",
				"employeeId",
				"payrollPeriodId",
				"totalDays",
				"totalHoursWorked",
				"totalRegularHours",
				"totalOvertimeHours",
				"totalUndertimeHours",
				"totalLateHours",
				"totalEarlyOutHours",
				"status",
				"notes",
				"editPermissionStatus",
				"isDeleted",
				"createdAt",
				"updatedAt"
			)
			SELECT
				'dm3ts_' || substr(md5(${params.organizationId} || ':' || e."employeeId" || ':' || e."payrollPeriodId"), 1, 20),
				'DM3-OPEN-' || substr(md5(${params.organizationId} || ':' || e."employeeId" || ':' || e."payrollPeriodId"), 1, 24),
				${params.organizationId},
				e."employeeId",
				e."payrollPeriodId",
				0,
				'0:00',
				'0:00',
				'0:00',
				'0:00',
				'0:00',
				'0:00',
				'DRAFT'::"TimesheetStatus",
				'Prepared draft header from DM3 employee import',
				'NONE'::"TimesheetEditPermissionStatus",
				false,
				NOW(),
				NOW()
			FROM eligible e
			ON CONFLICT ("organizationId", "employeeId", "payrollPeriodId") DO NOTHING
			RETURNING "payrollPeriodId"
		),
		inserted_counts AS (
			SELECT "payrollPeriodId", COUNT(*)::int AS "created"
			FROM inserted
			GROUP BY "payrollPeriodId"
		),
		existing_after AS (
			SELECT t."payrollPeriodId", COUNT(*)::int AS "existingAfter"
			FROM "timesheets" t
			JOIN eligible e
				ON e."payrollPeriodId" = t."payrollPeriodId"
				AND e."employeeId" = t."employeeId"
			WHERE t."organizationId" = ${params.organizationId}
				AND t."isDeleted" = false
			GROUP BY t."payrollPeriodId"
		),
		eligible_counts AS (
			SELECT "payrollPeriodId", "payrollPeriodCode", COUNT(*)::int AS "eligibleEmployees"
			FROM eligible
			GROUP BY "payrollPeriodId", "payrollPeriodCode"
		)
		SELECT
			p."id" AS "payrollPeriodId",
			p."code" AS "payrollPeriodCode",
			COALESCE(ec."eligibleEmployees", 0)::int AS "eligibleEmployees",
			COALESCE(eb."existing", 0)::int AS "existing",
			COALESCE(ic."created", 0)::int AS "created",
			GREATEST(COALESCE(ec."eligibleEmployees", 0) - COALESCE(ea."existingAfter", 0), 0)::int AS "remainingDraftsToPrepare"
		FROM target_periods p
		LEFT JOIN eligible_counts ec ON ec."payrollPeriodId" = p."id"
		LEFT JOIN existing_before eb ON eb."payrollPeriodId" = p."id"
		LEFT JOIN inserted_counts ic ON ic."payrollPeriodId" = p."id"
		LEFT JOIN existing_after ea ON ea."payrollPeriodId" = p."id"
		ORDER BY p."id" ASC
	`);
	if (!draftResults.some((result) => Number(result.eligibleEmployees || 0) > 0)) {
		return {
			status: "BLOCKED",
			blockerReason: "Timesheet draft headers need eligible imported employees.",
			periodsProcessed: targetPeriods.length,
			eligibleEmployees: 0,
			existing: 0,
			created: 0,
			refreshed: 0,
			remainingDraftsToPrepare: 0,
			results: draftResults.map((result) => ({
				payrollPeriodId: result.payrollPeriodId,
				payrollPeriodCode: result.payrollPeriodCode,
				eligibleEmployees: 0,
				existing: 0,
				created: 0,
				refreshed: 0,
				remainingDraftsToPrepare: 0,
			})),
		};
	}
	const normalizedResults = draftResults.map((result) => ({
		payrollPeriodId: result.payrollPeriodId,
		payrollPeriodCode: result.payrollPeriodCode,
		eligibleEmployees: Number(result.eligibleEmployees || 0),
		existing: Number(result.existing || 0),
		created: Number(result.created || 0),
		refreshed: 0,
		remainingDraftsToPrepare: Number(result.remainingDraftsToPrepare || 0),
	}));
	return {
		status: "COMPLETED",
		periodsProcessed: normalizedResults.length,
		eligibleEmployees: normalizedResults.reduce(
			(total, result) => total + Number(result.eligibleEmployees || 0),
			0,
		),
		existing: normalizedResults.reduce((total, result) => total + result.existing, 0),
		created: normalizedResults.reduce((total, result) => total + result.created, 0),
		refreshed: 0,
		remainingDraftsToPrepare: normalizedResults.reduce(
			(total, result) => total + result.remainingDraftsToPrepare,
			0,
		),
		results: normalizedResults,
	};
}
