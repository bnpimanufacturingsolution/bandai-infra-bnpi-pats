import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

(async () => {
	try {
		await prisma.$executeRawUnsafe(
			`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "pregnant" BOOLEAN NOT NULL DEFAULT false;`,
		);
		await prisma.$executeRawUnsafe(
			`ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "expectedDueDate" TIMESTAMP(3);`,
		);
		console.log("PREGNANT_COLUMNS_OK");
		const check = await prisma.$queryRawUnsafe<any[]>(
			`SELECT column_name FROM information_schema.columns WHERE table_name='employees' AND column_name IN ('pregnant','expectedDueDate')`,
		);
		console.log("COLUMNS:", JSON.stringify(check));
	} catch (error: any) {
		console.log("FAIL:", error?.message?.slice(0, 200));
	}
	await prisma.$disconnect();
})();
