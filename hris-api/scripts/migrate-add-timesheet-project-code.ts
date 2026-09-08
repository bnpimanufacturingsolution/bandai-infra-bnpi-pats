/** Narrow additive migration runner: timesheet_lines.projectCode (2026-09-08). */
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function main() {
	const before = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
		`SELECT column_name FROM information_schema.columns
		 WHERE table_schema='public' AND table_name='timesheet_lines' AND column_name='projectCode'`,
	);
	if (before.length > 0) {
		console.log("[project-code-migration] column already exists; nothing to do");
		return;
	}
	await prisma.$executeRawUnsafe(`ALTER TABLE "timesheet_lines" ADD COLUMN "projectCode" TEXT`);
	const after = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
		`SELECT column_name, data_type FROM information_schema.columns
		 WHERE table_schema='public' AND table_name='timesheet_lines' AND column_name='projectCode'`,
	);
	console.log(`[project-code-migration] added column:`, after);
}

main()
	.catch((e) => {
		console.error("[project-code-migration] failed:", e);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
