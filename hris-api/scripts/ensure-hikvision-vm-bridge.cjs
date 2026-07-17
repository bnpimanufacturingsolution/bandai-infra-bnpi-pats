/**
 * Ensure host → VM reverse tunnels so the VM Hikvision hot-reload listener can
 * SDK-login to the local TEST A device (and post back to host API).
 *
 * Fast path: if active bridge process + VM :59000 already listening, exit in <2s.
 * Slow path: full start-host-hikvision-vm-ssh-bridge.ps1 (still runs when needed).
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
const stateFile = path.join(repoRoot, ".runtime", "hikvision-vm-ssh-bridge", "active-ssh-bridge.json");
if (!fs.existsSync(bridgeScript)) {
	console.warn(`[hikvision-bridge] Missing ${bridgeScript}; skip.`);
	process.exit(0);
}

const deviceIp = envValue("HIKVISION_VM_BRIDGE_DEVICE_IP", "192.168.254.189");
const sdkDevicePort = envValue("HIKVISION_VM_BRIDGE_SDK_DEVICE_PORT", "8000");
const httpDevicePort = envValue("HIKVISION_VM_BRIDGE_HTTP_DEVICE_PORT", "443");
const sdkListenPort = envValue("HIKVISION_VM_BRIDGE_SDK_LISTEN_PORT", "59000");
const httpListenPort = envValue("HIKVISION_VM_BRIDGE_HTTP_LISTEN_PORT", "59443");
const apiLocalPort = envValue("HIKVISION_VM_BRIDGE_API_LOCAL_PORT", "3001");
const apiRemotePort = envValue("HIKVISION_VM_BRIDGE_API_REMOTE_PORT", "53001");
const sshTarget = envValue("HIKVISION_VM_BRIDGE_SSH_TARGET", "project-truth-hris");
// Listener restart needs API; during predev it is almost always wasted time.
const restartListener = envBool("HIKVISION_VM_BRIDGE_RESTART_LISTENER", false);

function processAlive(pid) {
	if (!pid || !Number.isFinite(Number(pid))) return false;
	try {
		process.kill(Number(pid), 0);
		return true;
	} catch {
		return false;
	}
}

function vmPortOpen(port) {
	// Fast SSH probe; 4s budget. If SSH is cold this fails and we fall through to full start.
	const result = spawnSync(
		"ssh.exe",
		[
			"-o",
			"BatchMode=yes",
			"-o",
			"ConnectTimeout=3",
			"-o",
			"StrictHostKeyChecking=accept-new",
			sshTarget,
			`ss -ltn 2>/dev/null | grep -q ':${port} ' || netstat -ltn 2>/dev/null | grep -q ':${port} '`,
		],
		{ cwd: repoRoot, stdio: "pipe", windowsHide: true, encoding: "utf8" },
	);
	return result.status === 0;
}

const t0 = Date.now();
console.log(
	`[hikvision-bridge] STEP check: device=${deviceIp} sdk ${sdkListenPort}->${sdkDevicePort} via ${sshTarget}`,
);

// FAST PATH: VM already listening on reverse SDK port (tunnel from any prior session).
// Note: API reverse :53001 is enforced by ensure-device-live-path (next predev step).
// This script only owns the device SDK tunnel; do not claim socket-truth here.
console.log(
	`[hikvision-bridge] STEP check: probing VM :${sdkListenPort} (fast SSH)...`,
);
if (vmPortOpen(Number(sdkListenPort))) {
	console.log(
		`[hikvision-bridge] DONE (fast path) in ${((Date.now() - t0) / 1000).toFixed(1)}s — VM :${sdkListenPort} already listening (API :${apiRemotePort} checked by ensure-device-live-path)`,
	);
	process.exit(0);
}

if (fs.existsSync(stateFile)) {
	try {
		const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
		const pid = state.processId || state.ProcessId;
		if (processAlive(pid)) {
			console.log(
				`[hikvision-bridge] STEP check: local bridge PID ${pid} alive but VM port closed — will re-start bridge`,
			);
		} else {
			console.log("[hikvision-bridge] STEP check: state file present but process dead — re-start");
		}
	} catch {
		console.log("[hikvision-bridge] STEP check: state unreadable — re-start");
	}
} else {
	console.log("[hikvision-bridge] STEP check: no VM tunnel — full start");
}

console.log(
	`[hikvision-bridge] STEP start: SSH reverse bridge (may wait on Cloudflare Access if SSH cold)`,
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

const sec = ((Date.now() - t0) / 1000).toFixed(1);
if (result.status !== 0) {
	console.warn(
		`[hikvision-bridge] Bridge start failed (exit ${result.status || 1}) after ${sec}s. Live capture may stay Login failed (7). Continuing API boot.`,
	);
	process.exit(0);
}
console.log(`[hikvision-bridge] STEP start: ok in ${sec}s`);

if (restartListener) {
	const restartScript = path.join(repoRoot, "scripts", "restart-local-hikvision-listener.ps1");
	if (fs.existsSync(restartScript)) {
		console.log("[hikvision-bridge] Restarting hot-reload listener after bridge…");
		spawnSync(
			"powershell.exe",
			["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", restartScript],
			{ cwd: repoRoot, stdio: "inherit", windowsHide: true, env: process.env },
		);
	}
} else {
	console.log(
		"[hikvision-bridge] Listener restart deferred (API not up yet). After login: Device Events → Listener → Restart if needed.",
	);
}

console.log(
	`[hikvision-bridge] Ready in ${((Date.now() - t0) / 1000).toFixed(1)}s. TEST A should arm when tunnel stays up.`,
);
process.exit(0);
