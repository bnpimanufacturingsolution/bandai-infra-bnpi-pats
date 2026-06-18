import { PrismaClient } from "../generated/prisma";
import { AsyncLocalStorage } from "async_hooks";
import { getLogger } from "../helper/logger.helper";
import { assertValidPrismaDatasourceUrl } from "../helper/prisma-datasource.helper";
import { redisClient } from "./redis";
import { config } from "./config";

const WRITE_ONLY_METHODS = new Set([
	"create",
	"createMany",
	"update",
	"updateMany",
	"upsert",
	"delete",
	"deleteMany",
	"executeRaw",
	"executeRawUnsafe",
]);

const READ_ONLY_METHODS = new Set([
	"findUnique",
	"findUniqueOrThrow",
	"findFirst",
	"findFirstOrThrow",
	"findMany",
	"count",
	"aggregate",
	"groupBy",
	"queryRaw",
	"queryRawUnsafe",
]);

const createPrismaClient = (datasourceUrl?: string) =>
	new PrismaClient({
		...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
		transactionOptions: {
			maxWait: config.prismaTransactionMaxWaitMs,
			timeout: config.prismaTransactionTimeoutMs,
		},
	});

type ReadReplicaState = {
	id: string;
	client: PrismaClient;
	url: string;
	healthy: boolean;
	lastLagSeconds: number | null;
	lastCheckedAt: number | null;
	lastError?: string;
};

const writePrisma = createPrismaClient(config.writeDatabaseUrl || undefined);
const rawReadReplicaUrls = config.enableReadReplica
	? [...config.readDatabaseUrls, config.readDatabaseUrl].filter(Boolean)
	: [];
const uniqueReadReplicaUrls = Array.from(new Set(rawReadReplicaUrls));
const readReplicas: ReadReplicaState[] = uniqueReadReplicaUrls.map((url, index) => ({
	id: `read-replica-${index + 1}`,
	client: createPrismaClient(url),
	url,
	healthy: true,
	lastLagSeconds: null,
	lastCheckedAt: null,
}));
const requestDbContext = new AsyncLocalStorage<{ forcePrimaryReads: boolean }>();
let readReplicaCursor = 0;
let readReplicaHealthcheckTimer: NodeJS.Timeout | null = null;
const logger = getLogger();

export const runWithDbRequestContext = <T>(fn: () => T): T =>
	requestDbContext.run({ forcePrimaryReads: false }, fn);

const parseLagSeconds = (lagValue: unknown): number | null => {
	if (lagValue === null || lagValue === undefined) return null;
	if (typeof lagValue === "number") return Number.isFinite(lagValue) ? lagValue : null;
	if (typeof lagValue === "string") {
		const parsed = Number(lagValue);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
};

const readReplicaHealthQuery = `
	SELECT
		pg_is_in_recovery() AS is_replica,
		EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds
`;

const refreshReadReplicaHealth = async (replica: ReadReplicaState) => {
	try {
		const result = (await replica.client.$queryRawUnsafe(readReplicaHealthQuery)) as Array<{
			is_replica?: boolean;
			lag_seconds?: number | string | null;
		}>;
		const row = result?.[0];
		const isReplica = Boolean(row?.is_replica);
		const lagSeconds = parseLagSeconds(row?.lag_seconds);
		const withinLagThreshold =
			lagSeconds === null || lagSeconds <= config.readReplicaLagThresholdSeconds;

		replica.healthy = isReplica && withinLagThreshold;
		replica.lastLagSeconds = lagSeconds;
		replica.lastCheckedAt = Date.now();
		replica.lastError = !isReplica
			? "Target is not in replica recovery mode."
			: withinLagThreshold
				? undefined
				: `Replica lag ${lagSeconds}s exceeded threshold ${config.readReplicaLagThresholdSeconds}s.`;
	} catch (error) {
		replica.healthy = false;
		replica.lastCheckedAt = Date.now();
		replica.lastError = error instanceof Error ? error.message : String(error);
	}
};

const refreshAllReadReplicaHealth = async () => {
	if (readReplicas.length === 0) return;
	await Promise.all(readReplicas.map((replica) => refreshReadReplicaHealth(replica)));
};

const getReadReplica = (): PrismaClient | null => {
	if (readReplicas.length === 0) return null;

	const healthyReplicas = readReplicas.filter((replica) => replica.healthy);
	if (healthyReplicas.length === 0) {
		return null;
	}

	const selected = healthyReplicas[readReplicaCursor % healthyReplicas.length];
	readReplicaCursor = (readReplicaCursor + 1) % healthyReplicas.length;
	return selected.client;
};

const prismaProxy = new Proxy(writePrisma as any, {
	get(target, prop, receiver) {
		if (typeof prop !== "string") {
			return Reflect.get(target, prop, receiver);
		}

		// Prisma root operations are always routed to write for safety and consistency.
		if (prop.startsWith("$")) {
			return Reflect.get(target, prop, receiver);
		}

		const writeDelegate = Reflect.get(target, prop, receiver);
		if (readReplicas.length === 0 || !writeDelegate || typeof writeDelegate !== "object") {
			return writeDelegate;
		}

		return new Proxy(writeDelegate, {
			get(writeDelegateTarget, delegateProp, delegateReceiver) {
				const writeValue = Reflect.get(writeDelegateTarget, delegateProp, delegateReceiver);
				if (typeof delegateProp !== "string" || typeof writeValue !== "function") {
					return writeValue;
				}

				if (WRITE_ONLY_METHODS.has(delegateProp)) {
					const requestContext = requestDbContext.getStore();
					if (requestContext) {
						requestContext.forcePrimaryReads = true;
					}
					return writeValue.bind(writeDelegateTarget);
				}

				if (READ_ONLY_METHODS.has(delegateProp)) {
					const requestContext = requestDbContext.getStore();
					if (requestContext?.forcePrimaryReads) {
						return writeValue.bind(writeDelegateTarget);
					}

					const readClient = getReadReplica();
					if (!readClient) {
						return writeValue.bind(writeDelegateTarget);
					}

					const readDelegate = (readClient as any)[prop];
					const replicaValue = readDelegate?.[delegateProp];
					if (typeof replicaValue === "function") {
						return replicaValue.bind(readDelegate);
					}
				}

				return writeValue.bind(writeDelegateTarget);
			},
		});
	},
});

const prisma = prismaProxy as PrismaClient;

export async function connectDb() {
	try {
		assertValidPrismaDatasourceUrl({
			context: "startup.database.connect",
			logger,
			rawValue: config.writeDatabaseUrl || undefined,
		});
		await writePrisma.$connect();
		for (const replica of readReplicas) {
			assertValidPrismaDatasourceUrl({
				context: `startup.database.connect.${replica.id}`,
				logger,
				rawValue: replica.url,
			});
			await replica.client.$connect();
		}
		await refreshAllReadReplicaHealth();
		if (readReplicas.length > 0) {
			readReplicaHealthcheckTimer = setInterval(() => {
				void refreshAllReadReplicaHealth();
			}, config.readReplicaHealthcheckIntervalMs);
		}

		logger.info("Connected to the database successfully.", {
			prismaTransactionTimeoutMs: config.prismaTransactionTimeoutMs,
			prismaTransactionMaxWaitMs: config.prismaTransactionMaxWaitMs,
			readReplicaEnabled: readReplicas.length > 0,
			readReplicaCount: readReplicas.length,
			readReplicaLagThresholdSeconds: config.readReplicaLagThresholdSeconds,
			readReplicaHealthcheckIntervalMs: config.readReplicaHealthcheckIntervalMs,
		});
	} catch (error) {
		logger.error("Error connecting to the database:", {
			error,
			stack: error instanceof Error ? error.stack : undefined,
		});
		throw error;
	}
}

export async function connectRedis() {
	try {
		await redisClient.connect();
		logger.info("Connected to Redis successfully.");
	} catch (error) {
		logger.error("Error connecting to Redis:", {
			error,
			stack: error instanceof Error ? error.stack : undefined,
		});
		// Don't exit process for Redis connection failure - allow app to continue without caching
		logger.warn("Application will continue without Redis caching functionality.");
	}
}

export async function disconnectRedis() {
	try {
		await redisClient.disconnect();
		logger.info("Disconnected from Redis successfully.");
	} catch (error) {
		logger.error("Error disconnecting from Redis:", {
			error,
			stack: error instanceof Error ? error.stack : undefined,
		});
	}
}

export async function connectAllDatabases() {
	await connectDb();
	await connectRedis();
}

export async function disconnectAllDatabases() {
	try {
		if (readReplicaHealthcheckTimer) {
			clearInterval(readReplicaHealthcheckTimer);
			readReplicaHealthcheckTimer = null;
		}
		await writePrisma.$disconnect();
		for (const replica of readReplicas) {
			await replica.client.$disconnect();
		}
		logger.info("Disconnected from the database successfully.");
	} catch (error) {
		logger.error("Error disconnecting from the database:", {
			error,
			stack: error instanceof Error ? error.stack : undefined,
		});
	}

	await disconnectRedis();
}

export { prisma };
