import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

(async () => {
	const employee = await prisma.employee.findUnique({
		where: { id: "cmspnnxot02s5qw01yk7yy2er" },
		select: { employeeId: true, pregnant: true, expectedDueDate: true },
	});
	console.log(JSON.stringify(employee));
	await prisma.$disconnect();
})();
