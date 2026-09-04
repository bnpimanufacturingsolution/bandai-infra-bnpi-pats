import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const periodId = "cmpxw13bf001h7zwsyy6k976f";
	const byOrg = (await p.$queryRawUnsafe(
		`SELECT t."organizationId", COUNT(*)::int AS cnt
		FROM timesheets t WHERE t."payrollPeriodId" = $1 AND t."isDeleted" = false
		GROUP BY 1`,
		periodId,
	)) as any[];
	console.log("DRAFTS_BY_ORG", JSON.stringify(byOrg));

	const empScope = (await p.$queryRawUnsafe(
		`SELECT e."workforceSource", COUNT(*)::int AS cnt,
			COUNT(*) FILTER (WHERE t.id IS NOT NULL)::int AS with_draft
		FROM employees e
		LEFT JOIN timesheets t ON t."employeeId" = e.id AND t."payrollPeriodId" = $1 AND t."isDeleted" = false
		WHERE e."isDeleted" = false AND e."organizationId" = 'cmpxw0mfe00007zws3iypuu9d'
		GROUP BY e."workforceSource"`,
		periodId,
	)) as any[];
	console.log("EMPLOYEES_BY_SOURCE_VS_DRAFTS", JSON.stringify(empScope));

	const draftEmpSample = (await p.$queryRawUnsafe(
		`SELECT e.id, e."employeeId", e."workforceSource", e."organizationId", e."employmentStatus",
			(e."organizationId" = 'cmpxw0mfe00007zws3iypuu9d') AS org_matches_period
		FROM timesheets t
		INNER JOIN employees e ON e.id = t."employeeId"
		WHERE t."payrollPeriodId" = $1 AND t."isDeleted" = false
		LIMIT 6`,
		periodId,
	)) as any[];
	console.log("DRAFT_EMP_SAMPLES", JSON.stringify(draftEmpSample, null, 1));
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e.message);
		process.exit(1);
	});
