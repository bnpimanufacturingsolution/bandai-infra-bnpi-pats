import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	// Direct employees with dailyRate stored (Path A basis for basic pay)
	const withDaily = (await p.$queryRawUnsafe(
		`SELECT COUNT(*) FILTER (WHERE "dailyRate" > 0)::int AS with_daily_rate,
			COUNT(*) FILTER (WHERE "dailyRate" IS NULL OR "dailyRate" = 0)::int AS without_daily_rate,
			COUNT(*)::int AS total
		FROM employees
		WHERE "workforceSource"='DIRECT' AND "isDeleted"=false
			AND "employmentStatus" IN ('ACTIVE','ONBOARDING') AND "basicSalary" > 0`,
	)) as any[];
	console.log("DAILY_RATE_COVERAGE", JSON.stringify(withDaily));

	// Evidence-backed employees: how many have dailyRate?
	const evidenceDaily = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS evidence_emps,
			COUNT(*) FILTER (WHERE e."dailyRate" > 0)::int AS with_daily_rate,
			COUNT(*) FILTER (WHERE e."dailyRate" IS NULL OR e."dailyRate" = 0)::int AS without_daily_rate
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = 'cmpxw13bf001h7zwsyy6k976f' AND o."isDeleted" = false
			AND UPPER(o.status) <> 'EXPECTED'
			AND e."workforceSource"='DIRECT' AND e."isDeleted"=false
			AND e."employmentStatus" IN ('ACTIVE','ONBOARDING') AND e."basicSalary" > 0`,
	)) as any[];
	console.log("EVIDENCE_EMPLOYEES_DAILY_RATE", JSON.stringify(evidenceDaily));

	// Current period basic salary scale (what payroll amounts will look like)
	const salaryScale = (await p.$queryRawUnsafe(
		`SELECT MIN("basicSalary")::text AS min_basic, MAX("basicSalary")::text AS max_basic,
			ROUND(AVG("basicSalary"))::text AS avg_basic
		FROM employees
		WHERE "workforceSource"='DIRECT' AND "isDeleted"=false
			AND "employmentStatus" IN ('ACTIVE','ONBOARDING') AND "basicSalary" > 0`,
	)) as any[];
	console.log("SALARY_SCALE", JSON.stringify(salaryScale));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
