import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const periodId = "cmpxw13bf001h7zwsyy6k976f";
	const payrolls = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt,
			SUM(CASE WHEN "isPaid" THEN 1 ELSE 0 END)::int AS paid
		FROM employee_payrolls WHERE "payrollPeriodId" = $1 AND "isDeleted" = false`,
		periodId,
	)) as any[];
	console.log("PAYROLLS_NOW", JSON.stringify(payrolls));

	const ts = (await p.$queryRawUnsafe(
		`SELECT t.status, COUNT(*)::int AS cnt,
			COUNT(tl.id)::int AS lines
		FROM timesheets t
		LEFT JOIN timesheet_lines tl ON tl."timesheetId" = t.id AND tl."isDeleted" = false AND tl."isEffective" = true
		WHERE t."payrollPeriodId" = $1 AND t."isDeleted" = false
			AND EXISTS (SELECT 1 FROM employees e WHERE e.id = t."employeeId" AND e."workforceSource" = 'DIRECT')
		GROUP BY t.status`,
		periodId,
	)) as any[];
	console.log("DIRECT_TS_STATUS", JSON.stringify(ts));

	const locked = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt FROM timesheets
		WHERE "payrollPeriodId" = $1 AND "lockedAt" IS NOT NULL AND "isDeleted" = false`,
		periodId,
	)) as any[];
	console.log("LOCKED_TS", JSON.stringify(locked));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
