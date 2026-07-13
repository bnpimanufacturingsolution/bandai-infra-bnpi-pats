const fs = require("fs");

const knownVmHosts = ["10.184.37.241", "10.184.37.19", "10.184.37.78"];

const environmentPortMap = new Map([
	[15432, "prod"],
	[15433, "dev"],
	[15434, "uat"],
	[55432, "prod"],
	[56532, "prod"],
	[55433, "dev"],
	[56533, "dev"],
	[55434, "uat"],
	[56534, "uat"],
]);

const localForwardPortMap = {
	prod: [55432, 56532],
	dev: [55433, 56533],
	uat: [55434, 56534],
};
const preferredLocalForwardHost = "127.0.0.1";

function loadEnvFile(filePath, options = {}) {
	if (!fs.existsSync(filePath)) return;

	const overwrite = options.overwrite === true;
	const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;

		const equalsIndex = trimmed.indexOf("=");
		if (equalsIndex === -1) continue;

		const key = trimmed.slice(0, equalsIndex).trim();
		let value = trimmed.slice(equalsIndex + 1).trim();
		if (!key) continue;
		if (!overwrite && Object.prototype.hasOwnProperty.call(process.env, key)) continue;

		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		process.env[key] = value;
	}
}

function parseDatasourceUrl(raw) {
	if (!String(raw || "").trim()) return null;

	try {
		const parsed = new URL(raw);
		return {
			raw,
			protocol: parsed.protocol,
			hostname: parsed.hostname,
			port: Number(parsed.port || (parsed.protocol.startsWith("postgres") ? 5432 : 0)),
			pathname: parsed.pathname,
			search: parsed.search,
			hash: parsed.hash,
			username: parsed.username,
			password: parsed.password,
		};
	} catch {
		return null;
	}
}

function isLocalHost(hostname) {
	const normalized = String(hostname || "").toLowerCase();
	return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function inferEnvironment(datasource) {
	if (!datasource) return null;
	return environmentPortMap.get(datasource.port) || null;
}

function buildDatasourceUrl(datasource, hostname, port) {
	const parsed = new URL(datasource.raw);
	parsed.hostname = hostname;
	parsed.port = String(port);
	return parsed.toString();
}

function collectRemoteHostCandidates(datasource, envMap = process.env) {
	const environment = inferEnvironment(datasource);
	const candidates = [];
	const seen = new Set();

	function addHost(hostname) {
		const normalized = String(hostname || "").trim();
		if (!normalized || isLocalHost(normalized) || seen.has(normalized)) return;
		seen.add(normalized);
		candidates.push(normalized);
	}

	addHost(envMap.PROJECT_TRUTH_VM_HOST);
	addHost(envMap.PROJECT_TRUTH_GUEST_IP);
	addHost(envMap.PROJECT_TRUTH_PREFERRED_GUEST_IP);
	addHost(datasource.hostname);

	if (environment) {
		const envUrl = parseDatasourceUrl(
			envMap[`PROJECT_TRUTH_${environment.toUpperCase()}_PG_DATABASE_URL`],
		);
		if (envUrl) addHost(envUrl.hostname);
	}

	for (const host of knownVmHosts) addHost(host);

	return candidates;
}

async function resolvePreferredDatasource({
	datasource,
	envMap = process.env,
	canConnect,
}) {
	if (!datasource) {
		return {
			environment: null,
			resolution: "missing-datasource",
			selectedDatasource: null,
			selectedVmHost: null,
			needsBnpiForward: false,
		};
	}

	const environment = inferEnvironment(datasource);
	if (!datasource.protocol.startsWith("postgres")) {
		return {
			environment,
			resolution: "non-postgres",
			selectedDatasource: datasource,
			selectedVmHost: null,
			needsBnpiForward: false,
		};
	}

	if (isLocalHost(datasource.hostname)) {
		return {
			environment,
			resolution: "configured-localhost",
			selectedDatasource: datasource,
			selectedVmHost: null,
			needsBnpiForward: Boolean(environment),
		};
	}

	if (typeof canConnect !== "function") {
		throw new Error("resolvePreferredDatasource requires a canConnect function.");
	}

	if (await canConnect(datasource.port, datasource.hostname)) {
		return {
			environment,
			resolution: "configured-remote",
			selectedDatasource: datasource,
			selectedVmHost: datasource.hostname,
			needsBnpiForward: false,
		};
	}

	for (const hostname of collectRemoteHostCandidates(datasource, envMap)) {
		if (hostname === datasource.hostname) continue;
		if (!(await canConnect(datasource.port, hostname))) continue;

		return {
			environment,
			resolution: "discovered-remote",
			selectedDatasource: {
				...datasource,
				hostname,
				raw: buildDatasourceUrl(datasource, hostname, datasource.port),
			},
			selectedVmHost: hostname,
			needsBnpiForward: false,
		};
	}

	if (!environment) {
		return {
			environment,
			resolution: "unresolved-remote",
			selectedDatasource: datasource,
			selectedVmHost: null,
			needsBnpiForward: false,
		};
	}

	for (const localPort of localForwardPortMap[environment] || []) {
		if (await canConnect(localPort, "localhost")) {
			return {
				environment,
				resolution: "existing-local-forward",
				selectedDatasource: {
					...datasource,
					hostname: preferredLocalForwardHost,
					port: localPort,
					raw: buildDatasourceUrl(datasource, preferredLocalForwardHost, localPort),
				},
				selectedVmHost: null,
				needsBnpiForward: false,
			};
		}
	}

	const [preferredLocalPort] = localForwardPortMap[environment] || [];
	if (!preferredLocalPort) {
		return {
			environment,
			resolution: "unresolved-remote",
			selectedDatasource: datasource,
			selectedVmHost: null,
			needsBnpiForward: false,
		};
	}

	return {
		environment,
		resolution: "start-local-forward",
		selectedDatasource: {
			...datasource,
			hostname: preferredLocalForwardHost,
			port: preferredLocalPort,
			raw: buildDatasourceUrl(datasource, preferredLocalForwardHost, preferredLocalPort),
		},
		selectedVmHost: null,
		needsBnpiForward: true,
	};
}

function renderRuntimeOverride(result) {
	if (!result || !result.selectedDatasource) return "";

	const lines = [
		"# Auto-generated by scripts/ensure-bnpi-db-access.cjs.",
		"# Safe to delete; it will be regenerated on the next npm run dev.",
		`PG_DATABASE_URL=${result.selectedDatasource.raw}`,
		`WRITE_DATABASE_URL=${result.selectedDatasource.raw}`,
		`DATABASE_URL=${result.selectedDatasource.raw}`,
	];

	if (result.selectedVmHost && !isLocalHost(result.selectedVmHost)) {
		lines.push(`PROJECT_TRUTH_VM_HOST=${result.selectedVmHost}`);
		lines.push(`PROJECT_TRUTH_GUEST_IP=${result.selectedVmHost}`);
		lines.push(`PROJECT_TRUTH_PREFERRED_GUEST_IP=${result.selectedVmHost}`);
	}

	return `${lines.join("\n")}\n`;
}

module.exports = {
	collectRemoteHostCandidates,
	inferEnvironment,
	isLocalHost,
	loadEnvFile,
	localForwardPortMap,
	parseDatasourceUrl,
	renderRuntimeOverride,
	resolvePreferredDatasource,
};
