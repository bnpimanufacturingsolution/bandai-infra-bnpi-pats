/**
 * Rebuild the PRE-LEAVE baseline against the TRUE July Sheet2.
 * The earlier "before" run mistakenly compared June Sheet2 (hardcoded target).
 * App-side rows were saved in all-results.json before the leave import, so we
 * re-pair them with the July target using the same classify logic/bands.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const TARGET_XLSX = path.join(ROOT, ".runtime/tally-jul11-25-20260817/hris_payroll_jul11_unlocked.xlsx");
const SOURCE_ROWS = path.join(ROOT, ".runtime/tally-jul1125-before-leave-20260825/all-results.json");
const OUT = path.join(ROOT, ".runtime", "tally-jul1125-before-leave-julysheet2");
fs.mkdirSync(OUT, { recursive: true });

const TOL = 0.05;
const NEAR_TOL = 10;

const KEY_FIELDS = [
	{ target: "Monthly Salary", app: "monthlySalary", key: "monthlySalary" },
	{ target: "No. of Days", app: "numberOfDays", key: "numberOfDays" },
	{ target: "Basic Salary", app: "basicPay", key: "basicPay" },
	{ target: "Absent-Amt", app: "absentDeduction", key: "absent" },
	{ target: "UT/Late-Amt", app: "lateUndertimeAmount", key: "late" },
	{ target: "No. of Reg OT Hrs", app: "regularOtHours", key: "regOtHrs" },
	{ target: "Reg OT", app: "overtimePay", key: "ot" },
	{ target: "Adjustment OT/ND", app: "adjustmentOtNd", key: "aon" },
	{ target: "De Minimis Allowance", app: "deMinimisAllowance", key: "dma" },
	{ target: "GrossPay", app: "grossPay", key: "gross" },
	{ target: "W/Tax", app: "taxAmount", key: "tax" },
	{ target: "Modified HDMF 2", app: "modifiedHdmf2", key: "mhdmf2" },
	{ target: "RCBC Loan", app: "rcbcLoan", key: "rcbc" },
	{ target: "HDMF Salary Loan", app: "hdmfSalaryLoan", key: "hdmfSl" },
	{ target: "SSS Salary Loan", app: "sssSalaryLoan", key: "sssSl" },
	{ target: "TOTAL DEDN", app: "totalDeductions", key: "totalDedn" },
	{ target: "NetPay", app: "netPay", key: "net" },
	{ target: "Attendance Recognition Program", app: "attendanceRecognitionProgram", key: "arp", optional: true },
	{ target: "Perfect Attendance", app: "perfectAttendance", key: "pfa" },
	{ target: "Meal Allowance", app: "mealAllowance", key: "mla" },
	{ target: "TotalReceivable", app: "totalReceivable", key: "totalReceivable" },
	{ target: "Leave", app: "leavePay", key: "leavePay" },
];

function money(v) {
	if (v == null || v === "" || v === "-") return 0;
	if (typeof v === "number" && Number.isFinite(v)) return v;
	const s = String(v).replace(/,/g, "").replace(/PHP/gi, "").trim();
	if (!s || s === "-") return 0;
	const n = Number(s);
	return Number.isFinite(n) ? n : 0;
}
function normCode(v) {
	const s = String(v ?? "").trim();
	if (!s || s === "undefined" || s === "null") return "";
	if (/^\d+$/.test(s)) return s.padStart(5, "0");
	return s;
}
function almost(a, b, tol = TOL) {
	return Math.abs(money(a) - money(b)) <= tol;
}

// --- July target (identical loader to the tally script) ---
const wb = XLSX.readFile(TARGET_XLSX, { cellDates: true });
const ws = wb.Sheets.Sheet2;
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
const headers = rows[3].map((h) => (h == null ? "" : String(h).trim()));
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const target = new Map();
for (let i = 4; i < rows.length; i++) {
	const r = rows[i];
	if (!r) continue;
	const code = normCode(r[idx["Emp. No."]]);
	if (!code) continue;
	const rec = { code, name: String(r[idx["Employee Name"]] || "").trim() };
	for (const f of KEY_FIELDS) rec[f.key] = money(r[idx[f.target]]);
	target.set(code, rec);
}

// --- Saved pre-leave app rows ---
const saved = JSON.parse(fs.readFileSync(SOURCE_ROWS, "utf8"));

function classify(t, a) {
	const d = (k) => money(a[k]) - money(t[k]);
	const deltas = {};
	for (const f of KEY_FIELDS) deltas[f.key] = d(f.key);
	const fieldMatch = {};
	let matchCount = 0;
	let compared = 0;
	for (const f of KEY_FIELDS) {
		if (f.optional && money(a[f.key]) === 0 && money(t[f.key]) !== 0) {
			fieldMatch[f.key] = "SKIP_OPTIONAL";
			continue;
		}
		compared++;
		const ok = almost(t[f.key], a[f.key]);
		fieldMatch[f.key] = ok;
		if (ok) matchCount++;
	}
	const coreTallied =
		almost(t.gross, a.gross) &&
		almost(t.net, a.net) &&
		almost(t.totalReceivable, a.totalReceivable) &&
		almost(t.ot, a.ot) &&
		almost(t.absent, a.absent) &&
		almost(t.late, a.late) &&
		almost(t.totalDedn, a.totalDedn);
	const near =
		!coreTallied &&
		Math.abs(deltas.totalReceivable) <= NEAR_TOL &&
		almost(t.ot, a.ot) &&
		Math.abs(deltas.gross) <= NEAR_TOL * 2;
	const otMatched = almost(t.ot, a.ot) && almost(t.regOtHrs, a.regOtHrs);
	const alexaLike =
		otMatched &&
		Math.abs(deltas.totalReceivable) <= 1.0 &&
		Math.abs(deltas.absent) <= 10 &&
		Math.abs(deltas.late) <= 5;
	let band;
	if (coreTallied) band = "TALLIED";
	else if (alexaLike || (near && Math.abs(deltas.totalReceivable) <= 1)) band = "ALEXA_NEAR";
	else if (near) band = "NEAR_10";
	else if (otMatched && Math.abs(deltas.totalReceivable) <= 50) band = "OT_OK_NEAR_50";
	else if (otMatched) band = "OT_MATCH_ONLY";
	else band = "UNMATCH";
	return { band, matchCount, compared, deltas, fieldMatch, absDeltaTotal: Math.abs(deltas.totalReceivable), absDeltaGross: Math.abs(deltas.gross) };
}

const results = [];
let onlyApp = 0;
for (const savedRow of saved) {
	const t = target.get(savedRow.code);
	if (!t) continue;
	const a = savedRow.app; // pre-leave app computation (leavePay absent = 0)
	const c = classify(t, a);
	results.push({
		code: savedRow.code,
		name: t.name || savedRow.name,
		band: c.band,
		matchCount: c.matchCount,
		compared: c.compared,
		target: Object.fromEntries(KEY_FIELDS.map((f) => [f.key, t[f.key]])),
		app: { ...a, leavePay: 0 },
		deltas: c.deltas,
		fieldMatch: c.fieldMatch,
		absDeltaTotal: c.absDeltaTotal,
		absDeltaGross: c.absDeltaGross,
	});
}
const comparedCodes = new Set(results.map((r) => r.code));
for (const [code] of target) if (!comparedCodes.has(code)) continue;
for (const s of saved) if (!target.has(s.code)) onlyApp++;

const bands = {};
for (const r of results) bands[r.band] = (bands[r.band] || 0) + 1;
const fieldFailCounts = {};
for (const f of KEY_FIELDS) {
	if (f.optional) continue;
	fieldFailCounts[f.key] = results.filter((r) => r.fieldMatch[f.key] === false).length;
}

const summary = {
	generatedAt: new Date().toISOString(),
	periodId: "cmryhzl500032vgakz1uy1k7l",
	periodCode: "PP-20260711-20260726",
	tol: TOL,
	nearTol: NEAR_TOL,
	targetCount: target.size,
	appCount: saved.length,
	comparedCount: results.length,
	onlyInTarget: target.size - results.length,
	onlyInApp: onlyApp,
	bands,
	fieldFailCounts,
	note: "Reconstructed pre-leave baseline: saved app rows re-paired against TRUE July Sheet2 (earlier run mis-paired June Sheet2). App leavePay = 0 by definition (pre-import).",
};
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(OUT, "all-results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ out: OUT, targetCount: target.size, compared: results.length, bands, leaveFails: fieldFailCounts.leavePay }, null, 1));
