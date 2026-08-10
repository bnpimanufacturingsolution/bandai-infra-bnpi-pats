import "dotenv/config";
import path from "node:path";
import * as XLSX from "xlsx";
import { Prisma, PrismaClient } from "../generated/prisma";
import {
	AUTO_APPROVED_BY,
	AUTO_APPROVED_REASON,
	shouldAutoApproveTimesheetStatus,
} from "../helper/bandai-payroll-ot-auto-approve.helper";
import {
	buildBandaiOtLinePatch,
	type BandaiOtSourceRow,
} from "../helper/bandai-ot-line-patch.helper";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");

const readArg = (name: string, fallback?: string) => {
	const prefix = `${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
};

const apply = process.argv.includes("--apply");
// Default ON in apply mode so past approved OT import unblocks Run Payroll OT readiness.
// Pass --no-auto-approve to leave timesheet workflow status unchanged.
const autoApproveEnabled = apply && !process.argv.includes("--no-auto-approve");
// Optional backfill: also approve period timesheets that already have line OT > 0
// (even when no line patches are planned this run).
const autoApproveWithOt = process.argv.includes("--auto-approve-with-ot");
const periodCode = readArg("--periodCode", "PP-20260426-20260511")!;
const overtimeWorkbookPath = path.resolve(
	readArg(
		"--overtime-workbook",
		path.join(repoRoot, "docs", "Bandai Payroll", "2026 rptOvertimeDetails.xlsx"),
	)!,
);
const password = readArg("--password", "9090");
const employeeFilter = new Set(
	(readArg("--employees", "") || "")
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean),
);
const normalizedEmployeeFilter = new Set(
	Array.from(employeeFilter).map((value) => value.padStart(5, "0")),
);

type OvertimeSourceRow = BandaiOtSourceRow & {
	department: string;
	name: string;
};

const text = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
	const parsed = Number(text(value).replace(/,/g, ""));
	return Number.isFinite(parsed) ? parsed : 0;
};
const dateKey = (value: unknown) => {
	const raw = text(value);
	const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (match) {
		return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
	}
	const parsed = new Date(raw);
	return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

function parseOvertimeSource(filePath: string) {
	const workbook = XLSX.readFile(filePath, { cellDates: true, dense: true, raw: false, password });
	const sheetName = workbook.SheetNames.find((name) => /overtime/i.test(name)) || workbook.SheetNames[0];
	const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
		header: 1,
		defval: "",
		raw: false,
		blankrows: false,
	}) as unknown[][];
	let current = { department: "", name: "", employeeNo: "" };
	const byEmployeeDate = new Map<string, OvertimeSourceRow>();

	for (let index = 6; index < rows.length; index += 1) {
		const row = rows[index] || [];
		if (text(row[2])) current.name = text(row[2]);
		if (/^\d{3,6}$/.test(text(row[3]))) current.employeeNo = text(row[3]).padStart(5, "0");
		if (text(row[0]) && !/^\d{1,2}\//.test(text(row[0]))) {
			current.department = text(row[0]);
		}

		const directDate = dateKey(row[4]);
		const shiftedDate = directDate ? "" : dateKey(row[0]);
		const date = directDate || shiftedDate;
		const shift = shiftedDate ? 4 : 0;
		if (!date || !current.employeeNo) continue;

		const sourceRow: OvertimeSourceRow = {
			rowNumber: index + 1,
			date,
			department: current.department,
			name: current.name,
			employeeNo: current.employeeNo,
			regularDays: numberValue(row[6 - shift]),
			regOtHrs: numberValue(row[7 - shift]),
			regNdHrs: numberValue(row[8 - shift]),
			spclHrs: numberValue(row[9 - shift]),
			spclOtHrs: numberValue(row[10 - shift]),
			rholHrs: numberValue(row[11 - shift]),
			rholOtHrs: numberValue(row[13 - shift]),
			rdHrs: numberValue(row[14 - shift]),
			rdOtHrs: numberValue(row[15 - shift]),
		};
		byEmployeeDate.set(`${sourceRow.employeeNo}:${sourceRow.date}`, sourceRow);
	}

	return byEmployeeDate;
}

function buildLinePatch(line: any, source: OvertimeSourceRow, isCalendarHoliday: boolean) {
	return buildBandaiOtLinePatch({
		line: {
			status: line.status,
			timeIn: line.timeIn,
			timeOut: line.timeOut,
			hoursWorked: line.hoursWorked,
			regularHours: line.regularHours,
			overtimeHours: line.overtimeHours,
			lateHours: line.lateHours,
			earlyOutHours: line.earlyOutHours,
			undertimeHours: line.undertimeHours,
			primaryMarker: line.primaryMarker,
			metadata: line.metadata,
			scheduleSnapshot: line.scheduleSnapshot,
		},
		source,
		isCalendarHoliday,
		sourceLabel: path.basename(overtimeWorkbookPath),
	});
}

type LinePatchPayload = {
	lineId: string;
	timesheetId: string;
	status: string | null;
	primaryMarker: string | null;
	hoursWorked: string | null;
	regularHours: string | null;
	overtimeHours: string | null;
	lateHours: string | null;
	earlyOutHours: string | null;
	undertimeHours: string | null;
	notes: string | null;
	metadata: Record<string, any>;
};

async function applyLinePatchesWithRawSql(patches: LinePatchPayload[]) {
	if (!patches.length) return;
	const patchJson = JSON.stringify(patches);
	await prisma.$transaction(async (tx) => {
		await tx.$executeRaw`
			CREATE TEMP TABLE bandai_ot_line_patches (
				line_id text PRIMARY KEY,
				timesheet_id text NOT NULL,
				status text,
				primary_marker text,
				hours_worked text,
				regular_hours text,
				overtime_hours text,
				late_hours text,
				early_out_hours text,
				undertime_hours text,
				notes text,
				metadata jsonb NOT NULL
			) ON COMMIT DROP
		`;
		await tx.$executeRaw`
			INSERT INTO bandai_ot_line_patches (
				line_id,
				timesheet_id,
				status,
				primary_marker,
				hours_worked,
				regular_hours,
				overtime_hours,
				late_hours,
				early_out_hours,
				undertime_hours,
				notes,
				metadata
			)
			SELECT
				"lineId",
				"timesheetId",
				status,
				"primaryMarker",
				"hoursWorked",
				"regularHours",
				"overtimeHours",
				"lateHours",
				"earlyOutHours",
				"undertimeHours",
				notes,
				metadata
			FROM jsonb_to_recordset(${patchJson}::jsonb) AS patch(
				"lineId" text,
				"timesheetId" text,
				status text,
				"primaryMarker" text,
				"hoursWorked" text,
				"regularHours" text,
				"overtimeHours" text,
				"lateHours" text,
				"earlyOutHours" text,
				"undertimeHours" text,
				notes text,
				metadata jsonb
			)
		`;
		await tx.$executeRaw`
			UPDATE timesheet_lines line
			SET
				status = COALESCE(patch.status, line.status),
				"primaryMarker" = COALESCE(patch.primary_marker, line."primaryMarker"),
				"hoursWorked" = COALESCE(patch.hours_worked, line."hoursWorked"),
				"regularHours" = COALESCE(patch.regular_hours, line."regularHours"),
				"overtimeHours" = COALESCE(patch.overtime_hours, line."overtimeHours"),
				"lateHours" = COALESCE(patch.late_hours, line."lateHours"),
				"earlyOutHours" = COALESCE(patch.early_out_hours, line."earlyOutHours"),
				"undertimeHours" = COALESCE(patch.undertime_hours, line."undertimeHours"),
				notes = COALESCE(patch.notes, line.notes),
				metadata = patch.metadata,
				"updatedAt" = now()
			FROM bandai_ot_line_patches patch
			WHERE line.id = patch.line_id
		`;
		await tx.$executeRaw`
			WITH touched AS (
				SELECT DISTINCT timesheet_id FROM bandai_ot_line_patches
			),
			line_minutes AS (
				SELECT
					line."timesheetId",
					CASE WHEN line.status <> 'REST_DAY' THEN 1 ELSE 0 END AS day_count,
					CASE WHEN COALESCE(line."hoursWorked", '') ~ '^[0-9]+:[0-9]{2}$'
						THEN split_part(line."hoursWorked", ':', 1)::int * 60 + split_part(line."hoursWorked", ':', 2)::int
						ELSE 0
					END AS worked_minutes,
					CASE WHEN COALESCE(line."regularHours", '') ~ '^[0-9]+:[0-9]{2}$'
						THEN split_part(line."regularHours", ':', 1)::int * 60 + split_part(line."regularHours", ':', 2)::int
						ELSE 0
					END AS regular_minutes,
					CASE WHEN COALESCE(line."overtimeHours", '') ~ '^[0-9]+:[0-9]{2}$'
						THEN split_part(line."overtimeHours", ':', 1)::int * 60 + split_part(line."overtimeHours", ':', 2)::int
						ELSE 0
					END AS overtime_minutes,
					CASE WHEN COALESCE(line."lateHours", '') ~ '^[0-9]+:[0-9]{2}$'
						THEN split_part(line."lateHours", ':', 1)::int * 60 + split_part(line."lateHours", ':', 2)::int
						ELSE 0
					END AS late_minutes,
					CASE WHEN COALESCE(line."earlyOutHours", '') ~ '^[0-9]+:[0-9]{2}$'
						THEN split_part(line."earlyOutHours", ':', 1)::int * 60 + split_part(line."earlyOutHours", ':', 2)::int
						ELSE 0
					END AS early_out_minutes,
					CASE WHEN COALESCE(line."undertimeHours", '') ~ '^[0-9]+:[0-9]{2}$'
						THEN split_part(line."undertimeHours", ':', 1)::int * 60 + split_part(line."undertimeHours", ':', 2)::int
						ELSE 0
					END AS undertime_minutes
				FROM timesheet_lines line
				JOIN touched ON touched.timesheet_id = line."timesheetId"
				WHERE line."isDeleted" = false
					AND line."isEffective" = true
			),
			agg AS (
				SELECT
					"timesheetId",
					SUM(day_count)::int AS total_days,
					SUM(worked_minutes)::int AS total_worked,
					SUM(regular_minutes)::int AS total_regular,
					SUM(overtime_minutes)::int AS total_overtime,
					SUM(late_minutes)::int AS total_late,
					SUM(early_out_minutes)::int AS total_early_out,
					SUM(undertime_minutes)::int AS total_undertime
				FROM line_minutes
				GROUP BY "timesheetId"
			)
			UPDATE timesheets timesheet
			SET
				"totalDays" = agg.total_days,
				"totalHoursWorked" = (agg.total_worked / 60)::text || ':' || lpad((agg.total_worked % 60)::text, 2, '0'),
				"totalRegularHours" = (agg.total_regular / 60)::text || ':' || lpad((agg.total_regular % 60)::text, 2, '0'),
				"totalOvertimeHours" = (agg.total_overtime / 60)::text || ':' || lpad((agg.total_overtime % 60)::text, 2, '0'),
				"totalLateHours" = (agg.total_late / 60)::text || ':' || lpad((agg.total_late % 60)::text, 2, '0'),
				"totalEarlyOutHours" = (agg.total_early_out / 60)::text || ':' || lpad((agg.total_early_out % 60)::text, 2, '0'),
				"totalUndertimeHours" = (agg.total_undertime / 60)::text || ':' || lpad((agg.total_undertime % 60)::text, 2, '0'),
				metadata = COALESCE(timesheet.metadata, '{}'::jsonb) || jsonb_build_object(
					'totalMinutesWorked', agg.total_worked,
					'totalRegularMinutes', agg.total_regular,
					'totalOvertimeMinutes', agg.total_overtime,
					'totalLateMinutes', agg.total_late,
					'totalEarlyOutMinutes', agg.total_early_out,
					'totalUndertimeMinutes', agg.total_undertime,
					'bandaiPayrollSourceRepair', jsonb_build_object(
						'source', '2026 rptOvertimeDetails.xlsx',
						'recalculatedAt', now()
					)
				),
				"updatedAt" = now()
			FROM agg
			WHERE timesheet.id = agg."timesheetId"
		`;
	}, { maxWait: 10000, timeout: 120000 });
}

/**
 * Batch auto-approve timesheets after approved OT was applied to lines.
 * Only flips non-APPROVED rows; merges bandaiPayrollSourceRepair auto-approve markers.
 */
async function autoApproveTimesheetsWithRawSql(timesheetIds: string[]): Promise<{
	autoApprovedTimesheets: number;
	autoApproveSkipped: number;
}> {
	const uniqueIds = Array.from(new Set(timesheetIds.filter(Boolean)));
	if (!uniqueIds.length) {
		return { autoApprovedTimesheets: 0, autoApproveSkipped: 0 };
	}

	const existing = await prisma.timesheet.findMany({
		where: { id: { in: uniqueIds }, isDeleted: false },
		select: { id: true, status: true },
	});
	const eligibleIds = existing
		.filter((row) => shouldAutoApproveTimesheetStatus(String(row.status || "")))
		.map((row) => row.id);
	const autoApproveSkipped = uniqueIds.length - eligibleIds.length;
	if (!eligibleIds.length) {
		return { autoApprovedTimesheets: 0, autoApproveSkipped };
	}

	const idsSql = Prisma.join(eligibleIds.map((id) => Prisma.sql`${id}`));
	const updated = await prisma.$executeRaw`
		UPDATE timesheets timesheet
		SET
			status = 'APPROVED',
			"approvalDate" = now(),
			"approvedBy" = ${AUTO_APPROVED_BY},
			"rejectionReason" = NULL,
			metadata = COALESCE(timesheet.metadata, '{}'::jsonb) || jsonb_build_object(
				'bandaiPayrollSourceRepair',
				COALESCE(timesheet.metadata->'bandaiPayrollSourceRepair', '{}'::jsonb) || jsonb_build_object(
					'autoApprovedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
					'autoApprovedReason', ${AUTO_APPROVED_REASON}
				)
			),
			"updatedAt" = now()
		WHERE timesheet.id IN (${idsSql})
			AND timesheet."isDeleted" = false
			AND timesheet.status <> 'APPROVED'
	`;

	return {
		autoApprovedTimesheets: Number(updated || 0),
		autoApproveSkipped,
	};
}

/**
 * Timesheets that already have approved OT workbook applied on lines
 * (bandaiPayrollSourceRepair). Used by --auto-approve-with-ot.
 * Does NOT include demo/biometric-only OT (e.g. BNPI_DM4_DEMO_PROOF).
 */
async function loadTimesheetIdsWithLineOt(params: {
	organizationId: string;
	payrollPeriodId: string;
	employeeCodes?: Set<string>;
}): Promise<string[]> {
	const rows = await prisma.$queryRaw<Array<{ timesheetId: string }>>`
		SELECT DISTINCT l."timesheetId" AS "timesheetId"
		FROM timesheet_lines l
		JOIN timesheets t ON t.id = l."timesheetId"
		JOIN employees e ON e.id = t."employeeId"
		WHERE l."organizationId" = ${params.organizationId}
			AND l."payrollPeriodId" = ${params.payrollPeriodId}
			AND l."isDeleted" = false
			AND l."isEffective" = true
			AND t."isDeleted" = false
			AND l.metadata ? 'bandaiPayrollSourceRepair'
			AND COALESCE(l.metadata->>'source', '') NOT ILIKE '%DEMO%'
			AND l."overtimeHours" IS NOT NULL
			AND btrim(l."overtimeHours") <> ''
			AND btrim(l."overtimeHours") NOT IN ('0:00', '0', '00:00')
			AND (
				CASE
					WHEN l."overtimeHours" LIKE '%:%' THEN
						COALESCE(NULLIF(split_part(l."overtimeHours", ':', 1), '')::int, 0) * 60
						+ COALESCE(NULLIF(split_part(l."overtimeHours", ':', 2), '')::int, 0)
					ELSE
						ROUND(COALESCE(NULLIF(regexp_replace(l."overtimeHours", '[^0-9.\\-]', '', 'g'), '')::numeric, 0) * 60)::int
				END
			) > 0
			${
				params.employeeCodes && params.employeeCodes.size
					? Prisma.sql`AND e."employeeId" IN (${Prisma.join(
							Array.from(params.employeeCodes).map((code) => Prisma.sql`${code}`),
						)})`
					: Prisma.empty
			}
	`;
	return rows.map((row) => row.timesheetId);
}

async function main() {
	const period = await prisma.payrollPeriod.findFirst({
		where: { code: periodCode, isDeleted: false },
		select: { id: true, organizationId: true, code: true, startDate: true, endDate: true, status: true },
	});
	if (!period) throw new Error(`Payroll period ${periodCode} was not found.`);

	const sourceByEmployeeDate = parseOvertimeSource(overtimeWorkbookPath);
	const holidays = await prisma.calendarItem.findMany({
		where: {
			organizationId: period.organizationId,
			type: "HOLIDAY",
			status: "ACTIVE",
			startDate: {
				gte: period.startDate,
				lte: period.endDate,
			},
		},
		select: { startDate: true },
	});
	const calendarHolidayDates = new Set(holidays.map((holiday) => holiday.startDate.toISOString().slice(0, 10)));
	// Include DRAFT/SUBMITTED/etc. so approved-OT mapping is not a false green when
	// timesheets exist but are not yet APPROVED (Run Payroll still needs OT on lines).
	// Override with --approved-only to restore legacy APPROVED-only scope.
	const approvedOnly = process.argv.includes("--approved-only");
	const timesheets = await prisma.timesheet.findMany({
		where: {
			organizationId: period.organizationId,
			payrollPeriodId: period.id,
			isDeleted: false,
			...(approvedOnly ? { status: "APPROVED" } : {}),
			employee: normalizedEmployeeFilter.size ? { employeeId: { in: Array.from(normalizedEmployeeFilter) } } : undefined,
		},
		select: {
			id: true,
			status: true,
			employee: { select: { employeeId: true, person: { select: { personalInfo: true } } } },
			timesheetlines: {
				where: { isDeleted: false, isEffective: true },
				orderBy: { date: "asc" },
				select: {
					id: true,
					date: true,
					status: true,
					timeIn: true,
					timeOut: true,
					hoursWorked: true,
					regularHours: true,
					overtimeHours: true,
					lateHours: true,
					earlyOutHours: true,
					undertimeHours: true,
					primaryMarker: true,
					metadata: true,
					scheduleSnapshot: true,
					notes: true,
				},
			},
		},
	});

	const planned: Array<{ employeeNo: string; date: string; lineId: string; reasons: string[] }> = [];
	const linePatches: LinePatchPayload[] = [];
	const touchedTimesheets = new Set<string>();
	let missingSourceRows = 0;
	let effectiveLinesChecked = 0;

	for (const timesheet of timesheets) {
		const employeeNo = timesheet.employee.employeeId;
		for (const line of timesheet.timesheetlines) {
			effectiveLinesChecked += 1;
			const day = line.date.toISOString().slice(0, 10);
			const source = sourceByEmployeeDate.get(`${employeeNo}:${day}`);
			if (!source) {
				missingSourceRows += 1;
				continue;
			}
			const patch = buildLinePatch(line, source, calendarHolidayDates.has(day));
			if (!patch) continue;
			planned.push({ employeeNo, date: day, lineId: line.id, reasons: patch.reasons });
			touchedTimesheets.add(timesheet.id);
			linePatches.push({
				lineId: line.id,
				timesheetId: timesheet.id,
				status: patch.changes.status ?? null,
				primaryMarker: patch.changes.primaryMarker ?? null,
				hoursWorked: patch.changes.hoursWorked ?? null,
				regularHours: patch.changes.regularHours ?? null,
				overtimeHours: patch.changes.overtimeHours ?? null,
				lateHours: patch.changes.lateHours ?? null,
				earlyOutHours: patch.changes.earlyOutHours ?? null,
				undertimeHours: patch.changes.undertimeHours ?? null,
				notes: patch.changes.notes ?? null,
				metadata: patch.changes.metadata,
			});
		}
	}

	let autoApprovedTimesheets = 0;
	let autoApproveSkipped = 0;

	if (apply) {
		await applyLinePatchesWithRawSql(linePatches);

		if (autoApproveEnabled) {
			const approveCandidates = new Set<string>(touchedTimesheets);
			if (autoApproveWithOt) {
				const withLineOt = await loadTimesheetIdsWithLineOt({
					organizationId: period.organizationId,
					payrollPeriodId: period.id,
					employeeCodes: normalizedEmployeeFilter.size
						? normalizedEmployeeFilter
						: undefined,
				});
				for (const id of withLineOt) approveCandidates.add(id);
			}

			const result = await autoApproveTimesheetsWithRawSql(Array.from(approveCandidates));
			autoApprovedTimesheets = result.autoApprovedTimesheets;
			autoApproveSkipped = result.autoApproveSkipped;
		}
	}

	const byReason: Record<string, number> = {};
	for (const item of planned) {
		for (const reason of item.reasons) byReason[reason.replace(/[0-9]+\.[0-9]{2}h/g, "#h")] = (byReason[reason.replace(/[0-9]+\.[0-9]{2}h/g, "#h")] || 0) + 1;
	}

	console.log(JSON.stringify({
		mode: apply ? "apply" : "dry-run",
		period: { code: period.code, status: period.status },
		overtimeWorkbookPath,
		sourceRowsParsed: sourceByEmployeeDate.size,
		timesheetsChecked: timesheets.length,
		effectiveLinesChecked,
		plannedLineUpdates: planned.length,
		touchedTimesheets: touchedTimesheets.size,
		missingSourceRows,
		autoApproveEnabled,
		autoApproveWithOt,
		autoApprovedTimesheets,
		autoApproveSkipped,
		byReason,
		sample: planned.slice(0, 25),
		next: apply
			? autoApproveEnabled
				? "Timesheets that received approved OT were auto-approved when not already APPROVED. Re-check Run Payroll OT readiness."
				: "Re-run npx tsx scripts/dry-run-bandai-payroll-comparison.ts and show-bandai-payroll-comparison.ts --payslip-only --top=8."
			: "Run with --apply to update effective Timesheetline snapshots, recalculate touched timesheet summaries, and auto-approve touched timesheets (use --no-auto-approve to skip approval).",
	}, null, 2));
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
