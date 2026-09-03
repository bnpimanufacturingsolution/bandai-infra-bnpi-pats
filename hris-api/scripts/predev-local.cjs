/**
 * Predev for `npm run dev:local` — local Docker Postgres clone only.
 *
 * Does NOT open the shared BNPI/VM DEV tunnel (55435).
 * Does NOT start Hikvision reverse bridges (optional Live capture path).
 *
 * Requires:
 *   - Docker container `hris-local-dev-clone` on 127.0.0.1:5433 (or matching .env.local-clone)
 *   - `.env.local-clone` (see `.env.local-clone.example`)
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const apiRoot = path.resolve(__dirname, "..");
const localCloneEnv = path.join(apiRoot, ".env.local-clone");
const exampleEnv = path.join(apiRoot, ".env.local-clone.example");

function loadEnvFile(filePath, { overwrite = false } = {}) {
	if (!fs.existsSync(filePath)) return;
	for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!key) continue;
		if (!overwrite && Object.prototype.hasOwnProperty.call(process.env, key)) continue;
		process.env[key] = value;
	}
}

if (!fs.existsSync(localCloneEnv)) {
	console.error(
		"[predev-local] Missing .env.local-clone. Copy .env.local-clone.example and point DATABASE_URL at your local clone (default 127.0.0.1:5433).",
	);
	if (fs.existsSync(exampleEnv)) {
		console.error(`[predev-local] Example: ${exampleEnv}`);
	}
	process.exit(1);
}

// Local-clone env wins for DB URLs; skip shared-tunnel / device-SSH predev steps.
// Remote Hikvision device forwards and K8s DEV DB watch belong to `npm run dev`
// (shared 55435 path), not the isolated local Docker clone.
loadEnvFile(localCloneEnv, { overwrite: true });
process.env.HRIS_SKIP_BNPI_DB_ACCESS = "true";
process.env.HRIS_SKIP_PROJECT_TRUTH_REMOTE_LAN_FORWARD = "true";
process.env.HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL =
	process.env.HRIS_SKIP_HIKVISION_REMOTE_DEVICE_TUNNEL || "true";
process.env.PROJECT_TRUTH_DISABLE_K8S_DB_WATCH =
	process.env.PROJECT_TRUTH_DISABLE_K8S_DB_WATCH || "true";
process.env.HIKVISION_VM_BRIDGE_ENABLED =
	process.env.HIKVISION_VM_BRIDGE_ENABLED || "false";
process.env.HRIS_SKIP_DEVICE_LIVE_PATH =
	process.env.HRIS_SKIP_DEVICE_LIVE_PATH || "true";
process.env.HRIS_SKIP_LOCAL_DB_BOOTSTRAP =
	process.env.HRIS_SKIP_LOCAL_DB_BOOTSTRAP || "true";

console.log(
	"[predev-local] Local clone mode — shared VM DEV tunnel (55435) and remote device tunnels disabled; using .env.local-clone",
);

const result = spawnSync(process.execPath, [path.join(__dirname, "predev-run.cjs")], {
	cwd: apiRoot,
	stdio: "inherit",
	windowsHide: true,
	env: process.env,
});

process.exit(result.status == null ? 1 : result.status);
