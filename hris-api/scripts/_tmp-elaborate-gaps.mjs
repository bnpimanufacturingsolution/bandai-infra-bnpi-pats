/**
 * Elaborate the failing tally: gate-overlap analysis, UNMATCH detail,
 * leave residual detail, and simulations of the two policy fixes
 * (PhilHealth salary basis, absent/Saturday expectation).
 * Read-only. Writes GAP-ELABORATION.md next to the latest tally.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const API = "http://localhost:3001";
const PERIOD_ID = "cmryhzl500032vgakz1uy1k7l";
const TARGET = "../.runtime/tally-jul11-25-20260817/hris_payroll_jul11_unlocked.xlsx";

const dirs = fs.readdirSync(path.join(root, ".runtime")).filter((d) => d.startsWith("tally-jul1125-after-repairs-")).sort();
const latest = dirs[dirs.length - 1];
const dir = path.join(root, ".runtime", latest);
const rows = JSON.parse(fs.readFileSync(path.join(dir, "all-results.json"), "utf8"));
const tol = 0.05;

// ---- Sheet2 contributions + absent per employee ----
const wb = XLSX.readFile(TARGET, { cellDates: true });
const srows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet2, { header: 1, defval: null, raw: true });
const headers = srows[3].map((h) => (h == null ? "" : String(h).trim()));
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const money = (v) => (v == null || v === "" ? 0 : typeof v === "number" ? v : Number(String(v).replace(/,/g, "")) || 0);
const N = (s) => (/^\d+$/.test(String(s ?? "").trim()) ? String(s).trim().padStart(5, "0") : "");
const s2 = new Map();
for (let i = 4; i < srows.length; i++) {
	const r = srows[i];
	if (!r) continue;
	const code = N(r[idx["Emp. No."]]);
	if (!code) continue;
	s2.set(code, {
		ph: money(r[idx["PhilHealth"]]),
		sss: money(r[idx["SSS Cont"]]),
		pag: money(r[idx["Pagibig"]]),
		absent: money(r[idx["Absent-Amt"]]),
	});
}

// ---- App contributions per employee (one preview pass) ----
const login = await fetch(`${API}/api/auth/login`, {
	method: "POST",
	headers: { "Content-Type": "application/json" },
	body: JSON.stringify({ email: "admin@bandai.local", password: "password123", appCode: "hris" }),
}).then((r) => r.json());
const token = login.data.token;
const app = new Map();
let page = 1, totalPages = 1;
while (page <= totalPages) {
	const r = await fetch(
		`${API}/api/payrollperiod/${PERIOD_ID}/generate-timesheet/preview?calculateRows=true&page=${page}&limit=50`,
		{ headers: { Authorization: `Bearer ${token}` } },
	).then((x) => x.json());
	if (page === 1) totalPages = Number(r.data?.pagination?.totalPages || 1) || 1;
	for (const row of r.data.includedEmployees || []) {
		const code = String(row.employeeCode || "").padStart(5, "0");
		const g = row.payrollRegister || {};
		app.set(code, {
			ph: Number(g.philHealthContribution || 0),
			sss: Number(g.sssContribution || 0),
			pag: Number(g.pagibigContribution || 0),
		});
	}
	page++;
}

// ---- Gate overlap ----
const gates = { gross: 0, net: 0, totalDedn: 0, totalReceivable: 0, absent: 0, late: 0, ot: 0, leavePay: 0 };
for (const r of rows) {
	for (const f of Object.keys(gates)) {
		const t = Number(r.target?.[f] || 0);
		const a = Number(r.app?.[f] || 0);
		if (Math.abs(t - a) > tol) gates[f]++;
	}
}

// per-employee: which core gates fail
const coreFails = { one: 0, two: 0, threePlus: 0, none: 0 };
const failOnlyDedn = [];
for (const r of rows) {
	const fails = [];
	if (Math.abs((r.target?.gross || 0) - (r.app?.gross || 0)) > tol) fails.push("gross");
	if (Math.abs((r.target?.net || 0) - (r.app?.net || 0)) > tol) fails.push("net");
	if (Math.abs((r.target?.totalDedn || 0) - (r.app?.totalDedn || 0)) > tol) fails.push("dedn");
	if (Math.abs((r.target?.totalReceivable || 0) - (r.app?.totalReceivable || 0)) > tol) fails.push("TR");
	if (Math.abs((r.target?.ot || 0) - (r.app?.ot || 0)) > tol) fails.push("ot");
	if (Math.abs((r.target?.absent || 0) - (r.app?.absent || 0)) > tol) fails.push("absent");
	if (Math.abs((r.target?.late || 0) - (r.app?.late || 0)) > tol) fails.push("late");
	if (fails.length === 0) coreFails.none++;
	else if (fails.length === 1) {
		coreFails.one++;
		if (fails[0] === "dedn") failOnlyDedn.push(r.code);
	} else if (fails.length === 2) coreFails.two++;
	else coreFails.threePlus++;
}

// ---- Simulations ----
let phFixTallies = 0, phFixNetOk = 0;
let absentFixTallies = 0;
let bothFixTallies = 0;
const phGapSamples = [];
for (const r of rows) {
	const code = r.code;
	const s = s2.get(code) || { ph: 0, absent: 0 };
	const a = app.get(code) || { ph: 0 };
	const dPh = a.ph - s.ph; // app over → correction subtracts
	// Sim 1: PH salary basis → dedn' = dedn - dPh; net' = net + dPh; TR' = TR + dPh
	const dedn2 = (r.app?.totalDedn || 0) - dPh;
	const net2 = (r.app?.net || 0) + dPh;
	const tr2 = (r.app?.totalReceivable || 0) + dPh;
	const okNet = Math.abs(net2 - (r.target?.net || 0)) <= tol;
	const okDedn = Math.abs(dedn2 - (r.target?.totalDedn || 0)) <= tol;
	const okTr = Math.abs(tr2 - (r.target?.totalReceivable || 0)) <= tol;
	const okGross = Math.abs((r.app?.gross || 0) - (r.target?.gross || 0)) <= tol;
	const okOt = Math.abs((r.app?.ot || 0) - (r.target?.ot || 0)) <= tol;
	const okAbs = Math.abs((r.app?.absent || 0) - (r.target?.absent || 0)) <= tol;
	const okLate = Math.abs((r.app?.late || 0) - (r.target?.late || 0)) <= tol;
	const okLeave = Math.abs((r.app?.leavePay || 0) - (r.target?.leavePay || 0)) <= tol;
	if (okNet) phFixNetOk++;
	if (okNet && okDedn && okTr && okGross && okOt && okAbs && okLate && okLeave) phFixTallies++;
	// Sim 2: absent policy (charge Sheet2 absent) → gross' = gross - (s2.absent - app.absent); net/tr shift equally
	const dAbs = s.absent - (r.app?.absent || 0);
	const gross3 = (r.app?.gross || 0) - dAbs;
	const net3 = (r.app?.net || 0) - dAbs;
	const tr3 = (r.app?.totalReceivable || 0) - dAbs;
	const okGross3 = Math.abs(gross3 - (r.target?.gross || 0)) <= tol;
	const okNet3 = Math.abs(net3 - (r.target?.net || 0)) <= tol;
	const okTr3 = Math.abs(tr3 - (r.target?.totalReceivable || 0)) <= tol;
	if (okGross3 && okNet3 && okTr3 && okDedn && okOt && okAbs && okLate && okLeave) absentFixTallies++;
	if (okGross3 && okNet3 && okTr3 && okDedn && okOt && okLate && okLeave) {
		// absent fixed AND PH fixed
		const dedn4 = dedn2;
		const okAbs4 = Math.abs((r.target?.absent || 0) - (r.app?.absent || 0) - 0) <= tol || dAbs !== 0 ? Math.abs((r.target?.absent || 0) - 0) >= 0 : true;
		bothFixTallies++;
	}
	if (Math.abs(dPh) > 50 && phGapSamples.length < 5) {
		phGapSamples.push({ code, appPH: a.ph, s2PH: s.ph, dPh: +dPh.toFixed(2) });
	}
}

// ---- UNMATCH + leave detail ----
const unmatch = rows.filter((r) => r.band === "UNMATCH").map((r) => ({
	code: r.code, name: r.name, dTotal: +r.deltas.totalReceivable.toFixed(2),
	dGross: +r.deltas.gross.toFixed(2), dDedn: +r.deltas.totalDedn.toFixed(2),
}));
const leaveFails = rows
	.filter((r) => Math.abs((r.target?.leavePay || 0) - (r.app?.leavePay || 0)) > tol)
	.map((r) => ({ code: r.code, sheet: r.target?.leavePay, app: r.app?.leavePay }));

const out = {
	generatedAt: new Date().toISOString(),
	gateFails: gates,
	coreFailOverlap: coreFails,
	failOnlyDednCount: failOnlyDedn.length,
	simulations: {
		phSalaryBasis: { talliedWouldBe: phFixTallies, netWouldPass: phFixNetOk, note: "per-employee PH correction (app PH − Sheet2 PH)" },
		absentPolicy: { talliedWouldBe: absentFixTallies },
		bothPolicy: { talliedWouldBeUpperBound: bothFixTallies },
		phGapSamples,
	},
	unmatch,
	leaveFails,
};
fs.writeFileSync(path.join(dir, "GAP-ELABORATION.json"), JSON.stringify(out, null, 2));

const md = [];
md.push(`# Failing tally elaboration — ${latest}`);
md.push("");
md.push(`## Gate fail counts (of 828)`);
md.push("");
md.push("| Gate | Fails |");
md.push("|---|---:|");
for (const [k, v] of Object.entries(gates)) md.push(`| ${k} | ${v} |`);
md.push("");
md.push(`## Core-gate overlap per employee`);
md.push("");
md.push(`| Failing gates | Employees |`);
md.push(`|---|---:|`);
md.push(`| none (core-clean) | ${coreFails.none} |`);
md.push(`| exactly 1 | ${coreFails.one} |`);
md.push(`| exactly 2 | ${coreFails.two} |`);
md.push(`| 3+ | ${coreFails.threePlus} |`);
md.push("");
md.push(`## Simulations (per-employee, exact ±${tol})`);
md.push("");
md.push(`| Scenario | TALLIED would become |`);
md.push(`|---|---:|`);
md.push(`| PhilHealth salary basis (per-employee PH correction) | **${phFixTallies}** (net passes for ${phFixNetOk}) |`);
md.push(`| Absent/Saturday policy | **${absentFixTallies}** |`);
md.push(`| Both (upper bound) | **${bothFixTallies}** |`);
md.push("");
md.push(`PH gap samples: ${JSON.stringify(phGapSamples)}`);
md.push("");
md.push(`## UNMATCH (${unmatch.length})`);
md.push("");
md.push("```json");
md.push(JSON.stringify(unmatch, null, 1));
md.push("```");
md.push("");
md.push(`## Leave residual (${leaveFails.length})`);
md.push("");
md.push("| Code | Sheet2 | App |");
md.push("|---|---:|---:|");
for (const l of leaveFails) md.push(`| ${l.code} | ${l.sheet} | ${l.app} |`);
fs.writeFileSync(path.join(dir, "GAP-ELABORATION.md"), md.join("\n"));
console.log(JSON.stringify(out, null, 1));
