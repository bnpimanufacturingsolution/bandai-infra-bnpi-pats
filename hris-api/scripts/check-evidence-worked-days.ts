import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	// Which employees are evidence-backed? breakdown by salary sanity
	const rows = (await p.$queryRawUnsafe(
		`SELECT e.id, e."employeeId", e."basicSalary"::text, e."payFrequency", e."employmentStatus",
			COUNT(o.id)::int AS evidence_days,
			SUM(CASE WHEN o.status IN ('PRESENT','INCOMPLETE') THEN 1 ELSE 0 END)::int AS worked_days
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = 'cmpxw13bf001h7zwsyy6k976f' AND o."isDeleted" = false
			AND UPPER(o.status) <> 'EXPECTED'
			AND e."workforceSource"='DIRECT' AND e."isDeleted"=false
			AND e."employmentStatus" IN ('ACTIVE','ONBOARDING') AND e."basicSalary" > 0
		GROUP BY e.id, e."employeeId", e."basicSalary", e."payFrequency", e."employmentStatus"
		ORDER BY worked_days DESC, e."employeeId"
		LIMIT 12`,
	)) as any[];
	console.log("EVIDENCE_SAMPLE_TOP", JSON.stringify(rows, null, 1));

	const dist = (await p.$queryRawUnsafe(
		`SELECT
			COUNT(*)::int AS emps,
			COUNT(*) FILTER (WHERE worked.worked_days > 0)::int AS with_worked_days,
			COUNT(*) FILTER (WHERE worked.worked_days = 0)::int AS zero_worked_days,
			ROUND(AVG(worked.worked_days), 1)::text AS avg_worked_days,
			MAX(worked.worked_days)::int AS max_worked_days
		FROM (
			SELECT e.id, SUM(CASE WHEN o.status IN ('PRESENT','INCOMPLETE') THEN 1 ELSE 0 END)::int AS worked_days
			FROM attendance_obligations o
			INNER JOIN employees e ON e.id = o."employeeId"
			WHERE o."payrollPeriodId" = 'cmpxw13bf001h7zwsyy6k976f' AND o."isDeleted" = false
				AND UPPER(o.status) <> 'EXPECTED'
				AND e."workforceSource"='DIRECT' AND e."isDeleted"=false
				AND e."employmentStatus" IN ('ACTIVE','ONBOARDING') AND e."basicSalary" > 0
			GROUP BY e.id
		) worked`,
	)) as any[];
	console.log("WORKED_DAYS_DIST", JSON.stringify(dist));

	const lowDays = (await p.$queryRawUnsafe(
		`SELECT e."employeeId", e."basicSalary"::text, SUM(CASE WHEN o.status IN ('PRESENT','INCOMPLETE') THEN 1 ELSE 0 END)::int AS worked_days
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = 'cmpxw13bf001h7zwsyy6k976f' AND o."isDeleted" = false
			AND UPPER(o.status) <> 'EXPECTED'
			AND e."workforceSource"='DIRECT' AND e."isDeleted"=false
			AND e."employmentStatus" IN ('ACTIVE','ONBOARDING') AND e."basicSalary" > 0
		GROUP BY e.id, e."employeeId", e."basicSalary"
		HAVING SUM(CASE WHEN o.status IN ('PRESENT','INCOMPLETE') THEN 1 ELSE 0 END) = 0
		ORDER BY e."basicSalary" DESC LIMIT 10`,
	)) as any[];
	console.log("ZERO_WORKED_DAYS_SAMPLE", JSON.stringify(lowDays, null, 1));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
