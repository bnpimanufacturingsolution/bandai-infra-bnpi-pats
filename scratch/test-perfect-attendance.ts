import { PrismaClient, Prisma } from "../hris-api/generated/prisma";

const prisma = new PrismaClient();

async function main() {
	const startDate = new Date("2026-08-01T00:00:00.000Z");
	const endDate = new Date("2026-08-31T23:59:59.999Z");
	const org = await prisma.employee.findFirst({ where: { isDeleted: false }, select: { organizationId: true } });
	const organizationId = org?.organizationId!;

	const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
		WITH ranked AS (
			SELECT
				ao.*,
				COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD')) AS "_obligationDateKey",
				row_number() OVER (
					PARTITION BY ao."employeeId", COALESCE(ao."businessDate", to_char(ao."date", 'YYYY-MM-DD'))
					ORDER BY ao."date" DESC, pp."startDate" DESC, ao."updatedAt" DESC, ao."createdAt" DESC
				) AS "_rank"
			FROM "attendance_obligations" ao
			INNER JOIN "payroll_periods" pp ON pp."id" = ao."payrollPeriodId"
			INNER JOIN "employees" e ON e."id" = ao."employeeId"
			WHERE e."organizationId" = ${organizationId}
			  AND e."isDeleted" = false
			  AND ao."date" >= ${startDate} AND ao."date" <= ${endDate}
		),
		deduped AS (
			SELECT * FROM ranked WHERE "_rank" = 1
		)
		SELECT
			"employeeId",
			"employeeCodeSnapshot",
			"employeeNameSnapshot",
			"departmentNameSnapshot",
			COUNT(*) AS "totalObligations",
			COUNT(*) FILTER (WHERE UPPER(COALESCE("status", '')) != 'REST_DAY' AND UPPER(COALESCE("scheduleSnapshot"->>'shiftType', '')) != 'OFF') AS "scheduledWorkDays",
			COUNT(*) FILTER (WHERE "timeIn" IS NOT NULL) AS "daysPresent",
			COUNT(*) FILTER (
				WHERE "timeIn" IS NOT NULL
				  AND UPPER(COALESCE("status", '')) NOT IN ('ABSENT', 'NOT_CLOCKED_IN', 'LEAVE')
				  AND COALESCE("lateMinutes", 0) = 0
				  AND COALESCE("undertimeMinutes", 0) = 0
				  AND COALESCE("earlyOutMinutes", 0) = 0
				  AND ("lateHours" IS NULL OR "lateHours" = '0:00')
				  AND ("undertimeHours" IS NULL OR "undertimeHours" = '0:00')
				  AND ("earlyOutHours" IS NULL OR "earlyOutHours" = '0:00')
			) AS "daysPresentOnTime",
			COUNT(*) FILTER (WHERE UPPER(COALESCE("status", '')) IN ('ABSENT', 'NOT_CLOCKED_IN') OR ("timeIn" IS NULL AND "timeOut" IS NULL AND UPPER(COALESCE("status", '')) != 'REST_DAY' AND UPPER(COALESCE("scheduleSnapshot"->>'shiftType', '')) != 'OFF')) AS "absentDays",
			SUM(COALESCE("lateMinutes", 0)) AS "totalLateMinutes",
			SUM(COALESCE("undertimeMinutes", 0)) AS "totalUndertimeMinutes"
		FROM deduped
		GROUP BY "employeeId", "employeeCodeSnapshot", "employeeNameSnapshot", "departmentNameSnapshot"
	`);

	console.log(`Total employee obligation groups: ${rows.length}`);
	const perfectEmployees = rows.filter(r => Number(r.scheduledWorkDays) > 0 && Number(r.daysPresentOnTime) === Number(r.scheduledWorkDays) && Number(r.absentDays) === 0);
	console.log(`Perfect Attendance employees: ${perfectEmployees.length}`);
	console.log("Sample perfect employees:", perfectEmployees.slice(0, 5));
	console.log("Sample non-perfect employees:", rows.filter(r => !perfectEmployees.includes(r)).slice(0, 5));
	await prisma.$disconnect();
}

main().catch(console.error);
