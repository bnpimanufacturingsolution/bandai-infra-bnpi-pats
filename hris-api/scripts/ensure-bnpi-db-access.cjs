const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawnSync } = require("child_process");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const envPath = path.join(apiRoot, ".env");
const projectTruthScript = path.join(repoRoot, "scripts", "project-truth.ps1");

const bnpiPorts = new Map([
	[55432, "prod"],
	[56532, "prod"],
	[55433, "dev"],
	[56533, "dev"],
	[55434, "uat"],
	[56534, "uat"],
]);

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return;

	const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const equalsIndex = trimmed.indexOf("=");
		if (equalsIndex === -1) continue;

		const key = trimmed.slice(0, equalsIndex).trim();
		let value = trimmed.slice(equalsIndex + 1).trim();
		if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		process.env[key] = value;
	}
}

function parseDatasourceUrl() {
	const raw =
		process.env.WRITE_DATABASE_URL ||
		process.env.PG_DATABASE_URL ||
		process.env.DATABASE_URL ||
		"";
	if (!raw.trim()) return null;

	try {
		const parsed = new URL(raw);
		return {
			protocol: parsed.protocol,
			hostname: parsed.hostname,
			port: Number(parsed.port || (parsed.protocol.startsWith("postgres") ? 5432 : 0)),
		};
	} catch {
		return null;
	}
}

function isLocalHost(hostname) {
	const normalized = String(hostname || "").toLowerCase();
	return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

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
	const datasource = parseDatasourceUrl();
	if (!datasource || !datasource.protocol.startsWith("postgres")) return;
	if (!isLocalHost(datasource.hostname)) return;

	const environment = bnpiPorts.get(datasource.port);
	if (!environment) return;

	if (await canConnect(datasource.port, datasource.hostname)) {
		console.log(
			`[bnpi-db-access] ${environment.toUpperCase()} DB forward is already listening at ${datasource.hostname}:${datasource.port}.`,
		);
		return;
	}

	if (!fs.existsSync(projectTruthScript)) {
		throw new Error(`Missing ${path.relative(repoRoot, projectTruthScript)}.`);
	}

	console.log(
		`[bnpi-db-access] Starting ${environment.toUpperCase()} DB forward for ${datasource.hostname}:${datasource.port}...`,
	);
	const result = runPowerShell([
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		projectTruthScript,
		"start-bnpi-db-access",
		"-Environment",
		environment,
		"-LocalPort",
		String(datasource.port),
	]);

	if (result.status !== 0) {
		throw new Error(
			"Could not start BNPI DB access. Confirm cloudflared is installed and your Cloudflare Access account is allowed for the DB hostname.",
		);
	}
}

main().catch((error) => {
	console.error(`[bnpi-db-access] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
