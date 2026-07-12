const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawnSync } = require("child_process");
const {
	loadEnvFile,
	parseDatasourceUrl,
	renderRuntimeOverride,
	resolvePreferredDatasource,
} = require("./dev-db-runtime.cjs");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const envPath = path.join(apiRoot, ".env");
const runtimeEnvPath = path.join(apiRoot, ".env.development.local");
const projectTruthScript = path.join(repoRoot, "scripts", "project-truth.ps1");

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

	loadEnvFile(envPath);
	const datasource = parseDatasourceUrl(
		process.env.WRITE_DATABASE_URL ||
			process.env.PG_DATABASE_URL ||
			process.env.DATABASE_URL ||
			"",
	);
	if (!datasource || !datasource.protocol.startsWith("postgres")) return;

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
