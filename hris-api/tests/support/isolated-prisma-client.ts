import { PrismaClient } from "../../generated/prisma";
import {
	APPROVED_DB_FAULT_DATABASE_NAME,
	resolveIsolatedDbFaultTestConfig,
	type DbFaultTestEnv,
	type IsolatedDbFaultConfig,
} from "./isolated-db-fault.guard";

export function getRequiredIsolatedDbFaultConfig(
	env: DbFaultTestEnv = process.env,
): Extract<IsolatedDbFaultConfig, { allowed: true }> {
	const config = resolveIsolatedDbFaultTestConfig(env);
	if (!config.allowed) {
		throw new Error(config.reason);
	}
	return config;
}

export function createIsolatedPrismaClient(env: DbFaultTestEnv = process.env) {
	const config = getRequiredIsolatedDbFaultConfig(env);
	return new PrismaClient({
		datasources: {
			db: {
				url: config.url,
			},
		},
	});
}

export async function getCurrentDatabaseName(prisma: PrismaClient) {
	const rows = await prisma.$queryRaw<Array<{ database_name: string }>>`
		SELECT current_database() AS database_name
	`;
	return rows[0]?.database_name;
}

export async function assertConnectedToIsolatedFaultDatabase(prisma: PrismaClient) {
	const databaseName = await getCurrentDatabaseName(prisma);
	if (databaseName !== APPROVED_DB_FAULT_DATABASE_NAME) {
		throw new Error(
			`Expected isolated DB ${APPROVED_DB_FAULT_DATABASE_NAME}, got ${databaseName || "<unknown>"}.`,
		);
	}
	return databaseName;
}

export async function disconnectQuietly(prisma: PrismaClient | undefined) {
	if (!prisma) return;
	try {
		await prisma.$disconnect();
	} catch {
		// Test cleanup should not mask the original assertion failure.
	}
}
