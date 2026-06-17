import dotenv from "dotenv";

dotenv.config();

const ALWAYS_ALLOWED_ORIGINS = [
	"http://localhost:3000",
	"http://127.0.0.1:3000",
	"http://localhost:5173",
	"http://localhost:3001",
	"http://localhost:4173",
	"http://localhost:5175",
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
	/^http:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}):3000$/;

const isLanCorsEnabled = process.env.ALLOW_LAN_CORS !== "false";

const isAllowedCorsOrigin = (origin?: string | null): boolean => {
	if (!origin) return true;
	if (MERGED_CORS_ORIGINS.includes(origin)) return true;
	return isLanCorsEnabled && PRIVATE_LAN_APP_ORIGIN.test(origin);
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
	prismaTransactionTimeoutMs: parseInt(process.env.PRISMA_TRANSACTION_TIMEOUT_MS || "30000", 10),
	prismaTransactionMaxWaitMs: parseInt(process.env.PRISMA_TRANSACTION_MAX_WAIT_MS || "15000", 10),
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
	readReplicaLagThresholdSeconds: parseInt(process.env.READ_REPLICA_LAG_THRESHOLD_SECONDS || "5", 10),
	readReplicaHealthcheckIntervalMs: parseInt(process.env.READ_REPLICA_HEALTHCHECK_INTERVAL_MS || "10000", 10),
	slowRequestWarnMs: parseInt(process.env.SLOW_REQUEST_WARN_MS || "10000", 10),
	defaultRequestTimeoutMs: parseInt(process.env.DEFAULT_REQUEST_TIMEOUT_MS || "120000", 10),
	heavyRequestTimeoutMs: parseInt(process.env.HEAVY_REQUEST_TIMEOUT_MS || "300000", 10),
	headersTimeoutMs: parseInt(process.env.HEADERS_TIMEOUT_MS || "310000", 10),
	keepAliveTimeoutMs: parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS || "65000", 10),
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
		port: parseInt(process.env.REDIS_PORT || "6379"),
		password: process.env.REDIS_PASSWORD || undefined,
		db: parseInt(process.env.REDIS_DB || "0"),
		enabled: process.env.REDIS_ENABLED !== "false", // Default to enabled
	},
};

export const defaultOrg = "69884da971e2dc9d6ac67b59";
