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

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(__dirname, "..", "..");
const bridgeScript = path.join(repoRoot, "scripts", "start-host-hikvision-vm-ssh-bridge.ps1");
const stateFile = path.join(repoRoot, ".runtime", "hikvision-vm-ssh-bridge", "active-ssh-bridge.json");
const resolverScript = path.join(__dirname, "resolve-hikvision-vm-bridge-targets.cjs");
if (!fs.existsSync(bridgeScript)) {
	console.warn(`[hikvision-bridge] Missing ${bridgeScript}; skip.`);
	process.exit(0);
}

const sdkDevicePort = envValue("HIKVISION_VM_BRIDGE_SDK_DEVICE_PORT", "8000");
const httpDevicePort = envValue("HIKVISION_VM_BRIDGE_HTTP_DEVICE_PORT", "443");
const sdkListenPort = envValue("HIKVISION_VM_BRIDGE_SDK_LISTEN_PORT", "59000");
const httpListenPort = envValue("HIKVISION_VM_BRIDGE_HTTP_LISTEN_PORT", "59443");
const apiLocalPort = envValue("HIKVISION_VM_BRIDGE_API_LOCAL_PORT", "3001");
const apiRemotePort = envValue("HIKVISION_VM_BRIDGE_API_REMOTE_PORT", "53001");
const sshTarget = envValue("HIKVISION_VM_BRIDGE_SSH_TARGET", "auto");
const directSshKey = path.join(process.env.USERPROFILE || "", ".ssh", "node-health-appliance_ed25519");
// Listener restart needs API; during predev it is almost always wasted time.
const restartListener = envBool("HIKVISION_VM_BRIDGE_RESTART_LISTENER", false);

function resolveDeviceIps() {
	const explicit = envValue("HIKVISION_VM_BRIDGE_DEVICE_IP", "");
	if (explicit) {
		return {
			deviceIps: [explicit],
			source: "env:HIKVISION_VM_BRIDGE_DEVICE_IP",
			targets: [{ deviceIp: explicit }],
		};
	}

	if (fs.existsSync(resolverScript)) {
		const result = spawnSync(process.execPath, [resolverScript], {
			cwd: apiRoot,
			stdio: "pipe",
			windowsHide: true,
			encoding: "utf8",
			env: process.env,
		});
		try {
			const parsed = JSON.parse(String(result.stdout || "{}"));
			const targets = Array.isArray(parsed.targets) ? parsed.targets : [];
			const deviceIps = targets
				.map((target) => String(target.deviceIp || "").trim())
				.filter(Boolean);
			if (deviceIps.length) {
				const reachable = targets.filter((t) => t.hostReachable).map((t) => t.deviceIp);
				const note = reachable.length
					? ` host-reachable=${reachable.join(",")}`
					: " (no host TCP hit — will still try reverse tunnel)";
				console.log(
					`[hikvision-bridge] Smart target source=${parsed.source || "db"}${note}`,
				);
				return {
					deviceIps: [...new Set(deviceIps)],
					source: parsed.source || "db",
					targets,
				};
			}
			if (parsed.error) console.warn(`[hikvision-bridge] DB target resolve failed: ${parsed.error}`);
		} catch (error) {
			console.warn(`[hikvision-bridge] DB target resolve output unreadable: ${error.message}`);
		}
	}

	// Prefer current site TEST A LAN before historical 189.
	return {
		deviceIps: ["192.168.254.102"],
		source: "host-fallback-102",
		targets: [{ deviceIp: "192.168.254.102" }],
	};
}

function processAlive(pid) {
	if (!pid || !Number.isFinite(Number(pid))) return false;
	try {
		process.kill(Number(pid), 0);
		return true;
	} catch {
		return false;
	}
}

function sshTargetCandidates() {
	if (sshTarget !== "auto") return [{ label: sshTarget, args: [sshTarget] }];
	const direct = fs.existsSync(directSshKey)
		? [
				"-i",
				directSshKey,
				"infra@10.184.37.19",
			]
		: ["infra@10.184.37.19"];
	return [
		{ label: "lan:infra@10.184.37.19", args: direct },
		{ label: "alias:project-truth-hris", args: ["project-truth-hris"] },
	];
}

function vmPortOpen(port) {
	// Fast SSH probe; if direct LAN is cold/unreachable, try the public alias.
	for (const target of sshTargetCandidates()) {
		const result = spawnSync(
			"ssh.exe",
			[
			"-o",
			"BatchMode=yes",
			"-o",
			"ConnectTimeout=3",
			"-o",
			"StrictHostKeyChecking=accept-new",
			...target.args,
			`ss -ltn 2>/dev/null | grep -q ':${port} ' || netstat -ltn 2>/dev/null | grep -q ':${port} '`,
			],
			{ cwd: repoRoot, stdio: "pipe", windowsHide: true, encoding: "utf8" },
		);
		if (result.status === 0) return true;
	}
	return false;
}

function localBridgeMatches(deviceIps) {
	const expected = new Set(deviceIps.map((ip) => String(ip).trim()).filter(Boolean));
	if (!expected.size) return false;
	try {
		const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : null;
		const stateIps = Array.isArray(state?.deviceIps)
			? state.deviceIps.map((ip) => String(ip).trim()).filter(Boolean)
			: [];
		if (stateIps.some((ip) => expected.has(ip)) && processAlive(state?.processId || state?.ProcessId)) {
			return true;
		}
	} catch {
		// Fall through to process command inspection.
	}

	const list = spawnSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-Command",
			"Get-CimInstance Win32_Process -Filter \"Name='ssh.exe'\" | Select-Object -ExpandProperty CommandLine",
		],
		{ cwd: repoRoot, stdio: "pipe", windowsHide: true, encoding: "utf8" },
	);
	const commands = String(list.stdout || "");
	return [...expected].some((ip) => commands.includes(`${sdkListenPort}:${ip}:${sdkDevicePort}`));
}

const t0 = Date.now();
const resolved = resolveDeviceIps();
const deviceIps = resolved.deviceIps;
console.log(
	`[hikvision-bridge] STEP check: devices=${deviceIps.join(",")} (${resolved.source}) sdk ${sdkListenPort}->${sdkDevicePort} via ${sshTarget}`,
);

// FAST PATH only when BOTH:
//  1) VM reverse SDK port is listening, AND
//  2) local ssh bridge process actually targets the resolved device IP(s).
// After PC reboot, (2) is false even if a stale remote listener lingers — must restart.
// Note: API reverse :53001 is enforced by ensure-device-live-path (next predev step).
console.log(
	`[hikvision-bridge] STEP check: probing local bridge match + VM :${sdkListenPort}...`,
);
const localMatches = localBridgeMatches(deviceIps);
const remoteSdkOpen = vmPortOpen(Number(sdkListenPort));
if (remoteSdkOpen && localMatches) {
	console.log(
		`[hikvision-bridge] DONE (fast path) in ${((Date.now() - t0) / 1000).toFixed(1)}s — local bridge matches ${deviceIps.join(",")} and VM :${sdkListenPort} is open`,
	);
	process.exit(0);
}
if (remoteSdkOpen && !localMatches) {
	console.log(
		`[hikvision-bridge] STEP check: VM :${sdkListenPort} open but local bridge target is stale/missing for ${deviceIps.join(",")} — stopping and rebinding`,
	);
	spawnSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			bridgeScript,
			"-Action",
			"stop",
		],
		{ cwd: repoRoot, stdio: "inherit", windowsHide: true, env: process.env },
	);
} else if (!remoteSdkOpen) {
	console.log(
		`[hikvision-bridge] STEP check: VM :${sdkListenPort} not open (typical after PC reboot) — full start for ${deviceIps.join(",")}`,
	);
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
		"-DeviceIps",
		deviceIps.join(","),
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
		stdio: "pipe",
		windowsHide: true,
		encoding: "utf8",
		env: process.env,
	},
);

const sec = ((Date.now() - t0) / 1000).toFixed(1);
const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
if (result.status !== 0) {
	console.warn(
		`[hikvision-bridge] Bridge start failed (exit ${result.status || 1}) after ${sec}s. Live capture may stay Login failed (7). Continuing API boot.`,
	);
	if (output) {
		const compact = output
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.filter((line) => !/^\s*(At |CategoryInfo|FullyQualifiedErrorId)/.test(line))
			.slice(-6);
		for (const line of compact) {
			console.warn(`[hikvision-bridge] ${line.slice(0, 500)}`);
		}
	}
	process.exit(0);
}
if (output) {
	for (const line of output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-8)) {
		console.log(`[hikvision-bridge] ${line.slice(0, 500)}`);
	}
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
