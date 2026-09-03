const { PrismaClient } = require("./generated/prisma");
const prisma = new PrismaClient();

async function check() {
	const attendances = await prisma.attendance.findMany({
		where: { isDeleted: false },
		orderBy: { date: "desc" },
		take: 5,
		include: {
			employee: {
				select: {
					person: { select: { personalInfo: true } },
				},
			},
		},
	});

	console.log("Recent attendance records:");
	attendances.forEach((a) => {
		const name = `${a.employee.person?.personalInfo?.firstName} ${a.employee.person?.personalInfo?.lastName}`;
		console.log(`${name}: ${a.date} (${a.date.toISOString()}) - ${a.status}`);
	});

	await prisma.$disconnect();
}

check();
