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

// All steps still run every predev. Warm path targets 3–8s total via probe-first
// inside each script (no re-SSH when tunnels already healthy).
const STEPS = [
	{
		id: "cleanup-emitted-js",
		label: "Clean emitted .js next to .ts",
		script: "cleanup-emitted-js.cjs",
		typical: "<1s warm / 1–5s cold",
		// phase A — independent of others
		phase: "A",
	},
	{
		id: "ensure-prisma-client",
		label: "Ensure Prisma client generated",
		script: "ensure-prisma-client.cjs",
		typical: "<1s warm / 1–10s cold",
		phase: "A",
	},
	{
		id: "ensure-dev-port-ownership",
		label: "Claim free port 3001 / kill stale API watchers",
		script: "ensure-dev-port-ownership.cjs",
		typical: "1–3s",
		phase: "B",
	},
	{
		id: "ensure-bnpi-db-access",
		label: "DB tunnel (probe 55435; single-port SSH only if missing)",
		script: "ensure-bnpi-db-access.cjs",
		typical: "<0.5s warm / ~5–15s cold CF SSH (no multi-port LAN)",
		// Independent from port 3001 ownership; overlap both startup checks.
		phase: "B",
	},
	{
		id: "ensure-k8s-db-watch",
		label: "Keep canonical DEV DB wire handshake self-repairing",
		script: "ensure-k8s-db-watch.cjs",
		typical: "<1s warm / <3s cold",
		phase: "C",
	},
	{
		id: "ensure-hikvision-remote-device-tunnel",
		label: "Hikvision remote device tunnels (.20-.25 -> localhost)",
		script: "ensure-hikvision-remote-device-tunnel.cjs",
		typical: "<2s warm / 5-30s cold SSH",
		phase: "C",
	},
	{
		id: "ensure-local-dev-services",
		label: "Local postgres/services if needed",
		script: "ensure-local-dev-services.cjs",
		typical: "<1s on K3s tunnel / 1–30s docker",
		phase: "D",
	},
	{
		id: "ensure-hikvision-vm-bridge",
		label: "TEST A SSH reverse tunnel for Live capture",
		script: "ensure-hikvision-vm-bridge.cjs",
		typical: "<2s warm / 5–40s cold",
		phase: "D",
	},
	{
		// Socket truth: listener must post VM:53001 → host:3001 (never default VM:3101 alone).
		id: "ensure-device-live-path",
		label: "Device live path (53001→3001 listener + DB/SDK probes)",
		script: "ensure-device-live-path.cjs",
		typical: "<3s warm / 5–25s if retarget",
		phase: "E",
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

/** Run steps that share a phase in parallel (still all execute). Returns {code, failedId}. */
function runPhaseParallel(steps, indexOffset, total, runState) {
	const { spawn } = require("child_process");
	return new Promise((resolve) => {
		if (steps.length === 1) {
			const code = runStep(steps[0], indexOffset, total, runState);
			resolve({ code, failedId: code !== 0 ? steps[0].id : null });
			return;
		}

		logLine(
			`[predev] PHASE parallel: ${steps.map((s) => s.id).join(" + ")}`,
		);
		const results = [];
		let failedId = null;
		let remaining = steps.length;

		steps.forEach((step, i) => {
			const n = indexOffset + i + 1;
			const scriptPath = path.join(__dirname, step.script);
			const startedAt = Date.now();
			logLine(
				`[predev ${n}/${total}] START  ${step.id} — ${step.label} (parallel)`,
			);

			if (!fs.existsSync(scriptPath)) {
				results[i] = 0;
				runState.steps.push({
					id: step.id,
					status: "skipped",
					reason: "missing_script",
					ms: 0,
				});
				remaining -= 1;
				if (remaining === 0) resolve({ code: Math.max(0, ...results), failedId });
				return;
			}

			const child = spawn(process.execPath, [scriptPath], {
				cwd: apiRoot,
				stdio: "inherit",
				windowsHide: true,
				env: process.env,
			});
			child.on("exit", (code) => {
				const ms = Date.now() - startedAt;
				const exitCode = code == null ? 1 : code;
				results[i] = exitCode;
				if (exitCode === 0) {
					logLine(
						`[predev ${n}/${total}] OK     ${step.id} — ${(ms / 1000).toFixed(1)}s`,
					);
					runState.steps.push({ id: step.id, status: "ok", ms, exitCode: 0 });
				} else {
					logLine(
						`[predev ${n}/${total}] FAIL   ${step.id} — exit ${exitCode} after ${(ms / 1000).toFixed(1)}s`,
					);
					runState.steps.push({
						id: step.id,
						status: "fail",
						ms,
						exitCode,
					});
					if (failedId === null) failedId = step.id;
				}
				writeStatus(runState);
				remaining -= 1;
				if (remaining === 0) {
					resolve({
						code: Math.max(...results.map((c) => c || 0)),
						failedId,
					});
				}
			});
		});
	});
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
		"[predev] Tip: DB startup tries direct LAN briefly, then falls back to the existing Cloudflare SSH login",
	);

	const t0 = Date.now();

	(async () => {
		let failed = null;
		const total = STEPS.length;
		const phases = [];
		for (const step of STEPS) {
			const last = phases[phases.length - 1];
			if (!last || last.phase !== step.phase) {
				phases.push({ phase: step.phase, steps: [step] });
			} else {
				last.steps.push(step);
			}
		}

		let indexOffset = 0;
		for (const group of phases) {
			const outcome =
				group.steps.length > 1
					? await runPhaseParallel(group.steps, indexOffset, total, runState)
					: (() => {
							const code = runStep(group.steps[0], indexOffset, total, runState);
							return { code, failedId: code !== 0 ? group.steps[0].id : null };
						})();
			indexOffset += group.steps.length;
			if (outcome.code !== 0) {
				failed = { stepId: outcome.failedId || group.steps[0].id, code: outcome.code };
				break;
			}
		}

		const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

		if (failed) {
			runState.status = "failed";
			runState.finishedAt = nowIso();
			runState.totalMs = Date.now() - t0;
			runState.failedStep = failed.stepId;
			writeStatus(runState);
			banner(
				`[predev] FAILED at ${failed.stepId} (exit ${failed.code}) after ${totalSec}s`,
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
		if (Date.now() - t0 > 8000) {
			logLine(
				"[predev] Tip: >8s usually means cold SSH/Cloudflare. Next run should be 3–8s if 55435 + bridge stay up.",
			);
		}
		try {
			fs.copyFileSync(logPath, historyLog);
			logLine(`[predev] History copy: ${path.relative(repoRoot, historyLog)}`);
		} catch {
			/* ignore */
		}
		process.exit(0);
	})().catch((error) => {
		console.error(`[predev] ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	});
}

main();
