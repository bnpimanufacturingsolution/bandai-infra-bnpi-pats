/**
 * Host-local Device Events live path (predev + Keep ready).
 *
 * Truth (do not invent another path):
 *   Browser 5175 → host API :3001 (socket + logSearch resolve)
 *   Listener on VM posts → VM :53001 → SSH reverse → host :3001
 *   NOT VM :3101 (K3s DEV) — that saves/reloads but sockets/resolve drift
 *
 * Fast path: if host DB/SDK ports look ready and VM already listens on 53001
 * with listener hrisApiBase=53001, exit in a few seconds without restart thrash.
 *
 * Skip: HRIS_SKIP_DEVICE_LIVE_PATH=true
 */
const { spawnSync } = require("child_process");
const net = require("net");
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

if (envBool("HRIS_SKIP_DEVICE_LIVE_PATH", false)) {
	console.log("[device-live-path] Skipped (HRIS_SKIP_DEVICE_LIVE_PATH=true)");
	process.exit(0);
}

const repoRoot = path.resolve(__dirname, "..", "..");
const script = path.join(repoRoot, "scripts", "ensure-device-live-path.ps1");
if (!fs.existsSync(script)) {
	console.warn(`[device-live-path] Missing ${script}; skip.`);
	process.exit(0);
}

const dbPort = Number(envValue("HRIS_DEV_DB_LOCAL_PORT", "55435")) || 55435;
const sdkPort = Number(envValue("HIKVISION_VM_BRIDGE_SDK_LISTEN_PORT", "59000")) || 59000;
const apiLocalPort = Number(envValue("HIKVISION_VM_BRIDGE_API_LOCAL_PORT", "3001")) || 3001;
const apiRemotePort = Number(envValue("HIKVISION_VM_BRIDGE_API_REMOTE_PORT", "53001")) || 53001;
const sshTarget = envValue("HIKVISION_VM_BRIDGE_SSH_TARGET", "auto");
const directSshKey = path.join(process.env.USERPROFILE || "", ".ssh", "node-health-appliance_ed25519");
const requireApiBeforeExit = envBool("HRIS_DEVICE_LIVE_PATH_REQUIRE_API", false);

function tcpOpen(port, host = "127.0.0.1", timeoutMs = 700) {
	return new Promise((resolve) => {
		const socket = net.createConnection({ port, host });
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

function sshTargetCandidates() {
	if (sshTarget !== "auto") return [{ label: sshTarget, args: [sshTarget] }];
	const direct = fs.existsSync(directSshKey)
		? ["-i", directSshKey, "infra@10.184.37.19"]
		: ["infra@10.184.37.19"];
	return [
		{ label: "lan:infra@10.184.37.19", args: direct },
		{ label: "alias:project-truth-hris", args: ["project-truth-hris"] },
	];
}

function vmSsHasPort(port) {
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

function listenerPostsHostApi() {
	// Prove last service_started / contract post targets reverse, not VM K3s 3101.
	for (const target of sshTargetCandidates()) {
		const result = spawnSync(
			"ssh.exe",
			[
			"-o",
			"BatchMode=yes",
			"-o",
			"ConnectTimeout=4",
			"-o",
			"StrictHostKeyChecking=accept-new",
			...target.args,
			`sudo -n journalctl -u project-truth-hikvision-hot-reload-listener.service -n 40 --no-pager 2>/dev/null | grep -E 'service_started|hrisApiBase|apiBase' | tail -n 5`,
			],
			{ cwd: repoRoot, stdio: "pipe", windowsHide: true, encoding: "utf8" },
		);
		if (result.status !== 0) continue;
		const out = `${result.stdout || ""}\n${result.stderr || ""}`;
		if (/127\.0\.0\.1:53001|localhost:53001/.test(out) && !/localhost:3101/.test(out)) {
			return { ok: true, detail: out.trim().split("\n").slice(-2).join(" | ") };
		}
		if (/localhost:3101/.test(out)) {
			return { ok: false, detail: "listener still posting localhost:3101" };
		}
		return { ok: false, detail: out.trim().slice(0, 240) || "no recent listener apiBase log" };
	}
	return { ok: false, detail: "no reachable VM SSH target for listener apiBase proof" };
}

async function main() {
	const t0 = Date.now();
	console.log(
		`[device-live-path] STEP check: host API must be :${apiLocalPort}; listener must post VM :${apiRemotePort}→host (not :3101)`,
	);

	const [dbOk, hostSdkOk] = await Promise.all([tcpOpen(dbPort), tcpOpen(sdkPort)]);
	const apiOk = await tcpOpen(apiLocalPort);
	const vmApi = vmSsHasPort(apiRemotePort);
	const vmSdk = vmSsHasPort(sdkPort);

	console.log(
		`[device-live-path] probes host db:${dbPort}=${dbOk} sdk:${sdkPort}=${hostSdkOk} api:${apiLocalPort}=${apiOk} | vm :${apiRemotePort}=${vmApi} :${sdkPort}=${vmSdk}`,
	);

	if (!apiOk && !requireApiBeforeExit) {
		const bridgeState = vmSdk
			? `VM SDK reverse :${sdkPort} is ready`
			: `VM SDK reverse :${sdkPort} is not ready yet`;
		console.log(
			`[device-live-path] DONE (pre-api defer) in ${((Date.now() - t0) / 1000).toFixed(1)}s — host API :${apiLocalPort} is not listening yet, so socket reverse/listener retarget will run after dev server health. ${bridgeState}.`,
		);
		process.exit(0);
	}

	if (dbOk && vmSdk && apiOk && vmApi) {
		const listener = listenerPostsHostApi();
		if (listener.ok) {
			console.log(
				`[device-live-path] DONE (fast path) in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${listener.detail || "listener on 53001"}`,
			);
			process.exit(0);
		}
		console.log(
			`[device-live-path] warm ports ok but listener base drift: ${listener.detail} — running ensure script`,
		);
	} else {
		console.log("[device-live-path] STEP ensure: running scripts/ensure-device-live-path.ps1");
	}

	const result = spawnSync(
		"powershell.exe",
		[
			"-NoProfile",
			"-ExecutionPolicy",
			"Bypass",
			"-File",
			script,
			"-DbLocalPort",
			String(dbPort),
			"-SdkListenPort",
			String(sdkPort),
			"-ApiLocalPort",
			String(apiLocalPort),
			"-ApiRemotePort",
			String(apiRemotePort),
			"-VmSshTarget",
			sshTarget,
		],
		{
			cwd: repoRoot,
			stdio: "pipe",
			windowsHide: true,
			encoding: "utf8",
			env: process.env,
		},
	);

	const out = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
	if (out) {
		// Prefer last JSON line for compact status.
		const lines = out.split(/\r?\n/).filter(Boolean);
		const last = lines[lines.length - 1];
		console.log(`[device-live-path] ${last.slice(0, 500)}`);
		if (lines.length > 1) {
			for (const line of lines.slice(0, -1).slice(-6)) {
				if (line.length < 400) console.log(`[device-live-path] ${line}`);
			}
		}
	}

	const sec = ((Date.now() - t0) / 1000).toFixed(1);
	if (result.status !== 0) {
		console.warn(
			`[device-live-path] ensure exited ${result.status || 1} after ${sec}s (API still boots; Keep ready can retry).`,
		);
		process.exit(0);
	}
	console.log(`[device-live-path] DONE in ${sec}s`);
	process.exit(0);
}

main().catch((error) => {
	console.warn(`[device-live-path] unexpected: ${error?.message || error}`);
	process.exit(0);
});
