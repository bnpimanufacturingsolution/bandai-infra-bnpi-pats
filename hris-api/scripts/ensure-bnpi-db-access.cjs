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

function runPowerShell(args) {
	const command = process.platform === "win32" ? "powershell.exe" : "pwsh";
	return spawnSync(command, args, {
		cwd: repoRoot,
		stdio: "inherit",
		windowsHide: true,
	});
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

	if (
		environment === "dev" &&
		process.env.PROJECT_TRUTH_DEV_DB_MODE !== "docker-dev-db"
	) {
		if (!(await canConnect(preferredDevK8sPort, "127.0.0.1"))) {
			if (!fs.existsSync(k8sDevDbScript)) {
				throw new Error(`Missing ${path.relative(repoRoot, k8sDevDbScript)}.`);
			}

			console.log(
				`[bnpi-db-access] Starting DEV K3s DB forward for localhost:${preferredDevK8sPort}...`,
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
				throw new Error(
					"Could not start the K3s DEV DB forward. Confirm direct LAN SSH to 10.184.37.19 works from this workstation.",
				);
			}
		}

		if (!(await canConnect(preferredDevK8sPort, "127.0.0.1"))) {
			throw new Error(
				`K3s DEV DB forward localhost:${preferredDevK8sPort} is still unreachable after bootstrap.`,
			);
		}

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

main().catch((error) => {
	console.error(`[bnpi-db-access] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
