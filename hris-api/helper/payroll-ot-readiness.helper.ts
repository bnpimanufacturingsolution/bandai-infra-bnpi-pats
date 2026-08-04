/**
 * Period OT readiness — keep Run Payroll Approved OT panel responsive.
 *
 * Fast path (default):
 * - List + summary chips from timesheets.totalOvertimeHours (no full line hydrate)
 * - Deep-load line OT only for current page (limit)
 *
 * Optional accuracy: OT_READINESS_FULL_LINE_TOTALS=true runs period-wide line aggregates.
 *
 * Payable source remains timesheetline.overtimeHours after approved OT import.
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
		rawAttendanceRole: "punch evidence only — not payable OT without approved OT → lines";
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
		lineTotalsApproximate?: boolean;
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
		strategy: "summary_first_page_deep_lines";
		pageLimit: number;
		onlyWithOt: boolean;
		lightTimesheets: number;
		deepLoaded: number;
		fullLineTotals: boolean;
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
		"No OT on effective lines — import approved OT workbook (DM4.3) if expected.";
	if (payableMinutes > 0 && status === "APPROVED") {
		blockerClass =
			attendanceOtMinutes > 0 && Math.abs(deltaMinutes) > 1
				? "ot_on_lines_only"
				: "ok";
		nextStep =
			blockerClass === "ok"
				? "Payable OT on lines; ready for Run Payroll OT pay."
				: "Line OT differs from attendance.overtimeHours — payroll uses lines (approved OT), not raw punches.";
	} else if (payableMinutes > 0 && status !== "APPROVED") {
		blockerClass = "timesheet_not_approved";
		nextStep = `Timesheet status ${status || "UNKNOWN"} — approve timesheet before payroll pays OT.`;
	} else if (attendanceOtMinutes > 0 && payableMinutes === 0) {
		blockerClass = "attendance_ot_without_line";
		nextStep =
			"Attendance has overtimeHours but lines are empty — apply approved OT report to timesheet lines.";
	}
	return { blockerClass, nextStep, deltaMinutes };
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
	const fullLineTotals =
		String(process.env.OT_READINESS_FULL_LINE_TOTALS || "")
			.trim()
			.toLowerCase() === "true";

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

	const periodId = period.id;
	const orgId = params.organizationId;

	// One SQL round-trip for light timesheet list (no relations).
	const timesheets = await prisma.$queryRaw<
		Array<{
			id: string;
			status: string;
			totalOvertimeHours: string | null;
			employeeId: string;
		}>
	>`
		SELECT
			t.id,
			t.status::text AS status,
			t."totalOvertimeHours" AS "totalOvertimeHours",
			t."employeeId" AS "employeeId"
		FROM timesheets t
		WHERE t."organizationId" = ${orgId}
			AND t."payrollPeriodId" = ${periodId}
			AND t."isDeleted" = false
		ORDER BY t."employeeId" ASC
	`;

	type Light = {
		timesheetId: string;
		employeeId: string;
		employeeCode: string | null;
		status: string;
		summaryMin: number;
	};

	const light: Light[] = timesheets.map((ts) => ({
		timesheetId: ts.id,
		employeeId: ts.employeeId,
		employeeCode: null,
		status: String(ts.status || ""),
		summaryMin: parseDurationToMinutes(ts.totalOvertimeHours),
	}));

	const withSummaryOt = light.filter((p) => p.summaryMin > 0);
	const totalSummaryOtMinutes = light.reduce((sum, p) => sum + p.summaryMin, 0);

	let peopleWithLineOt = withSummaryOt.length;
	let totalLineOtMinutes = totalSummaryOtMinutes;
	let lineTotalsApproximate = true;

	if (fullLineTotals) {
		const periodLineAgg = await prisma.$queryRaw<
			Array<{ people_with_line_ot: bigint; total_line_ot_minutes: bigint }>
		>`
			SELECT
				COUNT(DISTINCT l."timesheetId")::bigint AS people_with_line_ot,
				COALESCE(SUM(${LINE_OT_MINUTES_SQL}), 0)::bigint AS total_line_ot_minutes
			FROM timesheet_lines l
			WHERE l."organizationId" = ${orgId}
				AND l."payrollPeriodId" = ${periodId}
				AND l."isDeleted" = false
				AND l."isEffective" = true
				AND l."overtimeHours" IS NOT NULL
				AND btrim(l."overtimeHours") <> ''
				AND btrim(l."overtimeHours") NOT IN ('0:00', '0', '00:00')
		`;
		peopleWithLineOt = Number(periodLineAgg[0]?.people_with_line_ot || 0);
		totalLineOtMinutes = Number(periodLineAgg[0]?.total_line_ot_minutes || 0);
		lineTotalsApproximate = false;
	}

	let listSource = light;
	if (query) {
		// Codes not on light rows; filter by status/id, or load codes when searching.
		const empIds = [...new Set(listSource.map((p) => p.employeeId))];
		const codes =
			empIds.length > 0
				? await prisma.employee.findMany({
						where: { id: { in: empIds } },
						select: { id: true, employeeId: true },
					})
				: [];
		const codeMap = new Map(codes.map((e) => [e.id, e.employeeId]));
		listSource = listSource
			.map((p) => ({ ...p, employeeCode: codeMap.get(p.employeeId) || null }))
			.filter((p) => {
				const hay = [p.employeeCode, p.status, p.timesheetId]
					.filter(Boolean)
					.join(" ")
					.toLowerCase();
				return hay.includes(query);
			});
	}

	if (onlyWithOt) {
		const summaryList = listSource.filter((p) => p.summaryMin > 0);
		const summaryCoverage =
			light.length > 0 ? summaryList.length / light.length : 0;
		if (summaryList.length > 0 && summaryCoverage >= 0.05) {
			listSource = summaryList;
		} else {
			const lineIds = await prisma.$queryRaw<Array<{ timesheet_id: string }>>`
				SELECT DISTINCT l."timesheetId" AS timesheet_id
				FROM timesheet_lines l
				WHERE l."organizationId" = ${orgId}
					AND l."payrollPeriodId" = ${periodId}
					AND l."isDeleted" = false
					AND l."isEffective" = true
					AND l."overtimeHours" IS NOT NULL
					AND btrim(l."overtimeHours") <> ''
					AND btrim(l."overtimeHours") NOT IN ('0:00', '0', '00:00')
			`;
			const idSet = new Set(lineIds.map((r) => r.timesheet_id));
			if (idSet.size > 0) {
				listSource = listSource.filter(
					(p) => idSet.has(p.timesheetId) || p.summaryMin > 0,
				);
				if (!fullLineTotals) {
					peopleWithLineOt = idSet.size;
					lineTotalsApproximate = true;
				}
			} else {
				listSource = summaryList;
			}
		}
	}

	listSource = [...listSource].sort((a, b) => {
		if (b.summaryMin !== a.summaryMin) return b.summaryMin - a.summaryMin;
		return String(a.employeeId).localeCompare(String(b.employeeId));
	});

	const listTotal = listSource.length;
	const totalPages = Math.max(1, Math.ceil(Math.max(listTotal, 1) / limit));
	const safePage = Math.min(page, totalPages);
	const skip = (safePage - 1) * limit;
	const pageLight = listSource.slice(skip, skip + limit);
	const pageTsIds = pageLight.map((p) => p.timesheetId);

	// Page line OT only (capped).
	type PageAgg = {
		timesheet_id: string;
		line_ot_minutes: number;
		line_days_with_ot: number;
	};
	const pageAgg = new Map<string, PageAgg>();
	if (pageTsIds.length > 0) {
		const rows = await prisma.$queryRaw<PageAgg[]>`
			SELECT
				l."timesheetId" AS timesheet_id,
				COALESCE(SUM(${LINE_OT_MINUTES_SQL}), 0)::int AS line_ot_minutes,
				COUNT(*) FILTER (WHERE (${LINE_OT_MINUTES_SQL}) > 0)::int AS line_days_with_ot
			FROM timesheet_lines l
			WHERE l."timesheetId" IN (${Prisma.join(pageTsIds)})
				AND l."isDeleted" = false
				AND l."isEffective" = true
				AND l."overtimeHours" IS NOT NULL
				AND btrim(l."overtimeHours") <> ''
			GROUP BY l."timesheetId"
		`;
		for (const r of rows) {
			pageAgg.set(r.timesheet_id, {
				timesheet_id: r.timesheet_id,
				line_ot_minutes: Number(r.line_ot_minutes || 0),
				line_days_with_ot: Number(r.line_days_with_ot || 0),
			});
		}
	}

	const pageEmpIds = [...new Set(pageLight.map((p) => p.employeeId))];
	const employees =
		pageEmpIds.length > 0
			? await prisma.employee.findMany({
					where: { id: { in: pageEmpIds } },
					select: {
						id: true,
						employeeId: true,
						person: { select: { personalInfo: true } },
						department: { select: { name: true } },
					},
				})
			: [];
	const empMap = new Map(employees.map((e) => [e.id, e]));

	const people: PayrollOtReadinessPerson[] = pageLight.map((p) => {
		const emp = empMap.get(p.employeeId);
		const agg = pageAgg.get(p.timesheetId);
		const lineOtMinutes = agg?.line_ot_minutes ?? 0;
		const summaryMin = p.summaryMin;
		const displayLineMin = lineOtMinutes > 0 ? lineOtMinutes : summaryMin;
		const attendanceOtMinutes = 0;
		const { blockerClass, nextStep, deltaMinutes } = classifyPerson({
			status: p.status,
			summaryMin,
			lineOtMinutes: displayLineMin,
			attendanceOtMinutes,
		});
		return {
			employeeId: p.employeeId,
			employeeCode: emp?.employeeId || p.employeeCode,
			name: employeeDisplayName(emp),
			department: emp?.department?.name || null,
			timesheetId: p.timesheetId,
			timesheetStatus: p.status,
			timesheetOtHours: formatMinutesAsHhMm(summaryMin),
			timesheetOtMinutes: summaryMin,
			lineOtHours: formatMinutesAsHhMm(displayLineMin),
			lineOtMinutes: displayLineMin,
			attendanceOtHours: "0:00",
			attendanceOtMinutes: 0,
			deltaMinutes,
			deltaHours: minutesToHours(deltaMinutes),
			lineDaysWithOt: agg?.line_days_with_ot ?? 0,
			blockerClass,
			nextStep,
		};
	});

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
				"punch evidence only — not payable OT without approved OT → lines",
			note: lineTotalsApproximate
				? "Fast path: list/summary from timesheet.totalOvertimeHours; page deep-loads line OT. Set OT_READINESS_FULL_LINE_TOTALS=true for exact period line aggregates."
				: "Full line OT period totals enabled via OT_READINESS_FULL_LINE_TOTALS.",
		},
		summary: {
			timesheetsTotal: light.length,
			timesheetsApproved: light.filter((p) => p.status === "APPROVED").length,
			peopleWithLineOt,
			peopleWithTimesheetOtSummary: withSummaryOt.length,
			peopleWithoutOt: Math.max(0, light.length - peopleWithLineOt),
			totalLineOtMinutes,
			totalLineOtHours: minutesToHours(totalLineOtMinutes),
			totalAttendanceOtMinutes: 0,
			totalAttendanceOtHours: 0,
			totalDeltaMinutes: totalLineOtMinutes,
			lineTotalsApproximate,
		},
		people,
		pagination: {
			page: safePage,
			limit,
			totalItems: listTotal,
			totalPages,
			hasNextPage: safePage < totalPages,
		},
		queryMeta: {
			strategy: "summary_first_page_deep_lines",
			pageLimit: limit,
			onlyWithOt,
			lightTimesheets: light.length,
			deepLoaded: pageTsIds.length,
			fullLineTotals,
		},
	};
}
