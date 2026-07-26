/**
 * Single entry: npm run dev:local
 *
 * 1) Ensure Docker Postgres clone container (hris-local-dev-clone :5433)
 *    with named volume hris-local-dev-clone-pgdata (distinguishable in `docker volume ls`)
 * 2) Ensure .env.local-clone (from example if missing)
 * 3) Optional: restore golden DM snapshot (npm run dev:local:restore / --restore)
 * 4) Apply Prisma schema via `prisma db push` against the local clone
 * 5) Run predev with BNPI tunnel + device bridges skipped
 * 6) Start API watch with .env + .env.local-clone
 *
 * Does not touch shared VM DEV (55435). For that use: npm run dev
 *
 * Skip schema push: HRIS_SKIP_LOCAL_CLONE_SCHEMA_PUSH=true
 * Restore snapshot on start: HRIS_LOCAL_CLONE_RESTORE_ON_START=true or --restore
 * Snapshot capture: npm run db:snapshot
 * Snapshot restore only: npm run db:restore
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const localCloneEnv = path.join(apiRoot, ".env.local-clone");
const exampleEnv = path.join(apiRoot, ".env.local-clone.example");
const postgresSchemaDir = path.join("prisma", "schema-postgres");
const containerName = process.env.HRIS_LOCAL_CLONE_CONTAINER || "hris-local-dev-clone";
const volumeName =
	process.env.HRIS_LOCAL_CLONE_VOLUME || "hris-local-dev-clone-pgdata";
const localPort = String(process.env.HRIS_LOCAL_CLONE_PORT || "5433");
const defaultLocalCloneDbUrl = `postgresql://postgres:postgres@127.0.0.1:${localPort}/hris?schema=public`;
const isWin = process.platform === "win32";

function log(msg) {
	console.log(`[dev:local] ${msg}`);
}

function fail(msg, code = 1) {
	console.error(`[dev:local] ${msg}`);
	process.exit(code);
}

function run(cmd, args, opts = {}) {
	const result = spawnSync(cmd, args, {
		cwd: opts.cwd || apiRoot,
		stdio: opts.stdio || "inherit",
		windowsHide: true,
		env: opts.env || process.env,
		shell: opts.shell === true,
		encoding: "utf8",
	});
	return result;
}

function runCapture(cmd, args) {
	return spawnSync(cmd, args, {
		cwd: apiRoot,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
		env: process.env,
		encoding: "utf8",
	});
}

function dockerAvailable() {
	const r = runCapture("docker", ["version", "--format", "{{.Server.Version}}"]);
	return r.status === 0;
}

function containerState() {
	const r = runCapture("docker", [
		"ps",
		"-a",
		"--filter",
		`name=^/${containerName}$`,
		"--format",
		"{{.Names}}|{{.Status}}",
	]);
	const line = String(r.stdout || "")
		.trim()
		.split(/\r?\n/)
		.filter(Boolean)[0];
	if (!line) return { exists: false, running: false };
	const running = /^[^|]+\|Up\b/i.test(line);
	return { exists: true, running };
}

function containerVolumeMounts() {
	const r = runCapture("docker", [
		"inspect",
		"--format",
		"{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Destination}};{{end}}",
		containerName,
	]);
	if (r.status !== 0) return [];
	return String(r.stdout || "")
		.trim()
		.split(";")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((entry) => {
			const [type, name, destination] = entry.split("|");
			return { type, name: name || "", destination: destination || "" };
		});
}

function ensureNamedVolume() {
	const exists = runCapture("docker", [
		"volume",
		"inspect",
		volumeName,
		"--format",
		"{{.Name}}",
	]);
	if (exists.status === 0 && String(exists.stdout || "").trim() === volumeName) {
		log(`Docker volume ready: ${volumeName}`);
		return;
	}
	log(`Creating Docker volume ${volumeName}...`);
	const create = run("docker", ["volume", "create", volumeName]);
	if (create.status !== 0) {
		fail(`Failed to create Docker volume ${volumeName}`);
	}
	log(`Docker volume created: ${volumeName}`);
}

function logVolumeHintForExistingContainer() {
	const mounts = containerVolumeMounts();
	const pgdata = mounts.find((m) =>
		m.destination.includes("/var/lib/postgresql/data"),
	);
	if (!pgdata) {
		log(
			`Warning: existing ${containerName} has no /var/lib/postgresql/data mount (unexpected)`,
		);
		return;
	}
	if (pgdata.type === "volume" && pgdata.name === volumeName) {
		log(`Postgres data volume: ${volumeName}`);
		return;
	}
	const label =
		pgdata.type === "volume" && pgdata.name
			? `volume ${pgdata.name}`
			: `${pgdata.type || "unknown"} mount`;
	log(
		`Note: existing ${containerName} uses ${label}, not named volume ${volumeName}. ` +
			`Recreate to adopt the named volume (data moves only if you re-point the same volume or restore a dump): ` +
			`docker stop ${containerName} && docker rm ${containerName} then re-run npm run dev:local`,
	);
}

function ensureContainer() {
	if (!dockerAvailable()) {
		fail(
			"Docker is not available. Start Docker Desktop, then re-run: npm run dev:local",
		);
	}

	const state = containerState();
	if (state.running) {
		log(`Postgres clone already running (${containerName} → 127.0.0.1:${localPort})`);
		logVolumeHintForExistingContainer();
		return;
	}

	if (state.exists) {
		log(`Starting existing container ${containerName}...`);
		const start = run("docker", ["start", containerName]);
		if (start.status !== 0) fail(`docker start ${containerName} failed`);
		logVolumeHintForExistingContainer();
	} else {
		ensureNamedVolume();
		log(
			`Creating Postgres clone container ${containerName} on port ${localPort} ` +
				`with volume ${volumeName} (schema applied next via prisma db push)...`,
		);
		const create = run("docker", [
			"run",
			"-d",
			"--name",
			containerName,
			"-e",
			"POSTGRES_DB=hris",
			"-e",
			"POSTGRES_USER=postgres",
			"-e",
			"POSTGRES_PASSWORD=postgres",
			"-p",
			`${localPort}:5432`,
			"-v",
			`${volumeName}:/var/lib/postgresql/data`,
			"postgres:16-alpine",
		]);
		if (create.status !== 0) {
			fail(
				`Failed to create ${containerName}. If a dump already exists under .runtime/local-db-clone-*, restore it after the container is up.`,
			);
		}
		log(`Postgres data volume: ${volumeName}`);
	}

	log("Waiting for Postgres ready...");
	for (let i = 0; i < 60; i++) {
		const ready = runCapture("docker", [
			"exec",
			containerName,
			"pg_isready",
			"-U",
			"postgres",
			"-d",
			"hris",
		]);
		if (ready.status === 0) {
			log("Postgres is ready");
			return;
		}
		spawnSync(process.execPath, ["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500)"], {
			stdio: "ignore",
			windowsHide: true,
		});
	}
	fail(`Postgres in ${containerName} did not become ready in time`);
}

function ensureEnvFile() {
	if (fs.existsSync(localCloneEnv)) {
		log("Using existing .env.local-clone");
		return;
	}
	if (!fs.existsSync(exampleEnv)) {
		fail("Missing .env.local-clone and .env.local-clone.example");
	}
	fs.copyFileSync(exampleEnv, localCloneEnv);
	log("Created .env.local-clone from .env.local-clone.example");
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

function getLocalCloneDatabaseUrl() {
	loadEnvFile(localCloneEnv, { overwrite: true });
	return (
		process.env.DATABASE_URL ||
		process.env.WRITE_DATABASE_URL ||
		process.env.PG_DATABASE_URL ||
		defaultLocalCloneDbUrl
	);
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

/**
 * Keep the local clone schema in sync with prisma/schema-postgres.
 * Safe/idempotent: already-synced DBs just report "in sync".
 * Opt out: HRIS_SKIP_LOCAL_CLONE_SCHEMA_PUSH=true
 */
function ensureLocalCloneSchema() {
	if (String(process.env.HRIS_SKIP_LOCAL_CLONE_SCHEMA_PUSH || "").toLowerCase() === "true") {
		log("Skipping prisma db push (HRIS_SKIP_LOCAL_CLONE_SCHEMA_PUSH=true)");
		return;
	}

	const dbUrl = getLocalCloneDatabaseUrl();
	if (!/127\.0\.0\.1|localhost/i.test(dbUrl)) {
		fail(
			`Refusing prisma db push: local-clone DATABASE_URL is not localhost (${redactDbUrl(dbUrl)}). ` +
				`Fix .env.local-clone or set HRIS_SKIP_LOCAL_CLONE_SCHEMA_PUSH=true.`,
		);
	}

	const schemaPath = path.join(apiRoot, postgresSchemaDir);
	if (!fs.existsSync(schemaPath)) {
		fail(`Missing Prisma schema path: ${schemaPath}`);
	}

	log(`Applying Prisma schema to local clone (${redactDbUrl(dbUrl)})...`);
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
			`prisma db push failed for local clone. Check Docker Postgres on port ${localPort}, then re-run npm run dev:local.`,
		);
	}
	log("Local clone schema is in sync with prisma/schema-postgres");
}

function runPredevLocal() {
	loadEnvFile(localCloneEnv, { overwrite: true });
	process.env.HRIS_SKIP_BNPI_DB_ACCESS = "true";
	process.env.HRIS_SKIP_PROJECT_TRUTH_REMOTE_LAN_FORWARD = "true";
	process.env.HIKVISION_VM_BRIDGE_ENABLED =
		process.env.HIKVISION_VM_BRIDGE_ENABLED || "false";
	process.env.HRIS_SKIP_DEVICE_LIVE_PATH =
		process.env.HRIS_SKIP_DEVICE_LIVE_PATH || "true";
	// Keep ensure-local-dev-services from double-pushing / touching other local compose stacks.
	// Schema for the clone is handled by ensureLocalCloneSchema() above.
	process.env.HRIS_SKIP_LOCAL_DB_BOOTSTRAP =
		process.env.HRIS_SKIP_LOCAL_DB_BOOTSTRAP || "true";

	log("Running predev (local clone mode — no shared 55435 tunnel)...");
	const result = run(process.execPath, [path.join(__dirname, "predev-run.cjs")], {
		env: process.env,
	});
	if (result.status !== 0) {
		fail(`predev failed with exit ${result.status == null ? 1 : result.status}`);
	}
}

function startApiWatch() {
	log("Starting API against local clone (.env + .env.local-clone)...");
	// Avoid Windows dotenv.cmd quoting breakage (cmd.exe + quoted .bin path).
	// Match package.json order: base .env then local-clone overwrites (dotenv -o).
	loadEnvFile(path.join(apiRoot, ".env"), { overwrite: true });
	loadEnvFile(localCloneEnv, { overwrite: true });

	// Keep local-clone isolation flags even if .env set otherwise.
	process.env.HRIS_SKIP_BNPI_DB_ACCESS = "true";
	process.env.HRIS_SKIP_PROJECT_TRUTH_REMOTE_LAN_FORWARD = "true";
	process.env.HIKVISION_VM_BRIDGE_ENABLED =
		process.env.HIKVISION_VM_BRIDGE_ENABLED || "false";
	process.env.HRIS_SKIP_DEVICE_LIVE_PATH =
		process.env.HRIS_SKIP_DEVICE_LIVE_PATH || "true";

	const dbUrl =
		process.env.DATABASE_URL ||
		process.env.WRITE_DATABASE_URL ||
		process.env.PG_DATABASE_URL ||
		"";
	log(`DATABASE_URL host target: ${dbUrl.replace(/:[^:@/]+@/, ":***@") || "(unset)"}`);

	const watchScript = path.join(__dirname, "run-dev-api-watch.cjs");
	const child = spawn(process.execPath, [watchScript], {
		cwd: apiRoot,
		stdio: "inherit",
		windowsHide: true,
		env: process.env,
	});

	child.on("error", (err) => {
		console.error(`[dev:local] failed to start API watcher: ${err.message}`);
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
	const env = String(process.env.HRIS_LOCAL_CLONE_RESTORE_ON_START || "").toLowerCase();
	return env === "1" || env === "true" || env === "yes";
}

function restoreLocalCloneSnapshot() {
	const snapshotScript = path.join(__dirname, "local-db-snapshot.cjs");
	if (!fs.existsSync(snapshotScript)) {
		fail(`Missing snapshot script: ${snapshotScript}`);
	}
	log("Restoring golden local-db snapshot into clone (before schema push / API start)...");
	const result = run(process.execPath, [snapshotScript, "restore", "--from", "current"], {
		env: process.env,
	});
	if (result.status !== 0) {
		fail(
			`Snapshot restore failed (exit ${result.status == null ? 1 : result.status}). ` +
				`Capture one first with: npm run db:snapshot`,
		);
	}
	log("Golden snapshot restored");
}

function main() {
	const restore = shouldRestoreOnStart();
	log(restore ? "=== local clone one-shot (with restore) ===" : "=== local clone one-shot ===");
	log(`repo=${repoRoot}`);
	ensureEnvFile();
	ensureContainer();
	if (restore) {
		// Restore full business data first; schema push afterwards keeps Prisma models in sync
		// with the repo without wiping the restored rows.
		restoreLocalCloneSnapshot();
	}
	ensureLocalCloneSchema();
	runPredevLocal();
	startApiWatch();
}

main();
