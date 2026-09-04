import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const pId = "cmpxw13b7001f7zwshw4kp4sf"; // PP-20260811-20260826
	// employees with any PRESENT/INCOMPLETE work evidence
	const work = (await p.$queryRawUnsafe(
		`SELECT COUNT(DISTINCT o."employeeId")::int AS with_work_evidence
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = $1 AND o."isDeleted" = false
			AND e."workforceSource" = 'DIRECT' AND e."isDeleted" = false
			AND o.status IN ('PRESENT','INCOMPLETE')`,
		pId,
	)) as any[];
	console.log("WITH_WORK_EVIDENCE", JSON.stringify(work));

	// punch-backed employees via attendances table in period
	const punch = (await p.$queryRawUnsafe(
		`SELECT COUNT(DISTINCT a."employeeId")::int AS with_punch
		FROM attendances a
		INNER JOIN employees e ON e.id = a."employeeId"
		WHERE a."timeIn" >= '2026-08-11' AND a."timeIn" < '2026-08-26'
			AND a."isDeleted" = false AND e."workforceSource" = 'DIRECT' AND e."isDeleted" = false`,
	)) as any[];
	console.log("WITH_PUNCH", JSON.stringify(punch));

	// work days totals per bucket
	const days = (await p.$queryRawUnsafe(
		`SELECT o.status, COUNT(DISTINCT o."employeeId")::int AS emps, COUNT(*)::int AS rows
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = $1 AND o."isDeleted" = false
			AND e."workforceSource" = 'DIRECT'
			AND o.status IN ('PRESENT','INCOMPLETE')
		GROUP BY o.status`,
		pId,
	)) as any[];
	console.log("WORK_DAY_BUCKETS", JSON.stringify(days));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => { console.error("ERR", e.message); process.exit(1); });