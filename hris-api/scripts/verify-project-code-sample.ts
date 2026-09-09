import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function main() {
	const sample = (await prisma.$queryRawUnsafe(
		`SELECT l."projectCode", l."dayLaborType", l."workforceSourceSnapshot"::text AS wf, to_char(l."date",'YYYY-MM-DD') AS d, COUNT(*)::int AS n
		 FROM timesheet_lines l
		 WHERE l."isDeleted"=false AND l."isEffective"=true
		 GROUP BY 1,2,3,4 ORDER BY 4 DESC, 1 LIMIT 12`,
	)) as Array<any>;
	console.log("=== recent-date sample (grouped) ===");
	for (const row of sample) {
		console.log(
			`code=${row.projectCode} tag=${row.dayLaborType ?? "-"} source=${row.wf ?? "-"} date=${row.date} n=${row.n}`,
		);
	}
	const remaining = (await prisma.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS bad FROM timesheet_lines WHERE "isDeleted"=false AND "isEffective"=true AND "projectCode" IS NULL`,
	)) as Array<any>;
	console.log("null projectCode remaining:", remaining[0].bad);

	const perDate = (await prisma.$queryRawUnsafe(
		`SELECT to_char("date",'YYYY-MM-DD') AS d, "projectCode" AS code, COUNT(*)::int AS n
		 FROM timesheet_lines
		 WHERE "isDeleted"=false AND "isEffective"=true
		 GROUP BY 1,2 ORDER BY 1 DESC LIMIT 12`,
	)) as Array<any>;
	console.log("=== distinct codes per recent date ===");
	for (const row of perDate) {
		console.log(`date=${row.d} code=${row.code} n=${row.n}`);
	}

	const multiCodeEmployee = (await prisma.$queryRawUnsafe(
		`SELECT "employeeId", COUNT(DISTINCT "projectCode") AS codes, STRING_AGG(DISTINCT "projectCode", ',') AS list
		 FROM timesheet_lines
		 WHERE "isDeleted"=false AND "isEffective"=true
		 GROUP BY "employeeId" HAVING COUNT(DISTINCT "projectCode") > 1
		 LIMIT 5`,
	)) as Array<any>;
	console.log("=== employees carrying multiple codes across days (per-day proof) ===");
	for (const row of multiCodeEmployee) {
		console.log(`employee=${row.employeeId} codes=${row.list}`);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
