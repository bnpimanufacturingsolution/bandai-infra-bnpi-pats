/**
 * Docker-free, VM-free host Postgres for npm run dev:native / db:native:*.
 *
 * SEPARATE from:
 *   - shared VM/K3s DEV (npm run dev, port 55435)
 *   - Docker local clone (npm run dev:local, port 5433, .env.local-clone)
 *
 * Default port: 5434 (must not collide with Docker 5433 or VM tunnel 55435)
 * Data: %LOCALAPPDATA%\project-truth\local-postgres  (Windows)
 *       ~/.local/share/project-truth/local-postgres (other)
 *
 * Usage:
 *   node scripts/ensure-native-local-postgres.cjs          # start / ensure
 *   node scripts/ensure-native-local-postgres.cjs start
 *   node scripts/ensure-native-local-postgres.cjs stop
 *   node scripts/ensure-native-local-postgres.cjs status
 *
 * Env:
 *   HRIS_NATIVE_PG_PORT            default 5434
 *   HRIS_NATIVE_PG_DATA_DIR        override data directory
 *   HRIS_NATIVE_PG_BIN_DIR         override bin directory
 *   HRIS_NATIVE_PG_USER            default postgres
 *   HRIS_NATIVE_PG_PASSWORD        default postgres
 *   HRIS_NATIVE_PG_DB              default hris
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const net = require("net");

const apiRoot = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
// Default 5434 — intentionally different from Docker local-clone 5433.
const localPort = Number(process.env.HRIS_NATIVE_PG_PORT || "5434") || 5434;
const pgUser = process.env.HRIS_NATIVE_PG_USER || "postgres";
const pgPassword = process.env.HRIS_NATIVE_PG_PASSWORD || "postgres";
const pgDb = process.env.HRIS_NATIVE_PG_DB || "hris";

function log(msg) {
	console.log(`[native-pg] ${msg}`);
}

function fail(msg, code = 1) {
	console.error(`[native-pg] ${msg}`);
	process.exit(code);
}

function defaultDataRoot() {
	if (process.env.HRIS_NATIVE_PG_DATA_DIR) {
		return path.resolve(process.env.HRIS_NATIVE_PG_DATA_DIR);
	}
	if (isWin) {
		return path.join(
			process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
			"project-truth",
			"local-postgres",
		);
	}
	return path.join(os.homedir(), ".local", "share", "project-truth", "local-postgres");
}

function resolveBinDir() {
	if (process.env.HRIS_NATIVE_PG_BIN_DIR) {
		return path.resolve(process.env.HRIS_NATIVE_PG_BIN_DIR);
	}
	const platformPkg =
		process.platform === "win32"
			? "windows-x64"
			: process.platform === "darwin"
				? process.arch === "arm64"
					? "darwin-arm64"
					: "darwin-x64"
				: process.arch === "arm64"
					? "linux-arm64"
					: "linux-x64";
	const candidates = [
		path.join(apiRoot, "node_modules", "@embedded-postgres", platformPkg, "native", "bin"),
		path.join(apiRoot, "..", "node_modules", "@embedded-postgres", platformPkg, "native", "bin"),
	];
	for (const dir of candidates) {
		const initdb = path.join(dir, isWin ? "initdb.exe" : "initdb");
		const pgCtl = path.join(dir, isWin ? "pg_ctl.exe" : "pg_ctl");
		if (fs.existsSync(initdb) && fs.existsSync(pgCtl)) {
			return dir;
		}
	}
	return null;
}

function exe(binDir, name) {
	return path.join(binDir, isWin ? `${name}.exe` : name);
}

function tcpOpen(port, host = "127.0.0.1", timeoutMs = 400) {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		let done = false;
		const finish = (ok) => {
			if (done) return;
			done = true;
			try {
				socket.destroy();
			} catch {
				/* ignore */
			}
			resolve(ok);
		};
		socket.setTimeout(timeoutMs);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
		socket.connect(port, host);
	});
}

function run(cmd, args, opts = {}) {
	return spawnSync(cmd, args, {
		cwd: opts.cwd || apiRoot,
		stdio: opts.stdio || "inherit",
		windowsHide: true,
		env: { ...process.env, ...(opts.env || {}) },
		encoding: "utf8",
	});
}

function runCapture(cmd, args, opts = {}) {
	return spawnSync(cmd, args, {
		cwd: opts.cwd || apiRoot,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
		env: { ...process.env, ...(opts.env || {}) },
		encoding: "utf8",
	});
}

async function waitForPort(port, attempts = 60) {
	for (let i = 0; i < attempts; i++) {
		if (await tcpOpen(port)) return true;
		spawnSync(process.execPath, ["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500)"], {
			stdio: "ignore",
			windowsHide: true,
		});
	}
	return false;
}

function ensureCluster(binDir, dataDir) {
	const pgVersion = path.join(dataDir, "PG_VERSION");
	if (fs.existsSync(pgVersion)) {
		log(`Cluster already initialized: ${dataDir}`);
		return;
	}

	fs.mkdirSync(dataDir, { recursive: true });
	const pwFile = path.join(path.dirname(dataDir), "pwfile");
	fs.writeFileSync(pwFile, `${pgPassword}\n`, "utf8");

	log(`Initializing cluster with initdb → ${dataDir}`);
	const initdb = exe(binDir, "initdb");
	const result = runCapture(initdb, [
		"-D",
		dataDir,
		"-U",
		pgUser,
		"-A",
		"password",
		"--pwfile",
		pwFile,
		"--encoding",
		"UTF8",
		"--locale",
		"C",
	]);
	try {
		fs.unlinkSync(pwFile);
	} catch {
		/* ignore */
	}
	if (result.status !== 0) {
		const err = String(result.stderr || result.stdout || "").trim();
		fail(`initdb failed (exit ${result.status}): ${err || "no output"}`);
	}

	const confPath = path.join(dataDir, "postgresql.conf");
	let conf = fs.readFileSync(confPath, "utf8");
	const overrides = [
		`# project-truth native local postgres (dev:native / port ${localPort})`,
		`listen_addresses = '127.0.0.1'`,
		`port = ${localPort}`,
		`max_connections = 100`,
	].join("\n");
	if (!conf.includes("project-truth native local postgres")) {
		conf = `${conf}\n${overrides}\n`;
		fs.writeFileSync(confPath, conf, "utf8");
	}

	const hbaPath = path.join(dataDir, "pg_hba.conf");
	let hba = fs.readFileSync(hbaPath, "utf8");
	if (!hba.includes("127.0.0.1/32")) {
		hba += `\nhost all all 127.0.0.1/32 scram-sha-256\nhost all all ::1/128 scram-sha-256\n`;
		fs.writeFileSync(hbaPath, hba, "utf8");
	}
	log("Cluster initialized");
}

function isServerRunning(binDir, dataDir) {
	const pgCtl = exe(binDir, "pg_ctl");
	const status = runCapture(pgCtl, ["status", "-D", dataDir]);
	const out = `${status.stdout || ""}${status.stderr || ""}`;
	return status.status === 0 || /server is running/i.test(out);
}

function startServer(binDir, dataDir, logFile) {
	if (isServerRunning(binDir, dataDir)) {
		log(`pg_ctl reports server already running on data dir`);
		return;
	}

	fs.mkdirSync(path.dirname(logFile), { recursive: true });
	const pgCtl = exe(binDir, "pg_ctl");
	log(`Starting postgres on 127.0.0.1:${localPort}...`);
	const result = run(
		pgCtl,
		["start", "-D", dataDir, "-l", logFile, "-o", `-p ${localPort}`, "-w"],
		{
			env: {
				PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
			},
		},
	);
	if (result.status !== 0) {
		let tail = "";
		try {
			const raw = fs.readFileSync(logFile, "utf8");
			tail = raw.slice(-2000);
		} catch {
			/* ignore */
		}
		fail(
			`pg_ctl start failed (exit ${result.status == null ? 1 : result.status}).` +
				(tail ? `\n--- log tail ---\n${tail}` : ""),
		);
	}
}

function stopServer(binDir, dataDir) {
	if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
		log(`No cluster at ${dataDir} — nothing to stop`);
		return;
	}
	if (!isServerRunning(binDir, dataDir)) {
		log("Server already stopped");
		return;
	}
	const pgCtl = exe(binDir, "pg_ctl");
	log(`Stopping postgres (dataDir=${dataDir})...`);
	const result = run(pgCtl, ["stop", "-D", dataDir, "-m", "fast", "-w"], {
		env: {
			PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
		},
	});
	if (result.status !== 0) {
		fail(`pg_ctl stop failed (exit ${result.status == null ? 1 : result.status})`);
	}
	log("Stopped");
}

async function ensureDatabase() {
	let Client;
	try {
		Client = require("pg").Client;
	} catch {
		fail(
			"Node package 'pg' is required to create the hris database. " +
				"Run: npm.cmd install pg  (or install embedded-postgres which depends on it)",
		);
	}

	const client = new Client({
		host: "127.0.0.1",
		port: localPort,
		user: pgUser,
		password: pgPassword,
		database: "postgres",
		connectionTimeoutMillis: 8000,
	});
	await client.connect();
	try {
		const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [pgDb]);
		if (exists.rowCount === 0) {
			log(`Creating database ${pgDb}...`);
			await client.query(
				`CREATE DATABASE "${pgDb.replace(/"/g, '""')}" OWNER "${pgUser.replace(/"/g, '""')}"`,
			);
			log(`Database ${pgDb} created`);
		} else {
			log(`Database ${pgDb} already exists`);
		}
	} finally {
		await client.end().catch(() => {});
	}
}

function writeRuntimeStamp(root, binDir, dataDir) {
	const stamp = {
		kind: "native-local-postgres",
		lane: "dev:native",
		doesNotReplace: ["npm run dev (VM 55435)", "npm run dev:local (Docker 5433)"],
		port: localPort,
		user: pgUser,
		database: pgDb,
		binDir,
		dataDir,
		url: `postgresql://${pgUser}:***@127.0.0.1:${localPort}/${pgDb}?schema=public`,
		updatedAt: new Date().toISOString(),
	};
	const out = path.join(root, "status.json");
	fs.writeFileSync(out, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");
	return out;
}

async function cmdStart() {
	const binDir = resolveBinDir();
	if (!binDir) {
		fail(
			[
				"Native Postgres binaries not found.",
				"Install once (no Docker, no admin MSI required):",
				"  cd hris-api",
				"  npm.cmd install --no-save embedded-postgres@18.4.0-beta.17",
				"  node node_modules/@embedded-postgres/windows-x64/scripts/hydrate-symlinks.js",
				"Then re-run: npm run db:native:start   or   npm run dev:native",
			].join("\n"),
		);
	}

	const root = defaultDataRoot();
	const dataDir = path.join(root, "data");
	const logFile = path.join(root, "postgres.log");
	fs.mkdirSync(root, { recursive: true });

	log(`lane=dev:native (does NOT touch VM 55435 or Docker 5433)`);
	log(`binDir=${binDir}`);
	log(`dataDir=${dataDir}`);
	log(`port=${localPort}`);

	if (await tcpOpen(localPort)) {
		log(`Postgres already listening on 127.0.0.1:${localPort} — reusing`);
		await ensureDatabase();
		const stampPath = writeRuntimeStamp(root, binDir, dataDir);
		log(`Ready. status=${stampPath}`);
		log(
			`DATABASE_URL=postgresql://${pgUser}:${pgPassword}@127.0.0.1:${localPort}/${pgDb}?schema=public`,
		);
		return;
	}

	ensureCluster(binDir, dataDir);
	startServer(binDir, dataDir, logFile);

	const ready = await waitForPort(localPort);
	if (!ready) {
		fail(`Postgres did not open 127.0.0.1:${localPort}. See log: ${logFile}`);
	}
	log(`Listening on 127.0.0.1:${localPort}`);

	await ensureDatabase();
	const stampPath = writeRuntimeStamp(root, binDir, dataDir);
	log(`Ready (native lane only). status=${stampPath}`);
	log(
		`DATABASE_URL=postgresql://${pgUser}:${pgPassword}@127.0.0.1:${localPort}/${pgDb}?schema=public`,
	);
}

async function cmdStop() {
	const binDir = resolveBinDir();
	if (!binDir) {
		fail("Native Postgres binaries not found; cannot stop.");
	}
	const root = defaultDataRoot();
	const dataDir = path.join(root, "data");
	stopServer(binDir, dataDir);
}

async function cmdStatus() {
	const binDir = resolveBinDir();
	const root = defaultDataRoot();
	const dataDir = path.join(root, "data");
	const listening = await tcpOpen(localPort);
	const running = binDir && fs.existsSync(path.join(dataDir, "PG_VERSION"))
		? isServerRunning(binDir, dataDir)
		: false;
	const stampPath = path.join(root, "status.json");
	console.log(
		JSON.stringify(
			{
				lane: "dev:native",
				port: localPort,
				listening,
				pgCtlRunning: running,
				binDir: binDir || null,
				dataDir,
				statusFile: fs.existsSync(stampPath) ? stampPath : null,
				note: "Separate from npm run dev (VM) and npm run dev:local (Docker 5433)",
			},
			null,
			2,
		),
	);
	if (!listening) process.exitCode = 2;
}

async function main() {
	const action = String(process.argv[2] || "start").toLowerCase();
	if (action === "start" || action === "ensure") {
		await cmdStart();
		return;
	}
	if (action === "stop") {
		await cmdStop();
		return;
	}
	if (action === "status") {
		await cmdStatus();
		return;
	}
	fail(`Unknown action "${action}". Use: start | stop | status`);
}

main().catch((err) => {
	fail(err && err.stack ? err.stack : String(err));
});
