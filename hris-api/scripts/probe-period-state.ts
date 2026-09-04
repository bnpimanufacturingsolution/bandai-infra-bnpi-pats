import { PrismaClient } from "../generated/prisma";

const p = new PrismaClient();

async function main() {
	const periodId = process.argv[2] || "cmpxw13b7001f7zwshw4kp4sf";
	const probe = await Promise.race([
		(async () => {
			const lines = (await p.$queryRawUnsafe(
				`SELECT COUNT(*)::int AS cnt FROM timesheet_lines tl
				INNER JOIN timesheets t ON t.id = tl."timesheetId"
				WHERE t."payrollPeriodId" = $1 AND tl."isDeleted" = false AND tl."isEffective" = true`,
				periodId,
			)) as any[];
			const ts = (await p.$queryRawUnsafe(
				`SELECT t.status, COUNT(*)::int AS cnt
				FROM timesheets t INNER JOIN employees e ON e.id = t."employeeId"
				WHERE t."payrollPeriodId" = $1 AND t."isDeleted" = false AND e."workforceSource"='DIRECT'
				GROUP BY t.status`,
				periodId,
			)) as any[];
			const pay = (await p.$queryRawUnsafe(
				`SELECT COUNT(*)::int AS cnt FROM employee_payrolls WHERE "payrollPeriodId" = $1 AND "isDeleted" = false`,
				periodId,
			)) as any[];
			return { lines: lines[0], ts, payrolls: pay[0] };
		})(),
		new Promise((_, rej) => setTimeout(() => rej(new Error("PROBE_TIMEOUT_20S")), 20000)),
	]);
	console.log("STATE", JSON.stringify(proofOf(probe)));
	await p.$disconnect();
}

function proofOf(x: any) {
	return x;
}

main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
