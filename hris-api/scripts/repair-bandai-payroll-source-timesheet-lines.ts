import "dotenv/config";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");

const readArg = (name: string, fallback?: string) => {
	const prefix = `${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
};

const apply = process.argv.includes("--apply");
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

type OvertimeSourceRow = {
	rowNumber: number;
	date: string;
	department: string;
	name: string;
	employeeNo: string;
	regularDays: number;
	regOtHrs: number;
	regNdHrs: number;
	spclHrs: number;
	spclOtHrs: number;
	rholHrs: number;
	rholOtHrs: number;
	rdHrs: number;
	rdOtHrs: number;
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
const timeToMinutes = (value: unknown) => {
	const raw = text(value);
	if (!raw) return 0;
	const [hours, minutes = 0] = raw.split(":").map(Number);
	return (hours || 0) * 60 + (minutes || 0);
};
const hoursToTime = (hours: number) => {
	const totalMinutes = Math.max(0, Math.round(hours * 60));
	return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
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

function approvedOvertimeHours(source: OvertimeSourceRow) {
	return source.regOtHrs + source.spclOtHrs + source.rholOtHrs + source.rdOtHrs;
}

function approvedPremiumHours(source: OvertimeSourceRow) {
	return source.spclHrs + source.spclOtHrs + source.rholHrs + source.rholOtHrs + source.rdHrs + source.rdOtHrs;
}

function hasAnyApprovedPayBucket(source: OvertimeSourceRow) {
	return (
		source.regularDays > 0 ||
		source.regOtHrs > 0 ||
		source.regNdHrs > 0 ||
		source.spclHrs > 0 ||
		source.spclOtHrs > 0 ||
		source.rholHrs > 0 ||
		source.rholOtHrs > 0 ||
		source.rdHrs > 0 ||
		source.rdOtHrs > 0
	);
}

const approvedBucketKeys = [
	"regularDays",
	"regOtHrs",
	"regNdHrs",
	"spclHrs",
	"spclOtHrs",
	"rholHrs",
	"rholOtHrs",
	"rdHrs",
	"rdOtHrs",
] as const;

function approvedBucketsDiffer(current: unknown, source: OvertimeSourceRow) {
	if (!current || typeof current !== "object" || Array.isArray(current)) return true;
	const bucket = current as Record<string, unknown>;
	return approvedBucketKeys.some(
		(key) => Math.abs(numberValue(bucket[key]) - source[key]) > 0.001,
	);
}

function hasPayrollPremiumMarker(line: any) {
	const marker = String(line.primaryMarker || line.metadata?.primaryMarker || "").toUpperCase();
	return (
		marker === "HOLIDAY" ||
		marker === "REST_DAY" ||
		Array.isArray(line.metadata?.holidayEntries) ||
		Boolean(line.metadata?.holidayType || line.metadata?.holidayTitle)
	);
}

function withoutPremiumMetadata(metadata: Record<string, any>) {
	const {
		holidayEntries: _holidayEntries,
		holidayType: _holidayType,
		holidayTitle: _holidayTitle,
		isDoubleHoliday: _isDoubleHoliday,
		...rest
	} = metadata;
	return rest;
}

function buildLinePatch(line: any, source: OvertimeSourceRow, isCalendarHoliday: boolean) {
	const currentOvertime = timeToMinutes(line.overtimeHours) / 60;
	const targetOvertime = approvedOvertimeHours(source);
	const sourceHasPayBucket = hasAnyApprovedPayBucket(source);
	const sourceHasPremiumBucket = approvedPremiumHours(source) > 0;
	const changes: Record<string, any> = {};
	const reasons: string[] = [];
	const metadata = {
		...(line.metadata || {}),
		bandaiPayrollSourceRepair: {
			source: "2026 rptOvertimeDetails.xlsx",
			sourceRow: source.rowNumber,
			employeeNo: source.employeeNo,
			date: source.date,
			appliedAt: new Date().toISOString(),
			previous: {
				status: line.status,
				hoursWorked: line.hoursWorked,
				regularHours: line.regularHours,
				overtimeHours: line.overtimeHours,
				primaryMarker: line.primaryMarker,
			},
			approvedBuckets: {
				regularDays: source.regularDays,
				regOtHrs: source.regOtHrs,
				regNdHrs: source.regNdHrs,
				spclHrs: source.spclHrs,
				spclOtHrs: source.spclOtHrs,
				rholHrs: source.rholHrs,
				rholOtHrs: source.rholOtHrs,
				rdHrs: source.rdHrs,
				rdOtHrs: source.rdOtHrs,
			},
		},
	};

	if (Math.abs(currentOvertime - targetOvertime) > 0.01) {
		changes.overtimeHours = hoursToTime(targetOvertime);
		reasons.push(`overtime ${currentOvertime.toFixed(2)}h -> ${targetOvertime.toFixed(2)}h`);
	}

	if (approvedBucketsDiffer(line.metadata?.bandaiPayrollSourceRepair?.approvedBuckets, source)) {
		changes.metadata = metadata;
		reasons.push("approved bucket metadata refreshed from overtime source");
	}

	if (!sourceHasPayBucket && !["REST_DAY", "LEAVE"].includes(String(line.status || ""))) {
		changes.status = "REST_DAY";
		changes.primaryMarker = "REST_DAY";
		changes.hoursWorked = "0:00";
		changes.regularHours = "0:00";
		changes.overtimeHours = "0:00";
		changes.lateHours = "0:00";
		changes.earlyOutHours = "0:00";
		changes.undertimeHours = "0:00";
		reasons.push(`${line.status} -> REST_DAY because source has zero regular/OT/premium buckets`);
	} else if (
		source.regularDays > 0 &&
		!sourceHasPremiumBucket &&
		String(line.status || "") === "PRESENT" &&
		(isCalendarHoliday || hasPayrollPremiumMarker(line))
	) {
		changes.status = "HOLIDAY";
		changes.primaryMarker = "HOLIDAY";
		changes.metadata = {
			...withoutPremiumMetadata(metadata),
			primaryMarker: "HOLIDAY",
		};
		reasons.push("cleared premium marker because source has regular day but zero holiday/rest premium buckets");
	}

	if (!Object.keys(changes).length) return null;
	changes.metadata = changes.metadata || metadata;
	return { changes, reasons };
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
	const timesheets = await prisma.timesheet.findMany({
		where: {
			organizationId: period.organizationId,
			payrollPeriodId: period.id,
			isDeleted: false,
			status: "APPROVED",
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
					hoursWorked: true,
					regularHours: true,
					overtimeHours: true,
					lateHours: true,
					earlyOutHours: true,
					undertimeHours: true,
					primaryMarker: true,
					metadata: true,
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
				metadata: patch.changes.metadata,
			});
		}
	}

	if (apply) {
		await applyLinePatchesWithRawSql(linePatches);
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
		byReason,
		sample: planned.slice(0, 25),
		next: apply
			? "Re-run npx tsx scripts/dry-run-bandai-payroll-comparison.ts and show-bandai-payroll-comparison.ts --payslip-only --top=8."
			: "Run with --apply to update effective Timesheetline snapshots and recalculate touched timesheet summaries.",
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
