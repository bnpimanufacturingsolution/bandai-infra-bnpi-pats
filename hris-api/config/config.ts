import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();
const localDevEnv = path.resolve(process.cwd(), ".env.development.local");
if (fs.existsSync(localDevEnv)) {
	dotenv.config({ path: localDevEnv, override: true });
}

const ALWAYS_ALLOWED_ORIGINS = [
	"http://localhost:3000",
	"http://127.0.0.1:3000",
	"http://localhost:3100",
	"http://127.0.0.1:3100",
	"http://localhost:3200",
	"http://127.0.0.1:3200",
	"http://localhost:3300",
	"http://127.0.0.1:3300",
	"http://localhost:3310",
	"http://127.0.0.1:3310",
	"http://localhost:3320",
	"http://127.0.0.1:3320",
	"http://localhost:5173",
	"http://localhost:3001",
	"http://localhost:4173",
	"http://localhost:5175",
	"http://127.0.0.1:5175",
	"https://bnpi-hris.tech",
	"https://www.bnpi-hris.tech",
	"https://app.bnpi-hris.tech",
	"https://dev.bnpi-hris.tech",
	"https://uat.bnpi-hris.tech",
	"https://emp.bnpi-hris.tech",
	"https://dev-emp.bnpi-hris.tech",
	"https://uat-emp.bnpi-hris.tech",
	"https://hris-emp-app-dev.web.app",
	"https://hris-emp-app-dev.firebaseapp.com",
	"https://hris-emp-app-uat.web.app",
	"https://hris-emp-app-uat.firebaseapp.com",
	"https://hris-emp-app.web.app",
	"https://hris-emp-app.firebaseapp.com",
	"https://hris-workforce-dev-20260416-app.web.app",
	"https://hris-workforce-dev-20260416-app.firebaseapp.com",
	"https://hris-workforce-uat-20260416.web.app",
	"https://hris-workforce-uat-20260416.firebaseapp.com",
	"https://hris-462dc.web.app",
];

const ENV_CORS_ORIGINS = process.env.CORS_ORIGINS
	? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
	: [];

const MERGED_CORS_ORIGINS = Array.from(
	new Set([...ALWAYS_ALLOWED_ORIGINS, ...ENV_CORS_ORIGINS].filter(Boolean)),
);

const PRIVATE_LAN_APP_ORIGIN =
	/^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):(3000|3100|3200|3300|3310|3320)$/;

const isLanCorsEnabled = process.env.ALLOW_LAN_CORS !== "false";

/** CORS origin gate used by Express cors middleware and Socket.IO. No-origin (curl/server) is allowed. */
const isAllowedCorsOrigin = (origin?: string | null): boolean => {
	if (!origin) return true;
	if (MERGED_CORS_ORIGINS.includes(origin)) return true;
	return isLanCorsEnabled && PRIVATE_LAN_APP_ORIGIN.test(origin);
};

const parseInteger = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseInt(value || "", 10);
	return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
	port: process.env.PORT || 3000,
	host: process.env.HOST || "0.0.0.0",
	baseApiPath: "/api",
	enableStartupServices: process.env.ENABLE_STARTUP_SERVICES === "true",
	enableDeviceServices: true,
	enableMetricsServices: process.env.ENABLE_METRICS_SERVICES !== "false",
	idpEnabled: String(process.env.IDP_ENABLED || "")
		.trim()
		.toLowerCase() === "true",
	authBaseUrl:
		process.env.AUTH_BASE_URL?.trim() ||
		"https://adam-auth-431713067666.asia-southeast1.run.app",
	enableRateLimit: process.env.ENABLE_RATE_LIMIT === "true",
	prismaTransactionTimeoutMs: parseInteger(process.env.PRISMA_TRANSACTION_TIMEOUT_MS, 30000),
	prismaTransactionMaxWaitMs: parseInteger(process.env.PRISMA_TRANSACTION_MAX_WAIT_MS, 15000),
	/** Prisma client pool size (default was ~5–9 in small pods → Device Events red flaps). */
	prismaConnectionLimit: parseInteger(process.env.PRISMA_CONNECTION_LIMIT, 30),
	/** Seconds to wait for a free pool connection before erroring. */
	prismaPoolTimeoutSeconds: parseInteger(process.env.PRISMA_POOL_TIMEOUT_SECONDS, 20),
	writeDatabaseUrl:
		process.env.WRITE_DATABASE_URL?.trim() ||
		process.env.PG_DATABASE_URL?.trim() ||
		process.env.DATABASE_URL?.trim() ||
		"",
	readDatabaseUrl: process.env.READ_DATABASE_URL?.trim() || "",
	readDatabaseUrls: (process.env.READ_DATABASE_URLS || "")
		.split(",")
		.map((url) => url.trim())
		.filter(Boolean),
	enableReadReplica:
		String(process.env.ENABLE_READ_REPLICA || "").trim().toLowerCase() === "true" ||
		Boolean(process.env.READ_DATABASE_URL?.trim()) ||
		Boolean(process.env.READ_DATABASE_URLS?.trim()),
	readReplicaLagThresholdSeconds: parseInteger(process.env.READ_REPLICA_LAG_THRESHOLD_SECONDS, 5),
	readReplicaHealthcheckIntervalMs: parseInteger(process.env.READ_REPLICA_HEALTHCHECK_INTERVAL_MS, 10000),
	slowRequestWarnMs: parseInteger(process.env.SLOW_REQUEST_WARN_MS, 10000),
	defaultRequestTimeoutMs: parseInteger(process.env.DEFAULT_REQUEST_TIMEOUT_MS, 120000),
	heavyRequestTimeoutMs: parseInteger(process.env.HEAVY_REQUEST_TIMEOUT_MS, 300000),
	headersTimeoutMs: parseInteger(process.env.HEADERS_TIMEOUT_MS, 310000),
	keepAliveTimeoutMs: parseInteger(process.env.KEEP_ALIVE_TIMEOUT_MS, 65000),
	backup: {
		enabled: process.env.BACKUP_ENABLED !== "false",
		timezone: process.env.BACKUP_TIMEZONE || "Asia/Manila",
		cron: process.env.BACKUP_CRON || "0 12 * * *",
		outputDir: process.env.BACKUP_DIR || "/var/backups/hris",
		retentionDays: parseInteger(process.env.BACKUP_RETENTION_DAYS, 0),
		postgresContainerName: process.env.POSTGRES_CONTAINER_NAME || "",
		postgresDatabase: process.env.POSTGRES_DB || "",
		postgresUser: process.env.POSTGRES_USER || "",
		postgresPassword: process.env.POSTGRES_PASSWORD || "",
	},
	apiActivityLogging: {
		enabled: process.env.API_ACTIVITY_LOGGING_ENABLED !== "false",
		includeReads: process.env.API_ACTIVITY_LOG_INCLUDE_READS !== "false",
		sampleRate: Math.min(
			1,
			Math.max(0, Number.parseFloat(process.env.API_ACTIVITY_LOG_SAMPLE_RATE || "1") || 1),
		),
		excludedPaths: (process.env.API_ACTIVITY_LOG_EXCLUDED_PATHS || "/health,/metrics")
			.split(",")
			.map((path) => path.trim())
			.filter(Boolean),
		bodyMode: process.env.API_ACTIVITY_LOG_BODY_MODE || "metadata",
	},
	auditLogging: {
		enabled: process.env.AUDIT_LOGGING_ENABLED !== "false",
	},
	betterStackEnabled:
		process.env.NODE_ENV === "production"
			? process.env.BETTER_STACK_ENABLED !== "false"
			: process.env.BETTER_STACK_ENABLED === "true",
	betterStackSourceToken: process.env.BETTER_STACK_SOURCE_TOKEN || "",
	betterStackHost: process.env.BETTER_STACK_HOST || "",
	cors: {
		origins: MERGED_CORS_ORIGINS,
		isAllowedOrigin: isAllowedCorsOrigin,
		credentials: process.env.CORS_CREDENTIALS === "true",
	},
	redis: {
		url: process.env.REDIS_URL || "redis://localhost:6379",
		host: process.env.REDIS_HOST || "localhost",
		port: parseInteger(process.env.REDIS_PORT, 6379),
		password: process.env.REDIS_PASSWORD || undefined,
		db: parseInteger(process.env.REDIS_DB, 0),
		enabled: process.env.REDIS_ENABLED !== "false", // Default to enabled
	},
};

export const defaultOrg = "69884da971e2dc9d6ac67b59";
