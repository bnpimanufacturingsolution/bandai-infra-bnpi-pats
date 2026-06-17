export type DbFaultTestEnv = Record<string, string | undefined>;

export type IsolatedDbFaultConfig =
	| {
			allowed: true;
			databaseName: string;
			hostname: string;
			port: string;
			reason: "ISOLATED_DB_FAULT_TESTS_ENABLED";
			schemaName?: string;
			url: string;
	  }
	| {
			allowed: false;
			reason: string;
	  };

const SHARED_ENV_PATTERN = /(^|[._-])(prod|production|uat|stage|staging|shared|live|develop|development|dev)([._-]|$)/i;
export const APPROVED_DB_FAULT_DATABASE_NAME = "hris_fault_test";
export const APPROVED_DB_FAULT_HOSTS = new Set(["localhost", "127.0.0.1"]);
export const APPROVED_DB_FAULT_PORT = "55432";

function isLocalHost(hostname: string) {
	return APPROVED_DB_FAULT_HOSTS.has(hostname);
}

export function resolveIsolatedDbFaultTestConfig(
	env: DbFaultTestEnv = process.env,
): IsolatedDbFaultConfig {
	if (env.ALLOW_DB_FAULT_TESTS !== "true") {
		return {
			allowed: false,
			reason: "Set ALLOW_DB_FAULT_TESTS=true to enable isolated DB fault tests.",
		};
	}

	const rawUrl = env.ISOLATED_TEST_DATABASE_URL?.trim();
	if (!rawUrl) {
		return {
			allowed: false,
			reason: "Set ISOLATED_TEST_DATABASE_URL to a disposable test database.",
		};
	}

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(rawUrl);
	} catch {
		return {
			allowed: false,
			reason: "ISOLATED_TEST_DATABASE_URL must be a valid database URL.",
		};
	}

	const hostname = parsedUrl.hostname.toLowerCase();
	const databaseName = parsedUrl.pathname.replace(/^\//, "");
	const port = parsedUrl.port || (parsedUrl.protocol.startsWith("postgres") ? "5432" : "");
	const schemaName = env.DB_FAULT_TEST_SCHEMA ?? parsedUrl.searchParams.get("schema") ?? undefined;
	if (!databaseName) {
		return {
			allowed: false,
			reason: "ISOLATED_TEST_DATABASE_URL must include a database name.",
		};
	}

	if (!parsedUrl.protocol.startsWith("postgres")) {
		return {
			allowed: false,
			reason: "ISOLATED_TEST_DATABASE_URL must use a PostgreSQL URL.",
		};
	}

	if (!isLocalHost(hostname)) {
		return {
			allowed: false,
			reason: "DB fault tests are allowed only on localhost or 127.0.0.1.",
		};
	}

	if (port !== APPROVED_DB_FAULT_PORT) {
		return {
			allowed: false,
			reason: `DB fault tests are allowed only on local Postgres port ${APPROVED_DB_FAULT_PORT}.`,
		};
	}

	if (databaseName !== APPROVED_DB_FAULT_DATABASE_NAME) {
		return {
			allowed: false,
			reason: `DB fault tests are allowed only on database ${APPROVED_DB_FAULT_DATABASE_NAME}.`,
		};
	}

	if (schemaName && SHARED_ENV_PATTERN.test(schemaName)) {
		return {
			allowed: false,
			reason: "DB fault-test schema appears to target a shared or production-like environment.",
		};
	}

	if (SHARED_ENV_PATTERN.test(hostname) || SHARED_ENV_PATTERN.test(databaseName)) {
		return {
			allowed: false,
			reason: "Database URL appears to target a shared or production-like environment.",
		};
	}

	return {
		allowed: true,
		databaseName,
		hostname,
		port,
		reason: "ISOLATED_DB_FAULT_TESTS_ENABLED",
		schemaName,
		url: rawUrl,
	};
}
