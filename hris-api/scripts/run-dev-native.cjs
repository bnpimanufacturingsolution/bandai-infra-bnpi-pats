/**
 * Separate lane: npm run dev:native / dev:native:restore
 *
 * Host Postgres without Docker and without the VM/K3s DEV tunnel.
 * Does NOT replace or alter:
 *   - npm run dev        (shared VM DEV via 55435)
 *   - npm run dev:local  (Docker clone on 5433 + .env.local-clone)
 *
 * This path only:
 *   1) Start native Postgres on 127.0.0.1:5434 (ensure-native-local-postgres.cjs)
 *   2) Ensure .env.local-native (from .env.local-native.example)
 *   3) Optional: restore shared golden dump (--restore / npm run dev:native:restore)
 *      from .runtime/local-db-snapshots/current/hris-local.dump
 *      (SAME file as npm run dev:local:restore — portable PG custom dump)
 *   4) prisma db push against that URL
 *   5) predev with all remote tunnel helpers skipped
 *   6) API watch with .env + .env.local-native
 *
 * Skip schema push: HRIS_SKIP_NATIVE_SCHEMA_PUSH=true
 * Restore on start: HRIS_NATIVE_RESTORE_ON_START=true or --restore
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const apiRoot = path.resolve(__dirname, "..");
const nativeEnv = path.join(apiRoot, ".env.local-native");
const exampleEnv = path.join(apiRoot, ".env.local-native.example");
const postgresSchemaDir = path.join("prisma", "schema-postgres");
const nativePort = String(process.env.HRIS_NATIVE_PG_PORT || "5434");
const defaultNativeDbUrl = `postgresql://postgres:postgres@127.0.0.1:${nativePort}/hris?schema=public`;
const isWin = process.platform === "win32";

function log(msg) {
	console.log(`[dev:native] ${msg}`);
}

function fail(msg, code = 1) {
	console.error(`[dev:native] ${msg}`);
	process.exit(code);
}

function run(cmd, args, opts = {}) {
	return spawnSync(cmd, args, {
		cwd: opts.cwd || apiRoot,
		stdio: opts.stdio || "inherit",
		windowsHide: true,
		env: opts.env || process.env,
		shell: opts.shell === true,
		encoding: "utf8",
	});
}

function ensureEnvFile() {
	if (fs.existsSync(nativeEnv)) {
		log("Using existing .env.local-native");
		return;
	}
	if (!fs.existsSync(exampleEnv)) {
		fail("Missing .env.local-native and .env.local-native.example");
	}
	fs.copyFileSync(exampleEnv, nativeEnv);
	log("Created .env.local-native from .env.local-native.example");
}

function loadEnvFile(filePath, { overwrite = false } = {}) {
	if (!fs.existsSync(filePath)) return;
	for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!key) continue;
		if (!overwrite && Object.prototype.hasOwnProperty.call(process.env, key)) continue;
		process.env[key] = value;
	}
}

function redactDbUrl(raw) {
	return String(raw || "").replace(/:[^:@/]+@/, ":***@") || "(unset)";
}

function getNativeDatabaseUrl() {
	loadEnvFile(nativeEnv, { overwrite: true });
	return (
		process.env.DATABASE_URL ||
		process.env.WRITE_DATABASE_URL ||
		process.env.PG_DATABASE_URL ||
		defaultNativeDbUrl
	);
}

function ensureNativePostgres() {
	const script = path.join(__dirname, "ensure-native-local-postgres.cjs");
	if (!fs.existsSync(script)) {
		fail(`Missing helper: ${script}`);
	}
	log("Starting native host Postgres (port 5434 — not Docker 5433, not VM 55435)...");
	const result = run(process.execPath, [script, "start"], {
		env: {
			...process.env,
			HRIS_NATIVE_PG_PORT: process.env.HRIS_NATIVE_PG_PORT || nativePort,
		},
	});
	if (result.status !== 0) {
		fail(
			`Native Postgres start failed (exit ${result.status == null ? 1 : result.status}). ` +
				`See: npm run db:native:start`,
		);
	}
}

function runPrisma(args, envOverrides = {}) {
	const localPrismaCli = path.join(apiRoot, "node_modules", "prisma", "build", "index.js");
	const env = { ...process.env, ...envOverrides };
	if (fs.existsSync(localPrismaCli)) {
		return run(process.execPath, [localPrismaCli, ...args], { env });
	}
	const npx = isWin ? "npx.cmd" : "npx";
	return run(npx, ["prisma", ...args], { env, shell: isWin });
}

function ensureSchema() {
	if (String(process.env.HRIS_SKIP_NATIVE_SCHEMA_PUSH || "").toLowerCase() === "true") {
		log("Skipping prisma db push (HRIS_SKIP_NATIVE_SCHEMA_PUSH=true)");
		return;
	}

	const dbUrl = getNativeDatabaseUrl();
	if (!/127\.0\.0\.1|localhost/i.test(dbUrl)) {
		fail(
			`Refusing prisma db push: native DATABASE_URL is not localhost (${redactDbUrl(dbUrl)}). ` +
				`Fix .env.local-native.`,
		);
	}
	// Guard: refuse accidental Docker/VM ports when using this lane's default intent.
	if (/:(5433|55435|15433)\b/.test(dbUrl) && !process.env.HRIS_NATIVE_ALLOW_NONDEFAULT_PORT) {
		fail(
			`Refusing prisma db push: ${redactDbUrl(dbUrl)} looks like Docker local-clone (5433) or VM tunnel. ` +
				`dev:native must use its own DB (default 5434). Override only with HRIS_NATIVE_ALLOW_NONDEFAULT_PORT=true.`,
		);
	}

	const schemaPath = path.join(apiRoot, postgresSchemaDir);
	if (!fs.existsSync(schemaPath)) {
		fail(`Missing Prisma schema path: ${schemaPath}`);
	}

	log(`Applying Prisma schema to native local DB (${redactDbUrl(dbUrl)})...`);
	const result = runPrisma(
		["db", "push", "--schema", postgresSchemaDir, "--skip-generate"],
		{
			DATABASE_URL: dbUrl,
			WRITE_DATABASE_URL: dbUrl,
			PG_DATABASE_URL: dbUrl,
		},
	);
	if (result.status !== 0) {
		fail(
			`prisma db push failed for native DB. Check: npm run db:native:status then npm run db:native:start`,
		);
	}
	log("Native schema is in sync with prisma/schema-postgres");
}

function applyIsolationFlags() {
	process.env.HRIS_SKIP_BNPI_DB_ACCESS = "true";
	process.env.HRIS_SKIP_PROJECT_TRUTH_REMOTE_LAN_FORWARD = "true";
	process.env.HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL =
		process.env.HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL || "true";
	process.env.PROJECT_TRUTH_DISABLE_K8S_DB_WATCH =
		process.env.PROJECT_TRUTH_DISABLE_K8S_DB_WATCH || "true";
	process.env.HIKVISION_VM_BRIDGE_ENABLED =
		process.env.HIKVISION_VM_BRIDGE_ENABLED || "false";
	process.env.HRIS_SKIP_DEVICE_LIVE_PATH =
		process.env.HRIS_SKIP_DEVICE_LIVE_PATH || "true";
	process.env.HRIS_SKIP_LOCAL_DB_BOOTSTRAP =
		process.env.HRIS_SKIP_LOCAL_DB_BOOTSTRAP || "true";
}

function runPredevNative() {
	loadEnvFile(nativeEnv, { overwrite: true });
	applyIsolationFlags();

	log("Running predev (native lane — no VM tunnel / no Docker clone)...");
	const result = run(process.execPath, [path.join(__dirname, "predev-run.cjs")], {
		env: process.env,
	});
	if (result.status !== 0) {
		fail(`predev failed with exit ${result.status == null ? 1 : result.status}`);
	}
}

function startApiWatch() {
	log("Starting API against native local DB (.env + .env.local-native)...");
	loadEnvFile(path.join(apiRoot, ".env"), { overwrite: true });
	loadEnvFile(nativeEnv, { overwrite: true });
	applyIsolationFlags();

	const dbUrl =
		process.env.DATABASE_URL ||
		process.env.WRITE_DATABASE_URL ||
		process.env.PG_DATABASE_URL ||
		"";
	log(`DATABASE_URL host target: ${redactDbUrl(dbUrl)}`);
	log("Note: this lane does not use Docker :5433 or VM :55435");

	const watchScript = path.join(__dirname, "run-dev-api-watch.cjs");
	const child = spawn(process.execPath, [watchScript], {
		cwd: apiRoot,
		stdio: "inherit",
		windowsHide: true,
		env: process.env,
	});

	child.on("error", (err) => {
		console.error(`[dev:native] failed to start API watcher: ${err.message}`);
		process.exit(1);
	});

	child.on("exit", (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal);
			return;
		}
		process.exit(code == null ? 1 : code);
	});
}

function shouldRestoreOnStart() {
	const args = new Set(process.argv.slice(2).map((a) => String(a).toLowerCase()));
	if (args.has("--restore") || args.has("--with-restore") || args.has("restore")) {
		return true;
	}
	const env = String(process.env.HRIS_NATIVE_RESTORE_ON_START || "").toLowerCase();
	return env === "1" || env === "true" || env === "yes";
}

function restoreSharedSnapshot() {
	const snapshotScript = path.join(__dirname, "local-db-snapshot.cjs");
	if (!fs.existsSync(snapshotScript)) {
		fail(`Missing snapshot script: ${snapshotScript}`);
	}
	log(
		"Restoring shared golden dump into native 5434 (same .runtime/local-db-snapshots as dev:local:restore)...",
	);
	const result = run(
		process.execPath,
		[snapshotScript, "restore", "--from", "current", "--target", "native"],
		{ env: process.env },
	);
	if (result.status !== 0) {
		fail(
			`Snapshot restore failed (exit ${result.status == null ? 1 : result.status}). ` +
				`Need dump at ../.runtime/local-db-snapshots/current/hris-local.dump ` +
				`(copy from a device that ran npm run db:snapshot; path is gitignored).`,
		);
	}
	log("Shared snapshot restored into native DB");
}

function main() {
	const restore = shouldRestoreOnStart();
	log(
		restore
			? "=== native host DB lane + shared snapshot restore ==="
			: "=== native host DB lane (separate from VM + Docker) ===",
	);
	ensureEnvFile();
	ensureNativePostgres();
	if (restore) {
		// Restore business data first; schema push afterwards keeps Prisma models in sync
		// without wiping restored rows (same order as run-dev-local.cjs).
		restoreSharedSnapshot();
	}
	ensureSchema();
	runPredevNative();
	startApiWatch();
}

main();
