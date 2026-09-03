import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { backfillOpenPayrollPeriodAttendanceObligations } from "../helper/attendance-obligation.helper";

const prisma = new PrismaClient();

async function main() {
	const organizationId =
		process.argv.find((arg) => arg.startsWith("--organizationId="))?.split("=")[1] ||
		process.env.ORGANIZATION_ID;
	const employeeId = process.argv.find((arg) => arg.startsWith("--employeeId="))?.split("=")[1];

	if (!organizationId) {
		throw new Error("organizationId is required. Pass --organizationId=<id> or ORGANIZATION_ID.");
	}

	const results = await backfillOpenPayrollPeriodAttendanceObligations(prisma, {
		organizationId,
		employeeId,
	});

	console.log(
		JSON.stringify(
			{
				organizationId,
				employeeId: employeeId || null,
				periodsProcessed: results.length,
				results,
			},
			null,
			2,
		),
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
