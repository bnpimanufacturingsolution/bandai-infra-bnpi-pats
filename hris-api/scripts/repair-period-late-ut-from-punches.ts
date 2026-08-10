/**
 * Option A: recompute late/early-out/undertime using the employee's *assigned*
 * schedule for that day (schedule_override → resolveEffectiveShift), not a
 * stale punch-inferred timesheet scheduleSnapshot.
 *
 * Optionally apply WorkSharing day flags as schedule_overrides first:
 *   --worksharing-workbook=path/to/WorkSharingSchedule.xlsx
 *
 * Usage (from hris-api, with dev:local DB):
 *   npx tsx scripts/repair-period-late-ut-from-punches.ts --periodCode=PP-20260626-20260711
 *   npx tsx scripts/repair-period-late-ut-from-punches.ts --periodCode=... --apply
 *   npx tsx scripts/repair-period-late-ut-from-punches.ts --periodCode=... --apply \
 *     --worksharing-workbook=../confidential-files/june26-july10/WorkSharingSchedule - June 26 to July 10, 2026.xlsx
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import { computeDm4BiometricDayMetrics } from "../helper/dm4-biometric-day-metrics.helper";
import { resolveEffectiveShift } from "../helper/employee-schedule.helper";
import { importWorkSharingScheduleUpload } from "../app/migration/bnpi-worksharing-schedule-import.service";

const prisma = new PrismaClient();
const readArg = (name: string, fallback?: string) => {
	const prefix = `${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
};
const apply = process.argv.includes("--apply");
const periodCode = readArg("--periodCode", "PP-20260626-20260711")!;
const worksharingWorkbookArg = readArg("--worksharing-workbook");

function extractTime(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return null;
	// Stored as Manila wall via +08 offset (e.g. 03:10Z = 11:10 Manila).
	const manila = new Date(d.getTime() + 8 * 60 * 60 * 1000);
	const hh = String(manila.getUTCHours()).padStart(2, "0");
	const mm = String(manila.getUTCMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

function snapshotToMetricsSchedule(snap: any) {
	const timeSlots = Array.isArray(snap?.timeSlots) ? snap.timeSlots : [];
	let startTime = snap?.startTime || null;
	let endTime = snap?.endTime || null;
	if ((!startTime || !endTime) && timeSlots.length) {
		const work = timeSlots.filter((s: any) => s?.type !== "break" && s?.startTime && s?.endTime);
		if (work.length) {
			startTime = work[0].startTime;
			endTime = work[work.length - 1].endTime;
		}
	}
	let breakMinutes = Number(snap?.breakMinutes || 0);
	if (!breakMinutes && timeSlots.length) {
		for (const slot of timeSlots) {
			if (slot?.type !== "break") continue;
			const [sh, sm] = String(slot.startTime || "0:0").split(":").map(Number);
			const [eh, em] = String(slot.endTime || "0:0").split(":").map(Number);
			breakMinutes += Math.max(0, eh * 60 + em - (sh * 60 + sm));
		}
	}
	let regularMinutes = Number(snap?.regularMinutes || 0);
	if (!regularMinutes && startTime && endTime) {
		const [sh, sm] = String(startTime).split(":").map(Number);
		const [eh, em] = String(endTime).split(":").map(Number);
		let span = eh * 60 + em - (sh * 60 + sm);
		if (span <= 0) span += 24 * 60;
		regularMinutes = Math.max(0, span - breakMinutes);
	}
	if (!regularMinutes) regularMinutes = 480;

	return {
		isOff: Boolean(snap?.isOff),
		startTime,
		endTime,
		regularMinutes,
		breakMinutes,
		graceLateMinutes: Number(snap?.graceLateMinutes || 0),
		graceEarlyOutMinutes: Number(snap?.graceEarlyOutMinutes || 0),
		timeSlots,
		code: snap?.shiftTypeCode || snap?.code || null,
		name: snap?.shiftTypeName || snap?.name || null,
	};
}

async function main() {
	const period = await prisma.payrollPeriod.findFirst({
		where: { code: periodCode, isDeleted: false },
		select: {
			id: true,
			code: true,
			organizationId: true,
			startDate: true,
			endDate: true,
		},
	});
	if (!period) throw new Error(`Period not found: ${periodCode}`);

	let worksharingImport: any = null;
	if (worksharingWorkbookArg) {
		const workbookPath = path.resolve(process.cwd(), worksharingWorkbookArg);
		if (!fs.existsSync(workbookPath)) {
			throw new Error(`Worksharing workbook not found: ${workbookPath}`);
		}
		if (apply) {
			const buffer = fs.readFileSync(workbookPath);
			worksharingImport = await importWorkSharingScheduleUpload({
				prisma: prisma as any,
				organizationId: period.organizationId,
				buffer,
				sourceFilename: path.basename(workbookPath),
				persistLog: false,
			});
		} else {
			worksharingImport = {
				mode: "dry-run-skipped-import",
				note: "Pass --apply to import day-level WorkSharing overrides before late recompute",
				workbookPath,
			};
		}
	}

	const lines = await prisma.timesheetline.findMany({
		where: {
			payrollPeriodId: period.id,
			isDeleted: false,
			isEffective: true,
			status: { in: ["PRESENT", "INCOMPLETE"] },
		},
		select: {
			id: true,
			organizationId: true,
			employeeId: true,
			timesheetId: true,
			attendanceId: true,
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
			scheduleSnapshot: true,
			metadata: true,
		},
	});

	const planned: Array<{
		lineId: string;
		employeeId: string;
		date: string;
		schedule: string;
		from: string;
		to: string;
	}> = [];
	const lineUpdates: any[] = [];
	const attUpdates: any[] = [];
	let scheduleResolved = 0;
	let scheduleFallbackSnapshot = 0;

	for (const line of lines) {
		const effective = await resolveEffectiveShift(prisma as any, {
			organizationId: line.organizationId,
			employeeId: line.employeeId,
			date: line.date,
		});
		const scheduleSnap = effective
			? {
					...effective,
					source: effective.source || "ASSIGNED_SCHEDULE",
				}
			: line.scheduleSnapshot;
		if (effective) scheduleResolved += 1;
		else scheduleFallbackSnapshot += 1;

		const schedule = snapshotToMetricsSchedule(scheduleSnap || {});
		const timeIn = extractTime(line.timeIn);
		const timeOut = extractTime(line.timeOut);
		const punchCount = timeIn && timeOut && timeIn !== timeOut ? 2 : timeIn ? 1 : 0;
		const metrics = computeDm4BiometricDayMetrics({
			timeIn,
			timeOut,
			punchCount,
			schedule,
		});

		const hasApprovedBuckets = Boolean(
			(line.metadata as any)?.bandaiPayrollSourceRepair?.approvedBuckets,
		);
		const nextStatus = metrics.incomplete ? "INCOMPLETE" : line.status;
		const nextLate = metrics.lateHours;
		const nextEo = metrics.earlyOutHours;
		const nextUt = metrics.undertimeHours;
		const nextHoursWorked = metrics.incomplete
			? "0:00"
			: line.hoursWorked || metrics.hoursWorked;
		const nextRegular = metrics.incomplete
			? "0:00"
			: line.regularHours || metrics.regularHours;
		const nextOt = hasApprovedBuckets
			? line.overtimeHours || "0:00"
			: metrics.overtimeHours;

		const needs =
			nextLate !== (line.lateHours || "0:00") ||
			nextEo !== (line.earlyOutHours || "0:00") ||
			nextUt !== (line.undertimeHours || "0:00") ||
			nextStatus !== line.status ||
			(metrics.incomplete && (line.hoursWorked || "0:00") !== "0:00") ||
			JSON.stringify(line.scheduleSnapshot || {}) !== JSON.stringify(scheduleSnap || {});

		if (!needs) continue;

		planned.push({
			lineId: line.id,
			employeeId: line.employeeId,
			date: line.date.toISOString().slice(0, 10),
			schedule: `${schedule.startTime || "?"}-${schedule.endTime || "?"} (${schedule.code || "n/a"})`,
			from: `${line.status} late=${line.lateHours} eo=${line.earlyOutHours}`,
			to: `${nextStatus} late=${nextLate} eo=${nextEo}`,
		});

		lineUpdates.push({
			id: line.id,
			status: nextStatus,
			hoursWorked: nextHoursWorked,
			regularHours: nextRegular,
			overtimeHours: nextOt,
			lateHours: nextLate,
			earlyOutHours: nextEo,
			undertimeHours: nextUt,
			scheduleSnapshot: scheduleSnap,
			clearTimeOut: metrics.incomplete && !metrics.timeOut,
		});

		if (line.attendanceId) {
			attUpdates.push({
				id: line.attendanceId,
				status: nextStatus,
				lateMinutes: metrics.lateMinutes,
				earlyOutMinutes: metrics.earlyOutMinutes,
				undertimeMinutes: metrics.undertimeMinutes,
				lateHours: nextLate,
				earlyOutHours: nextEo,
				undertimeHours: nextUt,
				hoursWorked: nextHoursWorked,
				regularHours: nextRegular,
				overtimeHours: nextOt,
				totalMinutesWorked: metrics.totalMinutesWorked,
				regularMinutes: metrics.regularMinutes,
				overtimeMinutes: metrics.overtimeMinutes,
				scheduleSnapshot: scheduleSnap,
				clearTimeOut: metrics.incomplete && !metrics.timeOut,
			});
		}
	}

	if (apply && lineUpdates.length) {
		for (const p of lineUpdates) {
			await prisma.$executeRawUnsafe(
				`
				UPDATE timesheet_lines SET
					status = $2,
					"hoursWorked" = $3,
					"regularHours" = $4,
					"overtimeHours" = $5,
					"lateHours" = $6,
					"earlyOutHours" = $7,
					"undertimeHours" = $8,
					"scheduleSnapshot" = $9::jsonb,
					"primaryMarker" = $2,
					"timeOut" = CASE WHEN $10::boolean THEN NULL ELSE "timeOut" END,
					"updatedAt" = now()
				WHERE id = $1
				`,
				p.id,
				p.status,
				p.hoursWorked,
				p.regularHours,
				p.overtimeHours,
				p.lateHours,
				p.earlyOutHours,
				p.undertimeHours,
				JSON.stringify(p.scheduleSnapshot || {}),
				p.clearTimeOut,
			);
		}
		for (const p of attUpdates) {
			await prisma.$executeRawUnsafe(
				`
				UPDATE attendances SET
					status = $2::"AttendanceStatus",
					"lateMinutes" = $3,
					"earlyOutMinutes" = $4,
					"undertimeMinutes" = $5,
					"lateHours" = $6,
					"earlyOutHours" = $7,
					"undertimeHours" = $8,
					"hoursWorked" = $9,
					"regularHours" = $10,
					"overtimeHours" = $11,
					"totalMinutesWorked" = $12,
					"regularMinutes" = $13,
					"overtimeMinutes" = $14,
					"scheduleSnapshot" = $15::jsonb,
					"timeOut" = CASE WHEN $16::boolean THEN NULL ELSE "timeOut" END,
					"updatedAt" = now()
				WHERE id = $1
				`,
				p.id,
				p.status,
				p.lateMinutes,
				p.earlyOutMinutes,
				p.undertimeMinutes,
				p.lateHours,
				p.earlyOutHours,
				p.undertimeHours,
				p.hoursWorked,
				p.regularHours,
				p.overtimeHours,
				p.totalMinutesWorked,
				p.regularMinutes,
				p.overtimeMinutes,
				JSON.stringify(p.scheduleSnapshot || {}),
				p.clearTimeOut,
			);
		}
	}

	console.log(
		JSON.stringify(
			{
				mode: apply ? "apply" : "dry-run",
				period: period.code,
				worksharingImport: worksharingImport
					? {
							dayAssignmentsParsed: worksharingImport.dayAssignmentsParsed,
							dayOverridesCreated: worksharingImport.dayOverridesCreated,
							dayOverridesUpdated: worksharingImport.dayOverridesUpdated,
							created: worksharingImport.created,
							updated: worksharingImport.updated,
							failed: worksharingImport.failed,
						}
					: null,
				linesScanned: lines.length,
				scheduleResolvedFromAssigned: scheduleResolved,
				scheduleFallbackToLineSnapshot: scheduleFallbackSnapshot,
				plannedUpdates: planned.length,
				attendanceUpdates: attUpdates.length,
				sample: planned.slice(0, 25),
			},
			null,
			2,
		),
	);
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
