/**
 * Repair: ABSENT timesheet lines on WorkSharing flag=0 days & universal off-days → REST_DAY.
 *
 * Proof: ABSENT lines sitting on WS=0 days, Sundays, and scheduled off-Saturdays
 * where scheduleSnapshot still said isOff:false (flag=0 never wrote OFF override).
 *
 * Usage:
 *   npx tsx scripts/repair-absent-on-worksharing-off-days.ts --period=PP-20260626-20260711
 *   npx tsx scripts/repair-absent-on-worksharing-off-days.ts --period=PP-20260626-20260711 --execute
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import { parseWorkSharingScheduleWorkbook } from "../helper/bnpi-worksharing-schedule-import.helper";

const execute = process.argv.includes("--execute");
const repoRoot = path.resolve(__dirname, "..", "..");

const dbUrl =
	process.env.PG_DATABASE_URL &&
	!process.env.PG_DATABASE_URL.includes("10.184.37.19") &&
	!process.env.PG_DATABASE_URL.includes("15433")
		? process.env.PG_DATABASE_URL
		: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public";
process.env.PG_DATABASE_URL = dbUrl;
process.env.DATABASE_URL = dbUrl;
process.env.WRITE_DATABASE_URL = dbUrl;

const prisma = new PrismaClient({
	datasources: {
		db: { url: dbUrl },
	},
});
const evidenceDir = path.join(
	repoRoot,
	".runtime",
	`absent-repair-proof-${new Date().toISOString().slice(0, 10)}`,
);

function getArgValue(flag: string): string | undefined {
	const prefix = `--${flag}=`;
	const match = process.argv.find((a) => a.startsWith(prefix));
	if (match) return match.slice(prefix.length).trim();
	const idx = process.argv.indexOf(`--${flag}`);
	if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
		return process.argv[idx + 1].trim();
	}
	return undefined;
}

async function main() {
	fs.mkdirSync(evidenceDir, { recursive: true });

	const periodCode =
		getArgValue("period") ||
		getArgValue("periodCode") ||
		process.env.PERIOD_CODE ||
		"PP-20260626-20260711";

	const period = await prisma.payrollPeriod.findFirst({
		where: { code: periodCode },
	});
	if (!period) {
		throw new Error(`Payroll period not found for code: ${periodCode}`);
	}

	const orgId = period.organizationId;
	const periodId = period.id;

	// Resolve WorkSharing file
	let wsFile = getArgValue("wsFile") || process.env.WS_FILE;
	if (!wsFile) {
		if (periodCode.includes("20260626")) {
			wsFile = path.join(
				repoRoot,
				"confidential-files",
				"june26-july10",
				"WorkSharingSchedule - June 26 to July 10, 2026.xlsx",
			);
		} else {
			wsFile = path.join(
				repoRoot,
				"confidential-files",
				"july11-july25",
				"WorkSharingSchedule - July 11-25, 2026.xlsx",
			);
		}
	}

	const offByEmp = new Map<string, Set<string>>();
	if (fs.existsSync(wsFile)) {
		const buffer = fs.readFileSync(wsFile);
		const parsed = parseWorkSharingScheduleWorkbook(buffer);
		const offs = parsed.dayOffAssignments || [];
		for (const d of offs) {
			if (!offByEmp.has(d.employeeExternalId))
				offByEmp.set(d.employeeExternalId, new Set());
			offByEmp.get(d.employeeExternalId)!.add(d.dateKey);
		}
	}

	const employees = await prisma.employee.findMany({
		where: {
			organizationId: orgId,
			isDeleted: false,
		},
		select: { id: true, employeeId: true },
	});
	const idByCode = new Map(employees.map((e) => [e.employeeId, e.id]));
	const codeById = new Map(employees.map((e) => [e.id, e.employeeId]));

	const candidates: Array<{
		lineId: string;
		employeeId: string;
		empPk: string;
		date: string;
		dateObj: Date;
		status: string;
		reason: string;
	}> = [];

	// Fetch all ABSENT lines for this period
	const absentLines = await (prisma as any).timesheetline.findMany({
		where: {
			organizationId: orgId,
			payrollPeriodId: periodId,
			isDeleted: false,
			isEffective: true,
			status: "ABSENT",
		},
		select: {
			id: true,
			employeeId: true,
			date: true,
			status: true,
			hoursWorked: true,
			regularHours: true,
			overtimeHours: true,
			timeIn: true,
			timeOut: true,
		},
	});

	for (const line of absentLines) {
		const code = codeById.get(line.employeeId);
		if (!code) continue;
		const lineDate = new Date(line.date);
		const dateKey = lineDate.toISOString().slice(0, 10);
		const dayOfWeek = lineDate.getUTCDay();

		// Reason 1: WorkSharing Flag = 0
		if (offByEmp.has(code) && offByEmp.get(code)!.has(dateKey)) {
			candidates.push({
				lineId: line.id,
				employeeId: code,
				empPk: line.employeeId,
				date: dateKey,
				dateObj: lineDate,
				status: line.status,
				reason: "WorkSharing flag=0 off day",
			});
			continue;
		}

		// Reason 2: Universal Sunday without punch evidence
		if (dayOfWeek === 0 && !line.timeIn && !line.timeOut) {
			candidates.push({
				lineId: line.id,
				employeeId: code,
				empPk: line.employeeId,
				date: dateKey,
				dateObj: lineDate,
				status: line.status,
				reason: "Sunday universal rest day without punches",
			});
			continue;
		}

		// Reason 3: Saturday July 4, 2026 company off-day without punch evidence
		if (dateKey === "2026-07-04" && !line.timeIn && !line.timeOut) {
			candidates.push({
				lineId: line.id,
				employeeId: code,
				empPk: line.employeeId,
				date: dateKey,
				dateObj: lineDate,
				status: line.status,
				reason: "Saturday July 4 company off-day without punches",
			});
			continue;
		}
	}

	const report = {
		mode: execute ? "execute" : "dry-run",
		periodCode,
		wsFile,
		periodId,
		orgId,
		absentLinesEvaluated: absentLines.length,
		repairedLinesFound: candidates.length,
		uniqueEmployeesAffected: new Set(candidates.map((c) => c.employeeId)).size,
		sample: candidates.slice(0, 20),
	};

	if (execute && candidates.length) {
		const restSnapshot = {
			code: "WS_OFF",
			name: "WorkSharing Off",
			isOff: true,
			isOvernight: false,
			shiftHour: 0,
			timeSlots: [],
			source: "WORKSHARING_DAY_FLAG_OFF_REPAIR",
			reason: "repair-absent-on-worksharing-off-days",
		};

		let updated = 0;
		for (const c of candidates) {
			await (prisma as any).timesheetline.update({
				where: { id: c.lineId },
				data: {
					status: "REST_DAY",
					primaryMarker: "REST_DAY",
					hoursWorked: "0:00",
					regularHours: "0:00",
					overtimeHours: "0:00",
					lateHours: "0:00",
					earlyOutHours: "0:00",
					undertimeHours: "0:00",
					scheduleSnapshot: restSnapshot,
					notes: `Repaired: ${c.reason} → REST_DAY (was ABSENT empty-bio)`,
				},
			});

			const dayStart = new Date(`${c.date}T00:00:00.000Z`);
			const existing = await (prisma as any).scheduleOverride.findFirst({
				where: {
					organizationId: orgId,
					employeeId: c.empPk,
					date: dayStart,
					isDeleted: false,
				},
				select: { id: true },
			});

			const ovData = {
				shiftTypeId: null,
				shiftSnapshot: restSnapshot,
				reason: `${c.reason} ${c.date}`,
				isDeleted: false,
			};

			if (existing?.id) {
				await (prisma as any).scheduleOverride.update({
					where: { id: existing.id },
					data: ovData,
				});
			} else {
				try {
					await (prisma as any).scheduleOverride.create({
						data: {
							organizationId: orgId,
							employeeId: c.empPk,
							date: dayStart,
							...ovData,
						},
					});
				} catch {
					await (prisma as any).scheduleOverride.updateMany({
						where: {
							organizationId: orgId,
							employeeId: c.empPk,
							date: dayStart,
						},
						data: ovData,
					});
				}
			}
			updated += 1;
		}
		(report as any).updatedLines = updated;
	}

	fs.writeFileSync(
		path.join(evidenceDir, `repair-ws-off-absent-${periodCode}.json`),
		JSON.stringify(report, null, 2),
	);
	console.log(JSON.stringify(report, null, 2));
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
