import "dotenv/config";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");
const packs = [
  { period: "PP-20260611-20260626", file: "docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx", sample: 25 },
  { period: "PP-20260626-20260711", file: "docs/new-cutoff/june-26-10/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx", sample: 25 },
];

const text = (v: unknown) => String(v ?? "").trim();
const numberValue = (v: unknown) => {
  const p = Number(text(v).replace(/,/g, ""));
  return Number.isFinite(p) ? p : 0;
};
const dateKey = (v: unknown) => {
  const raw = text(v);
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0,10);
};
const timeToMin = (v: unknown) => {
  const raw = text(v);
  if (!raw || raw === "0" || raw === "0:00") return 0;
  if (raw.includes(":")) {
    const [h, m] = raw.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 60) : 0;
};

function parseFile(filePath: string) {
  const wb = XLSX.readFile(path.join(repoRoot, filePath), { cellDates: true, dense: true, raw: false, password: "9090" });
  const sheetName = wb.SheetNames.find((n) => /overtime/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: false, blankrows: false }) as unknown[][];
  let current = { name: "", employeeNo: "" };
  const byEmpDate = new Map<string, number>(); // emp:date -> mapped ot hours
  const empTotals = new Map<string, number>();
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i] || [];
    if (text(row[2])) current.name = text(row[2]);
    if (/^\d{3,6}$/.test(text(row[3]))) current.employeeNo = text(row[3]).padStart(5, "0");
    const directDate = dateKey(row[4]);
    const shiftedDate = directDate ? "" : dateKey(row[0]);
    const date = directDate || shiftedDate;
    const shift = shiftedDate ? 4 : 0;
    if (!date || !current.employeeNo) continue;
    const ot = numberValue(row[7-shift]) + numberValue(row[10-shift]) + numberValue(row[13-shift]) + numberValue(row[15-shift]);
    const key = `${current.employeeNo}:${date}`;
    byEmpDate.set(key, ot);
    empTotals.set(current.employeeNo, (empTotals.get(current.employeeNo) || 0) + ot);
  }
  return { byEmpDate, empTotals };
}

async function main() {
  const out: any[] = [];
  for (const pack of packs) {
    const period = await prisma.payrollPeriod.findFirst({ where: { code: pack.period } });
    if (!period) { out.push({ period: pack.period, missing: true }); continue; }
    const { byEmpDate, empTotals } = parseFile(pack.file);
    // top employees by file OT
    const top = Array.from(empTotals.entries()).filter(([,h]) => h > 0).sort((a,b) => b[1]-a[1]).slice(0, pack.sample);
    let dayMatch = 0, dayMismatch = 0, dayMissing = 0, empPerfect = 0, empFail = 0;
    const fails: any[] = [];
    for (const [empCode, fileTotalH] of top) {
      const emp = await prisma.employee.findFirst({ where: { employeeId: empCode }, select: { id: true } });
      if (!emp) { empFail++; fails.push({ empCode, reason: "no_employee" }); continue; }
      const ts = await prisma.timesheet.findFirst({
        where: { employeeId: emp.id, payrollPeriodId: period.id, isDeleted: false },
        select: {
          totalOvertimeHours: true,
          timesheetlines: {
            where: { isDeleted: false, isEffective: true },
            select: { date: true, overtimeHours: true, metadata: true },
          },
        },
      });
      if (!ts) { empFail++; fails.push({ empCode, reason: "no_timesheet" }); continue; }
      let empDayOk = true;
      let dbOtMin = 0;
      const lineMap = new Map(ts.timesheetlines.map((l) => [l.date.toISOString().slice(0,10), l]));
      for (const [key, otH] of byEmpDate) {
        if (!key.startsWith(empCode + ":")) continue;
        const date = key.slice(empCode.length + 1);
        const line = lineMap.get(date);
        const expected = Math.round(otH * 60);
        const actual = timeToMin(line?.overtimeHours);
        const hasRepair = Boolean((line?.metadata as any)?.bandaiPayrollSourceRepair);
        if (!line) { dayMissing++; empDayOk = false; }
        else if (actual === expected && (expected === 0 || hasRepair || expected === 0)) {
          // allow 0 OT days without repair
          if (expected > 0 && !hasRepair) { dayMismatch++; empDayOk = false; }
          else { dayMatch++; dbOtMin += actual; }
        } else if (actual === expected) { dayMatch++; dbOtMin += actual; }
        else { dayMismatch++; empDayOk = false; fails.push({ empCode, date, expected, actual, hasRepair }); }
      }
      const fileMin = Math.round(fileTotalH * 60);
      // recompute db report ot
      const reportMin = ts.timesheetlines
        .filter((l) => (l.metadata as any)?.bandaiPayrollSourceRepair)
        .reduce((s, l) => s + timeToMin(l.overtimeHours), 0);
      if (reportMin === fileMin && empDayOk) empPerfect++;
      else {
        empFail++;
        if (!fails.find((f) => f.empCode === empCode && f.date)) {
          fails.push({ empCode, reason: "total_mismatch", fileMin, reportMin, totalField: ts.totalOvertimeHours });
        }
      }
    }
    out.push({
      period: pack.period,
      sampleEmployees: top.length,
      dayMatch, dayMismatch, dayMissing,
      empPerfect, empFail,
      failSamples: fails.slice(0, 12),
    });
  }
  console.log(JSON.stringify(out, null, 2));
}
main().finally(() => prisma.$disconnect());
