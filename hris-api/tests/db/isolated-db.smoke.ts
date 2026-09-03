import {
	assertConnectedToIsolatedFaultDatabase,
	createIsolatedPrismaClient,
	disconnectQuietly,
	getRequiredIsolatedDbFaultConfig,
} from "../support/isolated-prisma-client";

async function main() {
	const config = getRequiredIsolatedDbFaultConfig();
	const prisma = createIsolatedPrismaClient();
	try {
		const databaseName = await assertConnectedToIsolatedFaultDatabase(prisma);
		console.log(
			`Isolated DB smoke passed: ${databaseName} at ${config.hostname}:${config.port}.`,
		);
	} finally {
		await disconnectQuietly(prisma);
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
