/**
 * Probe timesheetline OT for payroll periods (no HTTP).
 * Usage: PG_DATABASE_URL=... npx tsx scripts/probe-period-ot-readiness.ts
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma";

const codes = (
	process.env.PERIOD_CODES ||
	"PP-20260611-20260626,PP-20260626-20260711,PP-20260726-20260811"
).split(",");
const samples = (process.env.SAMPLES || "01360,00032,00021")
	.split(",")
	.map((s) => s.trim().padStart(5, "0"));

if (!process.env.FORCE_ENV_DB) {
	process.env.PG_DATABASE_URL =
		process.env.PG_DATABASE_URL ||
		"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
	process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
}

const prisma = new PrismaClient();

function mins(v?: string | null) {
	if (!v || typeof v !== "string" || !v.includes(":")) return 0;
	const [h, m] = v.split(":").map(Number);
	return (h || 0) * 60 + (m || 0);
}

async function main() {
	for (const code of codes.map((c) => c.trim()).filter(Boolean)) {
		const period = await prisma.payrollPeriod.findFirst({
			where: { code, isDeleted: false },
		});
		if (!period) {
			console.log(JSON.stringify({ code, missing: true }));
			continue;
		}
		const ts = await prisma.timesheet.findMany({
			where: { payrollPeriodId: period.id, isDeleted: false },
			select: {
				id: true,
				status: true,
				totalOvertimeHours: true,
				employee: { select: { employeeId: true } },
				timesheetlines: {
					where: { isDeleted: false, isEffective: true },
					select: { overtimeHours: true },
				},
			},
		});
		let withLineOt = 0;
		let totalLineMin = 0;
		let withSummary = 0;
		for (const t of ts) {
			let lm = 0;
			for (const l of t.timesheetlines) lm += mins(l.overtimeHours);
			if (lm > 0) withLineOt += 1;
			totalLineMin += lm;
			if (mins(t.totalOvertimeHours) > 0) withSummary += 1;
		}
		const sampleOut = samples.map((emp) => {
			const hit = ts.find(
				(x) => String(x.employee?.employeeId || "").padStart(5, "0") === emp,
			);
			if (!hit) return { emp, found: false };
			let lm = 0;
			for (const l of hit.timesheetlines) lm += mins(l.overtimeHours);
			return {
				emp,
				found: true,
				status: hit.status,
				summaryOt: hit.totalOvertimeHours,
				lineOtHrs: Number((lm / 60).toFixed(2)),
				lines: hit.timesheetlines.length,
			};
		});
		console.log(
			JSON.stringify({
				code,
				periodId: period.id,
				periodNumber: period.periodNumber,
				timesheets: ts.length,
				approved: ts.filter((t) => t.status === "APPROVED").length,
				withLineOt,
				withSummary,
				totalLineOtHrs: Number((totalLineMin / 60).toFixed(2)),
				samples: sampleOut,
			}),
		);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
