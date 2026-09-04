import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const pId = "cmpxw13b7001f7zwshw4kp4sf"; // PP-20260811-20260826
	const oblig = (await p.$queryRawUnsafe(
		`SELECT o.status, COUNT(*)::int AS cnt,
			COUNT(DISTINCT o."employeeId")::int AS emps
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = $1 AND o."isDeleted" = false AND e."workforceSource" = 'DIRECT'
		GROUP BY o.status`,
		pId,
	)) as any[];
	console.log("OBLIGATIONS_DIRECT", JSON.stringify(oblig));

	const ev = (await p.$queryRawUnsafe(
		`SELECT COUNT(DISTINCT o."employeeId")::int AS ev_emps,
			COUNT(*) FILTER (WHERE UPPER(o.status) <> 'EXPECTED')::int AS ev_rows
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = $1 AND o."isDeleted" = false
			AND e."workforceSource" = 'DIRECT' AND e."employmentStatus" IN ('ACTIVE','ONBOARDING')
			AND e."basicSalary" > 0`,
		pId,
	)) as any[];
	console.log("EVIDENCE_SCOPE", JSON.stringify(ev));

	// draft timesheets for DIRECT
	const drafts = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS draft_cnt,
			COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM timesheet_lines tl WHERE tl."timesheetId" = t.id AND tl."isDeleted"=false AND tl."isEffective"=true))::int AS with_lines
		FROM timesheets t
		INNER JOIN employees e ON e.id = t."employeeId"
		WHERE t."payrollPeriodId" = $1 AND t."isDeleted" = false AND t.status IN ('DRAFT','REVISED','REJECTED','SUBMITTED')
			AND e."workforceSource" = 'DIRECT'`,
		pId,
	)) as any[];
	console.log("DIRECT_DRAFTS", JSON.stringify(drafts));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => { console.error("ERR", e.message); process.exit(1); });