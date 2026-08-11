/**
 * Find mass-upload rows present for this cut but not reflected in live payroll preview money.
 * Leaves "missing from mass upload" out of scope.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, ".runtime", "mass-upload-apply-gap-20260811");
const PERIOD_ID = "cmryhzl4d0030vgaka9dd2v99";
const API = process.env.HRIS_API_URL || "http://localhost:3001";
const TOL = 0.05;

function money(v) {
  if (v == null || v === "" || v === "-") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function code5(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d+$/.test(s)) return s.padStart(5, "0");
  return s;
}

function pick(row, names) {
  for (const n of names) {
    if (row[n] != null && row[n] !== "") return row[n];
  }
  for (const k of Object.keys(row)) {
    const nk = k.replace(/\s+/g, "").toLowerCase();
    for (const n of names) {
      if (nk === n.replace(/\s+/g, "").toLowerCase()) return row[k];
    }
  }
  return null;
}

function loadSheet(rel) {
  const p = path.join(ROOT, rel);
  const wb = XLSX.readFile(p);
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    defval: null,
    raw: true,
  });
}

function loadMass() {
  const compRows = loadSheet(
    "confidential-files/june26-july10/Compensation Mass Upload 07.15.26.xlsx",
  );
  const dedRows = loadSheet(
    "confidential-files/june26-july10/Deduction Mass Upload 07.15.26.xlsx",
  );

  const compByEmp = new Map();
  const compCodeCounts = {};
  for (const r of compRows) {
    const emp = code5(r.EmployeeID);
    const code = String(r.COMCODE || "")
      .trim()
      .toUpperCase();
    const amt = money(r.Amount);
    if (!emp || !code) continue;
    compCodeCounts[code] = (compCodeCounts[code] || 0) + 1;
    if (!compByEmp.has(emp)) compByEmp.set(emp, {});
    const m = compByEmp.get(emp);
    m[code] = (m[code] || 0) + amt;
  }

  const dedByEmp = new Map();
  const dedCodeCounts = {};
  for (const r of dedRows) {
    const emp = code5(pick(r, ["EmployeeID"]));
    const code = String(pick(r, ["DEDCODE"]) || "")
      .trim()
      .toUpperCase();
    const payment = money(pick(r, ["Payment", " Payment "]));
    const amount = money(pick(r, ["Amount", " Amount "]));
    const use = payment > 0 ? payment : amount;
    if (!emp || !code) continue;
    dedCodeCounts[code] = (dedCodeCounts[code] || 0) + 1;
    if (!dedByEmp.has(emp)) dedByEmp.set(emp, {});
    const m = dedByEmp.get(emp);
    m[code] = (m[code] || 0) + use;
  }

  return { compByEmp, dedByEmp, compCodeCounts, dedCodeCounts, compRows, dedRows };
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
  const j = await res.json();
  return j.data.token;
}

async function fetchAllPreview(token) {
  const byCode = new Map();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const url = `${API}/api/payrollperiod/${PERIOD_ID}/generate-timesheet/preview?calculateRows=true&page=${page}&limit=50`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`preview ${page} ${res.status}`);
    const j = await res.json();
    const data = j.data || {};
    const pag = data.pagination || {};
    const total = Number(pag.total || data.summary?.includedEmployeesCount || 0);
    totalPages = Math.max(1, Math.ceil(total / 50));
    if (pag.totalPages) totalPages = Number(pag.totalPages);
    for (const row of data.includedEmployees || []) {
      const code = code5(row.employeeCode);
      if (!code) continue;
      const reg = row.payrollRegister || {};
      const sources = row.metadata?.payrollSourceDetails || [];
      const bySrc = {};
      for (const s of sources) {
        const c = String(s.code || "")
          .trim()
          .toUpperCase();
        const amt = money(s.amount);
        if (c) {
          bySrc[c] = (bySrc[c] || 0) + amt;
          continue;
        }
        // Name fallback only when source code is null (legacy loan rows).
        const name = String(s.name || s.benefitTypeName || "").toLowerCase();
        if (name.includes("hdmf salary")) bySrc.HDMFSALLN = (bySrc.HDMFSALLN || 0) + amt;
        else if (name.includes("sss salary")) bySrc.SSSSALLN = (bySrc.SSSSALLN || 0) + amt;
        else if (name.includes("sss calamity")) bySrc.SSSCALLN = (bySrc.SSSCALLN || 0) + amt;
        else if (name.includes("sss emergency")) bySrc.SSSELN = (bySrc.SSSELN || 0) + amt;
        else if (name.includes("hdmf calamity")) bySrc.HDMFCALLN = (bySrc.HDMFCALLN || 0) + amt;
        else if (name.includes("rcbc")) bySrc.RCBCLN = (bySrc.RCBCLN || 0) + amt;
        else if (name.includes("bnpi salary")) bySrc.BNPISALLN = (bySrc.BNPISALLN || 0) + amt;
      }
      byCode.set(code, {
        code,
        name: row.name,
        totalReceivable: money(row.totalReceivable ?? reg.totalReceivable),
        gross: money(row.grossPay ?? reg.grossPay),
        net: money(row.netPay ?? reg.netPay),
        reg,
        receivableOnly: money(row.metadata?.payrollSourceAmounts?.receivableOnlyBenefits),
        grossIncluded: money(row.metadata?.payrollSourceAmounts?.grossIncludedBenefits),
        deductionBenefits: money(row.metadata?.payrollSourceAmounts?.deductionBenefits),
        loanDeductions: money(row.metadata?.payrollSourceAmounts?.loanDeductions),
        bySrc,
        sourceList: sources.map((s) => ({
          code: s.code,
          name: s.name,
          amount: money(s.amount),
          action: s.reconciliationAction,
          dir: s.direction,
        })),
      });
    }
    console.log(JSON.stringify({ page, totalPages, n: byCode.size }));
    page += 1;
  }
  return byCode;
}

function mainCompare(mass, appByCode) {
  // Codes we expect to appear in payroll source details when present in mass upload
  const COMP_CODES = ["ARP", "PFA", "AON", "LLA", "OBA", "TSA", "MTX", "OAD", "ABS", "MLA"];
  const DED_CODES = [
    "HDMFSALLN",
    "SSSSALLN",
    "RCBCLN",
    "HDMFCALLN",
    "SSSCALLN",
    "SSSELN",
    "BNPISALLN",
    "NEGADJ",
  ];

  const gaps = [];
  const ok = [];
  const stats = {};

  const bump = (k) => {
    stats[k] = (stats[k] || 0) + 1;
  };

  for (const [emp, cMap] of mass.compByEmp) {
    const app = appByCode.get(emp);
    if (!app) {
      bump("comp_emp_not_in_preview");
      continue;
    }
    for (const code of COMP_CODES) {
      const massAmt = money(cMap[code]);
      if (massAmt <= TOL) continue;
      const appAmt = money(app.bySrc[code]);
      // ARP may only show in receivable total; also check register column
      let effective = appAmt;
      if (code === "ARP" && effective <= TOL) {
        effective = money(app.reg.attendanceRecognitionProgram);
      }
      if (Math.abs(effective - massAmt) > TOL) {
        gaps.push({
          emp,
          name: app.name,
          kind: "COMP",
          code,
          mass: massAmt,
          app: effective,
          delta: effective - massAmt,
          bandRecv: app.receivableOnly,
          sources: app.sourceList.filter((s) => String(s.code || "").toUpperCase() === code || (code === "ARP" && /attendance recognition/i.test(s.name || ""))),
        });
        bump(`GAP_COMP_${code}`);
      } else {
        ok.push({ emp, code, mass: massAmt });
        bump(`OK_COMP_${code}`);
      }
    }
  }

  for (const [emp, dMap] of mass.dedByEmp) {
    const app = appByCode.get(emp);
    if (!app) {
      bump("ded_emp_not_in_preview");
      continue;
    }
    for (const code of DED_CODES) {
      const massAmt = money(dMap[code]);
      if (massAmt <= TOL) continue;
      const appAmt = money(app.bySrc[code]);
      if (Math.abs(appAmt - massAmt) > TOL) {
        gaps.push({
          emp,
          name: app.name,
          kind: "DED",
          code,
          mass: massAmt,
          app: appAmt,
          delta: appAmt - massAmt,
          loanDeductions: app.loanDeductions,
          sources: app.sourceList.filter(
            (s) =>
              String(s.code || "").toUpperCase() === code ||
              (code === "RCBCLN" && /rcbc/i.test(s.name || "")) ||
              (code === "HDMFSALLN" && /hdmf salary/i.test(s.name || "")) ||
              (code === "SSSSALLN" && /sss salary/i.test(s.name || "")),
          ),
        });
        bump(`GAP_DED_${code}`);
      } else {
        ok.push({ emp, code, mass: massAmt });
        bump(`OK_DED_${code}`);
      }
    }
  }

  return { gaps, ok, stats };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const mass = loadMass();
  fs.writeFileSync(
    path.join(OUT, "mass-code-counts.json"),
    JSON.stringify(
      { comp: mass.compCodeCounts, ded: mass.dedCodeCounts },
      null,
      2,
    ),
  );

  console.log("login + preview…");
  const token = await login();
  const appByCode = await fetchAllPreview(token);
  const { gaps, ok, stats } = mainCompare(mass, appByCode);

  const byCode = {};
  for (const g of gaps) {
    const k = `${g.kind}:${g.code}`;
    byCode[k] = byCode[k] || { n: 0, sumMass: 0, sumApp: 0, samples: [] };
    byCode[k].n += 1;
    byCode[k].sumMass += g.mass;
    byCode[k].sumApp += g.app;
    if (byCode[k].samples.length < 8) byCode[k].samples.push(g);
  }

  const uniqueEmps = new Set(gaps.map((g) => g.emp)).size;
  const report = {
    generatedAt: new Date().toISOString(),
    periodId: PERIOD_ID,
    appPreviewCount: appByCode.size,
    massCompEmps: mass.compByEmp.size,
    massDedEmps: mass.dedByEmp.size,
    gapRows: gaps.length,
    uniqueEmpsWithGaps: uniqueEmps,
    okRows: ok.length,
    stats,
    byCode,
    note:
      "Gaps = mass upload amount present for this cut but not in live payroll source details (or not equal). Missing-from-mass is out of scope.",
  };

  fs.writeFileSync(path.join(OUT, "apply-gaps.json"), JSON.stringify(gaps, null, 2));
  fs.writeFileSync(path.join(OUT, "apply-gap-summary.json"), JSON.stringify(report, null, 2));

  // Markdown
  const md = [];
  md.push("# Mass-upload present but not applied — Jun 26–Jul 10");
  md.push("");
  md.push(`Generated: ${report.generatedAt}`);
  md.push(`Unique employees with apply-gaps: **${uniqueEmps}** (${gaps.length} code rows)`);
  md.push("");
  md.push("| Kind:Code | Gap count | Sum mass | Sum app |");
  md.push("|---|---:|---:|---:|");
  for (const [k, v] of Object.entries(byCode).sort((a, b) => b[1].n - a[1].n)) {
    md.push(`| ${k} | ${v.n} | ${v.sumMass.toFixed(2)} | ${v.sumApp.toFixed(2)} |`);
  }
  md.push("");
  md.push("## Stats");
  md.push("```json");
  md.push(JSON.stringify(stats, null, 2));
  md.push("```");
  fs.writeFileSync(path.join(OUT, "REPORT.md"), md.join("\n"));

  console.log(JSON.stringify({ gapRows: gaps.length, uniqueEmps, byCode: Object.fromEntries(Object.entries(byCode).map(([k, v]) => [k, v.n])), stats }, null, 2));
  console.log("OUT", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
