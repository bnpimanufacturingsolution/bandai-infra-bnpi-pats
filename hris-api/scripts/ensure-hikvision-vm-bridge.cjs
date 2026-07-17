/**
 * Ensure host → VM reverse tunnels so the VM Hikvision hot-reload listener can
 * SDK-login to the local TEST A device (and post back to host API).
 *
 * Why this exists:
 * - Live capture runs on the VM (HCNetSDK), not inside `npm run dev` Node.
 * - TEST A is on host LAN (e.g. 192.168.254.189) which the VM often cannot route.
 * - Device config expects VM localhost reverse ports (sdk 59000 / https 59443).
 * - Without the SSH -R bridge, listener status shows Login failed (7) forever.
 *
 * Enable / disable:
 *   HIKVISION_VM_BRIDGE_ENABLED=true|false
 *   Default: true on win32 (this host-local Project Truth workstation), false elsewhere.
 *
 * Optional overrides:
 *   HIKVISION_VM_BRIDGE_DEVICE_IP=192.168.254.189
 *   HIKVISION_VM_BRIDGE_SDK_DEVICE_PORT=8000
 *   HIKVISION_VM_BRIDGE_HTTP_DEVICE_PORT=443
 *   HIKVISION_VM_BRIDGE_SDK_LISTEN_PORT=59000
 *   HIKVISION_VM_BRIDGE_HTTP_LISTEN_PORT=59443
 *   HIKVISION_VM_BRIDGE_API_LOCAL_PORT=3001
 *   HIKVISION_VM_BRIDGE_API_REMOTE_PORT=53001
 *   HIKVISION_VM_BRIDGE_SSH_TARGET=project-truth-hris
 *   HIKVISION_VM_BRIDGE_RESTART_LISTENER=true
 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function envValue(name, fallback = "") {
	const value = process.env[name];
	return value && String(value).trim() ? String(value).trim() : fallback;
}

function envBool(name, defaultValue) {
	const raw = envValue(name, "");
	if (!raw) return defaultValue;
	return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

const defaultEnabled = process.platform === "win32";
const enabled = envBool("HIKVISION_VM_BRIDGE_ENABLED", defaultEnabled);
if (!enabled) {
	console.log(
		"[hikvision-bridge] Skipped (HIKVISION_VM_BRIDGE_ENABLED=false). Live capture will stay Login failed (7) unless the VM can reach devices itself.",
	);
	process.exit(0);
}

const repoRoot = path.resolve(__dirname, "..", "..");
const bridgeScript = path.join(repoRoot, "scripts", "start-host-hikvision-vm-ssh-bridge.ps1");
if (!fs.existsSync(bridgeScript)) {
	console.warn(`[hikvision-bridge] Missing ${bridgeScript}; skip.`);
	process.exit(0);
}

const deviceIp = envValue("HIKVISION_VM_BRIDGE_DEVICE_IP", "192.168.254.189");
const sdkDevicePort = envValue("HIKVISION_VM_BRIDGE_SDK_DEVICE_PORT", "8000");
const httpDevicePort = envValue("HIKVISION_VM_BRIDGE_HTTP_DEVICE_PORT", "443");
// Must match Device.config hikvisionSdkRuntimePort / hikvisionRuntimePort for TEST A.
const sdkListenPort = envValue("HIKVISION_VM_BRIDGE_SDK_LISTEN_PORT", "59000");
const httpListenPort = envValue("HIKVISION_VM_BRIDGE_HTTP_LISTEN_PORT", "59443");
const apiLocalPort = envValue("HIKVISION_VM_BRIDGE_API_LOCAL_PORT", "3001");
const apiRemotePort = envValue("HIKVISION_VM_BRIDGE_API_REMOTE_PORT", "53001");
const sshTarget = envValue("HIKVISION_VM_BRIDGE_SSH_TARGET", "project-truth-hris");
const restartListener = envBool("HIKVISION_VM_BRIDGE_RESTART_LISTENER", true);

console.log(
	`[hikvision-bridge] Ensuring SSH reverse bridge device=${deviceIp} sdk ${sdkListenPort}->${sdkDevicePort} http ${httpListenPort}->${httpDevicePort} api ${apiRemotePort}->host:${apiLocalPort} via ${sshTarget}`,
);

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
		"-VmSshTarget",
		sshTarget,
		"-HttpDevicePort",
		String(httpDevicePort),
		"-SdkDevicePort",
		String(sdkDevicePort),
		"-HttpListenPort",
		String(httpListenPort),
		"-SdkListenPort",
		String(sdkListenPort),
		"-ApiLocalPort",
		String(apiLocalPort),
		"-ApiRemotePort",
		String(apiRemotePort),
	],
	{
		cwd: repoRoot,
		stdio: "inherit",
		windowsHide: true,
		env: process.env,
	},
);

if (result.status !== 0) {
	console.warn(
		`[hikvision-bridge] Bridge start failed (exit ${result.status || 1}). Live capture may stay Login failed (7). Continuing API boot.`,
	);
	// Do not fail predev hard — API can still serve Device Events / Sync.
	process.exit(0);
}

if (restartListener) {
	// Best-effort: restart VM listener after tunnel is up so it re-logins TEST A.
	const restartScript = path.join(repoRoot, "scripts", "restart-local-hikvision-listener.ps1");
	if (fs.existsSync(restartScript)) {
		console.log("[hikvision-bridge] Restarting hot-reload listener after bridge…");
		spawnSync(
			"powershell.exe",
			["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", restartScript],
			{ cwd: repoRoot, stdio: "inherit", windowsHide: true, env: process.env },
		);
	} else {
		// Inline soft restart via API if available on 3001 (may not be up yet during predev).
		console.log(
			"[hikvision-bridge] Bridge up. After API is healthy, open Device Events → Listener → Restart if TEST A is not Receiving yet.",
		);
	}
}

console.log("[hikvision-bridge] Ready. TEST A should arm on VM listener when credentials + tunnel stay up.");
process.exit(0);
