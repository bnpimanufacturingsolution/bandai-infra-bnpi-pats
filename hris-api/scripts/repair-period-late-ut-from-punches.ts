/**
 * Recompute late/early-out/undertime on effective timesheet lines (and linked
 * attendances) from timeIn/timeOut + scheduleSnapshot for one payroll period.
 *
 * Usage:
 *   npx tsx scripts/repair-period-late-ut-from-punches.ts --periodCode=PP-20260626-20260711
 *   npx tsx scripts/repair-period-late-ut-from-punches.ts --periodCode=... --apply
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { computeDm4BiometricDayMetrics } from "../helper/dm4-biometric-day-metrics.helper";

const prisma = new PrismaClient();
const readArg = (name: string, fallback?: string) => {
	const prefix = `${name}=`;
	return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || fallback;
};
const apply = process.argv.includes("--apply");
const periodCode = readArg("--periodCode", "PP-20260626-20260711")!;

function extractTime(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return null;
	// Stored as Manila-local wall clock via +08:00; use UTC getters if already UTC-encoded local.
	// Prefer ISO slice of Manila components when offset present.
	const iso = d.toISOString();
	// Convert to Asia/Manila wall time via toLocaleString is heavy; use getUTC if stored as +08.
	// Many rows are stored as 2026-07-01T03:10:00.000Z for 11:10 Manila â†’ use UTC+8.
	const manila = new Date(d.getTime() + 8 * 60 * 60 * 1000);
	const hh = String(manila.getUTCHours()).padStart(2, "0");
	const mm = String(manila.getUTCMinutes()).padStart(2, "0");
	return `${hh}:${mm}`;
}

async function main() {
	const period = await prisma.payrollPeriod.findFirst({
		where: { code: periodCode, isDeleted: false },
		select: { id: true, code: true, organizationId: true, startDate: true, endDate: true },
	});
	if (!period) throw new Error(`Period not found: ${periodCode}`);

	const lines = await prisma.timesheetline.findMany({
		where: {
			payrollPeriodId: period.id,
			isDeleted: false,
			isEffective: true,
			status: { in: ["PRESENT", "INCOMPLETE"] },
		},
		select: {
			id: true,
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
		date: string;
		from: string;
		to: string;
		lateHours: string;
		earlyOutHours: string;
		status: string;
	}> = [];
	const lineUpdates: Array<{
		id: string;
		status: string;
		hoursWorked: string;
		regularHours: string;
		overtimeHours: string;
		lateHours: string;
		earlyOutHours: string;
		undertimeHours: string;
		timeOut: Date | null;
	}> = [];
	const attUpdates: Array<{
		id: string;
		status: string;
		lateMinutes: number;
		earlyOutMinutes: number;
		undertimeMinutes: number;
		lateHours: string;
		earlyOutHours: string;
		undertimeHours: string;
		hoursWorked: string;
		regularHours: string;
		overtimeHours: string;
		totalMinutesWorked: number;
		regularMinutes: number;
		overtimeMinutes: number;
		timeOut: Date | null;
	}> = [];

	for (const line of lines) {
		const snap = (line.scheduleSnapshot || {}) as Record<string, any>;
		const timeIn = extractTime(line.timeIn);
		const timeOut = extractTime(line.timeOut);
		const punchCount =
			timeIn && timeOut && timeIn !== timeOut ? 2 : timeIn ? 1 : 0;
		const metrics = computeDm4BiometricDayMetrics({
			timeIn,
			timeOut,
			punchCount,
			schedule: {
				isOff: Boolean(snap.isOff),
				startTime: snap.startTime || null,
				endTime: snap.endTime || null,
				regularMinutes: snap.regularMinutes ?? snap.regularMinutes ?? 480,
				breakMinutes: snap.breakMinutes ?? 0,
				graceLateMinutes: snap.graceLateMinutes ?? 0,
				graceEarlyOutMinutes: snap.graceEarlyOutMinutes ?? 0,
				timeSlots: snap.timeSlots || null,
			},
		});

		const needs =
			metrics.lateHours !== (line.lateHours || "0:00") ||
			metrics.earlyOutHours !== (line.earlyOutHours || "0:00") ||
			metrics.undertimeHours !== (line.undertimeHours || "0:00") ||
			metrics.status !== line.status ||
			(metrics.incomplete && (line.hoursWorked || "0:00") !== "0:00") ||
			(metrics.incomplete && line.timeOut != null && !metrics.timeOut);

		if (!needs) continue;

		planned.push({
			lineId: line.id,
			date: line.date.toISOString().slice(0, 10),
			from: `${line.status} late=${line.lateHours} eo=${line.earlyOutHours} worked=${line.hoursWorked}`,
			to: `${metrics.status} late=${metrics.lateHours} eo=${metrics.earlyOutHours} worked=${metrics.hoursWorked}`,
			lateHours: metrics.lateHours,
			earlyOutHours: metrics.earlyOutHours,
			status: metrics.status,
		});

		// Preserve approved OT hours when Bandai OT buckets already stamp payable OT.
		const hasApprovedBuckets = Boolean(
			(line.metadata as any)?.bandaiPayrollSourceRepair?.approvedBuckets,
		);
		lineUpdates.push({
			id: line.id,
			status: metrics.incomplete ? "INCOMPLETE" : line.status,
			hoursWorked: metrics.incomplete ? "0:00" : line.hoursWorked || metrics.hoursWorked,
			regularHours: metrics.incomplete ? "0:00" : line.regularHours || metrics.regularHours,
			overtimeHours: hasApprovedBuckets
				? line.overtimeHours || "0:00"
				: metrics.overtimeHours,
			lateHours: metrics.lateHours,
			earlyOutHours: metrics.earlyOutHours,
			undertimeHours: metrics.undertimeHours,
			timeOut: metrics.timeOut ? line.timeOut : null,
		});

		if (line.attendanceId) {
			attUpdates.push({
				id: line.attendanceId,
				status: metrics.status,
				lateMinutes: metrics.lateMinutes,
				earlyOutMinutes: metrics.earlyOutMinutes,
				undertimeMinutes: metrics.undertimeMinutes,
				lateHours: metrics.lateHours,
				earlyOutHours: metrics.earlyOutHours,
				undertimeHours: metrics.undertimeHours,
				hoursWorked: metrics.hoursWorked,
				regularHours: metrics.regularHours,
				overtimeHours: metrics.overtimeHours,
				totalMinutesWorked: metrics.totalMinutesWorked,
				regularMinutes: metrics.regularMinutes,
				overtimeMinutes: metrics.overtimeMinutes,
				timeOut: metrics.timeOut ? line.timeOut : null,
			});
		}
	}

	if (apply && lineUpdates.length) {
		// Batch updates via raw JSON for speed
		const patchJson = JSON.stringify(lineUpdates);
		await prisma.$executeRawUnsafe(
			`
			UPDATE timesheet_lines line
			SET
				status = patch.status,
				"hoursWorked" = patch."hoursWorked",
				"regularHours" = patch."regularHours",
				"overtimeHours" = patch."overtimeHours",
				"lateHours" = patch."lateHours",
				"earlyOutHours" = patch."earlyOutHours",
				"undertimeHours" = patch."undertimeHours",
				"timeOut" = CASE WHEN patch."timeOut" IS NULL THEN NULL ELSE line."timeOut" END,
				"primaryMarker" = patch.status,
				"updatedAt" = now()
			FROM jsonb_to_recordset($1::jsonb) AS patch(
				id text,
				status text,
				"hoursWorked" text,
				"regularHours" text,
				"overtimeHours" text,
				"lateHours" text,
				"earlyOutHours" text,
				"undertimeHours" text,
				"timeOut" text
			)
			WHERE line.id = patch.id
			`,
			patchJson,
		);

		if (attUpdates.length) {
			const attJson = JSON.stringify(attUpdates);
			await prisma.$executeRawUnsafe(
				`
				UPDATE attendances a
				SET
					status = patch.status::"AttendanceStatus",
					"lateMinutes" = patch."lateMinutes",
					"earlyOutMinutes" = patch."earlyOutMinutes",
					"undertimeMinutes" = patch."undertimeMinutes",
					"lateHours" = patch."lateHours",
					"earlyOutHours" = patch."earlyOutHours",
					"undertimeHours" = patch."undertimeHours",
					"hoursWorked" = patch."hoursWorked",
					"regularHours" = patch."regularHours",
					"overtimeHours" = patch."overtimeHours",
					"totalMinutesWorked" = patch."totalMinutesWorked",
					"regularMinutes" = patch."regularMinutes",
					"overtimeMinutes" = patch."overtimeMinutes",
					"timeOut" = CASE WHEN patch."timeOut" IS NULL THEN NULL ELSE a."timeOut" END,
					"updatedAt" = now()
				FROM jsonb_to_recordset($1::jsonb) AS patch(
					id text,
					status text,
					"lateMinutes" int,
					"earlyOutMinutes" int,
					"undertimeMinutes" int,
					"lateHours" text,
					"earlyOutHours" text,
					"undertimeHours" text,
					"hoursWorked" text,
					"regularHours" text,
					"overtimeHours" text,
					"totalMinutesWorked" int,
					"regularMinutes" int,
					"overtimeMinutes" int,
					"timeOut" text
				)
				WHERE a.id = patch.id
				`,
				attJson,
			);
		}
	}

	console.log(
		JSON.stringify(
			{
				mode: apply ? "apply" : "dry-run",
				period: period.code,
				linesScanned: lines.length,
				plannedUpdates: planned.length,
				attendanceUpdates: attUpdates.length,
				sample: planned.slice(0, 20),
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

