/**
 * Single entry: npm run dev:local
 *
 * 1) Ensure Docker Postgres clone container (hris-local-dev-clone :5433)
 * 2) Ensure .env.local-clone (from example if missing)
 * 3) Run predev with BNPI tunnel + device bridges skipped
 * 4) Start API watch with .env + .env.local-clone
 *
 * Does not touch shared VM DEV (55435). For that use: npm run dev
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const localCloneEnv = path.join(apiRoot, ".env.local-clone");
const exampleEnv = path.join(apiRoot, ".env.local-clone.example");
const containerName = process.env.HRIS_LOCAL_CLONE_CONTAINER || "hris-local-dev-clone";
const localPort = String(process.env.HRIS_LOCAL_CLONE_PORT || "5433");
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

function ensureContainer() {
	if (!dockerAvailable()) {
		fail(
			"Docker is not available. Start Docker Desktop, then re-run: npm run dev:local",
		);
	}

	const state = containerState();
	if (state.running) {
		log(`Postgres clone already running (${containerName} → 127.0.0.1:${localPort})`);
		return;
	}

	if (state.exists) {
		log(`Starting existing container ${containerName}...`);
		const start = run("docker", ["start", containerName]);
		if (start.status !== 0) fail(`docker start ${containerName} failed`);
	} else {
		log(
			`Creating Postgres clone container ${containerName} on port ${localPort} (empty until you restore a dump)...`,
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
			"postgres:16-alpine",
		]);
		if (create.status !== 0) {
			fail(
				`Failed to create ${containerName}. If a dump already exists under .runtime/local-db-clone-*, restore it after the container is up.`,
			);
		}
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

function runPredevLocal() {
	loadEnvFile(localCloneEnv, { overwrite: true });
	process.env.HRIS_SKIP_BNPI_DB_ACCESS = "true";
	process.env.HRIS_SKIP_PROJECT_TRUTH_REMOTE_LAN_FORWARD = "true";
	process.env.HIKVISION_VM_BRIDGE_ENABLED =
		process.env.HIKVISION_VM_BRIDGE_ENABLED || "false";
	process.env.HRIS_SKIP_DEVICE_LIVE_PATH =
		process.env.HRIS_SKIP_DEVICE_LIVE_PATH || "true";
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

function main() {
	log("=== local clone one-shot ===");
	log(`repo=${repoRoot}`);
	ensureEnvFile();
	ensureContainer();
	runPredevLocal();
	startApiWatch();
}

main();
