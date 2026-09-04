import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const periodId = "cmpxw13bf001h7zwsyy6k976f";
	const rows = (await p.$queryRawUnsafe(
		`SELECT o.status,
			COUNT(*)::int AS total,
			COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM attendances a WHERE a."employeeId" = o."employeeId" AND DATE(a."timeIn") = DATE(o.date) AND a."isDeleted" = false))::int AS with_punch
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = $1 AND o."isDeleted" = false AND e."workforceSource" = 'DIRECT'
		GROUP BY o.status`,
		periodId,
	)) as any[];
	console.log("OBLIGATION_PUNCH_BREAKDOWN", JSON.stringify(rows, null, 1));

	const incompleteSample = (await p.$queryRawUnsafe(
		`SELECT o."employeeId", o.date::text, o.status, o."timeIn"::text, o."timeOut"::text,
			(EXISTS (SELECT 1 FROM attendances a WHERE a."employeeId" = o."employeeId" AND DATE(a."timeIn") = DATE(o.date) AND a."isDeleted" = false)) AS has_punch,
			o.source, o."createdAt"::text
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = $1 AND o."isDeleted" = false AND o.status = 'INCOMPLETE' AND e."workforceSource" = 'DIRECT'
		ORDER BY o."createdAt" DESC LIMIT 8`,
		periodId,
	)) as any[];
	console.log("INCOMPLETE_SAMPLES", JSON.stringify(incompleteSample, null, 1));

	const watchCheck = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS drafts_all, COUNT(*) FILTER (WHERE e."workforceSource"='DIRECT')::int AS drafts_direct
		FROM timesheets t
		INNER JOIN employees e ON e.id = t."employeeId"
		WHERE t."payrollPeriodId" = $1 AND t."isDeleted" = false`,
		periodId,
	)) as any[];
	console.log("DRAFT_SCOPE", JSON.stringify(watchCheck));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
