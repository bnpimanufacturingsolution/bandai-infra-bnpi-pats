import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const periodIds = ["cmpxw13b7001f7zwshw4kp4sf", "cmpxw13bf001h7zwsyy6k976f"];
	for (const pid of periodIds) {
		const absents = (await p.$queryRawUnsafe(
			`SELECT tl.id, tl."timesheetId", tl.date::text, tl."employeeId"
			FROM timesheet_lines tl
			INNER JOIN timesheets t ON t.id = tl."timesheetId"
			WHERE t."payrollPeriodId" = $1 AND tl."isDeleted" = false AND tl."isEffective" = true
				AND UPPER(tl.status) = 'ABSENT'
			ORDER BY tl.date`,
			pid,
		)) as any[];
		console.log(`ABSENT_LINES period=${pid.slice(-6)}: ${absents.length}`);
		for (const a of absents.slice(0, 10)) {
			// was the source obligation for this day EXPECTED (no evidence)?
			const src = (await p.$queryRawUnsafe(
				`SELECT status FROM attendance_obligations
				WHERE "employeeId" = $1 AND date = $2::date AND "isDeleted" = false
				ORDER BY "updatedAt" DESC LIMIT 1`,
				a.employeeId,
				a.date,
			)) as any[];
			console.log(`  emp=${a.employeeId.slice(-6)} date=${String(a.date).slice(0, 10)} srcStatus=${src[0]?.status || "NONE"}`);
		}
	}
}

main()
	.then(() => p.$disconnect())
	.catch((e) => { console.error("ERR", e.message); process.exit(1); });
