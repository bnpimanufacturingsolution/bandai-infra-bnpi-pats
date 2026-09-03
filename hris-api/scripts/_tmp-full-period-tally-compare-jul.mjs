/**
 * Bulk tally: target Sheet2 (unlocked) vs live payroll preview for PP-20260626-20260711.
 * Writes evidence under .runtime/full-tally-20260811/
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(
  ROOT,
  ".runtime",
  process.env.TALLY_OUT_DIR || "full-tally-20260811",
);
const TARGET_XLSX = path.join(
  ROOT,
  process.env.TARGET_XLSX ||
    ".runtime/tally-jul11-25-20260817/hris_payroll_jul11_unlocked.xlsx",
);
const API = process.env.HRIS_API_URL || "http://localhost:3001";
const PERIOD_ID = process.env.PERIOD_ID || "cmryhzl4d0030vgaka9dd2v99";
const TOL = Number(process.env.TALLY_TOL || 0.05);
const NEAR_TOL = Number(process.env.NEAR_TOL || 10); // pesos — Alexa-like residual band
const LIMIT = 50;

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
  {
    target: "Attendance Recognition Program",
    app: "attendanceRecognitionProgram",
    key: "arp",
    // ARP may only appear in receivable-only sum; optional exact column
    optional: true,
  },
  { target: "Perfect Attendance", app: "perfectAttendance", key: "pfa" },
  { target: "Meal Allowance", app: "mealAllowance", key: "mla" },
  { target: "TotalReceivable", app: "totalReceivable", key: "totalReceivable" },
  // Leave tracked for the LVP import report; NOT part of coreTallied bands so
  // before/after band counts stay comparable with the pre-leave baseline.
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
  // keep alphanumeric; pad numeric-looking to 5
  if (/^\d+$/.test(s)) return s.padStart(5, "0");
  return s;
}

function almost(a, b, tol = TOL) {
  return Math.abs(money(a) - money(b)) <= tol;
}

function loadTarget() {
  const wb = XLSX.readFile(TARGET_XLSX, { cellDates: true });
  const ws = wb.Sheets.Sheet2;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const headers = rows[3].map((h) => (h == null ? "" : String(h).trim()));
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const byCode = new Map();
  for (let i = 4; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const code = normCode(r[idx["Emp. No."]]);
    if (!code) continue;
    const rec = { code, name: String(r[idx["Employee Name"]] || "").trim(), row: i + 1 };
    for (const f of KEY_FIELDS) {
      rec[f.key] = money(r[idx[f.target]]);
    }
    byCode.set(code, rec);
  }
  return { byCode, headers, rowCount: byCode.size };
}

async function login() {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "admin@bandai.local",
      password: "password123",
      appCode: "hris",
    }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
  const json = await res.json();
  const token = json?.data?.token;
  if (!token) throw new Error("no token");
  return token;
}

async function fetchAllPreview(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const byCode = new Map();
  let page = 1;
  let totalPages = 1;
  let summary = null;
  const t0 = Date.now();

  while (page <= totalPages) {
    const url = `${API}/api/payrollperiod/${PERIOD_ID}/generate-timesheet/preview?calculateRows=true&page=${page}&limit=${LIMIT}`;
    const tPage = Date.now();
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`preview page ${page} ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    const data = json.data || {};
    if (!summary) summary = data.summary || {};
    const pag = data.pagination || {};
    const total = Number(pag.total ?? summary.includedEmployeesCount ?? 0);
    totalPages = Math.max(1, Math.ceil(total / LIMIT) || 1);
    if (pag.totalPages) totalPages = Number(pag.totalPages);

    const rows = data.includedEmployees || [];
    for (const row of rows) {
      const code = normCode(row.employeeCode);
      if (!code) continue;
      const reg = row.payrollRegister || {};
      const rec = {
        code,
        name: row.name || "",
        employeeId: row.employeeId,
        timesheetId: row.timesheetId,
        // top-level fallbacks
        gross: money(row.grossPay ?? reg.grossPay),
        net: money(row.netPay ?? reg.netPay),
        totalReceivable: money(row.totalReceivable ?? reg.totalReceivable),
        ot: money(row.overtimePay ?? reg.overtimePay),
        totalDedn: money(row.totalDeductions ?? reg.totalDeductions),
        monthlySalary: money(reg.monthlySalary),
        numberOfDays: money(reg.numberOfDays),
        basicPay: money(reg.basicPay ?? row.basicPay),
        absent: money(reg.absentDeduction ?? row.deductions?.absentDeduction),
        late: money(reg.lateUndertimeAmount ?? row.deductions?.lateDeduction),
        regOtHrs: money(reg.regularOtHours),
        aon: money(reg.adjustmentOtNd),
        dma: money(reg.deMinimisAllowance),
        tax: money(reg.taxAmount ?? row.deductions?.taxAmount),
        mhdmf2: money(reg.modifiedHdmf2),
        rcbc: money(reg.rcbcLoan),
        hdmfSl: money(reg.hdmfSalaryLoan),
        sssSl: money(reg.sssSalaryLoan),
        arp: money(reg.attendanceRecognitionProgram),
        leavePay: money(reg.leavePay ?? row.leavePay),
        pfa: money(reg.perfectAttendance),
        mla: money(reg.mealAllowance),
        receivableOnly: money(row.metadata?.payrollSourceAmounts?.receivableOnlyBenefits),
        sourceCodes: (row.metadata?.payrollSourceDetails || [])
          .map((d) => d.code)
          .filter(Boolean),
      };
      // If ARP column empty but receivable-only implies ARP: don't invent unless we can isolate.
      // Keep arp as column; note separately.
      byCode.set(code, rec);
    }

    console.log(
      JSON.stringify({
        page,
        totalPages,
        pageRows: rows.length,
        cumulative: byCode.size,
        pageSec: ((Date.now() - tPage) / 1000).toFixed(2),
        elapsedSec: ((Date.now() - t0) / 1000).toFixed(1),
      }),
    );
    page += 1;
    if (rows.length === 0) break;
  }

  return { byCode, summary, elapsedMs: Date.now() - t0 };
}

function classify(t, a) {
  const d = (k) => money(a[k]) - money(t[k]);
  const deltas = {
    gross: d("gross"),
    net: d("net"),
    totalReceivable: d("totalReceivable"),
    ot: d("ot"),
    absent: d("absent"),
    late: d("late"),
    totalDedn: d("totalDedn"),
    tax: d("tax"),
    dma: d("dma"),
    mla: d("mla"),
    leavePay: d("leavePay"),
    pfa: d("pfa"),
    hdmfSl: d("hdmfSl"),
    rcbc: d("rcbc"),
    sssSl: d("sssSl"),
    aon: d("aon"),
    mhdmf2: d("mhdmf2"),
    regOtHrs: d("regOtHrs"),
    basicPay: d("basicPay"),
  };

  const fieldMatch = {};
  let matchCount = 0;
  let compared = 0;
  for (const f of KEY_FIELDS) {
    if (f.optional && money(a[f.key]) === 0 && money(t[f.key]) !== 0) {
      // skip strict ARP column if app 0 — may still be in receivable
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

  return {
    band,
    matchCount,
    compared,
    deltas,
    fieldMatch,
    absDeltaTotal: Math.abs(deltas.totalReceivable),
    absDeltaGross: Math.abs(deltas.gross),
  };
}

function mainBuckets(rows) {
  const counts = {};
  for (const r of rows) counts[r.band] = (counts[r.band] || 0) + 1;
  return counts;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  console.log("Loading target...");
  const target = loadTarget();
  console.log("target employees", target.rowCount);

  console.log("Login + fetch preview pages...");
  const token = await login();
  const app = await fetchAllPreview(token);
  console.log("app employees with register calc", app.byCode.size);

  const results = [];
  const onlyTarget = [];
  const onlyApp = [];

  for (const [code, t] of target.byCode) {
    const a = app.byCode.get(code);
    if (!a) {
      onlyTarget.push({ code, name: t.name, totalReceivable: t.totalReceivable });
      continue;
    }
    const c = classify(t, a);
    results.push({
      code,
      name: t.name,
      appName: a.name,
      band: c.band,
      matchCount: c.matchCount,
      compared: c.compared,
      target: {
        gross: t.gross,
        net: t.net,
        totalReceivable: t.totalReceivable,
        ot: t.ot,
        absent: t.absent,
        late: t.late,
        totalDedn: t.totalDedn,
        mla: t.mla,
        leavePay: t.leavePay,
        pfa: t.pfa,
        arp: t.arp,
        dma: t.dma,
        tax: t.tax,
        hdmfSl: t.hdmfSl,
        rcbc: t.rcbc,
        sssSl: t.sssSl,
        aon: t.aon,
        regOtHrs: t.regOtHrs,
        basicPay: t.basicPay,
        days: t.numberOfDays,
      },
      app: {
        gross: a.gross,
        net: a.net,
        totalReceivable: a.totalReceivable,
        ot: a.ot,
        absent: a.absent,
        late: a.late,
        totalDedn: a.totalDedn,
        mla: a.mla,
        leavePay: a.leavePay,
        pfa: a.pfa,
        arp: a.arp,
        dma: a.dma,
        tax: a.tax,
        hdmfSl: a.hdmfSl,
        rcbc: a.rcbc,
        sssSl: a.sssSl,
        aon: a.aon,
        regOtHrs: a.regOtHrs,
        basicPay: a.basicPay,
        days: a.numberOfDays,
        receivableOnly: a.receivableOnly,
      },
      deltas: c.deltas,
      fieldMatch: c.fieldMatch,
      absDeltaTotal: c.absDeltaTotal,
      absDeltaGross: c.absDeltaGross,
    });
  }

  for (const [code, a] of app.byCode) {
    if (!target.byCode.has(code)) {
      onlyApp.push({
        code,
        name: a.name,
        totalReceivable: a.totalReceivable,
        gross: a.gross,
      });
    }
  }

  results.sort((x, y) => x.absDeltaTotal - y.absDeltaTotal);

  const bands = mainBuckets(results);
  const fieldFailCounts = {};
  for (const f of KEY_FIELDS) {
    if (f.optional) continue;
    fieldFailCounts[f.key] = results.filter((r) => r.fieldMatch[f.key] === false).length;
  }

  const tallied = results.filter((r) => r.band === "TALLIED");
  const alexaNear = results.filter((r) => r.band === "ALEXA_NEAR");
  const near10 = results.filter((r) => r.band === "NEAR_10");
  const worst = [...results].sort((a, b) => b.absDeltaTotal - a.absDeltaTotal).slice(0, 30);
  const bestNonTallied = results.filter((r) => r.band !== "TALLIED").slice(0, 25);

  // Known samples
  const samples = ["01792", "01360"].map((code) => results.find((r) => r.code === code)).filter(Boolean);

  const report = {
    generatedAt: new Date().toISOString(),
    periodId: PERIOD_ID,
    periodCode: process.env.TALLY_PERIOD_CODE || "PP-20260626-20260711",
    tol: TOL,
    nearTol: NEAR_TOL,
    targetCount: target.rowCount,
    appCount: app.byCode.size,
    comparedCount: results.length,
    onlyInTarget: onlyTarget.length,
    onlyInApp: onlyApp.length,
    previewSummary: app.summary,
    previewElapsedMs: app.elapsedMs,
    bands,
    fieldFailCounts,
    talliedCount: tallied.length,
    alexaNearCount: alexaNear.length,
    near10Count: near10.length,
    samples,
    talliedCodes: tallied.map((r) => ({
      code: r.code,
      name: r.name,
      totalReceivable: r.app.totalReceivable,
    })),
    alexaNearSample: alexaNear.slice(0, 40).map((r) => ({
      code: r.code,
      name: r.name,
      dTotal: +r.deltas.totalReceivable.toFixed(2),
      dGross: +r.deltas.gross.toFixed(2),
      dLate: +r.deltas.late.toFixed(2),
      dAbsent: +r.deltas.absent.toFixed(2),
      dOt: +r.deltas.ot.toFixed(2),
    })),
    near10Sample: near10.slice(0, 30).map((r) => ({
      code: r.code,
      name: r.name,
      dTotal: +r.deltas.totalReceivable.toFixed(2),
      dGross: +r.deltas.gross.toFixed(2),
    })),
    worst30: worst.map((r) => ({
      code: r.code,
      name: r.name,
      band: r.band,
      dTotal: +r.deltas.totalReceivable.toFixed(2),
      dGross: +r.deltas.gross.toFixed(2),
      dOt: +r.deltas.ot.toFixed(2),
      dAbsent: +r.deltas.absent.toFixed(2),
      dLate: +r.deltas.late.toFixed(2),
      dDedn: +r.deltas.totalDedn.toFixed(2),
      targetTotal: r.target.totalReceivable,
      appTotal: r.app.totalReceivable,
    })),
    onlyTargetSample: onlyTarget.slice(0, 20),
    onlyAppSample: onlyApp.slice(0, 20),
  };

  fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, "all-results.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT, "only-target.json"), JSON.stringify(onlyTarget, null, 2));
  fs.writeFileSync(path.join(OUT, "only-app.json"), JSON.stringify(onlyApp, null, 2));

  // CSV for operator scan
  const csvLines = [
    [
      "code",
      "name",
      "band",
      "dTotalReceivable",
      "dGross",
      "dNet",
      "dOt",
      "dAbsent",
      "dLate",
      "dTotalDedn",
      "dTax",
      "dDma",
      "dMla",
      "dRcbc",
      "dHdmfSl",
      "dSssSl",
      "targetTotal",
      "appTotal",
      "matchCount",
    ].join(","),
  ];
  for (const r of results) {
    csvLines.push(
      [
        r.code,
        JSON.stringify(r.name),
        r.band,
        r.deltas.totalReceivable.toFixed(2),
        r.deltas.gross.toFixed(2),
        r.deltas.net.toFixed(2),
        r.deltas.ot.toFixed(2),
        r.deltas.absent.toFixed(2),
        r.deltas.late.toFixed(2),
        r.deltas.totalDedn.toFixed(2),
        r.deltas.tax.toFixed(2),
        r.deltas.dma.toFixed(2),
        r.deltas.mla.toFixed(2),
        r.deltas.rcbc.toFixed(2),
        r.deltas.hdmfSl.toFixed(2),
        r.deltas.sssSl.toFixed(2),
        r.target.totalReceivable.toFixed(2),
        r.app.totalReceivable.toFixed(2),
        r.matchCount,
      ].join(","),
    );
  }
  fs.writeFileSync(path.join(OUT, "compare.csv"), csvLines.join("\n"));

  const md = [];
  md.push("# Full period tally — Jun 26–Jul 10, 2026");
  md.push("");
  md.push(`Generated: ${report.generatedAt}`);
  md.push(`Period: ${report.periodCode} (\`${PERIOD_ID}\`)`);
  md.push(`Tolerance exact: ±${TOL} | near: ±${NEAR_TOL} on TotalReceivable`);
  md.push("");
  md.push("## Coverage");
  md.push("");
  md.push(`| Set | Count |`);
  md.push(`|---|---:|`);
  md.push(`| Target Sheet2 rows | ${target.rowCount} |`);
  md.push(`| App preview calculated | ${app.byCode.size} |`);
  md.push(`| Compared (intersection) | ${results.length} |`);
  md.push(`| Only in target | ${onlyTarget.length} |`);
  md.push(`| Only in app | ${onlyApp.length} |`);
  md.push("");
  md.push("## Bands");
  md.push("");
  md.push("| Band | Count | Meaning |");
  md.push("|---|---:|---|");
  md.push(
    `| TALLIED | ${bands.TALLIED || 0} | Gross+Net+TotalReceivable+OT+Absent+Late+TotalDedn within ±${TOL} |`,
  );
  md.push(
    `| ALEXA_NEAR | ${bands.ALEXA_NEAR || 0} | OT match; |ΔTotal|≤1; small absent/late residual (Alexa-class) |`,
  );
  md.push(`| NEAR_10 | ${bands.NEAR_10 || 0} | OT match; |ΔTotal|≤${NEAR_TOL} |`);
  md.push(`| OT_OK_NEAR_50 | ${bands.OT_OK_NEAR_50 || 0} | OT match; |ΔTotal|≤50 |`);
  md.push(`| OT_MATCH_ONLY | ${bands.OT_MATCH_ONLY || 0} | OT hrs/pay match; money still far |`);
  md.push(`| UNMATCH | ${bands.UNMATCH || 0} | OT and/or money far |`);
  md.push("");
  md.push("## Field fail counts (among compared)");
  md.push("");
  md.push("| Field | Fail count |");
  md.push("|---|---:|");
  for (const [k, v] of Object.entries(fieldFailCounts).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${k} | ${v} |`);
  }
  md.push("");
  md.push("## Known samples");
  md.push("");
  for (const s of samples) {
    md.push(
      `- **${s.code} ${s.name}** → \`${s.band}\` dTotal=${s.deltas.totalReceivable.toFixed(2)} dGross=${s.deltas.gross.toFixed(2)} dOt=${s.deltas.ot.toFixed(2)} dAbsent=${s.deltas.absent.toFixed(2)} dLate=${s.deltas.late.toFixed(2)}`,
    );
  }
  md.push("");
  md.push(`## TALLIED employees (${tallied.length})`);
  md.push("");
  if (!tallied.length) md.push("_None within exact tolerance._");
  else {
    md.push("| Code | Name | TotalReceivable |");
    md.push("|---|---|---:|");
    for (const r of tallied.slice(0, 100)) {
      md.push(`| ${r.code} | ${r.name} | ${r.app.totalReceivable.toFixed(2)} |`);
    }
    if (tallied.length > 100) md.push(`| … | +${tallied.length - 100} more | |`);
  }
  md.push("");
  md.push("## Worst 15 by |Δ TotalReceivable|");
  md.push("");
  md.push("| Code | Name | Band | dTotal | dGross | dOt | dAbsent | dLate |");
  md.push("|---|---|---|---:|---:|---:|---:|---:|");
  for (const r of worst.slice(0, 15)) {
    md.push(
      `| ${r.code} | ${r.name} | ${r.band} | ${r.deltas.totalReceivable.toFixed(2)} | ${r.deltas.gross.toFixed(2)} | ${r.deltas.ot.toFixed(2)} | ${r.deltas.absent.toFixed(2)} | ${r.deltas.late.toFixed(2)} |`,
    );
  }
  md.push("");
  md.push("Evidence: `summary.json`, `all-results.json`, `compare.csv`");
  fs.writeFileSync(path.join(OUT, "REPORT.md"), md.join("\n"));

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify({ bands, compared: results.length, tallied: tallied.length, samples: samples.map((s) => ({ code: s.code, band: s.band, dTotal: s.deltas.totalReceivable })) }, null, 2));
  console.log("OUT", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
