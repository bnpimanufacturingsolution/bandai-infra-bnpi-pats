import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function main() {
	const period = await prisma.payrollPeriod.findFirst({
		where: { code: "PP-20260826-20260911", isDeleted: false },
	});
	if (!period) return;

	const ts = await prisma.timesheet.findMany({
		where: { payrollPeriodId: period.id, isDeleted: false },
		select: {
			id: true,
			status: true,
			employee: {
				select: {
					employeeId: true,
					payFrequency: true,
					workforceSource: true,
					basicSalary: true,
					embeddedSchedule: true,
				},
			},
		},
		take: 20,
	});

	console.log(`Period payFrequency: ${period.payFrequency}`);
	for (const t of ts) {
		console.log(`Emp ${t.employee.employeeId}: status=${t.status}, freq=${t.employee.payFrequency}, wf=${t.employee.workforceSource}, basic=${t.employee.basicSalary}, hasSched=${Boolean(t.employee.embeddedSchedule)}`);
	}
}

main().finally(() => prisma.$disconnect());
