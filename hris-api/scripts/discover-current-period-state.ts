import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const tables = (await p.$queryRawUnsafe(
		`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%timesheet%' OR table_name ILIKE '%attendance%') ORDER BY 1`,
	)) as any[];
	console.log("TABLES", JSON.stringify(tables));

	const currentPeriodId = "cmpxw13bf001h7zwsyy6k976f";

	const punches = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt, MIN("timeIn")::text AS min_t, MAX("timeIn")::text AS max_t
		FROM attendances
		WHERE "timeIn" >= '2026-08-26' AND "timeIn" < '2026-09-04'`,
	)) as any[];
	console.log("PUNCHES_AUG26_TO_SEP3", JSON.stringify(punches));

	const punchDays = (await p.$queryRawUnsafe(
		`SELECT COUNT(DISTINCT "employeeId")::int AS employees,
			COUNT(DISTINCT DATE("timeIn"))::int AS distinct_days
		FROM attendances
		WHERE "timeIn" >= '2026-08-26' AND "timeIn" < '2026-09-04'`,
	)) as any[];
	console.log("PUNCH_COVERAGE", JSON.stringify(punchDays));

	const activeEmps = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt, COUNT(*) FILTER (WHERE "workforceSource"='DIRECT')::int AS direct,
			COUNT(*) FILTER (WHERE "employmentStatus"='ACTIVE')::int AS active_status
		FROM employees WHERE "isDeleted"=false`,
	)) as any[];
	console.log("ACTIVE_EMPLOYEES", JSON.stringify(activeEmps));

	const calculator = (await p.$queryRawUnsafe(
		`SELECT c.id, c.name FROM payroll_periods pp LEFT JOIN calculators c ON c.id = pp."calculatorId" WHERE pp.id = $1`,
		currentPeriodId,
	)) as any[];
	console.log("CALCULATOR", JSON.stringify(calculator));

	const obligations = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt, MIN(date)::text AS min_d, MAX(date)::text AS max_d
		FROM attendance_obligations WHERE "payrollPeriodId" = $1`,
		currentPeriodId,
	)) as any[];
	console.log("OBLIGATIONS", JSON.stringify(obligations));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
