const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const runtimeDir = path.join(repoRoot, ".runtime", "hikvision-api-reverse-bridge");
const statePath = path.join(runtimeDir, "active.json");
const remotePort = Number(process.env.HIKVISION_VM_BRIDGE_API_REMOTE_PORT || 53001);
const localPort = Number(process.env.HIKVISION_VM_BRIDGE_API_LOCAL_PORT || 3001);
const alias = process.env.PROJECT_TRUTH_VM_SSH_ALIAS || "project-truth-hris";
const directKey = path.join(
	process.env.USERPROFILE || "",
	".ssh",
	"node-health-appliance_ed25519",
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readState() {
	try {
		return JSON.parse(fs.readFileSync(statePath, "utf8"));
	} catch {
		return null;
	}
}

function candidates() {
	const direct = {
		label: "lan:infra@10.184.37.19",
		args: fs.existsSync(directKey)
			? ["-i", directKey, "infra@10.184.37.19"]
			: ["infra@10.184.37.19"],
	};
	const cloudflare = {
		label: `alias:${alias}`,
		args: [alias],
	};
	const preferred = String(readState()?.target || "");
	return preferred === cloudflare.label
		? [cloudflare, direct]
		: [direct, cloudflare];
}

function runRemote(target, command, timeoutMs = 15_000) {
	return spawnSync(
		"ssh.exe",
		[
			"-o",
			"BatchMode=yes",
			"-o",
			target.label.startsWith("alias:") ? "ConnectTimeout=10" : "ConnectTimeout=3",
			"-o",
			"StrictHostKeyChecking=accept-new",
			...target.args,
			command,
		],
		{
			cwd: repoRoot,
			encoding: "utf8",
			stdio: "pipe",
			windowsHide: true,
			timeout: timeoutMs,
		},
	);
}

function prove(target) {
	const result = runRemote(
		target,
		`curl -fsS --max-time 4 http://127.0.0.1:${remotePort}/health >/dev/null && printf API_REVERSE_HEALTHY`,
	);
	return result.status === 0 && /API_REVERSE_HEALTHY/.test(result.stdout || "");
}

async function main() {
	fs.mkdirSync(runtimeDir, { recursive: true });
	let selected = null;
	for (const target of candidates()) {
		if (prove(target)) {
			console.log(
				`[api-reverse] DONE (fast path) — VM :${remotePort} reaches host :${localPort}.`,
			);
			return;
		}
		const reachable = runRemote(target, "printf SSH_OK", 15_000);
		if (reachable.status === 0 && /SSH_OK/.test(reachable.stdout || "")) {
			selected = target;
			break;
		}
	}
	if (!selected) throw new Error("Neither direct LAN nor Cloudflare VM SSH is reachable");

	// Remove only a stale listener on the dedicated callback port.
	runRemote(
		selected,
		`pid=$(sudo -n ss -ltnp 2>/dev/null | awk '/:${remotePort} / { if (match($0,/pid=[0-9]+/)) print substr($0,RSTART+4,RLENGTH-4) }' | head -n1); if [ -n "$pid" ]; then sudo -n kill "$pid"; fi; true`,
	);

	const sshArgs = [
		"-N",
		"-T",
		"-o",
		"ExitOnForwardFailure=yes",
		"-o",
		"ServerAliveInterval=30",
		"-o",
		"ServerAliveCountMax=3",
		"-R",
		`${remotePort}:127.0.0.1:${localPort}`,
		...selected.args,
	];
	const child = spawn("ssh.exe", sshArgs, {
		cwd: repoRoot,
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	});
	child.unref();

	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		await sleep(1000);
		if (prove(selected)) {
			fs.writeFileSync(
				statePath,
				JSON.stringify(
					{
						generatedAt: new Date().toISOString(),
						processId: child.pid,
						target: selected.label,
						remotePort,
						localPort,
						status: "healthy",
					},
					null,
					2,
				),
				"utf8",
			);
			console.log(
				`[api-reverse] DONE (recovered) — VM :${remotePort} reaches host :${localPort}.`,
			);
			return;
		}
	}
	throw new Error(`VM :${remotePort} did not reach host :${localPort} within 20 seconds`);
}

main().catch((error) => {
	console.error(`[api-reverse] ${error?.message || error}`);
	process.exit(1);
});
