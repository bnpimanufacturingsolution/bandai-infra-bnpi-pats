const path = require("path");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");

process.env.CHOKIDAR_USEPOLLING = String(
	process.env.CHOKIDAR_USEPOLLING || "true",
).toLowerCase();
process.env.CHOKIDAR_INTERVAL = String(process.env.CHOKIDAR_INTERVAL || "150");
process.env.WATCHPACK_POLLING = String(process.env.WATCHPACK_POLLING || "true").toLowerCase();

console.log(
	`[dev-watch] Starting hris-api watch with polling=${process.env.CHOKIDAR_USEPOLLING} interval=${process.env.CHOKIDAR_INTERVAL}ms`,
);

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
