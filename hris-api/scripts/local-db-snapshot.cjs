/**
 * Local Postgres snapshot / restore (DM-safe rewind).
 *
 * Shared dump storage (gitignored under repo `.runtime/`):
 *   .runtime/local-db-snapshots/current/hris-local.dump   ← stable restore target
 *   .runtime/local-db-snapshots/current/manifest.json
 *   .runtime/local-db-snapshots/archives/<stamp>/...      ← optional history
 *
 * The dump is a portable PostgreSQL custom-format file. The SAME dump can be
 * restored into either lane:
 *   - Docker local clone (port 5433)  → npm run dev:local:restore / db:restore
 *   - Native host Postgres (port 5434) → npm run dev:native:restore / db:restore:native
 *
 * Targets (default: docker — does not change existing behavior):
 *   --target docker   container hris-local-dev-clone
 *   --target native   host 127.0.0.1:5434 (embedded, no Docker)
 *
 * Commands:
 *   node scripts/local-db-snapshot.cjs snapshot [--label name] [--no-archive] [--target docker|native]
 *   node scripts/local-db-snapshot.cjs restore  [--from path|current|archive-stamp] [--force] [--target docker|native]
 *   node scripts/local-db-snapshot.cjs status
 *
 * Safety:
 *   - Refuses non-local targets
 *   - Docker path uses docker exec + docker cp (Windows-safe)
 *   - Native path uses host pg_restore against 127.0.0.1 only
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
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
const pgUser =
	process.env.HRIS_LOCAL_CLONE_PGUSER ||
	process.env.HRIS_NATIVE_PG_USER ||
	"postgres";
const pgPassword =
	process.env.HRIS_LOCAL_CLONE_PGPASSWORD ||
	process.env.HRIS_NATIVE_PG_PASSWORD ||
	"postgres";
const pgDatabase =
	process.env.HRIS_LOCAL_CLONE_PGDATABASE ||
	process.env.HRIS_NATIVE_PG_DB ||
	"hris";
const dockerPort = String(process.env.HRIS_LOCAL_CLONE_PORT || "5433");
const nativePort = String(process.env.HRIS_NATIVE_PG_PORT || "5434");
const containerDumpPath = "/tmp/hris-local-snapshot.dump";
const isWin = process.platform === "win32";

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

function runCapture(cmd, args, opts = {}) {
	return spawnSync(cmd, args, {
		cwd: opts.cwd || apiRoot,
		stdio: ["ignore", "pipe", "pipe"],
		windowsHide: true,
		env: opts.env || process.env,
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
		if (token === "--label" || token === "--from" || token === "--target") {
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
		if (token.startsWith("--target=")) {
			options.target = token.slice("--target=".length);
			continue;
		}
		fail(`Unknown argument: ${token}`);
	}
	return { command, flags, options };
}

function resolveTarget(raw) {
	const t = String(raw || process.env.HRIS_LOCAL_DB_SNAPSHOT_TARGET || "docker")
		.trim()
		.toLowerCase();
	if (t === "docker" || t === "local" || t === "clone") return "docker";
	if (t === "native" || t === "host" || t === "embedded") return "native";
	fail(`Unknown --target "${raw}". Use: docker | native`);
}

function ensureDocker() {
	const r = runCapture("docker", ["version", "--format", "{{.Server.Version}}"]);
	if (r.status !== 0) {
		fail(
			"Docker is not available for --target docker. " +
				"Use --target native (npm run db:restore:native) or start Docker Desktop.",
		);
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

function waitForDockerPostgres(maxAttempts = 60) {
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

function ensureNativePostgresRunning() {
	const script = path.join(__dirname, "ensure-native-local-postgres.cjs");
	if (!fs.existsSync(script)) {
		fail(`Missing native helper: ${script}`);
	}
	log(`Ensuring native Postgres on 127.0.0.1:${nativePort}...`);
	const result = run(process.execPath, [script, "start"], {
		env: {
			...process.env,
			HRIS_NATIVE_PG_PORT: nativePort,
			HRIS_NATIVE_PG_USER: pgUser,
			HRIS_NATIVE_PG_PASSWORD: pgPassword,
			HRIS_NATIVE_PG_DB: pgDatabase,
		},
	});
	if (result.status !== 0) {
		fail(`Native Postgres is not ready (exit ${result.status == null ? 1 : result.status})`);
	}
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

/** ---------- client tools (pg_dump / pg_restore / psql) for native lane ---------- */

function clientToolsRoot() {
	if (process.env.HRIS_PG_CLIENT_DIR) {
		return path.resolve(process.env.HRIS_PG_CLIENT_DIR);
	}
	if (isWin) {
		return path.join(
			process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
			"project-truth",
			"pg-client",
		);
	}
	return path.join(os.homedir(), ".local", "share", "project-truth", "pg-client");
}

function toolName(base) {
	return isWin ? `${base}.exe` : base;
}

function findTool(base) {
	const name = toolName(base);
	const candidates = [];
	if (process.env.HRIS_PG_CLIENT_DIR) {
		candidates.push(path.join(path.resolve(process.env.HRIS_PG_CLIENT_DIR), name));
		candidates.push(path.join(path.resolve(process.env.HRIS_PG_CLIENT_DIR), "bin", name));
	}
	candidates.push(path.join(clientToolsRoot(), "bin", name));
	candidates.push(path.join(clientToolsRoot(), name));

	// Common Windows installs
	if (isWin) {
		const pf = process.env["ProgramFiles"] || "C:\\Program Files";
		for (const ver of ["18", "17", "16", "15", "14"]) {
			candidates.push(path.join(pf, "PostgreSQL", ver, "bin", name));
		}
	}

	// PATH lookup
	const which = runCapture(isWin ? "where.exe" : "which", [base]);
	if (which.status === 0) {
		const first = String(which.stdout || "")
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean)[0];
		if (first) candidates.unshift(first);
	}

	for (const c of candidates) {
		if (c && fs.existsSync(c)) return c;
	}
	return null;
}

function downloadFile(url, dest) {
	return new Promise((resolve, reject) => {
		ensureDir(path.dirname(dest));
		const file = fs.createWriteStream(dest);
		const req = https.get(url, (res) => {
			if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
				file.close();
				fs.unlink(dest, () => {});
				downloadFile(res.headers.location, dest).then(resolve, reject);
				return;
			}
			if (res.statusCode !== 200) {
				file.close();
				fs.unlink(dest, () => {});
				reject(new Error(`HTTP ${res.statusCode} for ${url}`));
				return;
			}
			res.pipe(file);
			file.on("finish", () => file.close(() => resolve(dest)));
		});
		req.on("error", (err) => {
			file.close();
			fs.unlink(dest, () => {});
			reject(err);
		});
	});
}

function extractZipWithPowerShell(zipPath, destDir) {
	ensureDir(destDir);
	const ps = `
$ErrorActionPreference = 'Stop'
Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force
`;
	const r = runCapture("powershell.exe", [
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-Command",
		ps,
	]);
	if (r.status !== 0) {
		fail(
			`Failed to extract ${zipPath}: ${String(r.stderr || r.stdout || "").trim() || "unknown error"}`,
		);
	}
}

/**
 * zonkyio embedded-postgres windows jar is a zip of a full PG distribution
 * (includes pg_dump / pg_restore / psql). We cache client tools under
 * %LOCALAPPDATA%\\project-truth\\pg-client once.
 */
async function ensureHostClientTools() {
	const existing = findTool("pg_restore");
	if (existing) {
		return {
			pg_restore: existing,
			pg_dump: findTool("pg_dump"),
			psql: findTool("psql"),
			binDir: path.dirname(existing),
		};
	}

	const root = clientToolsRoot();
	const stampFile = path.join(root, "source.json");
	const version = process.env.HRIS_PG_CLIENT_VERSION || "18.4.0";
	const jarName = `embedded-postgres-binaries-windows-amd64-${version}.jar`;
	const url =
		process.env.HRIS_PG_CLIENT_JAR_URL ||
		`https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/${version}/${jarName}`;
	const jarPath = path.join(root, "download", jarName);
	const extractDir = path.join(root, "extract", version);

	log(`Host pg_restore not found. Downloading Postgres client tools (${version}) once...`);
	log(`URL: ${url}`);
	try {
		await downloadFile(url, jarPath);
	} catch (err) {
		fail(
			`Could not download client tools: ${err.message}\n` +
				`Install PostgreSQL client tools (pg_restore) and re-run, or set HRIS_PG_CLIENT_DIR to a bin folder.`,
		);
	}

	// Jar is a zip; extract then locate bin/pg_restore.exe
	if (fs.existsSync(extractDir)) {
		fs.rmSync(extractDir, { recursive: true, force: true });
	}
	extractZipWithPowerShell(jarPath, extractDir);

	// Nested layout varies; search for pg_restore.exe
	function walkFind(dir, file, depth = 0) {
		if (depth > 8) return null;
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return null;
		}
		for (const e of entries) {
			const full = path.join(dir, e.name);
			if (e.isFile() && e.name.toLowerCase() === file.toLowerCase()) return full;
			if (e.isDirectory()) {
				const hit = walkFind(full, file, depth + 1);
				if (hit) return hit;
			}
		}
		return null;
	}

	const restored = walkFind(extractDir, toolName("pg_restore"));
	if (!restored) {
		// Some jars store a tar.gz inside — unpack that if present.
		const tarGz = walkFind(extractDir, "postgres-windows-x86_64.txz") ||
			walkFind(extractDir, "postgres-windows-x86_64.tar.gz") ||
			walkFind(extractDir, "pg-windows-x86_64.txz");
		if (tarGz) {
			fail(
				`Downloaded jar has nested archive at ${tarGz}. ` +
					`Extract client tools manually into ${root}\\bin (need pg_restore${isWin ? ".exe" : ""}).`,
			);
		}
		fail(
			`Downloaded client package but pg_restore was not found under ${extractDir}. ` +
				`Install PostgreSQL client tools and set HRIS_PG_CLIENT_DIR.`,
		);
	}

	const srcBin = path.dirname(restored);
	const destBin = path.join(root, "bin");
	ensureDir(destBin);
	// Copy whole bin directory so DLLs travel with the tools.
	for (const name of fs.readdirSync(srcBin)) {
		const from = path.join(srcBin, name);
		const to = path.join(destBin, name);
		if (fs.statSync(from).isFile()) {
			fs.copyFileSync(from, to);
		}
	}

	fs.writeFileSync(
		stampFile,
		`${JSON.stringify(
			{
				version,
				url,
				installedAt: new Date().toISOString(),
				binDir: destBin,
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	const pg_restore = path.join(destBin, toolName("pg_restore"));
	if (!fs.existsSync(pg_restore)) {
		fail(`Client tools install incomplete; missing ${pg_restore}`);
	}
	log(`Client tools ready: ${destBin}`);
	return {
		pg_restore,
		pg_dump: path.join(destBin, toolName("pg_dump")),
		psql: path.join(destBin, toolName("psql")),
		binDir: destBin,
	};
}

function withPgEnv(extra = {}) {
	return {
		...process.env,
		...extra,
		PGPASSWORD: pgPassword,
		PATH: extra.PATH || process.env.PATH,
	};
}

/** ---------- stats ---------- */

function queryCountDocker(sql) {
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

function queryCountNative(sql, tools) {
	if (tools?.psql && fs.existsSync(tools.psql)) {
		const r = runCapture(
			tools.psql,
			[
				"-h",
				"127.0.0.1",
				"-p",
				nativePort,
				"-U",
				pgUser,
				"-d",
				pgDatabase,
				"-t",
				"-A",
				"-c",
				sql,
			],
			{ env: withPgEnv({ PATH: `${tools.binDir}${path.delimiter}${process.env.PATH || ""}` }) },
		);
		if (r.status === 0) {
			const text = String(r.stdout || "").trim();
			if (!text) return null;
			const n = Number(text);
			return Number.isFinite(n) ? n : text;
		}
	}
	// Fallback: node pg
	try {
		const { Client } = require("pg");
		// sync via spawn of small node snippet for reliability without making whole script async-heavy
		const snippet = `
const {Client}=require('pg');
(async()=>{
  const c=new Client({host:'127.0.0.1',port:${Number(nativePort)},user:${JSON.stringify(pgUser)},password:${JSON.stringify(pgPassword)},database:${JSON.stringify(pgDatabase)}});
  await c.connect();
  const r=await c.query(${JSON.stringify(sql)});
  process.stdout.write(String(r.rows[0][Object.keys(r.rows[0])[0]]??''));
  await c.end();
})().catch(e=>{console.error(e);process.exit(1)});
`;
		const r = runCapture(process.execPath, ["-e", snippet], {
			env: process.env,
			cwd: apiRoot,
		});
		if (r.status !== 0) return null;
		const text = String(r.stdout || "").trim();
		if (!text) return null;
		const n = Number(text);
		return Number.isFinite(n) ? n : text;
	} catch {
		return null;
	}
}

function collectQuickStats(target, tools) {
	const q = (sql) =>
		target === "docker" ? queryCountDocker(sql) : queryCountNative(sql, tools);
	return {
		employees: q('SELECT count(*) FROM "employees"'),
		users: q('SELECT count(*) FROM "users"'),
		timesheets: q('SELECT count(*) FROM "timesheets"'),
		timesheetLines: q('SELECT count(*) FROM "timesheet_lines"'),
		attendances: q('SELECT count(*) FROM "attendances"'),
		employeeBenefits: q('SELECT count(*) FROM "employee_benefits"'),
		migrationRunEvents: q('SELECT count(*) FROM "MigrationRunEvent"'),
	};
}

/** ---------- snapshot / restore ---------- */

async function snapshot({ label, noArchive, target }) {
	const tools = target === "native" ? await ensureHostClientTools() : null;

	if (target === "docker") {
		ensureDocker();
		ensureContainerRunning();
		waitForDockerPostgres();
	} else {
		ensureNativePostgresRunning();
	}

	const stamp = stampNow();
	const archiveLabel = label
		? `${stamp}-${String(label).replace(/[^a-zA-Z0-9._-]+/g, "-")}`
		: stamp;

	ensureDir(currentDir);
	const currentDumpPath = path.join(currentDir, dumpFileName);
	const tmpHostDump = path.join(currentDir, `${dumpFileName}.tmp`);
	if (fs.existsSync(tmpHostDump)) fs.unlinkSync(tmpHostDump);

	if (target === "docker") {
		log(`Capturing pg_dump from Docker ${containerName} (${pgDatabase})...`);
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
		const copy = run("docker", ["cp", `${containerName}:${containerDumpPath}`, tmpHostDump]);
		if (copy.status !== 0) {
			fail("docker cp of dump file failed");
		}
		runCapture("docker", ["exec", containerName, "rm", "-f", containerDumpPath]);
	} else {
		log(`Capturing pg_dump from native 127.0.0.1:${nativePort}/${pgDatabase}...`);
		if (!tools.pg_dump || !fs.existsSync(tools.pg_dump)) {
			fail("pg_dump not available for native snapshot");
		}
		const dump = run(
			tools.pg_dump,
			[
				"-h",
				"127.0.0.1",
				"-p",
				nativePort,
				"-U",
				pgUser,
				"-d",
				pgDatabase,
				"-Fc",
				"--no-owner",
				"--no-acl",
				"-f",
				tmpHostDump,
			],
			{
				env: withPgEnv({
					PATH: `${tools.binDir}${path.delimiter}${process.env.PATH || ""}`,
				}),
			},
		);
		if (dump.status !== 0) {
			fail("pg_dump failed against native Postgres");
		}
	}

	if (fs.existsSync(currentDumpPath)) fs.unlinkSync(currentDumpPath);
	fs.renameSync(tmpHostDump, currentDumpPath);

	const stats = fs.statSync(currentDumpPath);
	const digest = sha256File(currentDumpPath);
	const quickStats = collectQuickStats(target, tools);
	const manifest = {
		kind: "hris-local-db-snapshot",
		version: 1,
		createdAt: new Date().toISOString(),
		label: label || null,
		stamp: archiveLabel,
		source: {
			target,
			containerName: target === "docker" ? containerName : null,
			host: target === "native" ? "127.0.0.1" : null,
			database: pgDatabase,
			user: pgUser,
			port: target === "docker" ? dockerPort : nativePort,
		},
		dump: {
			fileName: dumpFileName,
			sizeBytes: stats.size,
			sha256: digest,
			format: "custom",
			portable: true,
			note: "Same dump restores into docker (5433) or native (5434)",
		},
		quickStats,
		restoreHint:
			target === "native" ? "npm run db:restore:native" : "npm run db:restore",
		devHint:
			target === "native" ? "npm run dev:native:restore" : "npm run dev:local:restore",
	};

	const manifestPath = writeManifest(currentDir, manifest);
	log(`Current snapshot written: ${currentDumpPath} (${formatBytes(stats.size)})`);
	log(`SHA-256: ${digest}`);
	log(`Quick stats: ${JSON.stringify(quickStats)}`);
	log("This dump is portable — restore with either --target docker or --target native");

	if (!noArchive) {
		const archivePath = path.join(archivesDir, archiveLabel);
		ensureDir(archivePath);
		fs.copyFileSync(currentDumpPath, path.join(archivePath, dumpFileName));
		writeManifest(archivePath, { ...manifest, archivePath });
		log(`Archive copy: ${archivePath}`);
	}

	console.log(
		JSON.stringify(
			{
				ok: true,
				action: "snapshot",
				target,
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

function terminateOtherConnectionsDocker() {
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

function terminateOtherConnectionsNative() {
	const snippet = `
const {Client}=require('pg');
(async()=>{
  const c=new Client({host:'127.0.0.1',port:${Number(nativePort)},user:${JSON.stringify(pgUser)},password:${JSON.stringify(pgPassword)},database:${JSON.stringify(pgDatabase)}});
  await c.connect();
  await c.query(\`SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND pid <> pg_backend_pid()
      AND backend_type = 'client backend'\`);
  await c.end();
})().catch(()=>process.exit(0));
`;
	runCapture(process.execPath, ["-e", snippet], { cwd: apiRoot, env: process.env });
}

async function restore({ from, force, target }) {
	const tools = target === "native" ? await ensureHostClientTools() : null;

	if (target === "docker") {
		ensureDocker();
		ensureContainerRunning();
		waitForDockerPostgres();
	} else {
		ensureNativePostgresRunning();
	}

	const dumpPath = resolveDumpPath(from);
	if (!fs.existsSync(dumpPath)) {
		fail(
			[
				`No snapshot dump found at ${dumpPath}.`,
				`Same dump file is used by Docker and native lanes:`,
				`  ${path.join(currentDir, dumpFileName)}`,
				`Capture on a machine that has good local data:`,
				`  cd hris-api; npm run db:snapshot          # from Docker clone`,
				`  cd hris-api; npm run db:snapshot:native   # from native DB`,
				`Then copy the whole folder .runtime/local-db-snapshots/ to this machine (it is gitignored).`,
			].join("\n"),
		);
	}

	const dumpDir = path.dirname(dumpPath);
	const manifest = readManifest(dumpDir);
	const size = fs.statSync(dumpPath).size;
	const destLabel =
		target === "docker"
			? `${containerName}/${pgDatabase} (Docker :${dockerPort})`
			: `127.0.0.1:${nativePort}/${pgDatabase} (native)`;
	log(`Restoring ${dumpPath} (${formatBytes(size)}) into ${destLabel}`);
	log("Source dump is portable — captured on either lane can restore to either lane.");
	if (manifest?.quickStats) {
		log(`Snapshot quick stats (at capture): ${JSON.stringify(manifest.quickStats)}`);
	}
	if (manifest?.source?.target && manifest.source.target !== target) {
		log(
			`Note: dump was captured from target="${manifest.source.target}" → restoring into target="${target}" (supported)`,
		);
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

	let restoreResult;
	if (target === "docker") {
		const copy = run("docker", ["cp", dumpPath, `${containerName}:${containerDumpPath}`]);
		if (copy.status !== 0) {
			fail("docker cp of dump into container failed");
		}
		terminateOtherConnectionsDocker();
		restoreResult = runCapture("docker", [
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
		runCapture("docker", ["exec", containerName, "rm", "-f", containerDumpPath]);
	} else {
		terminateOtherConnectionsNative();
		restoreResult = runCapture(
			tools.pg_restore,
			[
				"-h",
				"127.0.0.1",
				"-p",
				nativePort,
				"-U",
				pgUser,
				"-d",
				pgDatabase,
				"--clean",
				"--if-exists",
				"--no-owner",
				"--no-acl",
				dumpPath,
			],
			{
				env: withPgEnv({
					PATH: `${tools.binDir}${path.delimiter}${process.env.PATH || ""}`,
				}),
			},
		);
	}

	const stderr = String(restoreResult.stderr || "").trim();
	const stdout = String(restoreResult.stdout || "").trim();
	if (restoreResult.status !== 0 && restoreResult.status !== 1) {
		if (stdout) console.error(stdout);
		if (stderr) console.error(stderr);
		fail(`pg_restore failed with exit ${restoreResult.status}`);
	}
	if (stderr) {
		const lines = stderr.split(/\r?\n/).filter(Boolean);
		const preview = lines.slice(0, 12).join("\n");
		log(
			`pg_restore reported ${lines.length} stderr line(s) (often benign with --clean). First lines:\n${preview}`,
		);
	}

	const afterStats = collectQuickStats(target, tools);
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
				target,
				from: dumpPath,
				destination:
					target === "docker"
						? { kind: "docker", containerName, port: dockerPort, database: pgDatabase }
						: { kind: "native", host: "127.0.0.1", port: nativePort, database: pgDatabase },
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

	let liveDocker = null;
	try {
		const r = runCapture("docker", [
			"ps",
			"--filter",
			`name=^/${containerName}$`,
			"--format",
			"{{.Status}}",
		]);
		const statusText = String(r.stdout || "").trim();
		if (statusText) {
			liveDocker = {
				containerName,
				status: statusText,
				quickStats: /^Up\b/i.test(statusText) ? collectQuickStats("docker", null) : null,
			};
		}
	} catch {
		// ignore
	}

	const payload = {
		snapshotsRoot,
		sharedDumpNote:
			"One dump file serves both npm run dev:local:restore (Docker 5433) and npm run dev:native:restore (native 5434).",
		current: fs.existsSync(currentDump)
			? {
					dumpPath: currentDump,
					sizeBytes: fs.statSync(currentDump).size,
					sizeHuman: formatBytes(fs.statSync(currentDump).size),
					manifest,
				}
			: null,
		recentArchives: archives,
		liveDocker,
		commands: {
			snapshotDocker: "npm run db:snapshot",
			snapshotNative: "npm run db:snapshot:native",
			restoreDocker: "npm run db:restore",
			restoreNative: "npm run db:restore:native",
			devLocalWithRestore: "npm run dev:local:restore",
			devNativeWithRestore: "npm run dev:native:restore",
		},
	};
	console.log(JSON.stringify(payload, null, 2));
}

function printHelp() {
	console.log(`Usage:
  node scripts/local-db-snapshot.cjs snapshot [--label name] [--no-archive] [--target docker|native]
  node scripts/local-db-snapshot.cjs restore  [--from current|archive-stamp|path] [--force] [--target docker|native]
  node scripts/local-db-snapshot.cjs status

Shared dump path (portable across Docker and native):
  .runtime/local-db-snapshots/current/hris-local.dump

npm aliases (from hris-api):
  npm run db:snapshot              # capture from Docker clone
  npm run db:snapshot:native       # capture from native 5434
  npm run db:restore               # restore into Docker clone
  npm run db:restore:native        # restore SAME dump into native 5434
  npm run db:snapshot:status
  npm run dev:local:restore        # restore → Docker API
  npm run dev:native:restore       # restore → native API
`);
}

async function main() {
	const { command, flags, options } = parseArgs(process.argv);
	const target = resolveTarget(options.target);
	switch (command) {
		case "snapshot":
		case "save":
		case "dump":
			await snapshot({
				label: options.label || null,
				noArchive: flags.has("no-archive"),
				target,
			});
			break;
		case "restore":
		case "load":
			await restore({
				from: options.from || "current",
				force: flags.has("force"),
				target,
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

main().catch((err) => {
	fail(err && err.stack ? err.stack : String(err));
});
