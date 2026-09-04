import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const period = (await p.$queryRawUnsafe(
		`SELECT id, code, "startDate"::text, "endDate"::text, status FROM payroll_periods WHERE code = 'PP-20260811-20260826'`,
	)) as any[];
	if (!period.length) { console.log("PERIOD_NOT_FOUND"); return; }
	const pId = period[0].id;
	console.log("PERIOD", JSON.stringify(period));

	const ts = (await p.$queryRawUnsafe(
		`SELECT t.status, COUNT(*)::int AS cnt,
			COUNT(tl.id)::int AS lines,
			COUNT(*) FILTER (WHERE e."workforceSource"='DIRECT')::int AS direct_cnt
		FROM timesheets t
		INNER JOIN employees e ON e.id = t."employeeId"
		LEFT JOIN timesheet_lines tl ON tl."timesheetId" = t.id AND tl."isDeleted" = false AND tl."isEffective" = true
		WHERE t."payrollPeriodId" = $1 AND t."isDeleted" = false
		GROUP BY t.status ORDER BY 2 DESC`,
		pId,
	)) as any[];
	console.log("TIMESHEETS", JSON.stringify(ts));

	const payrolls = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt FROM employee_payrolls WHERE "payrollPeriodId" = $1 AND "isDeleted" = false`,
		pId,
	)) as any[];
	console.log("EXISTING_PAYROLLS", JSON.stringify(payrolls));

	const obligations = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt, COUNT(DISTINCT "employeeId")::int AS emps
		FROM attendance_obligations WHERE "payrollPeriodId" = $1 AND "isDeleted" = false`,
		pId,
	)) as any[];
	console.log("OBLIGATIONS", JSON.stringify(obligations));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => { console.error("ERR", e.message); process.exit(1); });