import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const periodId = "cmpxw13bf001h7zwsyy6k976f";

	const obStatus = (await p.$queryRawUnsafe(
		`SELECT status, COUNT(*)::int AS cnt, SUM(CASE WHEN date > NOW() THEN 1 ELSE 0 END)::int AS future
		FROM attendance_obligations WHERE "payrollPeriodId" = $1 GROUP BY status`,
		periodId,
	)) as any[];
	console.log("OBLIGATION_STATUS", JSON.stringify(obStatus));

	const obEmployees = (await p.$queryRawUnsafe(
		`SELECT COUNT(DISTINCT "employeeId")::int AS employees
		FROM attendance_obligations WHERE "payrollPeriodId" = $1`,
		periodId,
	)) as any[];
	console.log("OBLIGATION_EMPLOYEES", JSON.stringify(obEmployees));

	const punchLinked = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS with_punch
		FROM attendance_obligations o
		WHERE o."payrollPeriodId" = $1
			AND EXISTS (SELECT 1 FROM attendances a WHERE a."employeeId" = o."employeeId" AND DATE(a."timeIn") = DATE(o.date))`,
		periodId,
	)) as any[];
	console.log("OBLIGATIONS_WITH_PUNCH", JSON.stringify(punchLinked));

	const directWithObl = (await p.$queryRawUnsafe(
		`SELECT COUNT(DISTINCT o."employeeId")::int AS direct_emp
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = $1 AND e."workforceSource" = 'DIRECT' AND e."isDeleted" = false`,
		periodId,
	)) as any[];
	console.log("DIRECT_EMP_WITH_OBLIGATIONS", JSON.stringify(directWithObl));

	const basicSalary = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS direct_with_basic
		FROM employees
		WHERE "workforceSource" = 'DIRECT' AND "isDeleted" = false
			AND "basicSalary" IS NOT NULL AND "basicSalary" > 0`,
	)) as any[];
	console.log("DIRECT_WITH_BASIC_SALARY", JSON.stringify(basicSalary));

	const schedules = (await p.$queryRawUnsafe(
		`SELECT COUNT(*) FILTER (WHERE "embeddedSchedule" IS NOT NULL)::int AS with_schedule
		FROM employees WHERE "workforceSource"='DIRECT' AND "isDeleted"=false`,
	)) as any[];
	console.log("DIRECT_WITH_SCHEDULE", JSON.stringify(schedules));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
