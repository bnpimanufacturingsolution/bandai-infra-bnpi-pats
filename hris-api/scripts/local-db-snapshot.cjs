/**
 * Local clone Postgres snapshot / restore (DM-safe rewind).
 *
 * Purpose:
 *   Capture the full `hris-local-dev-clone` database after DM import work so
 *   a later wipe/reset can restore business data without re-running migrations.
 *
 * Storage (gitignored under repo `.runtime/`):
 *   .runtime/local-db-snapshots/current/hris-local.dump   ← stable restore target
 *   .runtime/local-db-snapshots/current/manifest.json
 *   .runtime/local-db-snapshots/archives/<stamp>/...      ← optional history
 *
 * Commands:
 *   node scripts/local-db-snapshot.cjs snapshot [--label name] [--no-archive]
 *   node scripts/local-db-snapshot.cjs restore  [--from path|current|archive-stamp]
 *   node scripts/local-db-snapshot.cjs status
 *
 * Safety:
 *   - Default target is Docker container `hris-local-dev-clone` only
 *   - Refuses non-local targets
 *   - Uses docker exec + docker cp (avoids PowerShell binary pipe corruption)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const snapshotsRoot =
	process.env.HRIS_LOCAL_DB_SNAPSHOT_ROOT ||
	path.join(repoRoot, ".runtime", "local-db-snapshots");
const currentDir = path.join(snapshotsRoot, "current");
const archivesDir = path.join(snapshotsRoot, "archives");
const dumpFileName = "hris-local.dump";
const manifestFileName = "manifest.json";
const containerName = process.env.HRIS_LOCAL_CLONE_CONTAINER || "hris-local-dev-clone";
const pgUser = process.env.HRIS_LOCAL_CLONE_PGUSER || "postgres";
const pgDatabase = process.env.HRIS_LOCAL_CLONE_PGDATABASE || "hris";
const localPort = String(process.env.HRIS_LOCAL_CLONE_PORT || "5433");
const containerDumpPath = "/tmp/hris-local-snapshot.dump";

function log(msg) {
	console.log(`[db-snapshot] ${msg}`);
}

function fail(msg, code = 1) {
	console.error(`[db-snapshot] ${msg}`);
	process.exit(code);
}

function run(cmd, args, opts = {}) {
	const result = spawnSync(cmd, args, {
		cwd: opts.cwd || apiRoot,
		stdio: opts.stdio || "inherit",
		windowsHide: true,
		env: opts.env || process.env,
		encoding: "utf8",
		maxBuffer: opts.maxBuffer || 64 * 1024 * 1024,
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
		maxBuffer: 64 * 1024 * 1024,
	});
}

function parseArgs(argv) {
	const args = argv.slice(2);
	const command = (args[0] || "status").toLowerCase();
	const flags = new Set();
	const options = {};
	for (let i = 1; i < args.length; i++) {
		const token = args[i];
		if (token === "--no-archive") {
			flags.add("no-archive");
			continue;
		}
		if (token === "--force") {
			flags.add("force");
			continue;
		}
		if (token === "--label" || token === "--from") {
			const key = token.slice(2);
			const value = args[i + 1];
			if (!value || value.startsWith("--")) {
				fail(`Missing value for ${token}`);
			}
			options[key] = value;
			i += 1;
			continue;
		}
		if (token.startsWith("--label=")) {
			options.label = token.slice("--label=".length);
			continue;
		}
		if (token.startsWith("--from=")) {
			options.from = token.slice("--from=".length);
			continue;
		}
		fail(`Unknown argument: ${token}`);
	}
	return { command, flags, options };
}

function ensureDocker() {
	const r = runCapture("docker", ["version", "--format", "{{.Server.Version}}"]);
	if (r.status !== 0) {
		fail("Docker is not available. Start Docker Desktop, then re-run.");
	}
}

function ensureContainerRunning() {
	const r = runCapture("docker", [
		"ps",
		"--filter",
		`name=^/${containerName}$`,
		"--format",
		"{{.Names}}|{{.Status}}",
	]);
	const line = String(r.stdout || "")
		.trim()
		.split(/\r?\n/)
		.filter(Boolean)[0];
	if (!line) {
		fail(
			`Container ${containerName} is not running. Start it with: npm run dev:local (or docker start ${containerName})`,
		);
	}
	if (!/^[^|]+\|Up\b/i.test(line)) {
		fail(`Container ${containerName} exists but is not Up. Run: docker start ${containerName}`);
	}
}

function waitForPostgres(maxAttempts = 60) {
	for (let i = 0; i < maxAttempts; i++) {
		const ready = runCapture("docker", [
			"exec",
			containerName,
			"pg_isready",
			"-U",
			pgUser,
			"-d",
			pgDatabase,
		]);
		if (ready.status === 0) return;
		spawnSync(
			process.execPath,
			["-e", "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500)"],
			{ stdio: "ignore", windowsHide: true },
		);
	}
	fail(`Postgres in ${containerName} did not become ready`);
}

function sha256File(filePath) {
	const hash = crypto.createHash("sha256");
	hash.update(fs.readFileSync(filePath));
	return hash.digest("hex");
}

function formatBytes(n) {
	if (!Number.isFinite(n) || n < 0) return String(n);
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function stampNow() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	return (
		`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
		`${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
	);
}

function queryCount(sql) {
	const r = runCapture("docker", [
		"exec",
		containerName,
		"psql",
		"-U",
		pgUser,
		"-d",
		pgDatabase,
		"-t",
		"-A",
		"-c",
		sql,
	]);
	if (r.status !== 0) return null;
	const text = String(r.stdout || "").trim();
	if (!text) return null;
	const n = Number(text);
	return Number.isFinite(n) ? n : text;
}

function collectQuickStats() {
	return {
		employees: queryCount('SELECT count(*) FROM "employees"'),
		users: queryCount('SELECT count(*) FROM "users"'),
		timesheets: queryCount('SELECT count(*) FROM "timesheets"'),
		timesheetLines: queryCount('SELECT count(*) FROM "timesheet_lines"'),
		attendances: queryCount('SELECT count(*) FROM "attendances"'),
		employeeBenefits: queryCount('SELECT count(*) FROM "employee_benefits"'),
		migrationRunEvents: queryCount('SELECT count(*) FROM "MigrationRunEvent"'),
	};
}

function ensureDir(dir) {
	fs.mkdirSync(dir, { recursive: true });
}

function writeManifest(dir, payload) {
	const manifestPath = path.join(dir, manifestFileName);
	fs.writeFileSync(manifestPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	return manifestPath;
}

function readManifest(dir) {
	const manifestPath = path.join(dir, manifestFileName);
	if (!fs.existsSync(manifestPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	} catch {
		return null;
	}
}

function resolveDumpPath(fromArg) {
	if (!fromArg || fromArg === "current") {
		return path.join(currentDir, dumpFileName);
	}
	const asPath = path.resolve(fromArg);
	if (fs.existsSync(asPath) && fs.statSync(asPath).isFile()) {
		return asPath;
	}
	const archiveDump = path.join(archivesDir, fromArg, dumpFileName);
	if (fs.existsSync(archiveDump)) {
		return archiveDump;
	}
	const archiveDirDump = path.join(archivesDir, fromArg);
	if (fs.existsSync(archiveDirDump) && fs.statSync(archiveDirDump).isDirectory()) {
		const candidate = path.join(archiveDirDump, dumpFileName);
		if (fs.existsSync(candidate)) return candidate;
	}
	fail(
		`Could not resolve dump from "${fromArg}". Use "current", an archive stamp under ${archivesDir}, or a full path to a .dump file.`,
	);
}

function snapshot({ label, noArchive }) {
	ensureDocker();
	ensureContainerRunning();
	waitForPostgres();

	const stamp = stampNow();
	const archiveLabel = label
		? `${stamp}-${String(label).replace(/[^a-zA-Z0-9._-]+/g, "-")}`
		: stamp;

	log(`Capturing pg_dump from ${containerName} (${pgDatabase})...`);
	const dumpInContainer = run("docker", [
		"exec",
		containerName,
		"pg_dump",
		"-U",
		pgUser,
		"-d",
		pgDatabase,
		"-Fc",
		"--no-owner",
		"--no-acl",
		"-f",
		containerDumpPath,
	]);
	if (dumpInContainer.status !== 0) {
		fail("pg_dump failed inside the container");
	}

	ensureDir(currentDir);
	const currentDumpPath = path.join(currentDir, dumpFileName);
	const tmpHostDump = path.join(currentDir, `${dumpFileName}.tmp`);
	if (fs.existsSync(tmpHostDump)) fs.unlinkSync(tmpHostDump);

	const copy = run("docker", ["cp", `${containerName}:${containerDumpPath}`, tmpHostDump]);
	if (copy.status !== 0) {
		fail("docker cp of dump file failed");
	}

	// Atomic replace of current dump.
	if (fs.existsSync(currentDumpPath)) fs.unlinkSync(currentDumpPath);
	fs.renameSync(tmpHostDump, currentDumpPath);

	const stats = fs.statSync(currentDumpPath);
	const digest = sha256File(currentDumpPath);
	const quickStats = collectQuickStats();
	const manifest = {
		kind: "hris-local-db-snapshot",
		version: 1,
		createdAt: new Date().toISOString(),
		label: label || null,
		stamp: archiveLabel,
		source: {
			containerName,
			database: pgDatabase,
			user: pgUser,
			port: localPort,
		},
		dump: {
			fileName: dumpFileName,
			sizeBytes: stats.size,
			sha256: digest,
			format: "custom",
		},
		quickStats,
		restoreHint: "npm run db:restore",
		devHint: "npm run dev:local:restore",
	};

	const manifestPath = writeManifest(currentDir, manifest);
	log(`Current snapshot written: ${currentDumpPath} (${formatBytes(stats.size)})`);
	log(`SHA-256: ${digest}`);
	log(`Quick stats: ${JSON.stringify(quickStats)}`);

	if (!noArchive) {
		const archivePath = path.join(archivesDir, archiveLabel);
		ensureDir(archivePath);
		fs.copyFileSync(currentDumpPath, path.join(archivePath, dumpFileName));
		writeManifest(archivePath, { ...manifest, archivePath });
		log(`Archive copy: ${archivePath}`);
	}

	// Best-effort cleanup inside container.
	runCapture("docker", ["exec", containerName, "rm", "-f", containerDumpPath]);

	console.log(
		JSON.stringify(
			{
				ok: true,
				action: "snapshot",
				currentDumpPath,
				manifestPath,
				sizeBytes: stats.size,
				sha256: digest,
				quickStats,
				archive: noArchive ? null : path.join(archivesDir, archiveLabel),
			},
			null,
			2,
		),
	);
}

function terminateOtherConnections() {
	// Drop idle app connections so --clean restore can drop objects.
	const sql = `
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND backend_type = 'client backend';
`;
	runCapture("docker", [
		"exec",
		containerName,
		"psql",
		"-U",
		pgUser,
		"-d",
		pgDatabase,
		"-c",
		sql,
	]);
}

function restore({ from, force }) {
	ensureDocker();
	ensureContainerRunning();
	waitForPostgres();

	const dumpPath = resolveDumpPath(from);
	if (!fs.existsSync(dumpPath)) {
		fail(
			`No snapshot dump found at ${dumpPath}. Run: npm run db:snapshot  (from hris-api while the local clone has good data)`,
		);
	}

	const dumpDir = path.dirname(dumpPath);
	const manifest = readManifest(dumpDir);
	const size = fs.statSync(dumpPath).size;
	log(`Restoring ${dumpPath} (${formatBytes(size)}) into ${containerName}/${pgDatabase}`);
	if (manifest?.quickStats) {
		log(`Snapshot quick stats (at capture): ${JSON.stringify(manifest.quickStats)}`);
	}
	if (manifest?.dump?.sha256) {
		const actual = sha256File(dumpPath);
		if (actual !== manifest.dump.sha256) {
			const msg = `Dump SHA-256 mismatch (manifest ${manifest.dump.sha256}, file ${actual})`;
			if (!force) fail(`${msg}. Re-run with --force to ignore.`);
			log(`WARNING: ${msg} (continuing because --force)`);
		} else {
			log("SHA-256 matches manifest");
		}
	}

	// Host → container without shell binary pipes (Windows-safe).
	const copy = run("docker", ["cp", dumpPath, `${containerName}:${containerDumpPath}`]);
	if (copy.status !== 0) {
		fail("docker cp of dump into container failed");
	}

	terminateOtherConnections();

	// Prefer clean restore of objects. Exit code 1 can mean non-fatal warnings
	// (missing objects on --clean); treat only hard failures as fatal.
	const restoreResult = runCapture("docker", [
		"exec",
		containerName,
		"pg_restore",
		"-U",
		pgUser,
		"-d",
		pgDatabase,
		"--clean",
		"--if-exists",
		"--no-owner",
		"--no-acl",
		containerDumpPath,
	]);

	const stderr = String(restoreResult.stderr || "").trim();
	const stdout = String(restoreResult.stdout || "").trim();
	if (restoreResult.status !== 0 && restoreResult.status !== 1) {
		if (stdout) console.error(stdout);
		if (stderr) console.error(stderr);
		fail(`pg_restore failed with exit ${restoreResult.status}`);
	}
	if (stderr) {
		// Surface warnings but continue when exit is 0/1.
		const lines = stderr.split(/\r?\n/).filter(Boolean);
		const preview = lines.slice(0, 12).join("\n");
		log(
			`pg_restore reported ${lines.length} stderr line(s) (often benign with --clean). First lines:\n${preview}`,
		);
	}

	runCapture("docker", ["exec", containerName, "rm", "-f", containerDumpPath]);

	const afterStats = collectQuickStats();
	log(`Restore complete. Live quick stats: ${JSON.stringify(afterStats)}`);

	if (manifest?.quickStats?.employees != null && afterStats.employees != null) {
		if (Number(afterStats.employees) !== Number(manifest.quickStats.employees)) {
			log(
				`WARNING: employee count after restore (${afterStats.employees}) != snapshot (${manifest.quickStats.employees})`,
			);
		} else {
			log(`Employee count matches snapshot: ${afterStats.employees}`);
		}
	}

	console.log(
		JSON.stringify(
			{
				ok: true,
				action: "restore",
				from: dumpPath,
				containerName,
				database: pgDatabase,
				afterStats,
				snapshotStats: manifest?.quickStats || null,
			},
			null,
			2,
		),
	);
}

function status() {
	const currentDump = path.join(currentDir, dumpFileName);
	const manifest = readManifest(currentDir);
	let archives = [];
	if (fs.existsSync(archivesDir)) {
		archives = fs
			.readdirSync(archivesDir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name)
			.sort()
			.reverse()
			.slice(0, 20);
	}

	let live = null;
	try {
		ensureDocker();
		const r = runCapture("docker", [
			"ps",
			"--filter",
			`name=^/${containerName}$`,
			"--format",
			"{{.Status}}",
		]);
		const statusText = String(r.stdout || "").trim();
		if (statusText) {
			live = {
				containerName,
				status: statusText,
				quickStats: /^Up\b/i.test(statusText) ? collectQuickStats() : null,
			};
		}
	} catch {
		// ignore
	}

	const payload = {
		snapshotsRoot,
		current: fs.existsSync(currentDump)
			? {
					dumpPath: currentDump,
					sizeBytes: fs.statSync(currentDump).size,
					sizeHuman: formatBytes(fs.statSync(currentDump).size),
					manifest,
				}
			: null,
		recentArchives: archives,
		live,
		commands: {
			snapshot: "npm run db:snapshot",
			restore: "npm run db:restore",
			devWithRestore: "npm run dev:local:restore",
		},
	};
	console.log(JSON.stringify(payload, null, 2));
}

function printHelp() {
	console.log(`Usage:
  node scripts/local-db-snapshot.cjs snapshot [--label name] [--no-archive]
  node scripts/local-db-snapshot.cjs restore  [--from current|archive-stamp|path] [--force]
  node scripts/local-db-snapshot.cjs status

npm aliases (from hris-api):
  npm run db:snapshot
  npm run db:restore
  npm run db:snapshot:status
  npm run dev:local:restore   # restore current snapshot, then start API
`);
}

function main() {
	const { command, flags, options } = parseArgs(process.argv);
	switch (command) {
		case "snapshot":
		case "save":
		case "dump":
			snapshot({
				label: options.label || null,
				noArchive: flags.has("no-archive"),
			});
			break;
		case "restore":
		case "load":
			restore({
				from: options.from || "current",
				force: flags.has("force"),
			});
			break;
		case "status":
		case "info":
			status();
			break;
		case "help":
		case "--help":
		case "-h":
			printHelp();
			break;
		default:
			fail(`Unknown command "${command}". Try: snapshot | restore | status`);
	}
}

main();
