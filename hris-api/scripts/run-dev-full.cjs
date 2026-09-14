/**
 * One-command HRIS API dev bootstrap: `npm run dev`.
 *
 * Flow (meta contract):
 *   validate deps (+npm ci only when missing) -> predev preflight -> start API
 *   -> wait for real /health readiness -> start Cloudflare quick tunnel
 *   -> verify tunnel reaches the API -> keep both alive -> clean tree on exit.
 *
 * Escape hatches:
 *   HRIS_SKIP_CLOUDFLARE=true        run without the public quick tunnel
 *   HRIS_SKIP_PREDEV=true            skip the 9-step predev preflight
 *   HRIS_DEV_READY_TIMEOUT_MS        readiness deadline (default 240000)
 *   HRIS_CLOUDFLARED_BIN             explicit cloudflared path
 *
 * The orchestrator never prints secret values — only configured/missing.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const {
	buildBanner,
	extractTryCloudflareUrl,
	isApiHealthy,
	isDependencyTreeComplete,
	resolveCloudflaredBin,
	shouldSkipCloudflare,
	validateEnvPresence,
} = require("./dev-full-bootstrap-lib.cjs");
const { loadEnvFile } = require("./dev-db-runtime.cjs");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const envPath = path.join(apiRoot, ".env");
const localEnvPath = path.join(apiRoot, ".env.development.local");
const predevScript = path.join(__dirname, "predev-run.cjs");
const apiWatchScript = path.join(__dirname, "run-dev-api-watch.cjs");
const npmCliJs = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const runtimeDir = path.join(repoRoot, ".runtime", "dev-full");
const activeTunnelFile = path.join(runtimeDir, "active-tunnel.json");
const lastRunFile = path.join(runtimeDir, "last-run.json");

let runDir = null;
let apiChild = null;
let tunnelChild = null;
let tunnelUrl = null;
let shuttingDown = false;
let lastRunSummary = { startedAt: new Date().toISOString(), stopReason: null };

function log(message) {
	console.log(`[DEV] ${message}`);
}

function logError(message) {
	console.error(`[ERROR] ${message}`);
}

function nowIso() {
	return new Date().toISOString();
}

function ensureRuntimeDirs() {
	runStamp = new Date().toISOString().replace(/[:.]/g, "-");
	runDir = path.join(runtimeDir, runStamp);
	fs.mkdirSync(runDir, { recursive: true });
}function writeJson(file, payload) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

function readJson(file) {
	try {
		return JSON.parse(fs.readFileSync(file, "utf8"));
	} catch {
		return null;
	}
}

function loadRuntimeEnv() {
	loadEnvFile(envPath, { overwrite: true });
	loadEnvFile(localEnvPath, { overwrite: true });
}

function envValue(key, fallback) {
	const raw = process.env[key];
	return raw && String(raw).trim() ? String(raw).trim() : fallback;
}

function apiPortNumber() {
	return Number(envValue("PORT", "3001")) || 3001;
}

function killTree(pid, label) {
	if (!pid) return;
	try {
		if (process.platform === "win32") {
			spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true });
		} else {
			try {
				process.kill(-pid, "SIGTERM");
			} catch {
				try {
					process.kill(pid, "SIGTERM");
				} catch {
					/* already gone */
				}
			}
		}
		log(`stopped ${label} (pid ${pid})`);
	} catch {
		/* best effort */
	}
}

function stopTunnel({ keepEvidence = false } = {}) {
	const record = readJson(activeTunnelFile);
	if (record && record.pid) killTree(record.pid, "cloudflared quick tunnel");
	if (tunnelChild && tunnelChild.pid) killTree(tunnelChild.pid, "cloudflared quick tunnel");
	if (!keepEvidence) {
		try {
			fs.unlinkSync(activeTunnelFile);
		} catch {
			/* already gone */
		}
	}
	tunnelChild = null;
}

function shutdown(reason, exitCode) {
	if (shuttingDown) return;
	shuttingDown = true;
	log(`stopping development environment (${reason})...`);
	stopTunnel();
	if (apiChild && apiChild.pid) killTree(apiChild.pid, "HRIS API watcher tree");
	lastRunSummary.stoppedAt = nowIso();
	lastRunSummary.stopReason = reason;
	lastRunSummary.tunnelUrl = tunnelUrl;
	writeJson(lastRunFile, lastRunSummary);
	process.exit(exitCode);
}

function isCloudflaredQuickTunnelForPort(commandLine, port) {
	const normalized = String(commandLine || "");
	return normalized.includes("cloudflared") && normalized.includes(`--url`) && normalized.includes(`127.0.0.1:${port}`);
}

function listCloudflaredQuickTunnelProcesses() {
	const query =
		"Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json";
	const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", query], {
		windowsHide: true,
		encoding: "utf8",
		timeout: 15000,
	});
	const stdout = String(result.stdout || "").trim();
	if (!stdout) return [];
	let parsed = null;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return [];
	}
	return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Scenario G guard: never spawn a second quick tunnel for the same API port.
 * Tunnels recorded in our evidence file are ours — reclaim them like
 * ensure-dev-port-ownership reclaims stale repo watchers. Unknown cloudflared
 * quick tunnels on the same port fail loudly instead of being killed.
 */
function reclaimStaleOwnTunnel(port) {
	const record = readJson(activeTunnelFile);
	if (record && record.pid) {
		const alive = isPidAlive(record.pid);
		if (!alive) {
			log("previous quick tunnel evidence is stale (process gone); clearing record");
			try {
				fs.unlinkSync(activeTunnelFile);
			} catch {
				/* already gone */
			}
			return { ok: true };
		}
		const processes = listCloudflaredQuickTunnelProcesses();
		const match = processes.find((proc) => Number(proc.ProcessId) === Number(record.pid));
		if (match && isCloudflaredQuickTunnelForPort(match.CommandLine, port)) {
			log(`reclaiming stale quick tunnel from a previous dev session (pid ${record.pid})`);
			stopTunnel();
			return { ok: true };
		}
	}
	const processes = listCloudflaredQuickTunnelProcesses();
	const foreign = processes.filter(
		(proc) => isCloudflaredQuickTunnelForPort(proc.CommandLine, port) && !isOurTunnelRecord(proc.ProcessId),
	);
	if (foreign.length > 0) {
		return {
			ok: false,
			error:
				`A cloudflared quick tunnel for 127.0.0.1:${port} is already running and was not started by this bootstrap ` +
				`(pid ${foreign.map((p) => p.ProcessId).join(", ")}). Stop it first, or run with HRIS_SKIP_CLOUDFLARE=true.`,
		};
	}
	return { ok: true };
}

function isOurTunnelRecord(pid) {
	const record = readJson(activeTunnelFile);
	return Boolean(record && Number(record.pid) === Number(pid));
}

function isPidAlive(pid) {
	try {
		process.kill(Number(pid), 0);
		return true;
	} catch {
		return false;
	}
}

function checkDependencies() {
	const lockfilePath = path.join(apiRoot, "package-lock.json");
	if (!fs.existsSync(lockfilePath)) {
		logError("package-lock.json is missing; refusing to guess the dependency tree. Restore the lockfile, then re-run npm run dev.");
		return false;
	}
	if (isDependencyTreeComplete(apiRoot)) {
		return verifyArgon2Native();
	}

	log("node_modules is incomplete — installing the locked dependency tree with npm ci (one-time, slow)...");
	const npmResult = spawnSync(process.execPath, [npmCliJs, "ci", "--no-audit", "--no-fund"], {
		cwd: apiRoot,
		stdio: "inherit",
		windowsHide: true,
	});
	if (npmResult.status !== 0) {
		logError(`npm ci failed with exit code ${npmResult.status}. Fix the dependency tree, then re-run npm run dev.`);
		return false;
	}
	if (!isDependencyTreeComplete(apiRoot)) {
		logError("npm ci finished but required packages are still missing. Inspect node_modules and re-run npm run dev.");
		return false;
	}
	return verifyArgon2Native();
}

function verifyArgon2Native() {
	try {
		require("argon2");
		return true;
	} catch (error) {
		log("argon2 native binding is missing — running npm rebuild argon2 (conditional, one-time)...");
		const rebuild = spawnSync(process.execPath, [npmCliJs, "rebuild", "argon2", "--no-audit", "--no-fund"], {
			cwd: apiRoot,
			stdio: "inherit",
			windowsHide: true,
		});
		if (rebuild.status !== 0) {
			logError(`npm rebuild argon2 failed with exit code ${rebuild.status}.`);
			return false;
		}
		try {
			require("argon2");
			return true;
		} catch (retryError) {
			logError(`argon2 native binding still not loadable after rebuild: ${retryError.message}`);
			return false;
		}
	}
}

function validateEnvironment() {
	const load = validateEnvPresence(process.env);
	if (!load.ok) {
		logError(`required environment variable(s) missing: ${load.missing.join(", ")}`);
		logError("Configure the development environment (.env / .env.development.local) before re-running npm run dev.");
		return false;
	}
	log("Environment validation: PORT, JWT_SECRET configured (values not printed).");
	log("Database configuration: DATABASE_URL/PG_DATABASE_URL managed by predev DB resolution.");
	return true;
}

function runPredevPreflight() {
	if (process.env.HRIS_SKIP_PREDEV === "true") {
		log("predev preflight skipped (HRIS_SKIP_PREDEV=true)");
		return true;
	}
	log("running predev preflight (env, DB tunnel, port ownership, device paths)...");
	const result = spawnSync(process.execPath, [predevScript], {
		cwd: apiRoot,
		stdio: "inherit",
		windowsHide: true,
		env: process.env,
	});
	if (result.status !== 0) {
		logError(`predev preflight failed with exit code ${result.status}. See [predev] output above.`);
		return false;
	}
	return true;
}

function httpGetStatus(url, timeoutMs) {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (result) => {
			if (settled) return;
			settled = true;
			resolve(result);
		};
		try {
			const request = http.get(url, { timeout: timeoutMs }, (response) => {
				let body = "";
				response.on("data", (chunk) => {
					body += chunk;
				});
				response.on("end", () => finish({ statusCode: response.statusCode || 0, body }));
			});
			request.on("timeout", () => {
				request.destroy();
				finish(null);
			});
			request.on("error", () => finish(null));
		} catch {
			finish(null);
		}
	});
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApiReadiness(port, deadlineMs) {
	const healthUrl = `http://127.0.0.1:${port}/health`;
	const startedAt = Date.now();
	while (Date.now() - startedAt < deadlineMs) {
		if (apiChild && apiChild.exitCode !== null) {
			return { ok: false, reason: `API watcher exited with code ${apiChild.exitCode} before becoming ready` };
		}
		const result = await httpGetStatus(healthUrl, 1500);
		if (result && isApiHealthy(result.statusCode, result.body)) {
			return { ok: true };
		}
		await sleep(1000);
	}
	return { ok: false, reason: `API /health did not report healthy within ${Math.round(deadlineMs / 1000)}s (${healthUrl})` };
}

function findCloudflaredBin() {
	const override = process.env.HRIS_CLOUDFLARED_BIN;
	const whereResult = spawnSync("where", ["cloudflared"], { windowsHide: true, encoding: "utf8" });
	const firstPathHit = String(whereResult.stdout || "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	return resolveCloudflaredBin({
		pathOverride: override,
		candidates: [],
		whereResult: firstPathHit,
	});
}

function startQuickTunnel(port) {
	const bin = findCloudflaredBin();
	if (!bin) {
		return { ok: false, error: "cloudflared was not found. Install cloudflared (or set HRIS_CLOUDFLARED_BIN) before running npm run dev." };
	}
	const stdoutLog = path.join(runDir, "cloudflared-stdout.log");
	const stderrLog = path.join(runDir, "cloudflared-stderr.log");
	const stdoutStream = fs.openSync(stdoutLog, "a");
	const stderrStream = fs.openSync(stderrLog, "a");
	const child = spawn(bin, ["tunnel", "--url", `http://127.0.0.1:${port}`], {
		cwd: apiRoot,
		stdio: ["ignore", stdoutStream, stderrStream],
		windowsHide: true,
	});
	tunnelChild = child;
	lastRunSummary.tunnelPid = child.pid;
	lastRunSummary.tunnelLog = stderrLog;
	lastRunSummary.tunnelStdoutLog = stdoutLog;
	log(`starting Cloudflare quick tunnel: ${path.basename(bin)} tunnel --url http://127.0.0.1:${port} (pid ${child.pid})`);
	return { ok: true, child, stderrLog, stdoutLog };
}

async function waitForTunnelUrl(child, timeoutMs = 30000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		if (child.exitCode !== null) return { ok: false, error: `cloudflared exited early with code ${child.exitCode}` };
		const buffer =
			readTailFile(lastRunSummary.tunnelLog, 20000) + readTailFile(lastRunSummary.tunnelStdoutLog, 20000);
		const url = extractTryCloudflareUrl(buffer);
		if (url) return { ok: true, url };
		await sleep(500);
	}
	return { ok: false, error: `cloudflared did not announce a trycloudflare URL within ${Math.round(timeoutMs / 1000)}s` };
}

function readTailFile(filePath, maxBytes) {
	try {
		const stat = fs.statSync(filePath);
		const start = Math.max(0, stat.size - maxBytes);
		const handle = fs.openSync(filePath, "r");
		const buffer = Buffer.alloc(stat.size - start);
		fs.readSync(handle, buffer, 0, buffer.length, start);
		fs.closeSync(handle);
		return buffer.toString("utf8");
	} catch {
		return "";
	}
}

async function verifyTunnelRouting(tunnelUrlLocal, timeoutMs = 45000) {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutMs) {
		const result = await probeHttpsHealth(tunnelUrlLocal);
		if (result.ok) return { ok: true };
		await sleep(1500);
	}
	return { ok: false, error: `tunnel URL did not reach the HRIS API /health within ${Math.round(timeoutMs / 1000)}s` };
}

async function probeHttpsHealth(base) {
	return new Promise((resolve) => {
		const https = require("https");
		try {
			const request = https.get(`${base}/health`, { timeout: 8000 }, (response) => {
				let body = "";
				response.on("data", (chunk) => {
					body += chunk;
				});
				response.on("end", () => {
					resolve({ ok: isApiHealthy(response.statusCode || 0, body) });
				});
			});
			request.on("timeout", () => {
				request.destroy();
				resolve({ ok: false });
			});
			request.on("error", () => resolve({ ok: false }));
		} catch {
			resolve({ ok: false });
		}
	});
}

/**
 * Keep re-probing the public URL in the background after the dev banner.
 * trycloudflare DNS/edge warm-up can lag behind tunnel registration; report
 * honestly when verification lands instead of blocking or exiting.
 */
function backgroundReverify(url, attempts) {
	let remaining = attempts;
	const tick = async () => {
		while (remaining > 0) {
			remaining -= 1;
			await sleep(20000);
			if (shuttingDown) return;
			const result = await probeHttpsHealth(url);
			if (result.ok) {
				console.log(`[CLOUDFLARE] Routing verified after retry: ${url}/health -> healthy`);
				lastRunSummary.routingVerified = true;
				writeJson(lastRunFile, lastRunSummary);
				return;
			}
			console.warn(`[CLOUDFLARE] routing re-verify pending (${remaining} retries left): ${url}/health`);
		}
		console.warn(`[CLOUDFLARE] Could not verify ${url}/health after ${attempts} retries. The tunnel stays up; test the URL from your browser.`);
	};
	tick();
}

async function main() {
	ensureRuntimeDirs();
	lastRunSummary.startedAt = nowIso();
	console.log("");
	log("Starting HRIS development environment...");

	process.on("SIGINT", () => shutdown("SIGINT", 130));
	process.on("SIGBREAK", () => shutdown("SIGBREAK", 130));
	process.on("SIGTERM", () => shutdown("SIGTERM", 143));
	process.on("exit", () => {
		if (shuttingDown) return;
		shuttingDown = true;
		stopTunnel();
		if (apiChild && apiChild.pid) killTree(apiChild.pid, "HRIS API watcher tree");
	});

	loadRuntimeEnv();
	const port = apiPortNumber();
	const skipCloudflare = shouldSkipCloudflare(process.env);

	const envOk = validateEnvironment();
	if (!envOk) shutdown("environment validation failed", 1);

	const depsOk = checkDependencies();
	if (!depsOk) shutdown("dependency validation failed", 1);
	log("Dependencies OK.");

	const predevOk = runPredevPreflight();
	if (!predevOk) shutdown("predev preflight failed", 1);

	if (!skipCloudflare) {
		const reclaim = reclaimStaleOwnTunnel(port);
		if (!reclaim.ok) {
			logError(reclaim.error);
			shutdown("duplicate Cloudflare tunnel detected", 1);
		}
	}

	log("Starting HRIS API watcher (tsx watch index.ts)...");
	apiChild = spawn(process.execPath, [apiWatchScript], {
		cwd: apiRoot,
		stdio: "inherit",
		windowsHide: false,
		env: process.env,
	});
	lastRunSummary.apiPid = apiChild.pid;

	apiChild.on("exit", (code, signal) => {
		if (shuttingDown) return;
		shutdown(`API watcher exited (code=${code ?? "null"}, signal=${signal ?? "none"})`, code ?? 1);
	});

	const readyTimeoutMs = Number(envValue("HRIS_DEV_READY_TIMEOUT_MS", "240000"));
	log(`Waiting for API readiness (${Math.round(readyTimeoutMs / 1000)}s deadline)...`);
	const ready = await waitForApiReadiness(port, readyTimeoutMs);
	if (!ready.ok) {
		logError(ready.reason);
		logError("The Cloudflare tunnel was NOT started because the API is not ready. Fix the API error shown above, then re-run npm run dev.");
		shutdown("API failed to become ready", 1);
	}
	lastRunSummary.readyAt = nowIso();
	log(`API is ready: http://localhost:${port} (http://127.0.0.1:${port}/health)`);

	if (skipCloudflare) {
		console.log(
			buildBanner({ apiPort: port, skipCloudflare: true, bannerLines: [` Status:`, `   API        READY`, `   Cloudflare SKIPPED`] }),
		);
		lastRunSummary.tunnelUrl = null;
		writeJson(lastRunFile, lastRunSummary);
		return;
	}

	const started = startQuickTunnel(port);
	if (!started.ok) {
		logError(started.error);
		shutdown("cloudflared unavailable", 1);
	}

	const [CLOUDFLARE_TAG] = ["[CLOUDFLARE]"];
	console.log(`${CLOUDFLARE_TAG} Starting tunnel...`);
	const urlResult = await waitForTunnelUrl(started.child);
	if (!urlResult.ok) {
		console.error(`${CLOUDFLARE_TAG} ${urlResult.error}`);
		const tail = readTailFile(lastRunSummary.tunnelLog, 2000);
		if (tail) console.error(tail);
		logError("The API is running, but the development environment could not establish the Cloudflare connection. Stopping everything so the failure is visible.");
		shutdown("cloudflared tunnel failed before URL", 1);
	}
	tunnelUrl = urlResult.url;
	lastRunSummary.tunnelUrl = tunnelUrl;
	writeJson(activeTunnelFile, {
		pid: started.child.pid,
		url: tunnelUrl,
		port,
		startedAt: nowIso(),
		log: lastRunSummary.tunnelLog,
	});
	console.log(`${CLOUDFLARE_TAG} Tunnel URL: ${tunnelUrl}`);

	// Fresh trycloudflare hostnames can fail client DNS (ENOTFOUND) for a while
	// after creation even though the tunnel is registered. Never kill the whole
	// dev environment for that — re-verify in the background and keep serving.
	console.log(`${CLOUDFLARE_TAG} Verifying Internet -> Cloudflare -> tunnel -> localhost:${port} -> HRIS API...`);
	verifyTunnelRouting(tunnelUrl)
		.then((routing) => {
			if (routing.ok) {
				console.log(`${CLOUDFLARE_TAG} Routing verified: ${tunnelUrl}/health -> healthy`);
				console.log(
					buildBanner({
						apiPort: port,
						tunnelUrl,
						bannerLines: [` Status:`, `   API        READY`, `   Cloudflare READY`],
					}),
				);
				writeJson(activeTunnelFile, {
					pid: started.child.pid,
					url: tunnelUrl,
					port,
					startedAt: nowIso(),
					routingVerifiedAt: nowIso(),
					log: lastRunSummary.tunnelLog,
				});
				lastRunSummary.routingVerified = true;
				writeJson(lastRunFile, lastRunSummary);
			} else {
				console.warn(`${CLOUDFLARE_TAG} WARNING: ${tunnelUrl}/health not verified yet (DNS/edge warm-up can take a minute).`);
				console.warn(`${CLOUDFLARE_TAG} The tunnel is registered and will keep retrying in the background. The API stays up.`);
				backgroundReverify(tunnelUrl, 10);
			}
		})
		.catch(() => backgroundReverify(tunnelUrl, 10));

	console.log(
		buildBanner({
			apiPort: port,
			tunnelUrl,
			bannerLines: [` Status:`, `   API        READY`, `   Cloudflare REGISTERED (verifying...)`],
		}),
	);
	writeJson(lastRunFile, lastRunSummary);

	// Keep the orchestrator alive while children run.
	await new Promise(() => {});
}

main().catch((error) => {
	logError(error && error.message ? error.message : String(error));
	shutdown("bootstrap crashed", 1);
});
