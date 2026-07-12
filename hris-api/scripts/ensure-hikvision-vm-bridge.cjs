const { spawnSync } = require("child_process");
const path = require("path");

function envValue(name, fallback = "") {
	const value = process.env[name];
	return value && String(value).trim() ? String(value).trim() : fallback;
}

const enabled = envValue("HIKVISION_VM_BRIDGE_ENABLED", "false").toLowerCase() === "true";
if (!enabled) {
	console.log("[hikvision-bridge] Skipped because HIKVISION_VM_BRIDGE_ENABLED is not true.");
	process.exit(0);
}

const deviceIp = envValue("HIKVISION_VM_BRIDGE_DEVICE_IP", "192.168.254.194");
const deviceUsername = envValue("HIKVISION_VM_BRIDGE_USERNAME", "admin");
const devicePassword =
	envValue("HIKVISION_VM_BRIDGE_PASSWORD") || envValue("HIKVISION_PASSWORD");

if (!devicePassword) {
	console.log(
		"[hikvision-bridge] Skipped because HIKVISION_VM_BRIDGE_PASSWORD/HIKVISION_PASSWORD is not set.",
	);
	process.exit(0);
}

const repoRoot = path.resolve(__dirname, "..", "..");
const bridgeScript = path.join(repoRoot, "scripts", "start-hikvision-vm-cloudflare-bridge.ps1");

const result = spawnSync(
	"powershell.exe",
	[
		"-NoProfile",
		"-ExecutionPolicy",
		"Bypass",
		"-File",
		bridgeScript,
		"-Action",
		"start",
		"-DeviceIp",
		deviceIp,
		"-DeviceUsername",
		deviceUsername,
		"-DevicePassword",
		devicePassword,
	],
	{
		cwd: repoRoot,
		stdio: "inherit",
		windowsHide: true,
		env: process.env,
	},
);

if (result.status !== 0) {
	process.exit(result.status || 1);
}
