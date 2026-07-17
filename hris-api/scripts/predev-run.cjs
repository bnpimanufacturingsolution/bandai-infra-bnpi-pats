/**
 * Visible predev orchestrator for `npm run dev`.
 *
 * Why: ensure-* scripts can take 30–120s (SSH tunnels, DB forwards). Without
 * stage labels it looks hung. This runner:
 *  - prints timed steps to the console
 *  - appends the same lines to .runtime/predev/latest.log (always-on history)
 *  - writes .runtime/predev/latest-status.json for machine-readable progress
 *  - never hides child stdout/stderr (stdio inherit)
 *
 * Skip entire predev: HRIS_SKIP_PREDEV=true
 * Skip individual steps via existing env flags on each script.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..");
const runtimeDir = path.join(repoRoot, ".runtime", "predev");
const logPath = path.join(runtimeDir, "latest.log");
const statusPath = path.join(runtimeDir, "latest-status.json");
const historyDir = path.join(runtimeDir, "history");

const STEPS = [
	{
		id: "cleanup-emitted-js",
		label: "Clean emitted .js next to .ts",
		script: "cleanup-emitted-js.cjs",
		typical: "1–5s",
	},
	{
		id: "ensure-prisma-client",
		label: "Ensure Prisma client generated",
		script: "ensure-prisma-client.cjs",
		typical: "1–10s",
	},
	{
		id: "ensure-dev-port-ownership",
		label: "Claim free port 3001 / kill stale API watchers",
		script: "ensure-dev-port-ownership.cjs",
		typical: "1–15s",
	},
	{
		id: "ensure-bnpi-db-access",
		label: "DB tunnel (remote LAN + K3s 55435) — often the slow step",
		script: "ensure-bnpi-db-access.cjs",
		typical: "10–90s if SSH/Cloudflare cold; ~1s if tunnel already up",
	},
	{
		id: "ensure-local-dev-services",
		label: "Local postgres/services if needed",
		script: "ensure-local-dev-services.cjs",
		typical: "1–30s",
	},
	{
		id: "ensure-hikvision-vm-bridge",
		label: "TEST A SSH reverse tunnel for Live capture (Windows)",
		script: "ensure-hikvision-vm-bridge.cjs",
		typical: "5–40s if SSH needed; skip if disabled",
	},
];

function nowIso() {
	return new Date().toISOString();
}

function stampLocal() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function ensureDirs() {
	fs.mkdirSync(runtimeDir, { recursive: true });
	fs.mkdirSync(historyDir, { recursive: true });
}

function writeStatus(payload) {
	fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2), "utf8");
}

function logLine(message, { alsoConsole = true } = {}) {
	const line = `[${nowIso()}] ${message}`;
	fs.appendFileSync(logPath, `${line}\n`, "utf8");
	if (alsoConsole) console.log(message);
}

function banner(title) {
	const bar = "─".repeat(Math.min(72, Math.max(24, title.length + 8)));
	logLine(bar);
	logLine(title);
	logLine(bar);
}

function runStep(step, index, total, runState) {
	const n = index + 1;
	const scriptPath = path.join(__dirname, step.script);
	const startedAt = Date.now();

	logLine("");
	logLine(
		`[predev ${n}/${total}] START  ${step.id} — ${step.label} (typical ${step.typical})`,
	);
	runState.currentStep = {
		id: step.id,
		label: step.label,
		index: n,
		total,
		startedAt: nowIso(),
		status: "running",
	};
	writeStatus(runState);

	if (!fs.existsSync(scriptPath)) {
		logLine(`[predev ${n}/${total}] SKIP   ${step.id} — missing ${step.script}`);
		runState.steps.push({
			id: step.id,
			status: "skipped",
			reason: "missing_script",
			ms: 0,
		});
		runState.currentStep = null;
		writeStatus(runState);
		return 0;
	}

	const result = spawnSync(process.execPath, [scriptPath], {
		cwd: apiRoot,
		stdio: "inherit",
		windowsHide: true,
		env: process.env,
	});

	const ms = Date.now() - startedAt;
	const seconds = (ms / 1000).toFixed(1);
	const code = result.status == null ? 1 : result.status;

	if (code === 0) {
		logLine(`[predev ${n}/${total}] OK     ${step.id} — ${seconds}s`);
		runState.steps.push({ id: step.id, status: "ok", ms, exitCode: 0 });
	} else {
		logLine(
			`[predev ${n}/${total}] FAIL   ${step.id} — exit ${code} after ${seconds}s`,
		);
		runState.steps.push({
			id: step.id,
			status: "fail",
			ms,
			exitCode: code,
		});
	}

	runState.currentStep = null;
	runState.updatedAt = nowIso();
	writeStatus(runState);
	return code;
}

function main() {
	if (process.env.HRIS_SKIP_PREDEV === "true") {
		console.log("[predev] Skipped because HRIS_SKIP_PREDEV=true");
		process.exit(0);
	}

	ensureDirs();
	const runId = stampLocal();
	const historyLog = path.join(historyDir, `predev-${runId}.log`);

	// Fresh latest.log for this run; copy to history at end.
	fs.writeFileSync(
		logPath,
		`# predev run ${runId}\n# log file: ${logPath}\n# status: ${statusPath}\n`,
		"utf8",
	);

	const runState = {
		runId,
		startedAt: nowIso(),
		updatedAt: nowIso(),
		status: "running",
		logPath,
		statusPath,
		steps: [],
		currentStep: null,
	};
	writeStatus(runState);

	banner(`[predev] hris-api startup preflight — ${STEPS.length} steps`);
	logLine(
		"[predev] Watch this terminal for step START/OK lines. Full log: .runtime/predev/latest.log",
	);
	logLine(
		"[predev] Machine status JSON: .runtime/predev/latest-status.json (currentStep updates live)",
	);
	logLine(
		"[predev] Tip: if DB step hangs, check Cloudflare Access login for ssh project-truth-hris",
	);

	const t0 = Date.now();
	let failed = null;

	for (let i = 0; i < STEPS.length; i++) {
		const code = runStep(STEPS[i], i, STEPS.length, runState);
		if (code !== 0) {
			failed = { step: STEPS[i], code };
			break;
		}
	}

	const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

	if (failed) {
		runState.status = "failed";
		runState.finishedAt = nowIso();
		runState.totalMs = Date.now() - t0;
		runState.failedStep = failed.step.id;
		writeStatus(runState);
		banner(
			`[predev] FAILED at ${failed.step.id} (exit ${failed.code}) after ${totalSec}s`,
		);
		logLine(`[predev] See log: ${logPath}`);
		try {
			fs.copyFileSync(logPath, historyLog);
		} catch {
			/* ignore */
		}
		process.exit(failed.code || 1);
	}

	runState.status = "ok";
	runState.finishedAt = nowIso();
	runState.totalMs = Date.now() - t0;
	writeStatus(runState);

	banner(`[predev] ALL OK in ${totalSec}s — starting API watcher next`);
	logLine(
		`[predev] Summary: ${runState.steps.map((s) => `${s.id}=${s.status}/${(s.ms / 1000).toFixed(1)}s`).join(" · ")}`,
	);
	try {
		fs.copyFileSync(logPath, historyLog);
		logLine(`[predev] History copy: ${path.relative(repoRoot, historyLog)}`);
	} catch {
		/* ignore */
	}
	process.exit(0);
}

main();
