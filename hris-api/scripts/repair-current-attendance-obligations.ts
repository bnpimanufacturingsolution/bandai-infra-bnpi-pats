import "dotenv/config";
import { PrismaClient } from "../generated/prisma";
import { backfillCurrentPayrollPeriodAttendanceObligations } from "../helper/attendance-obligation.helper";

const prisma = new PrismaClient();

async function main() {
	const organizationCode =
		process.argv.find((arg) => arg.startsWith("--organizationCode="))?.split("=")[1] ||
		process.env.ORGANIZATION_CODE ||
		"bnei";
	const organizationIdArg =
		process.argv.find((arg) => arg.startsWith("--organizationId="))?.split("=")[1] ||
		process.env.ORGANIZATION_ID;
	const dateArg = process.argv.find((arg) => arg.startsWith("--date="))?.split("=")[1];
	const date = dateArg ? new Date(`${dateArg}T00:00:00.000Z`) : new Date();

	const organization = organizationIdArg
		? { id: organizationIdArg, code: organizationCode }
		: await prisma.organization.findUnique({
				where: { code: organizationCode },
				select: { id: true, code: true },
			});
	if (!organization?.id) throw new Error(`Organization not found: ${organizationCode}`);

	const beforePeriod = await prisma.payrollPeriod.findFirst({
		where: {
			organizationId: organization.id,
			isDeleted: false,
			status: { in: ["OPEN", "PROCESSING"] },
			startDate: { lte: date },
			endDate: { gte: date },
		},
		select: { id: true, code: true, startDate: true, endDate: true },
		orderBy: { startDate: "desc" },
	});
	if (!beforePeriod) throw new Error("Current open payroll period not found.");

	const day = new Date(date);
	day.setUTCHours(0, 0, 0, 0);
	const activeEmployees = await prisma.employee.count({
		where: {
			organizationId: organization.id,
			isDeleted: false,
			employmentStatus: { in: ["ACTIVE", "ONBOARDING"] },
		},
	});
	const beforeToday = await (prisma as any).attendanceObligation.count({
		where: {
			organizationId: organization.id,
			payrollPeriodId: beforePeriod.id,
			date: day,
			isDeleted: false,
		},
	});

	const results = await backfillCurrentPayrollPeriodAttendanceObligations(prisma, {
		organizationId: organization.id,
		date,
	});

	const afterToday = await (prisma as any).attendanceObligation.count({
		where: {
			organizationId: organization.id,
			payrollPeriodId: beforePeriod.id,
			date: day,
			isDeleted: false,
		},
	});
	const periodObligations = await (prisma as any).attendanceObligation.count({
		where: {
			organizationId: organization.id,
			payrollPeriodId: beforePeriod.id,
			isDeleted: false,
		},
	});

	console.log(
		JSON.stringify(
			{
				organization,
				date: day.toISOString().slice(0, 10),
				payrollPeriod: {
					code: beforePeriod.code,
					startDate: beforePeriod.startDate.toISOString().slice(0, 10),
					endDate: beforePeriod.endDate.toISOString().slice(0, 10),
				},
				activeEmployees,
				beforeToday,
				afterToday,
				periodObligations,
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
