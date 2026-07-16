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

/**
 * TCP-open is not enough for Prisma. A half-dead SSH hop or a LAN-style
 * loopback alias on 10.184.37.19 can accept TCP then fail under load/routing.
 * Prefer a short Postgres wire handshake (SSLRequest -> N/S/E).
 */
function canConnectPostgres(port, host, timeoutMs = 2500) {
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
	remoteLanHost,
	connect = canConnectPostgres,
}) {
	// Always prefer 127.0.0.1 for Prisma. 10.184.37.19 is only stable when a
	// temporary loopback alias exists; otherwise Windows routes it to real LAN
	// and Prisma fails with P1001 even though a CF/LAN forward is healthy.
	if (await connect(port, "127.0.0.1")) return "127.0.0.1";
	if (remoteLanHost && (await connect(port, remoteLanHost))) {
		// Signal that a remote-style listener exists but localhost still needs bootstrapping.
		return null;
	}
	return null;
}

function ensureProjectTruthRemoteLanForward() {
	if (process.platform !== "win32") return;
	if (process.env.HRIS_SKIP_PROJECT_TRUTH_REMOTE_LAN_FORWARD === "true") {
		console.log(
			"[bnpi-db-access] Project Truth remote LAN forward skipped because HRIS_SKIP_PROJECT_TRUTH_REMOTE_LAN_FORWARD=true.",
		);
		return;
	}
	if (!fs.existsSync(remoteLanForwardScript)) return;

	console.log("[bnpi-db-access] Ensuring Project Truth remote LAN URLs/DB forwards...");
	const result = runPowerShell([
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		remoteLanForwardScript,
	]);
	if (result.status !== 0) {
		console.warn(
			"[bnpi-db-access] Project Truth remote LAN forward was not fully established; continuing with DB-specific bootstrap.",
		);
	}
}

async function main() {
	if (process.env.HRIS_SKIP_BNPI_DB_ACCESS === "true") {
		console.log("[bnpi-db-access] Skipped because HRIS_SKIP_BNPI_DB_ACCESS=true.");
		return;
	}

	loadEnvFile(envPath, { overwrite: true });
	const datasource = parseDatasourceUrl(
		process.env.WRITE_DATABASE_URL ||
			process.env.PG_DATABASE_URL ||
			process.env.DATABASE_URL ||
			"",
	);
	if (!datasource || !datasource.protocol.startsWith("postgres")) return;
	const environment = inferEnvironment(datasource);
	const preferredDevK8sPort = Number(process.env.PROJECT_TRUTH_DEV_K8S_DB_LOCAL_PORT || 55435);
	const remoteLanHost = process.env.PROJECT_TRUTH_LAN_IP || "10.184.37.19";

	if (
		environment === "dev" &&
		process.env.PROJECT_TRUTH_DEV_DB_MODE !== "docker-dev-db"
	) {
		ensureProjectTruthRemoteLanForward();
		let devK8sForwardHost = await findReachableDevK8sForwardHost({
			port: preferredDevK8sPort,
			remoteLanHost,
		});

		// Always bootstrap localhost:55435 when missing, even if 10.184.37.19:55435
		// already answers (remote-LAN loopback alias). Prisma must use 127.0.0.1.
		if (devK8sForwardHost !== "127.0.0.1") {
			if (!fs.existsSync(k8sDevDbScript)) {
				throw new Error(`Missing ${path.relative(repoRoot, k8sDevDbScript)}.`);
			}

			console.log(
				`[bnpi-db-access] Starting DEV K3s DB forward for 127.0.0.1:${preferredDevK8sPort}...`,
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
					`[bnpi-db-access] Could not start localhost:${preferredDevK8sPort} K3s forward; will try compose DEV 15433 fallback.`,
				);
			}
			devK8sForwardHost = await findReachableDevK8sForwardHost({
				port: preferredDevK8sPort,
				remoteLanHost,
			});
		}

		if (devK8sForwardHost === "127.0.0.1") {
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
				`[bnpi-db-access] Resolved DEV datasource to shared K3s runtime at 127.0.0.1:${preferredDevK8sPort}.`,
			);
			return;
		}

		// Fallback: compose-published DEV Postgres on 15433 (LAN alias or localhost).
		const composeDevPort = Number(process.env.PROJECT_TRUTH_DEV_COMPOSE_DB_PORT || 15433);
		const composeHosts = ["127.0.0.1", remoteLanHost].filter(Boolean);
		let composeHost = null;
		for (const host of composeHosts) {
			if (await canConnectPostgres(composeDevPort, host)) {
				// Prefer writing 127.0.0.1 only when that host actually answered.
				composeHost = host === "127.0.0.1" ? "127.0.0.1" : host;
				if (host === "127.0.0.1") break;
			}
		}
		if (composeHost) {
			// If only LAN-style alias works, still write it but warn; prefer starting
			// a localhost forward next session.
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
				`[bnpi-db-access] Resolved DEV datasource to compose Postgres at ${composeHost}:${composeDevPort} (K3s localhost forward unavailable).`,
			);
			return;
		}

		throw new Error(
			`K3s DEV DB forward is still unreachable on 127.0.0.1:${preferredDevK8sPort} after bootstrap, and compose DEV ${composeDevPort} is also unreachable. Confirm ssh project-truth-hris works (Cloudflare Access) or direct LAN SSH to ${remoteLanHost}.`,
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

module.exports = { findReachableDevK8sForwardHost };
