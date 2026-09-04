import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const periodId = "cmpxw13bf001h7zwsyy6k976f";
	const ts = (await p.$queryRawUnsafe(
		`SELECT status, COUNT(*)::int AS cnt,
			MIN("createdAt")::text AS first_created, MAX("createdAt")::text AS last_created,
			MIN(notes) AS sample_notes
		FROM timesheets WHERE "payrollPeriodId" = $1 AND "isDeleted" = false
		GROUP BY status`,
		periodId,
	)) as any[];
	console.log("TS_STATUS", JSON.stringify(ts, null, 1));

	const sample = (await p.$queryRawUnsafe(
		`SELECT id, code, "employeeId", status, "createdAt"::text, notes,
			"totalDays", "lockedAt"::text
		FROM timesheets WHERE "payrollPeriodId" = $1 AND "isDeleted" = false
		ORDER BY "createdAt" DESC LIMIT 5`,
		periodId,
	)) as any[];
	console.log("SAMPLE", JSON.stringify(sample, null, 1));

	const lines = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt
		FROM timesheet_lines tl
		INNER JOIN timesheets t ON t.id = tl."timesheetId"
		WHERE t."payrollPeriodId" = $1 AND tl."isDeleted" = false`,
		periodId,
	)) as any[];
	console.log("LINES_TOTAL", JSON.stringify(lines));

	const obMax = (await p.$queryRawUnsafe(
		`SELECT status, COUNT(*)::int AS cnt, MIN(date)::text AS min_d, MAX(date)::text AS max_d
		FROM attendance_obligations WHERE "payrollPeriodId" = $1 GROUP BY status`,
		periodId,
	)) as any[];
	console.log("OBLIGATIONS_NOW", JSON.stringify(obMax));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
