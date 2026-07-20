const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");
const livePathScript = path.join(rootDir, "scripts", "ensure-device-live-path.cjs");
const apiPort = Number(process.env.PORT || 3001) || 3001;

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

async function runLivePathAfterHealth() {
	if (process.env.HRIS_SKIP_DEVICE_LIVE_PATH === "true") return;
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		if (await healthReady()) {
			console.log("[dev-watch] API health is up; ensuring device live path in background.");
			const helper = spawn(process.execPath, [livePathScript], {
				cwd: rootDir,
				stdio: "inherit",
				windowsHide: true,
				env: {
					...process.env,
					HRIS_DEVICE_LIVE_PATH_REQUIRE_API: "true",
				},
			});
			helper.on("exit", (code) => {
				console.log(`[dev-watch] device live path ensure finished with exit ${code ?? 0}`);
			});
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	console.warn("[dev-watch] API health did not come up within 90s; device live path ensure deferred.");
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

child.on("exit", (code, signal) => {
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
