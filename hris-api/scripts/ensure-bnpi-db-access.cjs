const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawnSync } = require("child_process");
const {
	loadEnvFile,
	parseDatasourceUrl,
	renderRuntimeOverride,
	resolvePreferredDatasource,
	inferEnvironment,
} = require("./dev-db-runtime.cjs");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const envPath = path.join(apiRoot, ".env");
const runtimeEnvPath = path.join(apiRoot, ".env.development.local");
const projectTruthScript = path.join(repoRoot, "scripts", "project-truth.ps1");
const k8sDevDbScript = path.join(repoRoot, "scripts", "start-k8s-dev-db-access.ps1");
const remoteLanForwardScript = path.join(
	repoRoot,
	"scripts",
	"start-project-truth-remote-lan-forward.ps1",
);
const hikvisionTunnelMapKey = "PROJECT_TRUTH_HIKVISION_TUNNEL_MAP";

function readEnvFileValue(filePath, key) {
	if (!fs.existsSync(filePath)) return "";
	for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const equalsIndex = trimmed.indexOf("=");
		if (equalsIndex === -1) continue;
		if (trimmed.slice(0, equalsIndex).trim() !== key) continue;
		return trimmed.slice(equalsIndex + 1).trim();
	}
	return "";
}

function canConnect(port, host, timeoutMs = 400) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ port, host });
		const done = (result) => {
			socket.removeAllListeners();
			socket.destroy();
			resolve(result);
		};

		socket.setTimeout(timeoutMs);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}

/**
 * TCP-open is not enough for Prisma. A half-dead SSH hop can accept TCP then
 * stall. Prefer a Postgres wire handshake (SSLRequest -> N/S/E).
 *
 * Cloudflare SSH local-forwards often need 1–3s for the first wire reply even
 * when 127.0.0.1 TCP is immediate. 500ms was a false-negative on a healthy
 * K3s DEV Postgres (firstByte 'N') via project-truth-hris. Override with
 * PROJECT_TRUTH_PG_HANDSHAKE_TIMEOUT_MS when needed.
 */
function defaultPostgresHandshakeTimeoutMs() {
	const raw = Number(process.env.PROJECT_TRUTH_PG_HANDSHAKE_TIMEOUT_MS || 5000);
	if (!Number.isFinite(raw) || raw < 250) return 5000;
	return Math.min(Math.floor(raw), 30000);
}

function canConnectPostgres(port, host, timeoutMs = defaultPostgresHandshakeTimeoutMs()) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ port, host });
		let settled = false;
		const done = (result) => {
			if (settled) return;
			settled = true;
			socket.removeAllListeners();
			socket.destroy();
			resolve(result);
		};

		socket.setTimeout(timeoutMs);
		socket.once("connect", () => {
			// Postgres SSLRequest
			socket.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]));
		});
		socket.once("data", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}

/** Fast fail: TCP first (250ms), Postgres wire only if TCP is open. */
async function canUseLocalPostgres(port) {
	if (!(await canConnect(port, "127.0.0.1", 250))) return false;
	return canConnectPostgres(port, "127.0.0.1", defaultPostgresHandshakeTimeoutMs());
}

function runPowerShell(args) {
	const command = process.platform === "win32" ? "powershell.exe" : "pwsh";
	return spawnSync(command, args, {
		cwd: repoRoot,
		stdio: "inherit",
		windowsHide: true,
	});
}

async function findReachableDevK8sForwardHost({
	port,
	// Injectable for unit tests. Production default: TCP+Postgres on 127.0.0.1 only.
	connect,
}) {
	// Prisma must use 127.0.0.1 only. Never probe 10.184.37.19 here — a dead
	// LAN-style alias only adds timeout and cannot satisfy Prisma on this host.
	const probe =
		typeof connect === "function"
			? (p, host) => connect(p, host)
			: (p) => canUseLocalPostgres(p);
	if (await probe(port, "127.0.0.1")) return "127.0.0.1";
	return null;
}

function ensureProjectTruthRemoteLanForward() {
	if (process.platform !== "win32") return;
	// Multi-port LAN forward is opt-in only — expensive and not needed for API DB.
	const forceEnsure =
		process.env.HRIS_ENSURE_PROJECT_TRUTH_REMOTE_LAN_FORWARD === "true";
	const forceSkip =
		process.env.HRIS_SKIP_PROJECT_TRUTH_REMOTE_LAN_FORWARD === "true";
	if (!forceEnsure || forceSkip) {
		return;
	}
	if (!fs.existsSync(remoteLanForwardScript)) return;

	const t0 = Date.now();
	console.log(
		"[bnpi-db-access] STEP remote-lan-forward: ensuring multi-port LAN URLs (opt-in)...",
	);
	const result = runPowerShell([
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		remoteLanForwardScript,
	]);
	const sec = ((Date.now() - t0) / 1000).toFixed(1);
	if (result.status !== 0) {
		console.warn(
			`[bnpi-db-access] STEP remote-lan-forward: incomplete after ${sec}s; continuing.`,
		);
	} else {
		console.log(`[bnpi-db-access] STEP remote-lan-forward: done in ${sec}s`);
	}
}

async function main() {
	const mainT0 = Date.now();
	if (process.env.HRIS_SKIP_BNPI_DB_ACCESS === "true") {
		console.log("[bnpi-db-access] Skipped because HRIS_SKIP_BNPI_DB_ACCESS=true.");
		return;
	}

	console.log("[bnpi-db-access] START — resolve Postgres for local hris-api dev");
	const preservedHikvisionTunnelMap =
		process.env[hikvisionTunnelMapKey] ||
		readEnvFileValue(runtimeEnvPath, hikvisionTunnelMapKey);
	if (preservedHikvisionTunnelMap) {
		process.env[hikvisionTunnelMapKey] = preservedHikvisionTunnelMap;
	}
	loadEnvFile(envPath, { overwrite: true });
	const datasource = parseDatasourceUrl(
		process.env.WRITE_DATABASE_URL ||
			process.env.PG_DATABASE_URL ||
			process.env.DATABASE_URL ||
			"",
	);
	if (!datasource || !datasource.protocol.startsWith("postgres")) {
		console.log("[bnpi-db-access] No postgres DATABASE_URL — nothing to do.");
		return;
	}
	const environment = inferEnvironment(datasource);
	const preferredDevK8sPort = Number(process.env.PROJECT_TRUTH_DEV_K8S_DB_LOCAL_PORT || 55435);
	const remoteLanHost = process.env.PROJECT_TRUTH_LAN_IP || "10.184.37.19";
	console.log(
		`[bnpi-db-access] env=${environment} target=127.0.0.1:${preferredDevK8sPort}`,
	);

	if (
		environment === "dev" &&
		process.env.PROJECT_TRUTH_DEV_DB_MODE !== "docker-dev-db"
	) {
		// WARM PATH: only probe 127.0.0.1 — no SSH, no multi-port LAN.
		console.log(
			`[bnpi-db-access] STEP probe-first: 127.0.0.1:${preferredDevK8sPort}...`,
		);
		const probeT0 = Date.now();
		let devK8sForwardHost = await findReachableDevK8sForwardHost({
			port: preferredDevK8sPort,
		});
		console.log(
			`[bnpi-db-access] STEP probe-first: host=${devK8sForwardHost || "none"} in ${((Date.now() - probeT0) / 1000).toFixed(2)}s`,
		);

		const writeDevK8sRuntime = () => {
			const devK8sDatasource = {
				...datasource,
				hostname: "127.0.0.1",
				port: preferredDevK8sPort,
				raw: new URL(
					`postgresql://${datasource.username}:${datasource.password}@127.0.0.1:${preferredDevK8sPort}${datasource.pathname}${datasource.search}${datasource.hash}`,
				).toString(),
			};
			fs.writeFileSync(
				runtimeEnvPath,
				renderRuntimeOverride({
					environment,
					resolution: "local-k8s-dev-forward",
					selectedDatasource: devK8sDatasource,
					selectedVmHost: null,
					needsBnpiForward: false,
				}),
				"utf8",
			);
			console.log(
				`[bnpi-db-access] Resolved DEV datasource to 127.0.0.1:${preferredDevK8sPort}.`,
			);
			console.log(
				`[bnpi-db-access] DONE (fast path) in ${((Date.now() - mainT0) / 1000).toFixed(2)}s`,
			);
		};

		if (devK8sForwardHost === "127.0.0.1") {
			writeDevK8sRuntime();
			return;
		}

		// COLD PATH: single-port K3s forward only (scripts/start-k8s-dev-db-access.ps1).
		// Never starts multi-port remote-lan-forward unless explicitly opted in.
		if (!fs.existsSync(k8sDevDbScript)) {
			throw new Error(`Missing ${path.relative(repoRoot, k8sDevDbScript)}.`);
		}

		const k8sT0 = Date.now();
		console.log(
			`[bnpi-db-access] STEP k8s-db-forward: single-port 127.0.0.1:${preferredDevK8sPort} (SSH; no multi-port LAN)...`,
		);
		const result = runPowerShell([
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			k8sDevDbScript,
			"-LocalPort",
			String(preferredDevK8sPort),
		]);

		if (result.status !== 0) {
			console.warn(
				`[bnpi-db-access] STEP k8s-db-forward: failed in ${((Date.now() - k8sT0) / 1000).toFixed(1)}s; trying compose fallback.`,
			);
		} else {
			console.log(
				`[bnpi-db-access] STEP k8s-db-forward: done in ${((Date.now() - k8sT0) / 1000).toFixed(1)}s`,
			);
		}
		devK8sForwardHost = await findReachableDevK8sForwardHost({
			port: preferredDevK8sPort,
		});

		// Opt-in multi-port LAN only after primary forward path.
		const wantRemoteLan =
			process.env.HRIS_ENSURE_PROJECT_TRUTH_REMOTE_LAN_FORWARD === "true" &&
			process.env.HRIS_SKIP_PROJECT_TRUTH_REMOTE_LAN_FORWARD !== "true";
		if (wantRemoteLan) {
			ensureProjectTruthRemoteLanForward();
			if (devK8sForwardHost !== "127.0.0.1") {
				runPowerShell([
					"-NoProfile",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
					k8sDevDbScript,
					"-LocalPort",
					String(preferredDevK8sPort),
				]);
				devK8sForwardHost = await findReachableDevK8sForwardHost({
					port: preferredDevK8sPort,
				});
			}
		}

		if (devK8sForwardHost === "127.0.0.1") {
			writeDevK8sRuntime();
			return;
		}

		// Fallback: compose-published DEV Postgres on 15433.
		// This is an explicit escape hatch only. The host-local DEV truth is the
		// K3s DEV Postgres forward on 127.0.0.1:55435; compose DEV has drifted
		// independently before and can show the wrong device set in localhost.
		if (process.env.PROJECT_TRUTH_ALLOW_COMPOSE_DEV_DB_FALLBACK !== "true") {
			throw new Error(
				`K3s DEV DB forward is still unreachable on 127.0.0.1:${preferredDevK8sPort} after bootstrap. Refusing automatic compose DEV fallback because 10.184.37.19:15433 is a separate drift-prone database. Set PROJECT_TRUTH_ALLOW_COMPOSE_DEV_DB_FALLBACK=true only for an intentional stale-compose diagnostic.`,
			);
		}
		const composeDevPort = Number(process.env.PROJECT_TRUTH_DEV_COMPOSE_DB_PORT || 15433);
		const composeHosts = ["127.0.0.1", remoteLanHost].filter(Boolean);
		let composeHost = null;
		for (const host of composeHosts) {
			if (await canConnectPostgres(composeDevPort, host, 400)) {
				composeHost = host === "127.0.0.1" ? "127.0.0.1" : host;
				if (host === "127.0.0.1") break;
			}
		}
		if (composeHost) {
			const composeDatasource = {
				...datasource,
				hostname: composeHost,
				port: composeDevPort,
				raw: new URL(
					`postgresql://${datasource.username}:${datasource.password}@${composeHost}:${composeDevPort}${datasource.pathname}${datasource.search}${datasource.hash}`,
				).toString(),
			};
			fs.writeFileSync(
				runtimeEnvPath,
				renderRuntimeOverride({
					environment,
					resolution: "compose-dev-db-fallback",
					selectedDatasource: composeDatasource,
					selectedVmHost: null,
					needsBnpiForward: false,
				}),
				"utf8",
			);
			console.log(
				`[bnpi-db-access] Resolved DEV datasource to compose Postgres at ${composeHost}:${composeDevPort}.`,
			);
			return;
		}

		throw new Error(
			`K3s DEV DB forward is still unreachable on 127.0.0.1:${preferredDevK8sPort} after bootstrap, and compose DEV ${composeDevPort} is also unreachable. Confirm: ssh project-truth-hris  (Cloudflare Access) or leave scripts/start-k8s-dev-db-access.ps1 running.`,
		);
	}

	const resolution = await resolvePreferredDatasource({
		datasource,
		envMap: process.env,
		canConnect,
	});
	if (!resolution.selectedDatasource) return;
	const selectedHost = resolution.selectedDatasource.hostname;
	const selectedPort = resolution.selectedDatasource.port;
	const selectedReachable = await canConnect(selectedPort, selectedHost);

	if (
		selectedReachable &&
		(resolution.resolution === "configured-localhost" ||
			resolution.resolution === "existing-local-forward" ||
			resolution.resolution === "configured-remote")
	) {
		if (fs.existsSync(runtimeEnvPath)) {
			fs.unlinkSync(runtimeEnvPath);
		}
		console.log(
			`[bnpi-db-access] Using reachable datasource ${selectedHost}:${selectedPort}.`,
		);
		return;
	}

	if (resolution.needsBnpiForward) {
		if (!fs.existsSync(projectTruthScript)) {
			throw new Error(`Missing ${path.relative(repoRoot, projectTruthScript)}.`);
		}

		console.log(
			`[bnpi-db-access] Starting ${resolution.environment.toUpperCase()} DB forward for localhost:${resolution.selectedDatasource.port}...`,
		);
		const result = runPowerShell([
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			projectTruthScript,
			"start-bnpi-db-access",
			"-Environment",
			resolution.environment,
			"-LocalPort",
			String(resolution.selectedDatasource.port),
		]);

		if (result.status !== 0) {
			throw new Error(
				"Could not start BNPI DB access. Confirm cloudflared is installed and your Cloudflare Access account is allowed for the DB hostname.",
			);
		}
	}

	if (!(await canConnect(selectedPort, selectedHost))) {
		throw new Error(
			`Resolved datasource ${selectedHost}:${selectedPort} is still unreachable after bootstrap.`,
		);
	}

	const runtimeOverride = renderRuntimeOverride(resolution);
	if (resolution.selectedDatasource.raw === datasource.raw && !resolution.selectedVmHost) {
		if (fs.existsSync(runtimeEnvPath)) {
			fs.unlinkSync(runtimeEnvPath);
		}
		console.log(
			`[bnpi-db-access] Using configured datasource ${resolution.selectedDatasource.hostname}:${resolution.selectedDatasource.port}.`,
		);
		return;
	}

	fs.writeFileSync(runtimeEnvPath, runtimeOverride, "utf8");
	console.log(
		`[bnpi-db-access] Resolved ${resolution.resolution} datasource to ${resolution.selectedDatasource.hostname}:${resolution.selectedDatasource.port}.`,
	);
}

if (require.main === module) {
	main().catch((error) => {
		console.error(`[bnpi-db-access] ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	});
}

module.exports = { findReachableDevK8sForwardHost, canUseLocalPostgres };
