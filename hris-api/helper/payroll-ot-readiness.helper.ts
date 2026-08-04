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

export type OtApprovalSource = "system" | "manager" | "none";

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
	/** True when timesheet is APPROVED and has payable line OT (Run Payroll ready). */
	isPayableApproved: boolean;
	/** How OT timesheet approval was recorded. */
	approvalSource: OtApprovalSource;
	approvedBy: string | null;
	approvalDate: string | null;
	/** Short UI label: "System approved OT" | "Manager approved" | "Needs timesheet approval" */
	approvalLabel: string;
	blockerClass:
		| "ok"
		| "ot_on_lines_only"
		| "attendance_ot_without_line"
		| "no_ot"
		| "timesheet_not_approved";
	nextStep: string;
};

export type PayrollOtDayDetail = {
	lineId: string;
	date: string;
	status: string | null;
	overtimeHours: string;
	overtimeMinutes: number;
	regularHours: string | null;
	hoursWorked: string | null;
	primaryMarker: string | null;
	/** Buckets from approved OT workbook metadata when present. */
	approvedBuckets: Record<string, number> | null;
	sourceRow: number | null;
	sourceLabel: string | null;
	appliedAt: string | null;
};

export type PayrollOtCategoryTotals = {
	/** Payable line OT hours (RegOT+SpclOT+RHolOT+RDOT) */
	payableOtHours: number;
	regOtHrs: number;
	regNdHrs: number;
	spclHrs: number;
	spclOtHrs: number;
	rholHrs: number;
	rholOtHrs: number;
	rdHrs: number;
	rdOtHrs: number;
	regularDays: number;
};

export type PayrollOtPersonDetail = {
	employeeId: string;
	employeeCode: string | null;
	name: string;
	department: string | null;
	timesheetId: string;
	timesheetStatus: string;
	approvalSource: OtApprovalSource;
	approvalLabel: string;
	approvedBy: string | null;
	approvalDate: string | null;
	totalLineOtHours: string;
	totalLineOtMinutes: number;
	otDayCount: number;
	/** Report category sums from approvedBuckets (and payable OT). */
	categoryTotals: PayrollOtCategoryTotals;
	days: PayrollOtDayDetail[];
	truth: {
		note: string;
		payableWhen: string;
	};
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
		payableSource: string;
		rawAttendanceRole: string;
		note: string;
	};
	summary: {
		timesheetsTotal: number;
		timesheetsApproved: number;
		peopleWithLineOt: number;
		/** People with line OT whose timesheet is APPROVED (payable for Run Payroll). */
		peopleWithApprovedOt: number;
		/** People with line OT still blocked on timesheet approval. */
		peopleWithPendingOtApproval: number;
		peopleWithTimesheetOtSummary: number;
		peopleWithoutOt: number;
		totalLineOtMinutes: number;
		totalLineOtHours: number;
		/** Line OT minutes only for APPROVED timesheets (truthful "Approved OT hrs"). */
		totalApprovedLineOtMinutes: number;
		totalApprovedLineOtHours: number;
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
		anyLineOtPeople?: number;
		approvedSourceOtPeople?: number;
	};
};

function employeeDisplayName(employee: any): string {
	const personal = employee?.person?.personalInfo || {};
	const parts = [personal.firstName, personal.middleName, personal.lastName]
		.map((part: unknown) => String(part || "").trim())
		.filter(Boolean);
	return parts.join(" ") || employee?.employeeId || "Employee";
}

/** Exported for unit tests and OT auto-approve regression coverage. */
export function classifyPerson(input: {
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

const SYSTEM_OT_APPROVER = "system:approved_ot_import";

/** Resolve how a timesheet's OT approval should be labeled in Run Payroll UI. */
export function resolveOtApprovalMeta(input: {
	status: string;
	approvedBy?: string | null;
	metadata?: unknown;
}): {
	approvalSource: OtApprovalSource;
	approvalLabel: string;
	approvedBy: string | null;
	approvalDate: string | null;
} {
	const status = String(input.status || "").toUpperCase();
	const approvedBy = input.approvedBy ? String(input.approvedBy) : null;
	const meta =
		input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
			? (input.metadata as Record<string, unknown>)
			: {};
	const repair =
		meta.bandaiPayrollSourceRepair &&
		typeof meta.bandaiPayrollSourceRepair === "object" &&
		!Array.isArray(meta.bandaiPayrollSourceRepair)
			? (meta.bandaiPayrollSourceRepair as Record<string, unknown>)
			: {};
	const autoReason = String(repair.autoApprovedReason || "");
	const autoAt = repair.autoApprovedAt ? String(repair.autoApprovedAt) : null;
	const approvalDateRaw = (meta as any).approvalDate; // not used; prefer column
	void approvalDateRaw;

	if (status !== "APPROVED") {
		return {
			approvalSource: "none",
			approvalLabel: "Needs timesheet approval",
			approvedBy,
			approvalDate: null,
		};
	}
	if (
		approvedBy === SYSTEM_OT_APPROVER ||
		autoReason === "approved_ot_import" ||
		Boolean(autoAt)
	) {
		return {
			approvalSource: "system",
			approvalLabel: "System approved OT",
			approvedBy: approvedBy || SYSTEM_OT_APPROVER,
			approvalDate: autoAt,
		};
	}
	if (approvedBy) {
		return {
			approvalSource: "manager",
			approvalLabel: "Manager approved",
			approvedBy,
			approvalDate: null,
		};
	}
	return {
		approvalSource: "manager",
		approvalLabel: "Approved",
		approvedBy: null,
		approvalDate: null,
	};
}

type LineAgg = {
	timesheetId: string;
	lineOtMinutes: number;
	lineDaysWithOt: number;
	/** Minutes from rptOvertimeDetails / bandaiPayrollSourceRepair only (payable approved OT). */
	approvedSourceOtMinutes: number;
	approvedSourceOtDays: number;
};

/**
 * Line OT from approved OT workbook apply (bandaiPayrollSourceRepair).
 * Do not use jsonb `?` operator inside Prisma.sql (can break composition).
 * Top-level metadata.source is often an object (attendance obligation) — ignore it.
 */
const APPROVED_OT_SOURCE_SQL = Prisma.sql`
	(l.metadata->'bandaiPayrollSourceRepair') IS NOT NULL
	AND jsonb_typeof(l.metadata->'bandaiPayrollSourceRepair') = 'object'
	AND COALESCE(l.metadata->'bandaiPayrollSourceRepair'->>'source', '') NOT ILIKE '%DEMO%'
`;

async function loadLineOtAggregates(
	prisma: PrismaClient,
	params: { organizationId: string; payrollPeriodId: string },
): Promise<Map<string, LineAgg>> {
	// Only rows that may carry OT — skip empty day lines (~15x smaller than full hydrate).
	// Split any-line OT vs approved-source OT (rptOvertimeDetails repair).
	const rows = await prisma.$queryRaw<
		Array<{
			timesheetId: string;
			lineOtMinutes: number | bigint;
			lineDaysWithOt: number | bigint;
			approvedSourceOtMinutes: number | bigint;
			approvedSourceOtDays: number | bigint;
		}>
	>`
		SELECT
			l."timesheetId" AS "timesheetId",
			COALESCE(SUM(${LINE_OT_MINUTES_SQL}), 0)::int AS "lineOtMinutes",
			COUNT(*) FILTER (WHERE (${LINE_OT_MINUTES_SQL}) > 0)::int AS "lineDaysWithOt",
			COALESCE(SUM(${LINE_OT_MINUTES_SQL}) FILTER (WHERE ${APPROVED_OT_SOURCE_SQL}), 0)::int AS "approvedSourceOtMinutes",
			COUNT(*) FILTER (WHERE (${LINE_OT_MINUTES_SQL}) > 0 AND ${APPROVED_OT_SOURCE_SQL})::int AS "approvedSourceOtDays"
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
			approvedSourceOtMinutes: Number(row.approvedSourceOtMinutes || 0),
			approvedSourceOtDays: Number(row.approvedSourceOtDays || 0),
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

	// Phase 1: light timesheets — prefer totalOvertimeHours for list filtering.
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
			approvedBy: true,
			approvalDate: true,
			metadata: true,
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
		/** Any effective line OT (includes demo/biometric) — diagnostic only. */
		lineOtMinutes: number;
		lineDaysWithOt: number;
		/** Payable approved OT from rptOvertimeDetails apply (bandaiPayrollSourceRepair). */
		approvedSourceOtMinutes: number;
		approvedSourceOtDays: number;
		approvedBy: string | null;
		approvalDate: Date | null;
		metadata: unknown;
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
			approvedSourceOtMinutes: agg?.approvedSourceOtMinutes ?? 0,
			approvedSourceOtDays: agg?.approvedSourceOtDays ?? 0,
			approvedBy: ts.approvedBy ? String(ts.approvedBy) : null,
			approvalDate: ts.approvalDate || null,
			metadata: ts.metadata,
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

	// Approved OT panel truth = report-backed line OT only (not BNPI_DM4_DEMO / raw punches).
	const withLineOt = light.filter((p) => p.approvedSourceOtMinutes > 0);
	const withAnyLineOt = light.filter((p) => p.lineOtMinutes > 0);
	const withSummaryOt = light.filter((p) => p.summaryMin > 0);
	const listSource = onlyWithOt
		? filtered.filter((p) => p.approvedSourceOtMinutes > 0)
		: filtered;

	// Prefer highest approved-source OT first.
	listSource.sort((a, b) => {
		if (b.approvedSourceOtMinutes !== a.approvedSourceOtMinutes) {
			return b.approvedSourceOtMinutes - a.approvedSourceOtMinutes;
		}
		if (b.lineOtMinutes !== a.lineOtMinutes) return b.lineOtMinutes - a.lineOtMinutes;
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
		// Payable OT for this panel = approved-source minutes (rptOvertimeDetails).
		const payableOtMinutes = person.approvedSourceOtMinutes;
		const { blockerClass, nextStep, deltaMinutes } = classifyPerson({
			status: person.timesheetStatus,
			summaryMin: person.summaryMin,
			lineOtMinutes: payableOtMinutes,
			attendanceOtMinutes,
		});
		const approval = resolveOtApprovalMeta({
			status: person.timesheetStatus,
			approvedBy: person.approvedBy,
			metadata: person.metadata,
		});
		const approvalDateIso =
			person.approvalDate?.toISOString?.() || approval.approvalDate || null;
		const isPayableApproved =
			person.timesheetStatus === "APPROVED" && payableOtMinutes > 0;
		return {
			employeeId: person.employeeId,
			employeeCode: person.employeeCode,
			name: person.name,
			department: person.department,
			timesheetId: person.timesheetId,
			timesheetStatus: person.timesheetStatus,
			timesheetOtHours: formatMinutesAsHhMm(person.summaryMin),
			timesheetOtMinutes: person.summaryMin,
			// Expose approved-source OT as the line OT the UI pays on.
			lineOtHours: formatMinutesAsHhMm(payableOtMinutes),
			lineOtMinutes: payableOtMinutes,
			attendanceOtHours: formatMinutesAsHhMm(attendanceOtMinutes),
			attendanceOtMinutes,
			deltaMinutes,
			deltaHours: minutesToHours(deltaMinutes),
			lineDaysWithOt: person.approvedSourceOtDays,
			isPayableApproved,
			approvalSource: approval.approvalSource,
			approvedBy: approval.approvedBy,
			approvalDate: approvalDateIso,
			approvalLabel: approval.approvalLabel,
			blockerClass,
			nextStep,
		};
	});

	const totalLineOtMinutes = light.reduce(
		(sum, p) => sum + p.approvedSourceOtMinutes,
		0,
	);
	const approvedWithLineOt = withLineOt.filter((p) => p.timesheetStatus === "APPROVED");
	const pendingWithLineOt = withLineOt.filter((p) => p.timesheetStatus !== "APPROVED");
	const totalApprovedLineOtMinutes = approvedWithLineOt.reduce(
		(sum, p) => sum + p.approvedSourceOtMinutes,
		0,
	);
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
				"punch evidence only - not payable OT without approved OT -> lines",
			note: "BNPI: import biometrics then approved OT workbook into timesheet lines before Run Payroll. Past OT import auto-approves timesheets. Header chips: Approved OT = APPROVED timesheets with line OT; Total OT = all line OT.",
		},
		summary: {
			timesheetsTotal: light.length,
			timesheetsApproved: light.filter((p) => p.timesheetStatus === "APPROVED").length,
			peopleWithLineOt: withLineOt.length,
			peopleWithApprovedOt: approvedWithLineOt.length,
			peopleWithPendingOtApproval: pendingWithLineOt.length,
			peopleWithTimesheetOtSummary: withSummaryOt.length,
			peopleWithoutOt: Math.max(0, light.length - withLineOt.length),
			totalLineOtMinutes,
			totalLineOtHours: minutesToHours(totalLineOtMinutes),
			totalApprovedLineOtMinutes,
			totalApprovedLineOtHours: minutesToHours(totalApprovedLineOtMinutes),
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
			// Diagnostic: any line OT vs report-backed OT (demo seed often has any-line only).
			anyLineOtPeople: withAnyLineOt.length,
			approvedSourceOtPeople: withLineOt.length,
		},
	};
}

/**
 * Compact person OT day detail for Run Payroll modal.
 * Source of truth: direct DB query of effective timesheet_lines with OT only.
 * No full timesheet hydrate, no attendance recompute, no calendar materialization.
 */
export async function getPayrollPeriodOtPersonDetail(
	prisma: PrismaClient,
	params: {
		payrollPeriodId: string;
		organizationId: string;
		timesheetId: string;
	},
): Promise<PayrollOtPersonDetail> {
	// Phase 1: header only (tiny)
	const timesheet = await prisma.timesheet.findFirst({
		where: {
			id: params.timesheetId,
			organizationId: params.organizationId,
			payrollPeriodId: params.payrollPeriodId,
			isDeleted: false,
		},
		select: {
			id: true,
			status: true,
			approvedBy: true,
			approvalDate: true,
			metadata: true,
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
	});
	if (!timesheet) {
		throw new Error(`Timesheet not found for OT detail: ${params.timesheetId}`);
	}

	// Phase 2: all approved-source lines (report matrix), including ND/RD-only days.
	const lineRows = await prisma.$queryRaw<
		Array<{
			lineId: string;
			date: Date;
			status: string | null;
			overtimeHours: string | null;
			regularHours: string | null;
			hoursWorked: string | null;
			primaryMarker: string | null;
			metadata: unknown;
		}>
	>`
		SELECT
			l.id AS "lineId",
			l.date AS date,
			l.status AS status,
			l."overtimeHours" AS "overtimeHours",
			l."regularHours" AS "regularHours",
			l."hoursWorked" AS "hoursWorked",
			l."primaryMarker" AS "primaryMarker",
			l.metadata AS metadata
		FROM timesheet_lines l
		WHERE l."timesheetId" = ${params.timesheetId}
			AND l."organizationId" = ${params.organizationId}
			AND l."payrollPeriodId" = ${params.payrollPeriodId}
			AND l."isDeleted" = false
			AND l."isEffective" = true
			AND ${APPROVED_OT_SOURCE_SQL}
		ORDER BY l.date ASC
	`;

	const approval = resolveOtApprovalMeta({
		status: String(timesheet.status || ""),
		approvedBy: timesheet.approvedBy,
		metadata: timesheet.metadata,
	});
	const approvalDateIso =
		timesheet.approvalDate?.toISOString?.() || approval.approvalDate || null;

	const bucketNum = (buckets: Record<string, number> | null, key: string) => {
		if (!buckets) return 0;
		const n = Number(buckets[key] ?? 0);
		return Number.isFinite(n) ? n : 0;
	};

	const days: PayrollOtDayDetail[] = [];
	let totalLineOtMinutes = 0;
	const categoryTotals: PayrollOtCategoryTotals = {
		payableOtHours: 0,
		regOtHrs: 0,
		regNdHrs: 0,
		spclHrs: 0,
		spclOtHrs: 0,
		rholHrs: 0,
		rholOtHrs: 0,
		rdHrs: 0,
		rdOtHrs: 0,
		regularDays: 0,
	};

	for (const line of lineRows) {
		const meta =
			line.metadata && typeof line.metadata === "object" && !Array.isArray(line.metadata)
				? (line.metadata as Record<string, any>)
				: {};
		const repair =
			meta.bandaiPayrollSourceRepair &&
			typeof meta.bandaiPayrollSourceRepair === "object"
				? meta.bandaiPayrollSourceRepair
				: {};
		const buckets =
			repair.approvedBuckets && typeof repair.approvedBuckets === "object"
				? (repair.approvedBuckets as Record<string, number>)
				: null;
		const otMin = parseDurationToMinutes(line.overtimeHours);
		const bucketSum =
			bucketNum(buckets, "regOtHrs") +
			bucketNum(buckets, "spclOtHrs") +
			bucketNum(buckets, "rholOtHrs") +
			bucketNum(buckets, "rdOtHrs") +
			bucketNum(buckets, "regNdHrs") +
			bucketNum(buckets, "spclHrs") +
			bucketNum(buckets, "rholHrs") +
			bucketNum(buckets, "rdHrs") +
			bucketNum(buckets, "regularDays");
		// Keep days with payable OT or any report category signal.
		if (otMin <= 0 && bucketSum <= 0) continue;

		totalLineOtMinutes += otMin;
		categoryTotals.regOtHrs += bucketNum(buckets, "regOtHrs");
		categoryTotals.regNdHrs += bucketNum(buckets, "regNdHrs");
		categoryTotals.spclHrs += bucketNum(buckets, "spclHrs");
		categoryTotals.spclOtHrs += bucketNum(buckets, "spclOtHrs");
		categoryTotals.rholHrs += bucketNum(buckets, "rholHrs");
		categoryTotals.rholOtHrs += bucketNum(buckets, "rholOtHrs");
		categoryTotals.rdHrs += bucketNum(buckets, "rdHrs");
		categoryTotals.rdOtHrs += bucketNum(buckets, "rdOtHrs");
		categoryTotals.regularDays += bucketNum(buckets, "regularDays");

		const dateVal =
			line.date instanceof Date
				? line.date.toISOString().slice(0, 10)
				: String(line.date || "").slice(0, 10);
		days.push({
			lineId: line.lineId,
			date: dateVal,
			status: line.status ? String(line.status) : null,
			overtimeHours: formatMinutesAsHhMm(otMin),
			overtimeMinutes: otMin,
			regularHours: line.regularHours ? String(line.regularHours) : null,
			hoursWorked: line.hoursWorked ? String(line.hoursWorked) : null,
			primaryMarker: line.primaryMarker ? String(line.primaryMarker) : null,
			approvedBuckets: buckets,
			sourceRow:
				typeof repair.sourceRow === "number"
					? repair.sourceRow
					: repair.sourceRow
						? Number(repair.sourceRow)
						: null,
			sourceLabel: repair.source ? String(repair.source) : null,
			appliedAt: repair.appliedAt ? String(repair.appliedAt) : null,
		});
	}
	categoryTotals.payableOtHours = Math.round((totalLineOtMinutes / 60) * 100) / 100;

	return {
		employeeId: timesheet.employeeId,
		employeeCode: timesheet.employee?.employeeId || null,
		name: employeeDisplayName(timesheet.employee),
		department: timesheet.employee?.department?.name || null,
		timesheetId: timesheet.id,
		timesheetStatus: String(timesheet.status || ""),
		approvalSource: approval.approvalSource,
		approvalLabel: approval.approvalLabel,
		approvedBy: approval.approvedBy,
		approvalDate: approvalDateIso,
		totalLineOtHours: formatMinutesAsHhMm(totalLineOtMinutes),
		totalLineOtMinutes,
		otDayCount: days.filter((d) => d.overtimeMinutes > 0).length,
		categoryTotals,
		days,
		truth: {
			note:
				"Payable OT = Reg OT + Spcl OT + RHol OT + RD OT from rptOvertimeDetails. ND / Spcl Hrs / RHol Hrs / RD Hrs are premium buckets (shown for truth, not added into payable OT).",
			payableWhen:
				"Timesheet APPROVED + timesheet_lines.overtimeHours from approved OT workbook",
		},
	};
}
