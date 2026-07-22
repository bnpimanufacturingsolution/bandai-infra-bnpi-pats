const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.env.PROJECT_TRUTH_DISABLE_K8S_DB_WATCH === "true") {
	console.log("[k8s-db-watch] skipped by PROJECT_TRUTH_DISABLE_K8S_DB_WATCH=true");
	process.exit(0);
}

const repoRoot = path.resolve(__dirname, "../..");
const script = path.join(repoRoot, "scripts", "watch-k8s-dev-db-access.ps1");
const result = spawnSync(
	"powershell.exe",
	["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
	{
		cwd: repoRoot,
		stdio: "inherit",
		windowsHide: true,
	},
);

process.exit(result.status == null ? 1 : result.status);
