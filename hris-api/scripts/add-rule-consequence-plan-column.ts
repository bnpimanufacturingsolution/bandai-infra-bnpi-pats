import { connectAllDatabases, disconnectAllDatabases, prisma } from "../config/database";

const run = async () => {
	await connectAllDatabases();
	await prisma.$executeRawUnsafe(
		`ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "consequencePlan" JSONB`,
	);
	const cols = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
		`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'rules' AND column_name = 'consequencePlan'`,
	);
	console.log("rules.consequencePlan column:", JSON.stringify(cols));
	await disconnectAllDatabases();
	process.exit(0);
};

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
