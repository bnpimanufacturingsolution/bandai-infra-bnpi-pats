import "dotenv/config";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function main() {
	await prisma.$executeRawUnsafe(
		'ALTER TABLE "schedule_overrides" ADD COLUMN IF NOT EXISTS "shiftSnapshot" JSONB',
	);
	await prisma.$executeRawUnsafe(
		'ALTER TABLE "schedule_overrides" ALTER COLUMN "shiftTypeId" DROP NOT NULL',
	);
	console.log("schedule_overrides schema repaired");
}

main()
	.catch((error) => {
		console.error("Failed to repair schedule_overrides schema:", error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
