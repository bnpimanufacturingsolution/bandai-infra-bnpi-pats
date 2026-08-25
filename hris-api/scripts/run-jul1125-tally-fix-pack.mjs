/**
 * Jul 11–25 tally fix pack — one orchestrator, proof at every step.
 *
 * The local clone lost the earlier brute data repairs (DB refresh): Jul COMP/DED
 * mass, Jul WorkSharing, Jul approved-OT buckets, prior-DED loan history, DMA
 * open-horizon, dailyRate. This pack replays the proven fixes in dependency
 * order, with compensation fixed FROM Sheet2 (operator directive — do not rely
 * on the single cut's COMP mass for recurring codes).
 *
 * Usage:
 *   node hris-api/scripts/run-jul1125-tally-fix-pack.mjs             # dry-run plan (read-only steps only)
 *   node hris-api/scripts/run-jul1125-tally-fix-pack.mjs --execute   # run everything
 *   --step=5   # run a single step (1..9)
 *
 * Every step writes JSON/txt proof under .runtime/jul1125-tally-fix-<stamp>/.
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const execute = process.argv.includes("--execute");
const stepArg = process.argv.find((a) => a.startsWith("--step="));
const onlyStep = stepArg ? Number(stepArg.split("--step=")[1]) : null;

const ORG_ID = "cmryhwpv70000vgaktlmrubmx";
const PERIOD_ID = "cmryhzl500032vgakz1uy1k7l";
const API = process.env.HRIS_API_URL || "http://localhost:3001";
const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13);
const OUT = path.join(root, ".runtime", `jul1125-tally-fix-${stamp}`);
fs.mkdirSync(OUT, { recursive: true });

const BIO = "confidential-files/july11-july25/Biometrics Data_Jul 11 - 25_3.xlsx";
const OT = "confidential-files/july11-july25/rptOvertimeDetails - July 11 to 25, 2026.xlsx";
const WS = "confidential-files/july11-july25/WorkSharingSchedule - July 11-25, 2026.xlsx";
const DED = "confidential-files/july11-july25/Deduction Mass Upload 07.31.26.xlsx";

function writeProof(name, data) {
	const file = path.join(OUT, name);
	fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 2));
	console.log(`  proof: ${path.relative(root, file)}`);
	return file;
}

const LOCAL_DB_ENV = {
	DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
	PG_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5433/hris?schema=public",
};

function runNode(command, env = {}) {
	const envPairs = Object.entries(env)
		.map(([k, v]) => `$env:${k}='${String(v).replace(/'/g, "''")}';`)
		.join(" ");
	console.log(`  $ ${envPairs}${command}`);
	return execSync(`${envPairs}${command}`, {
		cwd: path.join(root, "hris-api"),
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		shell: process.platform === "win32" ? "powershell.exe" : undefined,
	});
}

async function apiLogin() {
	const res = await fetch(`${API}/api/auth/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: "admin@bandai.local", password: "password123", appCode: "hris" }),
	});
	if (!res.ok) throw new Error(`login ${res.status}`);
	const json = await res.json();
	return json.data.token;
}

async function apiUploadMultipart(token, endpoint, filePath, dataObj) {
	const fsMod = await import("fs");
	const boundary = "----pack" + Date.now();
	const fileBuffer = fsMod.readFileSync(path.resolve(root, filePath));
	const fileName = path.basename(filePath);
	const parts = [];
	parts.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="organizationId"\r\n\r\n${ORG_ID}\r\n`,
		),
	);
	parts.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="data"\r\n\r\n${JSON.stringify(dataObj)}\r\n`,
		),
	);
	parts.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
		),
	);
	parts.push(fileBuffer);
	parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
	const res = await fetch(`${API}${endpoint}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": `multipart/form-data; boundary=${boundary}`,
		},
		body: Buffer.concat(parts),
	});
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = { raw: text.slice(0, 500) };
	}
	return { httpStatus: res.status, json };
}

async function apiGet(token, endpoint) {
	const res = await fetch(`${API}${endpoint}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const text = await res.text();
	try {
		return { httpStatus: res.status, json: JSON.parse(text) };
	} catch {
		return { httpStatus: res.status, json: { raw: text.slice(0, 300) } };
	}
}

const steps = [
	{
		id: 1,
		writes: true,
		name: "DM4 Jul attendance + approved OT buckets",
		async run(token) {
			const data = {
				organizationId: ORG_ID,
				workbookId: "dm4",
				idempotencyKey: `jul1125-fix-dm4-${stamp}`,
				options: {
					sourceFiles: [BIO, OT],
					periodCode: "PP-20260711-20260726",
					approveHistoricalTimesheets: true,
				},
			};
			const started = await apiUploadMultipart(token, "/api/migration/runs", BIO, {
				...data,
			});
			// Re-post with the OT file attached too (files field is informational;
			// the adapter resolves from options.sourceFiles paths).
			writeProof("step1-dm4-start.json", started);
			const runId = started?.json?.data?.runId;
			if (!runId) throw new Error(`DM4 run did not start: ${JSON.stringify(started).slice(0, 300)}`);
			let progress = null;
			for (let i = 0; i < 120; i++) {
				await new Promise((r) => setTimeout(r, 3000));
				const p = await apiGet(token, `/api/migration/runs/${runId}/progress`);
				progress = p?.json?.data?.progress || p?.json?.data || null;
				const status = String(progress?.status || "").toUpperCase();
				if (["COMPLETED", "COMPLETED_WITH_WARNINGS", "FAILED", "BLOCKED", "STALE"].includes(status)) break;
			}
			return { runId, progress };
		},
	},
	{
		id: 2,
		writes: true,
		name: "WorkSharing Jul 11-25 (day flags + OFF overrides)",
		async run(token) {
			const r = await apiUploadMultipart(
				token,
				"/api/migration/dm3/import-worksharing-schedule",
				WS,
				{ organizationId: ORG_ID },
			);
			return r;
		},
	},
	{
		id: 3,
		writes: true,
		name: "Late/UT recompute from punches",
		async run() {
			const out = runNode(
				"npx tsx scripts/repair-period-late-ut-from-punches.ts --periodCode=PP-20260711-20260726 --apply",
				LOCAL_DB_ENV,
			);
			return { tail: out.slice(-3000) };
		},
	},
	{
		id: 4,
		writes: true,
		name: "dailyRate backfill from Sheet2 (Path A basis; executes unless pack dry-run)",
		async run() {
			const out = runNode(
				`node scripts/backfill-employee-daily-rate-from-sheet2.mjs${execute ? "" : " --dry-run"}`,
				{
					...LOCAL_DB_ENV,
					SHEET2_XLSX: path.resolve(root, ".runtime/tally-jul11-25-20260817/hris_payroll_jul11_unlocked.xlsx"),
				},
			);
			return { tail: out.slice(-3000) };
		},
	},
	{
		id: 5,
		name: "Compensation from Sheet2 (DMA open-horizon + period-pinned codes)",
		async run() {
			const args = execute ? ["--execute"] : [];
			const out = runNode(
				`node scripts/repair-bnpi-comp-from-sheet2.mjs${args.join("") ? " " + args.join(" ") : ""}`,
			);
			return { tail: out.slice(-4000) };
		},
	},
	{
		id: 6,
		writes: true,
		name: "Jul DED mass 07.31.26 (loan payments + new deductions)",
		async run(token) {
			const r = await apiUploadMultipart(
				token,
				"/api/migration/dm3/import-deduction-mass-upload",
				DED,
				{ organizationId: ORG_ID },
			);
			return r;
		},
	},
	{
		id: 7,
		writes: true,
		name: "Prior DED mass history Jan-Jun (recurring loan enrollments)",
		async run() {
			const out = runNode("npx tsx scripts/import-prior-deduction-mass-history.ts", LOCAL_DB_ENV);
			return { tail: out.slice(-3000) };
		},
	},
	{
		id: 8,
		writes: true,
		name: "Loan multi-cutoff horizon repair",
		async run() {
			const out = runNode("node scripts/repair-bnpi-loan-multi-cutoff-horizon.mjs --execute");
			return { tail: out.slice(-3000) };
		},
	},
	{
		id: 9,
		name: "Proof tally (July Sheet2 vs live preview)",
		async run() {
			const outDir = `tally-jul1125-after-repairs-${stamp}`;
			const out = runNode("node scripts/_tmp-full-period-tally-compare-jul.mjs", {
				TARGET_XLSX: ".runtime/tally-jul11-25-20260817/hris_payroll_jul11_unlocked.xlsx",
				TALLY_OUT_DIR: outDir,
				TALLY_PERIOD_CODE: "PP-20260711-20260726",
				PERIOD_ID,
			});
			writeProof("step9-tally.json", out.slice(-2000));
			return { outDir };
		},
	},
];

async function main() {
	console.log(
		JSON.stringify(
			{
				pack: "jul1125-tally-fix",
				mode: execute ? "EXECUTE" : "DRY-RUN (steps 5 preview only; write steps skipped)",
				out: OUT,
				onlyStep,
			},
			null,
			2,
		),
	);
	const token = await apiLogin();
	const summary = [];
	for (const step of steps) {
		if (onlyStep && step.id !== onlyStep) continue;
		if (!execute && step.writes) {
			console.log(`=== Step ${step.id}: SKIPPED in dry-run (${step.name}) ===`);
			summary.push({ step: step.id, name: step.name, skippedDryRun: true });
			continue;
		}
		console.log(`\n=== Step ${step.id}: ${step.name} ===`);
		try {
			const result = await step.run(token);
			summary.push({ step: step.id, name: step.name, ok: true, result });
		} catch (error) {
			const errText = String(error?.stdout || "") + String(error?.stderr || error?.message || error);
			console.error(`Step ${step.id} FAILED: ${errText.slice(-800)}`);
			writeProof(`step${step.id}-error.txt`, errText);
			summary.push({ step: step.id, name: step.name, ok: false, error: errText.slice(-2000) });
			if (execute) {
				console.error("Pack aborted on failure (execute mode).");
				break;
			}
		}
	}
	writeProof("pack-summary.json", { mode: execute ? "execute" : "dry-run", summary });
	console.log(`\nPack done (${execute ? "execute" : "dry-run"}). Evidence: ${OUT}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
