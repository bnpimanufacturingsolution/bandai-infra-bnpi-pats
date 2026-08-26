/**
 * Repair: ABSENT timesheet lines on WorkSharing flag=0 days → REST_DAY.
 *
 * Proof (Jul 11–25): all Rio-class / absent-fail ABSENT lines sat on WS=0 days
 * while scheduleSnapshot still said isOff:false (flag=0 never wrote OFF override).
 *
 * Usage (hris-api, local clone):
 *   $env:PG_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public'
 *   $env:ORG_ID='cmryhwpv70000vgaktlmrubmx'
 *   $env:PERIOD_ID='cmryhzl500032vgakz1uy1k7l'
 *   $env:WS_FILE='../confidential-files/july11-july25/WorkSharingSchedule - July 11-25, 2026.xlsx'
 *   npx tsx scripts/repair-absent-on-worksharing-off-days.ts
 *   npx tsx scripts/repair-absent-on-worksharing-off-days.ts --execute
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import { parseWorkSharingScheduleWorkbook } from "../helper/bnpi-worksharing-schedule-import.helper";

const execute = process.argv.includes("--execute");
const repoRoot = path.resolve(__dirname, "..", "..");
const orgId = process.env.ORG_ID || "cmryhwpv70000vgaktlmrubmx";
const periodId = process.env.PERIOD_ID || "cmryhzl500032vgakz1uy1k7l";
const wsFile =
	process.env.WS_FILE ||
	path.join(
		repoRoot,
		"confidential-files",
		"july11-july25",
		"WorkSharingSchedule - July 11-25, 2026.xlsx",
	);

process.env.PG_DATABASE_URL =
	process.env.PG_DATABASE_URL ||
	"postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public";
process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
process.env.WRITE_DATABASE_URL = process.env.PG_DATABASE_URL;

const prisma = new PrismaClient();
const evidenceDir = path.join(repoRoot, ".runtime", "absent-nopunch-proof-20260818");

async function main() {
	fs.mkdirSync(evidenceDir, { recursive: true });
	const buffer = fs.readFileSync(wsFile);
	const parsed = parseWorkSharingScheduleWorkbook(buffer);
	const offs = parsed.dayOffAssignments || [];
	const offByEmp = new Map<string, Set<string>>();
	for (const d of offs) {
		if (!offByEmp.has(d.employeeExternalId)) offByEmp.set(d.employeeExternalId, new Set());
		offByEmp.get(d.employeeExternalId)!.add(d.dateKey);
	}

	const employees = await prisma.employee.findMany({
		where: {
			organizationId: orgId,
			isDeleted: false,
			employeeId: { in: Array.from(offByEmp.keys()) },
		},
		select: { id: true, employeeId: true },
	});
	const idByCode = new Map(employees.map((e) => [e.employeeId, e.id]));

	const candidates: Array<{
		lineId: string;
		employeeId: string;
		date: string;
		status: string;
	}> = [];

	for (const [code, dates] of offByEmp) {
		const empPk = idByCode.get(code);
		if (!empPk) continue;
		for (const dateKey of dates) {
			const dayStart = new Date(`${dateKey}T00:00:00.000Z`);
			const dayEnd = new Date(dayStart);
			dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
			const lines = await (prisma as any).timesheetline.findMany({
				where: {
					organizationId: orgId,
					employeeId: empPk,
					payrollPeriodId: periodId,
					isDeleted: false,
					isEffective: true,
					status: "ABSENT",
					date: { gte: dayStart, lt: dayEnd },
				},
				select: { id: true, employeeId: true, date: true, status: true },
			});
			for (const line of lines) {
				candidates.push({
					lineId: line.id,
					employeeId: code,
					date: dateKey,
					status: line.status,
				});
			}
		}
	}

	const report = {
		mode: execute ? "execute" : "dry-run",
		wsFile,
		periodId,
		orgId,
		dayOffAssignments: offs.length,
		absentLinesOnOffDays: candidates.length,
		uniqueEmployees: new Set(candidates.map((c) => c.employeeId)).size,
		sample: candidates.slice(0, 20),
	};

	if (execute && candidates.length) {
		const restSnapshot = {
			code: "WS_OFF",
			name: "WorkSharing Off",
			isOff: true,
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
					scheduleSnapshot: restSnapshot,
					notes: "Repaired: WorkSharing flag=0 → REST_DAY (was ABSENT empty-bio)",
				},
			});
			// Upsert OFF override so resolveEffectiveShift stays correct
			const empPk = idByCode.get(c.employeeId);
			if (!empPk) continue;
			const dayStart = new Date(`${c.date}T00:00:00.000Z`);
			const existing = await (prisma as any).scheduleOverride.findFirst({
				where: {
					organizationId: orgId,
					employeeId: empPk,
					date: dayStart,
					isDeleted: false,
				},
				select: { id: true },
			});
			const ovData = {
				shiftTypeId: null,
				shiftSnapshot: restSnapshot,
				reason: `WorkSharing day flag OFF repair ${c.date}`,
				isDeleted: false,
			};
			if (existing?.id) {
				await (prisma as any).scheduleOverride.update({
					where: { id: existing.id },
					data: ovData,
				});
			} else {
				await (prisma as any).scheduleOverride.create({
					data: {
						organizationId: orgId,
						employeeId: empPk,
						date: dayStart,
						...ovData,
					},
				});
			}
			updated += 1;
		}
		(report as any).updatedLines = updated;
	}

	fs.writeFileSync(
		path.join(evidenceDir, "repair-ws-off-absent.json"),
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
