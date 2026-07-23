const fs = require("fs");
const net = require("net");
const path = require("path");
const { spawnSync } = require("child_process");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const scriptPath = path.join(repoRoot, "scripts", "start-hikvision-remote-device-tunnel.ps1");

if (process.env.HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL === "true") {
	console.log("[hikvision-device-tunnel] Skipped because HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL=true.");
	process.exit(0);
}

if (process.platform !== "win32") {
	console.log("[hikvision-device-tunnel] Skipped on non-Windows host.");
	process.exit(0);
}

if (!fs.existsSync(scriptPath)) {
	console.log(
		`[hikvision-device-tunnel] Skipped because ${path.relative(repoRoot, scriptPath)} is missing.`,
	);
	process.exit(0);
}

const deviceIps = String(
	process.env.PROJECT_TRUTH_HIKVISION_REMOTE_DEVICE_IPS ||
		"10.184.37.20,10.184.37.21,10.184.37.22,10.184.37.23,10.184.37.24,10.184.37.25",
)
	.split(/[,\s;]+/)
	.map((value) => value.trim())
	.filter(Boolean);

const args = [
	"-NoProfile",
	"-ExecutionPolicy",
	"Bypass",
	"-File",
	scriptPath,
	"-DeviceIps",
	deviceIps.join(","),
];

function tcpOpen(port, timeoutMs = 500) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ host: "127.0.0.1", port });
		const done = (ok) => {
			socket.removeAllListeners();
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(timeoutMs);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}

async function allForwardPortsOpen() {
	const localPorts = deviceIps.flatMap((_, index) => [
		10080 + index,
		10443 + index,
		18000 + index,
	]);
	const proof = await Promise.all(localPorts.map((port) => tcpOpen(port)));
	return proof.every(Boolean);
}

async function main() {
	if (await allForwardPortsOpen()) {
		console.log(
			`[hikvision-device-tunnel] DONE (fast path) — all ${deviceIps.length * 3} forwarded ports carry TCP traffic.`,
		);
		return;
	}

	const result = spawnSync("powershell.exe", args, {
		cwd: repoRoot,
		// Do not attach the managed long-lived SSH child's console handles to npm.
		stdio: "ignore",
		windowsHide: true,
		env: process.env,
		timeout: 75_000,
		killSignal: "SIGTERM",
	});

	if (await allForwardPortsOpen()) {
		console.log(
			`[hikvision-device-tunnel] DONE (recovered) — all ${deviceIps.length * 3} forwarded ports carry TCP traffic.`,
		);
		return;
	}

	if (result.error?.code === "ETIMEDOUT") {
		console.error(
			"[hikvision-device-tunnel] Recovery exceeded 75 seconds and traffic proof is still incomplete.",
		);
		process.exit(124);
	}

	if (result.status !== 0) {
		console.error(
			"[hikvision-device-tunnel] Could not start the Hikvision remote device tunnel.",
		);
		process.exit(result.status || 1);
	}
}

main().catch((error) => {
	console.error(`[hikvision-device-tunnel] ${error?.message || error}`);
	process.exit(1);
});
