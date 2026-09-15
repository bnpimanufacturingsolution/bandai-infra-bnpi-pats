#!/usr/bin/env node
/**
 * run-dm4-timesheet-upload.mjs
 *
 * Reusable operator script for the DM4 timesheet data upload journey:
 *   biometrics punch workbooks -> attendance -> materialized timesheets (DM4.1/DM4.2)
 *   approved-OT workbooks      -> OT buckets on effective lines   (DM4.3)
 *   optional: DM3 period-leave imports per payroll period
 *
 * Replaces the manual API-call sequence used for the 2026-09-11 Jan-Jul backfill.
 * Every file is DRY-RUN gated first (plan must be clean before any write).
 * Safe by default: without --execute nothing is written.
 *
 * Usage:
 *   # Plan only (no writes) for every workbook in a folder:
 *   node scripts/run-dm4-timesheet-upload.mjs --files ".runtime/jan-jul-backfill-20260911/biometrics-2026"
 *
 *   # Real import (still dry-run-gated per file):
 *   node scripts/run-dm4-timesheet-upload.mjs --files <dir> --execute
 *
 *   # Include approved-OT workbooks (per-cutoff files, e.g. the ot-splits folder):
 *   node scripts/run-dm4-timesheet-upload.mjs --files <dir> --ot <ot-dir> --execute
 *
 *   # Include leave files (DM3 period-leave, needs an explicit period per file):
 *   node scripts/run-dm4-timesheet-upload.mjs --execute ^
 *        --leave "leave-january.xlsx=PP-20260111-20260126" --leave "leave-february.xlsx=PP-20260211-20260226"
 *
 *   # Other options:
 *   --api http://localhost:3001        BNPI PATS API base
 *   --org <organizationId>             defaults to the BNEI org (cmpxw0mfe00007zws3iypuu9d)
 *   --email / --password               defaults admin@bandai.local / password123 (env: BNPI_PATS_UPLOAD_EMAIL/PASSWORD)
 *   --max-refires 3                    STALE-run refire attempts per file
 *   --only <substring>                 process only files whose name contains this
 *   --skip-dry-run                     NOT recommended: skip the per-file plan gate
 *
 * Requires: node 18+, curl.exe on PATH, the local API healthy on --api
 * (if down: powershell -File scripts/restart-local-bnpi-pats-api-dev.ps1).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------- args ----------
const args = process.argv.slice(2);
function argValue(name) {
	const i = args.indexOf(name);
	return i >= 0 && args[i + 1] ? args[i + 1] : null;
}
function hasFlag(name) {
	return args.includes(name);
}
const collect = (name) => {
	const out = [];
	for (let i = 0; i < args.length; i++) if (args[i] === name && args[i + 1]) out.push(args[i + 1]);
	return out;
};

const API = argValue("--api") || "http://localhost:3001";
const ORG = argValue("--org") || "cmpxw0mfe00007zws3iypuu9d";
const EMAIL = argValue("--email") || process.env.BNPI_PATS_UPLOAD_EMAIL || "admin@bandai.local";
const PASSWORD = argValue("--password") || process.env.BNPI_PATS_UPLOAD_PASSWORD || "password123";
const MAX_REFIRES = Number(argValue("--max-refires") || 3);
const EXECUTE = hasFlag("--execute");
const SKIP_DRY_RUN = hasFlag("--skip-dry-run");
const ONLY = (argValue("--only") || "").toLowerCase();
const LEAVE_PAIRS = collect("--leave");

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const EVIDENCE_DIR = path.resolve(`.runtime/dm4-upload-${stamp}`);
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

function die(msg) {
	console.error("ERROR:", msg);
	console.error("If the API is down: powershell -File scripts/restart-local-bnpi-pats-api-dev.ps1");
	process.exit(1);
}

// ---------- helpers ----------
async function apiJson(url, options = {}) {
	const res = await fetch(url, options);
	const text = await res.text();
	let json = null;
	try { json = JSON.parse(text); } catch { /* non-json */ }
	return { status: res.status, json, text };
}

function repoPath(p) {
	const abs = path.isAbsolute(p) ? p : path.resolve(p);
	return abs;
}

function curlMultipart(url, token, fields, outFile, maxTimeSec) {
	// fields: array of { type: 'data-file'|'file', value } — data=<file trick avoids
	// multer's fileFilter rejecting .json parts (proven pattern from the 2026-09-11 backfill).
	const args = ["-s", "-X", "POST", url, "-H", `Authorization: Bearer ${token}`, "--max-time", String(maxTimeSec)];
	for (const f of fields) {
		if (f.type === "data-file") args.push("-F", `data=<${f.value}`);
		else if (f.type === "data-string") args.push("--form-string", `data=${f.value}`);
		else args.push("-F", `files=@${f.value}`);
	}
	args.push("-o", outFile, "-w", "%{http_code}");
	const r = spawnSync("curl.exe", args, { encoding: "utf8", windowsHide: true });
	const code = (r.stdout || "").trim();
	return { httpCode: code, raw: fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8") : "" };
}

function parseJsonSafe(raw) {
	try { return JSON.parse(raw.replace(/^\uFEFF/, "")); } catch { return null; }
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function fileSortKey(name) {
	// "Biometrics Data_Jan 11 - 25.xlsx" / "rptOvertimeDetails - Jan11-25.xlsx" / "Dec 26 - Jan 10"
	const m = String(name).toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2})?/);
	if (m) return (MONTHS[m[1]] || 12) * 100 + Number(m[2] || 0);
	return 1e9; // unknown naming sorts last, alphabetical fallback
}

function listWorkbooks(dirOrFile) {
	const p = repoPath(dirOrFile);
	if (!fs.existsSync(p)) return [];
	const stat = fs.statSync(p);
	if (!stat.isDirectory()) return [p];
	return fs
		.readdirSync(p)
		.filter((f) => /\.(xlsx|xls)$/i.test(f) && !f.startsWith("~$"))
		.map((f) => path.join(p, f))
		.sort((a, b) => fileSortKey(path.basename(a)) - fileSortKey(path.basename(b)) || a.localeCompare(b));
}

const isOtWorkbook = (p) => /rptOvertimeDetails/i.test(path.basename(p));

// ---------- login ----------
log(`checking API health at ${API} ...`);
const health = await apiJson(`${API}/health`);
if (health.status !== 200 || health.json?.status !== "healthy") die(`API not healthy at ${API}`);
log("API healthy. Logging in...");
const login = await apiJson(`${API}/api/auth/login`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ email: EMAIL, password: PASSWORD, appCode: "bnpi-pats" }),
});
const token = login.json?.data?.token;
if (!token) die(`login failed (${login.status}): ${(login.text || "").slice(0, 200)}`);
log("login ok.");

// ---------- build work plan ----------
const bioFiles = listWorkbooks(argValue("--files") || "");
const otFiles = listWorkbooks(argValue("--ot") || "");
const dm4Files = [...bioFiles, ...otFiles].filter((p) => !ONLY || path.basename(p).toLowerCase().includes(ONLY));
if (!dm4Files.length && !LEAVE_PAIRS.length) die("no workbooks found (check --files / --ot / --leave)");

const results = [];
const summaryPath = path.join(EVIDENCE_DIR, "SUMMARY.json");
const writeSummary = () => fs.writeFileSync(summaryPath, JSON.stringify(results, null, 1));

// ---------- DM4 flow per workbook ----------
async function pollRun(runId, label) {
	for (let attempt = 1; attempt <= MAX_REFIRES + 1; attempt++) {
		let consecErr = 0;
		while (true) {
			await new Promise((r) => setTimeout(r, 15000));
			let run = null;
			try {
				const r = await apiJson(`${API}/api/migration/runs/${runId}`, { headers: { Authorization: `Bearer ${token}` } });
				if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
				run = r.json?.data?.run;
				consecErr = 0;
			} catch (e) {
				consecErr++;
				log(`${label}: poll error ${consecErr} (${e.message})`);
				if (consecErr >= 14) return { status: "UNREACHABLE" };
				continue;
			}
			log(`${label}: ${run.status}`);
			if (["COMPLETED", "FAILED", "BLOCKED", "CANCELLED"].includes(run.status)) return run;
			if (run.status === "STALE") break; // refire
		}
		if (attempt > MAX_REFIRES) return { status: "STALE_EXHAUSTED" };
		log(`${label}: STALE -> refiring with fresh idempotencyKey (attempt ${attempt + 1})`);
		return null; // signal refire
	}
	return { status: "UNREACHABLE" };
}

async function runDm4Workbook(file, kind) {
	const name = path.basename(file);
	const label = `[dm4:${name}]`;
	const body = {
		workbookId: "dm4",
		organizationId: ORG,
		sourceFilename: name,
		sourceFiles: [file.replace(/\\/g, "/")],
	};
	const bodyFile = path.join(EVIDENCE_DIR, `body-${name}.json`);
	fs.writeFileSync(bodyFile, JSON.stringify(body));

	if (!SKIP_DRY_RUN) {
		log(`${label} dry-run gating...`);
		const dry = curlMultipart(`${API}/api/migration/runs/dry-run`, token, [
			{ type: "data-file", value: bodyFile },
			{ type: "file", value: file },
		], path.join(EVIDENCE_DIR, `dryrun-${name}.json`), 880);
		const dj = parseJsonSafe(dry.raw);
		const run = dj?.data?.run;
		if (dry.httpCode !== "200" || run?.status !== "DRY_RUN_COMPLETED") {
			log(`${label} DRY-RUN NOT CLEAN (http ${dry.httpCode}, run ${run?.status}) - file skipped`);
			results.push({ file: name, kind, phase: "dry-run", ok: false, detail: run?.errorJson || dj?.message || dry.httpCode });
			writeSummary();
			return;
		}
		const plan = run.summaryJson?.dryRunMaterializationPlan;
		if (plan && Number(plan.rowsWithoutAnySchedulePlan) > 0) {
			log(`${label} plan has ${plan.rowsWithoutAnySchedulePlan} rows without any schedule - file skipped (review the plan first)`);
			results.push({ file: name, kind, phase: "dry-run", ok: false, detail: "rowsWithoutAnySchedulePlan>0" });
			writeSummary();
			return;
		}
		log(`${label} dry-run clean.`);
	}

	if (!EXECUTE) {
		results.push({ file: name, kind, phase: "plan-only", ok: true });
		writeSummary();
		return;
	}

	let key = `dm4-${kind}-${name}-${stamp}`;
	for (let attempt = 1; attempt <= MAX_REFIRES + 1; attempt++) {
		const execBody = { ...body, idempotencyKey: key };
		const execBodyFile = path.join(EVIDENCE_DIR, `execbody-${name}-a${attempt}.json`);
		fs.writeFileSync(execBodyFile, JSON.stringify(execBody));
		const ex = curlMultipart(`${API}/api/migration/runs`, token, [
			{ type: "data-file", value: execBodyFile },
			{ type: "file", value: file },
		], path.join(EVIDENCE_DIR, `exec-${name}-a${attempt}.json`), 120);
		const ej = parseJsonSafe(ex.raw);
		const runId = ej?.data?.run?.id;
		if (ex.httpCode !== "202" || !runId) {
			log(`${label} EXEC start failed (http ${ex.httpCode})`);
			results.push({ file: name, kind, phase: "execute", ok: false, detail: ej?.message || ex.httpCode });
			writeSummary();
			return;
		}
		log(`${label} accepted ${runId}`);
		const terminal = await pollRun(runId, label);
		if (terminal && terminal.status !== "STALE") {
			const c = terminal.counts || {};
			log(`${label} TERMINAL ${terminal.status} | rows=${c.total ?? "-"} failed=${c.failed ?? "-"} updated=${c.updated ?? "-"} recalculated=${c.timesheetsRecalculated ?? "-"}`);
			results.push({ file: name, kind, phase: "execute", ok: terminal.status === "COMPLETED", runId, status: terminal.status, counts: c });
			writeSummary();
			return;
		}
		key = `${key}-r${attempt + 1}`;
	}
}

// ---------- leave flow ----------
async function runLeaveImport(pair) {
	const eq = pair.indexOf("=");
	const file = repoPath(pair.slice(0, eq));
	const periodCode = pair.slice(eq + 1);
	const name = path.basename(file);
	const label = `[leave:${name}->${periodCode}]`;
	// resolve period id
	const pp = await apiJson(`${API}/api/payrollPeriod?pagination=true&document=true&limit=60&sort=startDate&order=asc`, { headers: { Authorization: `Bearer ${token}` } });
	const per = (pp.json?.data?.payrollPeriods || []).find((p) => p.code === periodCode);
	if (!per) { log(`${label} period ${periodCode} NOT FOUND - skipped`); results.push({ file: name, kind: "leave", ok: false, detail: "period not found" }); writeSummary(); return; }
	if (!EXECUTE) { results.push({ file: name, kind: "leave", phase: "plan-only", ok: true, period: periodCode }); writeSummary(); return; }
	const bodyFile = path.join(EVIDENCE_DIR, `leave-body-${name}.json`);
	fs.writeFileSync(bodyFile, JSON.stringify({ payrollPeriodId: per.id }));
	const res = curlMultipart(`${API}/api/migration/dm3/import-period-leave`, token, [
		{ type: "data-file", value: bodyFile },
		{ type: "file", value: file },
	], path.join(EVIDENCE_DIR, `leave-resp-${name}.json`), 600);
	const j = parseJsonSafe(res.raw);
	const s = j?.data?.summary;
	log(`${label} HTTP ${res.httpCode} | created=${s?.created ?? "-"} updated=${s?.updated ?? "-"} skipped=${s?.skipped ?? "-"} failed=${s?.failed ?? "-"}`);
	results.push({ file: name, kind: "leave", ok: res.httpCode === "200" && !s?.failed, period: periodCode, summary: s });
	writeSummary();
}

// ---------- run ----------
log(`mode: ${EXECUTE ? "EXECUTE" : "PLAN-ONLY (use --execute to write)"}`);
log(`evidence: ${EVIDENCE_DIR}`);
for (const f of dm4Files) {
	try { await runDm4Workbook(f, isOtWorkbook(f) ? "ot" : "biometrics"); }
	catch (e) { log(`unexpected error on ${path.basename(f)}: ${e.message}`); results.push({ file: path.basename(f), ok: false, detail: e.message }); writeSummary(); }
}
for (const pair of LEAVE_PAIRS) {
	try { await runLeaveImport(pair); }
	catch (e) { log(`unexpected leave error: ${e.message}`); results.push({ file: pair, ok: false, detail: e.message }); writeSummary(); }
}

const okCount = results.filter((r) => r.ok).length;
log(`DONE: ${okCount}/${results.length} OK. Evidence: ${EVIDENCE_DIR}${EXECUTE ? "" : " (plan-only)"}`);
writeSummary();
if (!EXECUTE) log("This was a PLAN-ONLY pass. Re-run with --execute to import.");
