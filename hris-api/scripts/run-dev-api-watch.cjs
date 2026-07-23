const path = require("path");
const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(rootDir, "..");
const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const livePathScript = path.join(rootDir, "scripts", "ensure-device-live-path.cjs");
const apiReverseScript = path.join(
	rootDir,
	"scripts",
	"ensure-hikvision-api-reverse.cjs",
);
const remoteTunnelScript = path.join(
	rootDir,
	"scripts",
	"ensure-hikvision-remote-device-tunnel.cjs",
);
const dependencyRuntimeDir = path.join(repoRoot, ".runtime", "local-api-watch");
const dependencyStatusPath = path.join(
	dependencyRuntimeDir,
	"dependency-status.json",
);
const apiPort = Number(process.env.PORT || 3001) || 3001;
const watchdogIntervalMs = Math.max(
	15_000,
	Number(process.env.HRIS_DEV_DEPENDENCY_WATCH_INTERVAL_MS || 45_000) || 45_000,
);
const fastTunnelWatchIntervalMs = Math.max(
	2_000,
	Number(process.env.HRIS_DEV_TUNNEL_WATCH_INTERVAL_MS || 5_000) || 5_000,
);

process.env.CHOKIDAR_USEPOLLING = String(
	process.env.CHOKIDAR_USEPOLLING || "true",
).toLowerCase();
process.env.CHOKIDAR_INTERVAL = String(process.env.CHOKIDAR_INTERVAL || "150");
process.env.WATCHPACK_POLLING = String(process.env.WATCHPACK_POLLING || "true").toLowerCase();

console.log(
	`[dev-watch] Starting hris-api watch with polling=${process.env.CHOKIDAR_USEPOLLING} interval=${process.env.CHOKIDAR_INTERVAL}ms`,
);

function healthReady() {
	return new Promise((resolve) => {
		const req = http.get(`http://127.0.0.1:${apiPort}/health`, { timeout: 1000 }, (res) => {
			res.resume();
			resolve(res.statusCode === 200);
		});
		req.on("timeout", () => {
			req.destroy();
			resolve(false);
		});
		req.on("error", () => resolve(false));
	});
}

function writeDependencyStatus(status) {
	fs.mkdirSync(dependencyRuntimeDir, { recursive: true });
	fs.writeFileSync(
		dependencyStatusPath,
		JSON.stringify(
			{
				updatedAt: new Date().toISOString(),
				watchdogIntervalMs,
				dependencies: status,
			},
			null,
			2,
		),
		"utf8",
	);
}

function runBoundedHelper({
	id,
	script,
	required,
	target,
	timeoutMs,
	env = process.env,
}) {
	const startedAt = Date.now();
	return new Promise((resolve) => {
		let settled = false;
		const output = [];
		const helper = spawn(process.execPath, [script], {
			cwd: rootDir,
			stdio: ["ignore", "pipe", "pipe"],
			windowsHide: true,
			env,
		});
		const remember = (chunk) => {
			const value = String(chunk || "").trim();
			if (value) {
				output.push(...value.split(/\r?\n/).filter(Boolean).slice(-8));
				if (output.length > 12) output.splice(0, output.length - 12);
			}
		};
		helper.stdout.on("data", remember);
		helper.stderr.on("data", remember);
		const finish = (status, error, recoveryAttempted = true) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			const elapsedMs = Date.now() - startedAt;
			const detail = {
				dependency: id,
				required,
				status,
				target,
				elapsedMs,
				recoveryAttempted,
				lastError: error || null,
				checkedAt: new Date().toISOString(),
			};
			console.log(
				`[dev-watch] ${id}=${status} target=${target} elapsed=${elapsedMs}ms${error ? ` error=${error}` : ""}`,
			);
			resolve(detail);
		};
		const timer = setTimeout(() => {
			helper.kill();
			finish(
				"timed_out",
				`helper exceeded ${timeoutMs}ms; next watchdog pass will probe and recover again`,
			);
		}, timeoutMs);
		helper.on("error", (error) => finish("failed", error.message));
		helper.on("exit", (code) => {
			const lastError =
				code === 0 ? null : output.slice(-3).join(" | ") || `exit ${code ?? 1}`;
			finish(code === 0 ? "healthy" : "failed", lastError);
		});
	});
}

let dependencyPassRunning = false;
let lastDependencyStatus = [];
let remoteTunnelPassPromise = null;

function runRemoteTunnelPass(id) {
	if (!remoteTunnelPassPromise) {
		remoteTunnelPassPromise = runBoundedHelper({
			id,
			script: remoteTunnelScript,
			required: true,
			target: "managed SSH PID + 127.0.0.1:10080-10085,10443-10448,18000-18005",
			timeoutMs: 75_000,
		}).finally(() => {
			remoteTunnelPassPromise = null;
		});
	} else {
		console.log(`[dev-watch] remote tunnel pass already active; ${id} request coalesced.`);
	}
	return remoteTunnelPassPromise;
}

async function runFastTunnelPass() {
	if (
		process.env.HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL === "true"
	) {
		return;
	}
	await runRemoteTunnelPass("hikvision-a-f-fast-watch");
}

async function runDependencyPass(reason) {
	if (dependencyPassRunning) {
		console.log(`[dev-watch] dependency pass already active; ${reason} request coalesced.`);
		return;
	}
	dependencyPassRunning = true;
	try {
		if (!(await healthReady())) {
			lastDependencyStatus = [
				{
					dependency: "api-health",
					required: true,
					status: "waiting",
					target: `http://127.0.0.1:${apiPort}/health`,
					elapsedMs: 0,
					recoveryAttempted: false,
					lastError: "API health is not ready",
					checkedAt: new Date().toISOString(),
				},
			];
			writeDependencyStatus(lastDependencyStatus);
			return;
		}

		const results = [];
		if (process.env.HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL !== "true") {
			results.push(await runRemoteTunnelPass("hikvision-a-f-forwards"));
		}
		if (process.env.HRIS_SKIP_DEVICE_LIVE_PATH !== "true") {
			results.push(
				await runBoundedHelper({
					id: "vm-api-reverse",
					script: apiReverseScript,
					required: true,
					target: `VM 53001 -> host ${apiPort}`,
					timeoutMs: 45_000,
				}),
			);
			results.push(
				await runBoundedHelper({
					id: "vm-callback-and-listener",
					script: livePathScript,
					required: true,
					target: `VM 53001 -> host ${apiPort}; listener armed`,
					timeoutMs: 45_000,
					env: {
						...process.env,
						HRIS_DEVICE_LIVE_PATH_REQUIRE_API: "true",
					},
				}),
			);
		}
		lastDependencyStatus = results;
		writeDependencyStatus(lastDependencyStatus);
	} finally {
		dependencyPassRunning = false;
	}
}

async function runLivePathAfterHealth() {
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		if (await healthReady()) {
			console.log(
				"[dev-watch] API health is up; starting bounded dependency watchdog.",
			);
			await runDependencyPass("startup");
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	console.warn(
		"[dev-watch] API health did not come up within 90s; dependency recovery deferred.",
	);
}

const child = spawn(
	process.execPath,
	[tsxCli, "watch", "--clear-screen=false", "index.ts"],
	{
		cwd: rootDir,
		stdio: "inherit",
		windowsHide: false,
		env: process.env,
	},
);

runLivePathAfterHealth().catch((error) => {
	console.warn(`[dev-watch] device live path ensure skipped: ${error?.message || error}`);
});

const watchdog = setInterval(() => {
	runDependencyPass("interval").catch((error) => {
		console.warn(`[dev-watch] dependency watchdog failed: ${error?.message || error}`);
	});
}, watchdogIntervalMs);
watchdog.unref();

const fastTunnelWatchdog = setInterval(() => {
	runFastTunnelPass().catch((error) => {
		console.warn(`[dev-watch] fast tunnel watchdog failed: ${error?.message || error}`);
	});
}, fastTunnelWatchIntervalMs);
fastTunnelWatchdog.unref();

child.on("exit", (code, signal) => {
	clearInterval(watchdog);
	clearInterval(fastTunnelWatchdog);
	if (signal) {
		process.kill(process.pid, signal);
		return;
	}
	process.exit(code ?? 0);
});

child.on("error", (error) => {
	console.error(`[dev-watch] Failed to start tsx watch: ${error.message}`);
	process.exit(1);
});
