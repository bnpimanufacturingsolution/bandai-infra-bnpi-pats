import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

const main = async () => {
	const requestId = process.argv[2] || "cmszee5hy009j8ht0kx98v79f";
	const steps = await prisma.workflowStepExecution.findMany({
		where: { requestId, isDeleted: false },
		orderBy: { stepNumber: "asc" },
		select: {
			stepNumber: true,
			stepName: true,
			assigneeType: true,
			status: true,
			assigneeId: true,
		},
	});
	const ids = [...new Set(steps.map((step) => step.assigneeId).filter(Boolean))] as string[];
	const emps = await prisma.employee.findMany({
		where: { id: { in: ids } },
		select: {
			id: true,
			employeeId: true,
			person: { select: { personalInfo: true } },
		},
	});
	console.log(JSON.stringify({ steps, emps }, null, 2));
};

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
