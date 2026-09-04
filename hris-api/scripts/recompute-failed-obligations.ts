import { PrismaClient } from "../generated/prisma";
import { applyAttendanceToObligation } from "../helper/attendance-obligation.helper";

const DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";

const prisma = new PrismaClient({
	datasources: { db: { url: DATABASE_URL } },
});

async function main() {
	// Find all attendances missing obligations for Aug 25-27
	const missing = await prisma.$queryRawUnsafe<{
		employeeId: string;
		attendanceId: string;
		organizationId: string;
		date: Date;
	}[]>(
		`SELECT a."employeeId", a."id" as "attendanceId", e."organizationId", a."date"
		 FROM attendances a
		 JOIN employees e ON e."id" = a."employeeId"
		 WHERE a."date" >= '2026-08-25 16:00:00'
		   AND a."date" <= '2026-08-27 16:00:00'
		   AND a."timeIn" IS NOT NULL
		   AND NOT EXISTS (
			 SELECT 1 FROM attendance_obligations ao
			 WHERE ao."employeeId" = a."employeeId" AND ao."date" = a."date"
		   )
		 ORDER BY a."employeeId", a."date"`
	);

	console.log(`Found ${missing.length} attendances missing obligations`);

	let success = 0;
	let failed = 0;

	for (const row of missing) {
		try {
			const obligation = await applyAttendanceToObligation(prisma, {
				organizationId: row.organizationId,
				employeeId: row.employeeId,
				attendanceId: row.attendanceId,
			});
			if (obligation) {
				success++;
				console.log(`  OK: ${row.employeeId} ${row.date.toISOString().slice(0, 10)} -> obligation ${obligation.id}`);
			} else {
				failed++;
				console.log(`  SKIP: ${row.employeeId} ${row.date.toISOString().slice(0, 10)} -> no obligation created (no payroll period?)`);
			}
		} catch (err: any) {
			failed++;
			console.error(`  FAIL: ${row.employeeId} ${row.date.toISOString().slice(0, 10)} -> ${err.message?.slice(0, 120)}`);
		}
	}

	console.log(`\nDone: ${success} created, ${failed} skipped/failed out of ${missing.length}`);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
