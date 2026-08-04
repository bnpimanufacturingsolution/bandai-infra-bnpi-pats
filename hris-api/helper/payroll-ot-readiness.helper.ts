/**
 * Period OT readiness ΓÇö approved OT on effective timesheet lines / timesheet totals.
 *
 * Perf strategy (Run Payroll accordion must not hang on ~800 timesheets ├ù N lines):
 * 1) Light timesheet list (status + totalOvertimeHours + employee) ΓÇö no nested lines
 * 2) SQL aggregate only effective lines that carry OT (skips empty day rows)
 * 3) Attendance OT compared only for the current page (optional deep-load)
 *
 * Payable source: timesheet_lines.overtimeHours (effective). Fallback: timesheets.totalOvertimeHours.
 * Raw attendance is evidence only.
 */
import type { PrismaClient } from "../generated/prisma";
import { Prisma } from "../generated/prisma";

function parseDurationToMinutes(value?: string | null): number {
	if (!value || typeof value !== "string" || !value.includes(":")) {
		const asNum = Number(String(value || "").replace(/,/g, ""));
		return Number.isFinite(asNum) && asNum > 0 ? Math.round(asNum * 60) : 0;
	}
	const [hours, minutes] = value.split(":").map(Number);
	if (Number.isNaN(hours) || Number.isNaN(minutes)) return 0;
	return hours * 60 + minutes;
}

function minutesToHours(minutes: number): number {
	return Math.round((minutes / 60) * 100) / 100;
}

function formatMinutesAsHhMm(minutes: number): string {
	const safe = Math.max(0, Math.round(minutes));
	const h = Math.floor(safe / 60);
	const m = safe % 60;
	return `${h}:${String(m).padStart(2, "0")}`;
}

/** HH:MM or decimal hours ΓåÆ minutes (Postgres). Column: l."overtimeHours" */
const LINE_OT_MINUTES_SQL = Prisma.sql`
  CASE
    WHEN l."overtimeHours" IS NULL OR btrim(l."overtimeHours") = '' THEN 0
    WHEN l."overtimeHours" LIKE '%:%' THEN
      COALESCE(NULLIF(split_part(l."overtimeHours", ':', 1), '')::int, 0) * 60
      + COALESCE(NULLIF(split_part(l."overtimeHours", ':', 2), '')::int, 0)
    ELSE
      ROUND(COALESCE(NULLIF(regexp_replace(l."overtimeHours", '[^0-9.\\-]', '', 'g'), '')::numeric, 0) * 60)::int
  END
`;

export type PayrollOtReadinessPerson = {
	employeeId: string;
	employeeCode: string | null;
	name: string;
	department: string | null;
	timesheetId: string;
	timesheetStatus: string;
	timesheetOtHours: string;
	timesheetOtMinutes: number;
	lineOtHours: string;
	lineOtMinutes: number;
	attendanceOtHours: string;
	attendanceOtMinutes: number;
	deltaMinutes: number;
	deltaHours: number;
	lineDaysWithOt: number;
	blockerClass:
		| "ok"
		| "ot_on_lines_only"
		| "attendance_ot_without_line"
		| "no_ot"
		| "timesheet_not_approved";
	nextStep: string;
};

export type PayrollOtReadinessResult = {
	period: {
		id: string;
		code: string | null;
		name: string | null;
		startDate: string;
		endDate: string;
		periodNumber: number | null;
		status: string;
	};
	truth: {
		payableSource: "timesheetline.overtimeHours (effective) / timesheet.totalOvertimeHours";
		rawAttendanceRole: "punch evidence only ΓÇö not payable OT without approved OT ΓåÆ lines";
		note: string;
	};
	summary: {
		timesheetsTotal: number;
		timesheetsApproved: number;
		peopleWithLineOt: number;
		peopleWithTimesheetOtSummary: number;
		peopleWithoutOt: number;
		totalLineOtMinutes: number;
		totalLineOtHours: number;
		totalAttendanceOtMinutes: number;
		totalAttendanceOtHours: number;
		totalDeltaMinutes: number;
	};
	people: PayrollOtReadinessPerson[];
	pagination: {
		page: number;
		limit: number;
		totalItems: number;
		totalPages: number;
		hasNextPage: boolean;
	};
	queryMeta?: {
		strategy: "summary_first_sql_line_agg_page";
		pageLimit: number;
		onlyWithOt: boolean;
		lightTimesheets: number;
		lineAggRows: number;
		deepLoaded: number;
	};
};

function employeeDisplayName(employee: any): string {
	const personal = employee?.person?.personalInfo || {};
	const parts = [personal.firstName, personal.middleName, personal.lastName]
		.map((part: unknown) => String(part || "").trim())
		.filter(Boolean);
	return parts.join(" ") || employee?.employeeId || "Employee";
}

function classifyPerson(input: {
	status: string;
	summaryMin: number;
	lineOtMinutes: number;
	attendanceOtMinutes: number;
}): {
	blockerClass: PayrollOtReadinessPerson["blockerClass"];
	nextStep: string;
	deltaMinutes: number;
} {
	const { status, summaryMin, lineOtMinutes, attendanceOtMinutes } = input;
	const payableMinutes = lineOtMinutes > 0 ? lineOtMinutes : summaryMin;
	const deltaMinutes = lineOtMinutes - attendanceOtMinutes;
	let blockerClass: PayrollOtReadinessPerson["blockerClass"] = "no_ot";
	let nextStep =
		"No OT on effective lines ΓÇö import approved OT workbook (DM4.3) if expected.";
	if (payableMinutes > 0 && status === "APPROVED") {
		blockerClass =
			attendanceOtMinutes > 0 && Math.abs(deltaMinutes) > 1
				? "ot_on_lines_only"
				: "ok";
		nextStep =
			blockerClass === "ok"
				? "Payable OT on lines; ready for Run Payroll OT pay."
				: "Line OT differs from attendance.overtimeHours ΓÇö payroll uses lines (approved OT), not raw punches.";
	} else if (payableMinutes > 0 && status !== "APPROVED") {
		blockerClass = "timesheet_not_approved";
		nextStep = `Timesheet status ${status || "UNKNOWN"} ΓÇö approve timesheet before payroll pays OT.`;
	} else if (attendanceOtMinutes > 0 && payableMinutes === 0) {
		blockerClass = "attendance_ot_without_line";
		nextStep =
			"Attendance has overtimeHours but lines are empty ΓÇö apply approved OT report to timesheet lines.";
	}
	return { blockerClass, nextStep, deltaMinutes };
}

type LineAgg = {
	timesheetId: string;
	lineOtMinutes: number;
	lineDaysWithOt: number;
};

async function loadLineOtAggregates(
	prisma: PrismaClient,
	params: { organizationId: string; payrollPeriodId: string },
): Promise<Map<string, LineAgg>> {
	// Only rows that may carry OT ΓÇö skip empty day lines (~15├ù smaller than full hydrate).
	const rows = await prisma.$queryRaw<
		Array<{
			timesheetId: string;
			lineOtMinutes: number | bigint;
			lineDaysWithOt: number | bigint;
		}>
	>`
		SELECT
			l."timesheetId" AS "timesheetId",
			COALESCE(SUM(${LINE_OT_MINUTES_SQL}), 0)::int AS "lineOtMinutes",
			COUNT(*) FILTER (WHERE (${LINE_OT_MINUTES_SQL}) > 0)::int AS "lineDaysWithOt"
		FROM timesheet_lines l
		WHERE l."organizationId" = ${params.organizationId}
			AND l."payrollPeriodId" = ${params.payrollPeriodId}
			AND l."isDeleted" = false
			AND l."isEffective" = true
			AND l."overtimeHours" IS NOT NULL
			AND btrim(l."overtimeHours") <> ''
			AND btrim(l."overtimeHours") NOT IN ('0:00', '0', '00:00')
		GROUP BY l."timesheetId"
	`;
	const map = new Map<string, LineAgg>();
	for (const row of rows) {
		map.set(row.timesheetId, {
			timesheetId: row.timesheetId,
			lineOtMinutes: Number(row.lineOtMinutes || 0),
			lineDaysWithOt: Number(row.lineDaysWithOt || 0),
		});
	}
	return map;
}

async function loadPageAttendanceOt(
	prisma: PrismaClient,
	timesheetIds: string[],
): Promise<Map<string, number>> {
	const map = new Map<string, number>();
	if (timesheetIds.length === 0) return map;

	const lines = await prisma.timesheetline.findMany({
		where: {
			timesheetId: { in: timesheetIds },
			isDeleted: false,
			isEffective: true,
			attendanceId: { not: null },
		},
		select: {
			timesheetId: true,
			attendance: { select: { overtimeHours: true } },
		},
	});
	for (const line of lines) {
		const add = parseDurationToMinutes(line.attendance?.overtimeHours);
		if (add <= 0) continue;
		map.set(line.timesheetId, (map.get(line.timesheetId) || 0) + add);
	}
	return map;
}

export async function getPayrollPeriodOtReadiness(
	prisma: PrismaClient,
	params: {
		payrollPeriodId: string;
		organizationId: string;
		page?: number;
		limit?: number;
		query?: string;
		onlyWithOt?: boolean;
	},
): Promise<PayrollOtReadinessResult> {
	const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
	const limit =
		params.limit && params.limit > 0 ? Math.min(Math.floor(params.limit), 100) : 25;
	const query = String(params.query || "").trim().toLowerCase();
	const onlyWithOt = params.onlyWithOt !== false;

	const period = await prisma.payrollPeriod.findFirst({
		where: {
			id: params.payrollPeriodId,
			organizationId: params.organizationId,
			isDeleted: false,
		},
		select: {
			id: true,
			code: true,
			name: true,
			startDate: true,
			endDate: true,
			periodNumber: true,
			status: true,
		},
	});
	if (!period) {
		throw new Error(`Payroll period not found: ${params.payrollPeriodId}`);
	}

	// Phase 1: light timesheets ΓÇö prefer totalOvertimeHours for list filtering.
	const timesheets = await prisma.timesheet.findMany({
		where: {
			organizationId: params.organizationId,
			payrollPeriodId: params.payrollPeriodId,
			isDeleted: false,
		},
		select: {
			id: true,
			status: true,
			totalOvertimeHours: true,
			employeeId: true,
			employee: {
				select: {
					id: true,
					employeeId: true,
					person: { select: { personalInfo: true } },
					department: { select: { name: true } },
				},
			},
		},
		orderBy: [{ employeeId: "asc" }],
	});

	// Phase 2: SQL aggregate of non-empty line OT only (no attendance join).
	const lineAgg = await loadLineOtAggregates(prisma, {
		organizationId: params.organizationId,
		payrollPeriodId: params.payrollPeriodId,
	});

	type Light = {
		employeeId: string;
		employeeCode: string | null;
		name: string;
		department: string | null;
		timesheetId: string;
		timesheetStatus: string;
		summaryMin: number;
		lineOtMinutes: number;
		lineDaysWithOt: number;
	};

	const light: Light[] = timesheets.map((ts) => {
		const agg = lineAgg.get(ts.id);
		return {
			employeeId: ts.employeeId,
			employeeCode: ts.employee?.employeeId || null,
			name: employeeDisplayName(ts.employee),
			department: ts.employee?.department?.name || null,
			timesheetId: ts.id,
			timesheetStatus: String(ts.status || ""),
			summaryMin: parseDurationToMinutes(ts.totalOvertimeHours),
			lineOtMinutes: agg?.lineOtMinutes ?? 0,
			lineDaysWithOt: agg?.lineDaysWithOt ?? 0,
		};
	});

	const filtered = light.filter((person) => {
		if (!query) return true;
		const hay = [
			person.name,
			person.employeeCode,
			person.department,
			person.timesheetStatus,
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase();
		return hay.includes(query);
	});

	const withLineOt = light.filter((p) => p.lineOtMinutes > 0);
	const withSummaryOt = light.filter((p) => p.summaryMin > 0);
	const listSource = onlyWithOt
		? filtered.filter((p) => p.lineOtMinutes > 0 || p.summaryMin > 0)
		: filtered;

	// Prefer people with line OT first, then summary OT, then code.
	listSource.sort((a, b) => {
		if (b.lineOtMinutes !== a.lineOtMinutes) return b.lineOtMinutes - a.lineOtMinutes;
		if (b.summaryMin !== a.summaryMin) return b.summaryMin - a.summaryMin;
		return String(a.employeeCode || "").localeCompare(String(b.employeeCode || ""));
	});

	const totalItems = listSource.length;
	const totalPages = Math.max(1, Math.ceil(Math.max(totalItems, 1) / limit));
	const safePage = Math.min(page, totalPages);
	const skip = (safePage - 1) * limit;
	const pageLight = listSource.slice(skip, skip + limit);

	// Phase 3: attendance OT only for current page (capped).
	const pageIds = pageLight.map((p) => p.timesheetId);
	const pageAttOt = await loadPageAttendanceOt(prisma, pageIds);

	const people: PayrollOtReadinessPerson[] = pageLight.map((person) => {
		const attendanceOtMinutes = pageAttOt.get(person.timesheetId) || 0;
		const { blockerClass, nextStep, deltaMinutes } = classifyPerson({
			status: person.timesheetStatus,
			summaryMin: person.summaryMin,
			lineOtMinutes: person.lineOtMinutes,
			attendanceOtMinutes,
		});
		return {
			employeeId: person.employeeId,
			employeeCode: person.employeeCode,
			name: person.name,
			department: person.department,
			timesheetId: person.timesheetId,
			timesheetStatus: person.timesheetStatus,
			timesheetOtHours: formatMinutesAsHhMm(person.summaryMin),
			timesheetOtMinutes: person.summaryMin,
			lineOtHours: formatMinutesAsHhMm(person.lineOtMinutes),
			lineOtMinutes: person.lineOtMinutes,
			attendanceOtHours: formatMinutesAsHhMm(attendanceOtMinutes),
			attendanceOtMinutes,
			deltaMinutes,
			deltaHours: minutesToHours(deltaMinutes),
			lineDaysWithOt: person.lineDaysWithOt,
			blockerClass,
			nextStep,
		};
	});

	const totalLineOtMinutes = light.reduce((sum, p) => sum + p.lineOtMinutes, 0);
	// Page-scoped attendance sum is not period total; keep period attendance as 0 unless
	// we deep-load all (expensive). Summary truth for pay is line OT.
	const totalAttendanceOtMinutes = 0;

	return {
		period: {
			id: period.id,
			code: period.code,
			name: period.name,
			startDate: period.startDate.toISOString(),
			endDate: period.endDate.toISOString(),
			periodNumber: period.periodNumber,
			status: period.status,
		},
		truth: {
			payableSource:
				"timesheetline.overtimeHours (effective) / timesheet.totalOvertimeHours",
			rawAttendanceRole:
				"punch evidence only ΓÇö not payable OT without approved OT ΓåÆ lines",
			note: "BNPI: import biometrics then approved OT workbook into timesheet lines before Run Payroll. List uses timesheet summary first; line OT via SQL aggregate of non-empty lines only.",
		},
		summary: {
			timesheetsTotal: light.length,
			timesheetsApproved: light.filter((p) => p.timesheetStatus === "APPROVED").length,
			peopleWithLineOt: withLineOt.length,
			peopleWithTimesheetOtSummary: withSummaryOt.length,
			peopleWithoutOt: Math.max(0, light.length - withLineOt.length),
			totalLineOtMinutes,
			totalLineOtHours: minutesToHours(totalLineOtMinutes),
			totalAttendanceOtMinutes,
			totalAttendanceOtHours: minutesToHours(totalAttendanceOtMinutes),
			totalDeltaMinutes: totalLineOtMinutes - totalAttendanceOtMinutes,
		},
		people,
		pagination: {
			page: safePage,
			limit,
			totalItems,
			totalPages,
			hasNextPage: safePage < totalPages,
		},
		queryMeta: {
			strategy: "summary_first_sql_line_agg_page",
			pageLimit: limit,
			onlyWithOt,
			lightTimesheets: timesheets.length,
			lineAggRows: lineAgg.size,
			deepLoaded: pageIds.length,
		},
	};
}
