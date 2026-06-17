const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");
const defaultApiPort = 3001;
const defaultDockerHostPort = 58001;

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

function parsePort(value, fallback) {
	const parsed = Number.parseInt(String(value || "").trim(), 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function fail(message, details = []) {
	console.error(`[dev-port-check] ${message}`);
	for (const detail of details) {
		console.error(`[dev-port-check] ${detail}`);
	}
	process.exit(1);
}

function canConnect(port, host) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ port, host });
		const done = (result) => {
			socket.removeAllListeners();
			socket.destroy();
			resolve(result);
		};

		socket.setTimeout(750);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}

function run(command, args) {
	return spawnSync(command, args, {
		cwd: rootDir,
		stdio: "pipe",
		windowsHide: true,
		encoding: "utf8",
	});
}

function normalizeRows(value) {
	if (!value) return [];
	return Array.isArray(value) ? value : [value];
}

function getWindowsPortListeners(port) {
	const script = `
$connections = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue
if (-not $connections) {
  '[]'
  exit 0
}

$processMap = @{}
$procIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $procIds) {
  try {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction Stop
    $processMap[$procId] = [pscustomobject]@{
      ProcessName = $proc.Name
      CommandLine = $proc.CommandLine
    }
  } catch {
    $processMap[$procId] = [pscustomobject]@{
      ProcessName = ''
      CommandLine = ''
    }
  }
}

$rows = foreach ($conn in $connections) {
  $proc = $processMap[$conn.OwningProcess]
  [pscustomobject]@{
    localAddress = $conn.LocalAddress
    localPort = $conn.LocalPort
    pid = $conn.OwningProcess
    processName = $proc.ProcessName
    commandLine = $proc.CommandLine
  }
}

$rows | ConvertTo-Json -Compress
`;

	const result = run("powershell", ["-NoProfile", "-Command", script]);
	if (result.status !== 0) {
		return [];
	}

	try {
		return normalizeRows(JSON.parse((result.stdout || "[]").trim())).map((row) => ({
			localAddress: row.localAddress || "",
			localPort: Number(row.localPort || port),
			pid: Number(row.pid || 0),
			processName: String(row.processName || ""),
			commandLine: String(row.commandLine || ""),
		}));
	} catch {
		return [];
	}
}

function formatListener(listener) {
	const parts = [`${listener.processName || "<unknown>"} (PID ${listener.pid || "?"})`];
	if (listener.localAddress) {
		parts.push(`address ${listener.localAddress}:${listener.localPort}`);
	}
	if (listener.commandLine) {
		parts.push(listener.commandLine);
	}
	return parts.join(" | ");
}

function normalizePathForCommand(value) {
	return String(value || "").replace(/\\/g, "/").toLowerCase();
}

function isCurrentRepoDevServer(listener) {
	const commandLine = normalizePathForCommand(listener.commandLine);
	const normalizedRoot = normalizePathForCommand(rootDir);

	return (
		/node(\.exe)?/i.test(listener.processName) &&
		commandLine.includes(normalizedRoot) &&
		(
			(commandLine.includes("index.ts") && commandLine.includes("tsx")) ||
			commandLine.includes("dotenv-cli/cli.js")
		)
	);
}

function getWindowsRepoDevProcesses() {
	const escapedRoot = rootDir.replace(/'/g, "''");
	const script = `
$root = '${escapedRoot}'.ToLower().Replace('\\', '/')
$rows = foreach ($proc in Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue) {
  $command = [string]$proc.CommandLine
  $normalized = $command.ToLower().Replace('\\', '/')
  if ($normalized.Contains($root) -and (($normalized.Contains('index.ts') -and $normalized.Contains('tsx')) -or $normalized.Contains('dotenv-cli/cli.js'))) {
    [pscustomobject]@{
      localAddress = ''
      localPort = 0
      pid = $proc.ProcessId
      processName = $proc.Name
      commandLine = $proc.CommandLine
    }
  }
}
if (-not $rows) {
  '[]'
} else {
  $rows | ConvertTo-Json -Compress
}
`;

	const result = run("powershell", ["-NoProfile", "-Command", script]);
	if (result.status !== 0) {
		return [];
	}

	try {
		return normalizeRows(JSON.parse((result.stdout || "[]").trim())).map((row) => ({
			localAddress: row.localAddress || "",
			localPort: Number(row.localPort || 0),
			pid: Number(row.pid || 0),
			processName: String(row.processName || ""),
			commandLine: String(row.commandLine || ""),
		}));
	} catch {
		return [];
	}
}

function stopWindowsProcessTree(pid) {
	if (!pid || pid === process.pid) return false;

	const result = run("taskkill", ["/PID", String(pid), "/T", "/F"]);
	return result.status === 0;
}

async function waitForPortToClose(port) {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const stillListening =
			(await canConnect(port, "127.0.0.1")) || (await canConnect(port, "::1"));
		if (!stillListening) return true;
		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	return false;
}

async function main() {
	if (process.env.HRIS_SKIP_DEV_PORT_CHECK === "true") {
		console.log("[dev-port-check] Skipped because HRIS_SKIP_DEV_PORT_CHECK=true.");
		return;
	}

	loadEnvFile(envPath);

	const apiPort = parsePort(process.env.PORT, defaultApiPort);
	const appHostPort = parsePort(process.env.APP_HOST_PORT, defaultDockerHostPort);

	if (appHostPort === apiPort) {
		fail(
			`APP_HOST_PORT=${appHostPort} conflicts with the Windows dev API port ${apiPort}.`,
			[
				"Use APP_HOST_PORT=58001 for the Docker app so localhost:3001 stays reserved for npm run dev.",
				"After updating the override, recreate template-app with docker compose up -d --force-recreate app.",
			],
		);
	}

	const hasExistingListener =
		(await canConnect(apiPort, "127.0.0.1")) || (await canConnect(apiPort, "::1"));
	if (!hasExistingListener) {
		console.log(
			`[dev-port-check] Port ${apiPort} is available for the Windows hris-api dev server. Docker app host port is ${appHostPort}.`,
		);
		return;
	}

	if (process.platform !== "win32") {
		fail(
			`Port ${apiPort} is already listening before startup.`,
			[
				"Stop the conflicting process, or move the Docker app host port away from the Windows dev API port.",
			],
		);
	}

	const listeners = getWindowsPortListeners(apiPort);
	if (listeners.length === 0) {
		fail(
			`Port ${apiPort} is already listening before startup.`,
			[
				"Stop the conflicting process, or move the Docker app host port away from the Windows dev API port.",
			],
		);
	}

	const dockerLike = listeners.filter((listener) =>
		/(docker|wslrelay)/i.test(`${listener.processName} ${listener.commandLine}`),
	);
	const nodeLike = listeners.filter((listener) => /node(\.exe)?/i.test(listener.processName));
	const other = listeners.filter(
		(listener) => !dockerLike.includes(listener) && !nodeLike.includes(listener),
	);
	const currentRepoDevServers = nodeLike.filter(isCurrentRepoDevServer);
	const unrelatedNode = nodeLike.filter((listener) => !currentRepoDevServers.includes(listener));

	if (dockerLike.length > 0) {
		fail(
			`Port ${apiPort} is owned by Docker/WSL listeners instead of the Windows hris-api dev server.`,
			[
				"Stop or republish the Docker app so it does not bind localhost:3001.",
				"Use APP_HOST_PORT=58001 for template-app, then recreate the container.",
				...dockerLike.map(formatListener),
			],
		);
	}

	if (other.length > 0) {
		fail(
			`Port ${apiPort} is already owned by another local process.`,
			[
				"Stop the process below before running npm run dev.",
				...other.map(formatListener),
			],
		);
	}

	if (unrelatedNode.length > 0) {
		fail(
			`Port ${apiPort} is already in use by an unrelated Node process.`,
			[
				"Stop the process below before running npm run dev.",
				...unrelatedNode.map(formatListener),
			],
		);
	}

	if (currentRepoDevServers.length > 0) {
		if (process.env.HRIS_DEV_PORT_AUTOKILL === "false") {
			fail(
				`Port ${apiPort} is already in use by an older hris-api dev server.`,
				[
					"Set HRIS_DEV_PORT_AUTOKILL=true or stop the process below before running npm run dev.",
					...currentRepoDevServers.map(formatListener),
				],
			);
		}

		const repoDevProcesses = getWindowsRepoDevProcesses();
		const processesToStop = repoDevProcesses.length > 0 ? repoDevProcesses : currentRepoDevServers;

		console.log(
			`[dev-port-check] Port ${apiPort} is already owned by an older hris-api dev server. Stopping it before restart.`,
		);
		for (const listener of processesToStop) {
			console.log(`[dev-port-check] stopping ${formatListener(listener)}`);
		}

		for (const listener of processesToStop) {
			stopWindowsProcessTree(listener.pid);
		}

		if (await waitForPortToClose(apiPort)) {
			console.log(`[dev-port-check] Old hris-api dev server stopped; port ${apiPort} is ready.`);
			return;
		}

		fail(
			`Stopped the older hris-api dev server, but port ${apiPort} is still listening.`,
			getWindowsPortListeners(apiPort).map(formatListener),
		);
	}

	fail(
		`Port ${apiPort} is already in use by another Node process.`,
		[
			"The self-repair step only stops Node listeners that match this hris-api dev server.",
			...nodeLike.map(formatListener),
		],
	);
}

main().catch((error) => {
	fail(error instanceof Error ? error.message : String(error));
});
