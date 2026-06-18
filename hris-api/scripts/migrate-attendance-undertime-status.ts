import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();

async function migrateUndertimeStatusToPresent() {
	try {
		console.log("Checking attendances with legacy UNDERTIME status...");

		const result: any = await prisma.$runCommandRaw({
			update: "attendances",
			updates: [
				{
					q: { status: "UNDERTIME" },
					u: { $set: { status: "PRESENT", updatedAt: new Date() } },
					multi: true,
				},
			],
		});

		const matched = result?.n ?? 0;
		const modified = result?.nModified ?? 0;

		console.log(`Matched records: ${matched}`);
		console.log(`Updated records: ${modified}`);
		console.log("Migration complete.");
	} catch (error) {
		console.error("Migration failed:", error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

migrateUndertimeStatusToPresent()
	.then(() => process.exit(0))
	.catch(() => process.exit(1));

