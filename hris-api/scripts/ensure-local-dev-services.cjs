const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadEnvFile, parseDatasourceUrl } = require("./dev-db-runtime.cjs");

const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const runtimeEnvPath = path.join(rootDir, ".env.development.local");
const postgresComposeFile = path.join(rootDir, "docker-compose.postgres-rw.yml");
const postgresSchemaDir = path.join("prisma", "schema-postgres");
const postgresContainerName = "hris-pg-primary";
const defaultTimeoutMs = Number(process.env.HRIS_LOCAL_SERVICE_TIMEOUT_MS || 120000);

function isLocalHost(hostname) {
	const normalized = String(hostname || "").toLowerCase();
	return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function redactDatasourceUrl(raw) {
	try {
		const parsed = new URL(raw);
		const port = parsed.port ? `:${parsed.port}` : "";
		return `${parsed.protocol}//${parsed.hostname}${port}${parsed.pathname}`;
	} catch {
		return "<unparseable>";
	}
}

function buildDatabaseUrl(raw, databaseName) {
	const parsed = new URL(raw);
	parsed.pathname = `/${encodeURIComponent(databaseName)}`;
	return parsed.toString();
}

function escapeIdentifier(identifier) {
	return `"${String(identifier).replace(/"/g, '""')}"`;
}

function escapeLiteral(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect(port, host) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ port, host });
		const done = (result) => {
			socket.removeAllListeners();
			socket.destroy();
			resolve(result);
		};

		socket.setTimeout(1000);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}

async function waitForPort(port, host, timeoutMs) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (await canConnect(port, host)) return true;
		await wait(1500);
	}
	return false;
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: rootDir,
		stdio: options.silent ? "pipe" : "inherit",
		windowsHide: true,
		encoding: "utf8",
		input: options.input,
		env: options.env ? { ...process.env, ...options.env } : process.env,
	});

	return result;
}

function outputText(result) {
	const errorText = result.error ? result.error.message : "";
	return [result.stdout, result.stderr, errorText].filter(Boolean).join("\n");
}

function isMissingDatabaseError(result) {
	return /database .* does not exist/i.test(outputText(result));
}

function isMissingTableError(result) {
	return /relation .* does not exist/i.test(outputText(result));
}

function runPrisma(args, options = {}) {
	const localPrismaCli = path.join(rootDir, "node_modules", "prisma", "build", "index.js");
	if (fs.existsSync(localPrismaCli)) {
		return run(process.execPath, [localPrismaCli, ...args], options);
	}

	const npx = process.platform === "win32" ? "npx.cmd" : "npx";
	return run(npx, ["prisma", ...args], options);
}

function runPrismaDbExecute(url, sql) {
	return runPrisma(["db", "execute", "--url", url, "--stdin"], {
		silent: true,
		input: sql,
		env: {
			PG_DATABASE_URL: url,
			DATABASE_URL: url,
		},
	});
}

function runPsql(databaseName, sql) {
	return run("docker", [
		"exec",
		"-i",
		"-e",
		"PGPASSWORD=postgres",
		postgresContainerName,
		"psql",
		"-h",
		"127.0.0.1",
		"-U",
		"postgres",
		"-d",
		databaseName,
		"-tAc",
		sql,
	], { silent: true });
}

function psqlScalar(databaseName, sql) {
	const result = runPsql(databaseName, sql);
	if (result.status !== 0) {
		throw new Error(outputText(result).trim());
	}

	return String(result.stdout || "").trim();
}

function databaseExists(datasource) {
	const maintenanceDatabase = datasource.databaseName === "postgres" ? "template1" : "postgres";
	try {
		return psqlScalar(
			maintenanceDatabase,
			`SELECT 1 FROM pg_database WHERE datname = ${escapeLiteral(datasource.databaseName)};`,
		) === "1";
	} catch (error) {
		throw new Error(
			`Could not check local Postgres database ${datasource.databaseName} at ${redactDatasourceUrl(datasource.raw)}.\n${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function createDatabase(datasource) {
	const maintenanceDatabase = datasource.databaseName === "postgres" ? "template1" : "postgres";
	const result = runPsql(
		maintenanceDatabase,
		`CREATE DATABASE ${escapeIdentifier(datasource.databaseName)};`,
	);

	if (result.status === 0) {
		console.log(`[local-services] Created local Postgres database "${datasource.databaseName}".`);
		return;
	}

	if (/already exists/i.test(outputText(result))) return;

	const maintenanceUrl = buildDatabaseUrl(datasource.raw, maintenanceDatabase);
	const fallbackResult = runPrismaDbExecute(
		maintenanceUrl,
		`CREATE DATABASE ${escapeIdentifier(datasource.databaseName)};`,
	);
	if (fallbackResult.status === 0) {
		console.log(`[local-services] Created local Postgres database "${datasource.databaseName}".`);
		return;
	}

	if (/already exists/i.test(outputText(fallbackResult))) return;

	throw new Error(
		`Could not create local Postgres database "${datasource.databaseName}". Confirm the local user has CREATEDB permission, or create it manually.\n${outputText(result).trim() || outputText(fallbackResult).trim()}`,
	);
}

function schemaLooksInitialized(datasource) {
	try {
		return psqlScalar(
			datasource.databaseName,
			"SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations';",
		) === "1";
	} catch (error) {
		if (/database .* does not exist/i.test(error instanceof Error ? error.message : String(error))) {
			return false;
		}

		const result = runPrismaDbExecute(
			datasource.raw,
			'SELECT 1 FROM "organizations" LIMIT 0;',
		);
		if (result.status === 0) return true;
		if (isMissingDatabaseError(result) || isMissingTableError(result)) return false;

		throw new Error(
			`Could not inspect local Postgres schema for database "${datasource.databaseName}".\n${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function pushPrismaSchema(datasource) {
	console.log(`[local-services] Applying Prisma Postgres schema to "${datasource.databaseName}"...`);
	const result = runPrisma(["db", "push", "--schema", postgresSchemaDir, "--skip-generate"], {
		env: {
			PG_DATABASE_URL: datasource.raw,
			DATABASE_URL: datasource.raw,
		},
	});

	if (result.status !== 0) {
		throw new Error(`Prisma db push failed for local database "${datasource.databaseName}".`);
	}
}

function ensureLocalDatabase(datasource) {
	if (process.env.HRIS_SKIP_LOCAL_DB_BOOTSTRAP === "true") {
		console.log("[local-services] Database bootstrap skipped because HRIS_SKIP_LOCAL_DB_BOOTSTRAP=true.");
		return;
	}

	const existed = databaseExists(datasource);
	if (!existed) {
		createDatabase(datasource);
		pushPrismaSchema(datasource);
		return;
	}

	if (!schemaLooksInitialized(datasource)) {
		console.log(`[local-services] Local Postgres database "${datasource.databaseName}" is empty.`);
		pushPrismaSchema(datasource);
		return;
	}

	console.log(`[local-services] Local Postgres database "${datasource.databaseName}" is ready.`);
}

function dockerInfoWorks() {
	const result = run("docker", ["info"], { silent: true });
	return result.status === 0;
}

function startDockerDesktop() {
	const candidates = [
		path.join(process.env.ProgramFiles || "C:\\Program Files", "Docker", "Docker", "Docker Desktop.exe"),
		path.join(
			process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
			"Docker",
			"Docker",
			"Docker Desktop.exe",
		),
	];
	const dockerDesktop = candidates.find((candidate) => fs.existsSync(candidate));
	if (!dockerDesktop) return false;

	console.log("[local-services] Docker is not reachable. Starting Docker Desktop...");
	const result = spawnSync(dockerDesktop, [], {
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	});
	return !result.error;
}

async function ensureDockerReady(timeoutMs) {
	if (dockerInfoWorks()) return true;

	startDockerDesktop();
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (dockerInfoWorks()) return true;
		await wait(2500);
	}

	return false;
}

function composeUpPostgres() {
	if (!fs.existsSync(postgresComposeFile)) {
		throw new Error(`Missing ${path.relative(rootDir, postgresComposeFile)}`);
	}

	console.log("[local-services] Starting local Postgres service with docker compose...");
	const result = run("docker", [
		"compose",
		"-f",
		postgresComposeFile,
		"up",
		"-d",
		"pg-primary",
	]);

	if (result.status !== 0) {
		throw new Error("docker compose failed to start pg-primary");
	}
}

async function main() {
	if (process.env.HRIS_SKIP_LOCAL_SERVICES === "true") {
		console.log("[local-services] Skipped because HRIS_SKIP_LOCAL_SERVICES=true.");
		return;
	}

	loadEnvFile(envPath);
	loadEnvFile(runtimeEnvPath, { overwrite: true });
	const datasource = parseDatasourceUrl(
		process.env.WRITE_DATABASE_URL ||
			process.env.PG_DATABASE_URL ||
			process.env.DATABASE_URL ||
			"",
	);

	if (!datasource) {
		console.warn(
			"[local-services] No readable WRITE_DATABASE_URL, PG_DATABASE_URL, or DATABASE_URL found. Skipping local service check.",
		);
		return;
	}

	if (!datasource.protocol.startsWith("postgres")) {
		console.log(
			`[local-services] Datasource is ${datasource.protocol}; local Postgres bootstrap is not needed.`,
		);
		console.log("[local-services] Hikvision watcher is Linux/VM managed and is not started on this host.");
		return;
	}

	datasource.databaseName =
		decodeURIComponent(String(datasource.pathname || "").replace(/^\//, "")) || "<unknown>";

	if (!isLocalHost(datasource.hostname)) {
		console.log(
			`[local-services] Postgres host is ${datasource.hostname}; assuming externally managed database.`,
		);
		console.log("[local-services] Hikvision watcher is Linux/VM managed and is not started on this host.");
		return;
	}

	if (await canConnect(datasource.port, datasource.hostname)) {
		console.log(`[local-services] Postgres is reachable at ${datasource.hostname}:${datasource.port}.`);
		ensureLocalDatabase(datasource);
		console.log("[local-services] Hikvision watcher is Linux/VM managed and is not started on this host.");
		return;
	}

	const dockerReady = await ensureDockerReady(defaultTimeoutMs);
	if (!dockerReady) {
		throw new Error(
			`Postgres is not listening at ${datasource.hostname}:${datasource.port}, and Docker is not reachable. Start Docker Desktop, then run npm run dev again.`,
		);
	}

	composeUpPostgres();

	if (!(await waitForPort(datasource.port, datasource.hostname, defaultTimeoutMs))) {
		throw new Error(
			`Started Docker compose, but Postgres did not become reachable at ${datasource.hostname}:${datasource.port}. Check docker compose -f docker-compose.postgres-rw.yml logs pg-primary.`,
		);
	}

	console.log(`[local-services] Postgres is ready at ${datasource.hostname}:${datasource.port}.`);
	ensureLocalDatabase(datasource);
	console.log("[local-services] Hikvision watcher is Linux/VM managed and is not started on this host.");
}

main().catch((error) => {
	console.error(`[local-services] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
