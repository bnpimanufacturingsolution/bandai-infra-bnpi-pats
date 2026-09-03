/**
 * Step 2: Reclassify timesheet ABSENT days that have biometric punches (false absent).
 *
 * Buckets:
 *  A. ABSENT + has timeIn/timeOut or punches → PRESENT or INCOMPLETE + recompute late vs assigned schedule
 *  B/C/D. true empty / leave → left alone (not flipped)
 *
 * Usage (hris-api, local clone DB):
 *   npx tsx scripts/repair-period-false-absent-from-punches.ts --periodCode=PP-20260626-20260711
 *   npx tsx scripts/repair-period-false-absent-from-punches.ts --periodCode=... --apply
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import { computeDm4BiometricDayMetrics } from "../helper/dm4-biometric-day-metrics.helper";
import { resolveEffectiveShift } from "../helper/employee-schedule.helper";

const prisma = new PrismaClient();
const readArg = (name: string, fallback?: string) => {
	const prefix = `${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
};
const apply = process.argv.includes("--apply");
const periodCode = readArg("--periodCode", "PP-20260626-20260711")!;
const outDir =
	readArg("--outDir") ||
	path.resolve(process.cwd(), `../.runtime/false-absent-${new Date().toISOString().slice(0, 10)}`);

function extractTime(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return null;
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
	fs.mkdirSync(outDir, { recursive: true });
	const period = await prisma.payrollPeriod.findFirst({
		where: { code: periodCode, isDeleted: false },
		select: { id: true, code: true, organizationId: true, startDate: true, endDate: true },
	});
	if (!period) throw new Error(`Period not found: ${periodCode}`);

	const absentLines = await prisma.timesheetline.findMany({
		where: {
			payrollPeriodId: period.id,
			isDeleted: false,
			isEffective: true,
			status: "ABSENT",
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

	const buckets = {
		A_false_absent_with_punches: [] as any[],
		D_true_absent_no_punches: [] as any[],
		skipped_off_schedule: [] as any[],
	};

	const planned: any[] = [];
	const lineUpdates: any[] = [];
	const attUpdates: any[] = [];

	for (const line of absentLines) {
		const timeIn = extractTime(line.timeIn);
		const timeOut = extractTime(line.timeOut);
		const hasPunch = Boolean(timeIn || timeOut);
		const day = line.date.toISOString().slice(0, 10);

		if (!hasPunch) {
			buckets.D_true_absent_no_punches.push({
				lineId: line.id,
				employeeId: line.employeeId,
				date: day,
			});
			continue;
		}

		const effective = await resolveEffectiveShift(prisma as any, {
			organizationId: line.organizationId,
			employeeId: line.employeeId,
			date: line.date,
		});
		const scheduleSnap = effective
			? { ...effective, source: effective.source || "ASSIGNED_SCHEDULE" }
			: line.scheduleSnapshot;
		const schedule = snapshotToMetricsSchedule(scheduleSnap || {});

		if (schedule.isOff) {
			buckets.skipped_off_schedule.push({
				lineId: line.id,
				employeeId: line.employeeId,
				date: day,
				note: "ABSENT with punches but schedule is OFF — leave for REST/OT path review",
			});
			continue;
		}

		const punchCount = timeIn && timeOut && timeIn !== timeOut ? 2 : timeIn ? 1 : 0;
		const metrics = computeDm4BiometricDayMetrics({
			timeIn,
			timeOut,
			punchCount,
			schedule,
		});
		const nextStatus = metrics.incomplete ? "INCOMPLETE" : "PRESENT";
		const hasApprovedBuckets = Boolean(
			(line.metadata as any)?.bandaiPayrollSourceRepair?.approvedBuckets,
		);

		const row = {
			lineId: line.id,
			employeeId: line.employeeId,
			date: day,
			timeIn,
			timeOut,
			from: "ABSENT",
			to: nextStatus,
			late: metrics.lateHours,
			eo: metrics.earlyOutHours,
			schedule: `${schedule.startTime || "?"}-${schedule.endTime || "?"} (${schedule.code || "n/a"})`,
		};
		buckets.A_false_absent_with_punches.push(row);
		planned.push(row);

		lineUpdates.push({
			id: line.id,
			status: nextStatus,
			hoursWorked: metrics.incomplete ? "0:00" : metrics.hoursWorked,
			regularHours: metrics.incomplete ? "0:00" : metrics.regularHours,
			overtimeHours: hasApprovedBuckets
				? line.overtimeHours || "0:00"
				: metrics.overtimeHours,
			lateHours: metrics.lateHours,
			earlyOutHours: metrics.earlyOutHours,
			undertimeHours: metrics.undertimeHours,
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
				lateHours: metrics.lateHours,
				earlyOutHours: metrics.earlyOutHours,
				undertimeHours: metrics.undertimeHours,
				hoursWorked: metrics.incomplete ? "0:00" : metrics.hoursWorked,
				regularHours: metrics.incomplete ? "0:00" : metrics.regularHours,
				overtimeHours: hasApprovedBuckets
					? line.overtimeHours || "0:00"
					: metrics.overtimeHours,
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

	const summary = {
		mode: apply ? "apply" : "dry-run",
		period: period.code,
		absentLinesScanned: absentLines.length,
		bucketA_falseAbsentWithPunches: buckets.A_false_absent_with_punches.length,
		bucketD_trueAbsentNoPunches: buckets.D_true_absent_no_punches.length,
		bucketSkippedOffWithPunches: buckets.skipped_off_schedule.length,
		plannedWrites: planned.length,
		sampleA: buckets.A_false_absent_with_punches.slice(0, 30),
		sampleD: buckets.D_true_absent_no_punches.slice(0, 15),
		sampleSkippedOff: buckets.skipped_off_schedule.slice(0, 15),
	};

	fs.writeFileSync(path.join(outDir, "false-absent-summary.json"), JSON.stringify(summary, null, 2));
	fs.writeFileSync(
		path.join(outDir, "false-absent-bucket-A.json"),
		JSON.stringify(buckets.A_false_absent_with_punches, null, 2),
	);
	fs.writeFileSync(
		path.join(outDir, "false-absent-bucket-D.json"),
		JSON.stringify(buckets.D_true_absent_no_punches, null, 2),
	);
	console.log(JSON.stringify(summary, null, 2));
	console.log("OUT", outDir);
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
