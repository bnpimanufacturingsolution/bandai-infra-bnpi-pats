const fs = require("fs");
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
		"10.184.37.20,10.184.37.21,10.184.37.22,10.184.37.23",
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

const result = spawnSync("powershell.exe", args, {
	cwd: repoRoot,
	stdio: "inherit",
	windowsHide: true,
	env: process.env,
});

if (result.status !== 0) {
	console.error("[hikvision-device-tunnel] Could not start the Hikvision remote device tunnel.");
	process.exit(result.status || 1);
}
