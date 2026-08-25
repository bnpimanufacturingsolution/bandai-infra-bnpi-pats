import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

(async () => {
	const periods = await prisma.payrollPeriod.findMany({
		where: { isDeleted: false },
		select: { id: true, name: true, code: true },
		orderBy: { createdAt: "desc" },
		take: 3,
	});
	console.log(JSON.stringify(periods));
	await prisma.$disconnect();
})();
