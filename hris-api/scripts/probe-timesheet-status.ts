import "dotenv/config";
import { PrismaClient } from "../generated/prisma";

if (!process.env.FORCE_ENV_DB) {
	process.env.PG_DATABASE_URL =
		process.env.PG_DATABASE_URL ||
		"postgresql://postgres:postgres@127.0.0.1:55435/hris?schema=public";
	process.env.DATABASE_URL = process.env.PG_DATABASE_URL;
}

const prisma = new PrismaClient();
const codes = (process.env.PERIOD_CODES || "PP-20260611-20260626,PP-20260626-20260711").split(",");

async function main() {
	for (const code of codes.map((c) => c.trim()).filter(Boolean)) {
		const period = await prisma.payrollPeriod.findFirst({
			where: { code, isDeleted: false },
		});
		if (!period) {
			console.log(JSON.stringify({ code, missing: true }));
			continue;
		}
		const groups = await prisma.timesheet.groupBy({
			by: ["status"],
			where: { payrollPeriodId: period.id, isDeleted: false },
			_count: { _all: true },
		});
		console.log(
			JSON.stringify({
				code,
				periodId: period.id,
				statusCounts: groups.map((g) => ({ status: g.status, count: g._count._all })),
			}),
		);
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
