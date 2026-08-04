import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");
const workbook = path.join(repoRoot, "docs/new-cutoff/june-26-10/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx");
const EMP = "01713";
const PERIOD = "PP-20260626-20260711";

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
const hoursToTime = (h: number) => {
  const m = Math.max(0, Math.round(h * 60));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

function parseFile() {
  const wb = XLSX.readFile(workbook, { cellDates: true, dense: true, raw: false, password: "9090" });
  const sheetName = wb.SheetNames.find((n) => /overtime/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: false, blankrows: false }) as unknown[][];
  let current = { name: "", employeeNo: "" };
  const byDate = new Map<string, any>();
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i] || [];
    if (text(row[2])) current.name = text(row[2]);
    if (/^\d{3,6}$/.test(text(row[3]))) current.employeeNo = text(row[3]).padStart(5, "0");
    const directDate = dateKey(row[4]);
    const shiftedDate = directDate ? "" : dateKey(row[0]);
    const date = directDate || shiftedDate;
    const shift = shiftedDate ? 4 : 0;
    if (!date || current.employeeNo !== EMP) continue;
    const rec = {
      date,
      name: current.name,
      regularDays: numberValue(row[6 - shift]),
      regOtHrs: numberValue(row[7 - shift]),
      regNdHrs: numberValue(row[8 - shift]),
      spclHrs: numberValue(row[9 - shift]),
      spclOtHrs: numberValue(row[10 - shift]),
      rholHrs: numberValue(row[11 - shift]),
      rholOtHrs: numberValue(row[13 - shift]),
      rdHrs: numberValue(row[14 - shift]),
      rdOtHrs: numberValue(row[15 - shift]),
    };
    rec.mappedLineOt = rec.regOtHrs + rec.spclOtHrs + rec.rholOtHrs + rec.rdOtHrs;
    byDate.set(date, rec);
  }
  return byDate;
}

async function main() {
  const fileByDate = parseFile();
  const fileRows = Array.from(fileByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  const fileOtSum = fileRows.reduce((s, r) => s + r.mappedLineOt, 0);
  const fileRegOtSum = fileRows.reduce((s, r) => s + r.regOtHrs, 0);
  const fileNdSum = fileRows.reduce((s, r) => s + r.regNdHrs, 0);
  const fileRdSum = fileRows.reduce((s, r) => s + r.rdHrs, 0);

  const emp = await prisma.employee.findFirst({ where: { employeeId: EMP, isDeleted: false } });
  const period = await prisma.payrollPeriod.findFirst({ where: { code: PERIOD, isDeleted: false } });
  if (!emp || !period) throw new Error("emp/period missing");

  const ts = await prisma.timesheet.findFirst({
    where: { employeeId: emp.id, payrollPeriodId: period.id, isDeleted: false },
    select: {
      id: true, status: true, totalOvertimeHours: true, totalRegularHours: true, totalHoursWorked: true,
      timesheetlines: {
        where: { isDeleted: false, isEffective: true },
        orderBy: { date: "asc" },
        select: {
          date: true, overtimeHours: true, regularHours: true, hoursWorked: true,
          status: true, primaryMarker: true, metadata: true,
        },
      },
    },
  });

  const comparison: any[] = [];
  let match = 0, mismatch = 0, missingLine = 0, extraLine = 0;
  const lineByDate = new Map(
    (ts?.timesheetlines || []).map((l) => [l.date.toISOString().slice(0, 10), l]),
  );

  for (const fr of fileRows) {
    const line = lineByDate.get(fr.date);
    const expectedMin = Math.round(fr.mappedLineOt * 60);
    const actualMin = timeToMin(line?.overtimeHours);
    const buckets = (line?.metadata as any)?.bandaiPayrollSourceRepair?.approvedBuckets || null;
    const hasRepair = Boolean((line?.metadata as any)?.bandaiPayrollSourceRepair);
    const ok = line && actualMin === expectedMin && Math.abs((buckets?.regOtHrs ?? fr.regOtHrs) - fr.regOtHrs) < 0.001;
    if (!line) missingLine++;
    else if (actualMin === expectedMin) match++;
    else mismatch++;
    comparison.push({
      date: fr.date,
      file: { regOt: fr.regOtHrs, nd: fr.regNdHrs, rd: fr.rdHrs, mappedOt: fr.mappedLineOt, regDays: fr.regularDays },
      line: line
        ? {
            ot: line.overtimeHours,
            reg: line.regularHours,
            worked: line.hoursWorked,
            status: line.status,
            marker: line.primaryMarker,
            hasRepair,
            buckets,
            actualOtMin: actualMin,
            expectedOtMin: expectedMin,
            match: actualMin === expectedMin,
          }
        : null,
    });
  }

  // lines with OT not in file
  for (const [date, line] of lineByDate) {
    if (!fileByDate.has(date) && timeToMin(line.overtimeHours) > 0) {
      extraLine++;
      comparison.push({
        date,
        file: null,
        line: { ot: line.overtimeHours, hasRepair: Boolean((line.metadata as any)?.bandaiPayrollSourceRepair) },
        note: "DB OT without file row",
      });
    }
  }

  const dbOtMin = (ts?.timesheetlines || []).reduce((s, l) => s + timeToMin(l.overtimeHours), 0);
  const reportOtMin = (ts?.timesheetlines || [])
    .filter((l) => (l.metadata as any)?.bandaiPayrollSourceRepair)
    .reduce((s, l) => s + timeToMin(l.overtimeHours), 0);

  console.log(JSON.stringify({
    employee: { code: EMP, name: fileRows[0]?.name || "Aguila, Felix R." },
    period: PERIOD,
    workbook: path.basename(workbook),
    fileTotals: {
      mappedLineOtHours: fileOtSum,
      regOtHrs: fileRegOtSum,
      regNdHrs: fileNdSum,
      rdHrs: fileRdSum,
      expectedFromScreenshot: { regOt: 27, nd: 25, rd: 8, regularDays: 12 },
    },
    timesheet: {
      id: ts?.id,
      status: ts?.status,
      totalOvertimeHours: ts?.totalOvertimeHours,
      totalRegularHours: ts?.totalRegularHours,
      dbOtHours: hoursToTime(dbOtMin / 60),
      reportBackedOtHours: hoursToTime(reportOtMin / 60),
      lineCount: ts?.timesheetlines?.length || 0,
    },
    score: { match, mismatch, missingLine, extraLine, fileDays: fileRows.length },
    comparison,
  }, null, 2));
}
main().finally(() => prisma.$disconnect());
