import "dotenv/config";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");
const workbooks = [
  path.join(repoRoot, "docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx"),
  path.join(repoRoot, "docs/new-cutoff/june-26-10/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx"),
  path.join(repoRoot, "docs/new-cutoff/july-11-25/rptOvertimeDetails - July 11 to 25, 2026.xlsx"),
];
// also search Bandai Payroll folder
import fs from "node:fs";
const bandai = path.join(repoRoot, "docs", "Bandai Payroll");
if (fs.existsSync(bandai)) {
  for (const f of fs.readdirSync(bandai)) {
    if (/overtime|rpt/i.test(f) && f.endsWith(".xlsx")) workbooks.push(path.join(bandai, f));
  }
}

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

function parseOt(filePath: string) {
  if (!fs.existsSync(filePath)) return [];
  const wb = XLSX.readFile(filePath, { cellDates: true, dense: true, raw: false, password: "9090" });
  const sheetName = wb.SheetNames.find((n) => /overtime/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: "", raw: false, blankrows: false }) as unknown[][];
  let current = { name: "", employeeNo: "" };
  const out: any[] = [];
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i] || [];
    if (text(row[2])) current.name = text(row[2]);
    if (/^\d{3,6}$/.test(text(row[3]))) current.employeeNo = text(row[3]).padStart(5, "0");
    const directDate = dateKey(row[4]);
    const shiftedDate = directDate ? "" : dateKey(row[0]);
    const date = directDate || shiftedDate;
    const shift = shiftedDate ? 4 : 0;
    if (!date || !current.employeeNo) continue;
    const regOt = numberValue(row[7 - shift]);
    const spclOt = numberValue(row[10 - shift]);
    const rholOt = numberValue(row[13 - shift]);
    const rdOt = numberValue(row[15 - shift]);
    const totalOt = regOt + spclOt + rholOt + rdOt;
    if (current.employeeNo === "01474" || /lowela|baluncio/i.test(current.name)) {
      out.push({
        file: path.basename(filePath),
        row: i + 1,
        name: current.name,
        employeeNo: current.employeeNo,
        date,
        regOt, spclOt, rholOt, rdOt, totalOt,
        regNd: numberValue(row[8 - shift]),
        spcl: numberValue(row[9 - shift]),
        rhol: numberValue(row[11 - shift]),
        rd: numberValue(row[14 - shift]),
        raw: row.slice(0, 18).map(text),
      });
    }
  }
  return out;
}

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { employeeId: "01474", isDeleted: false },
    select: { id: true, employeeId: true, person: { select: { personalInfo: true } } },
  });
  console.log("EMP", JSON.stringify(emp));

  const sheets = await prisma.timesheet.findMany({
    where: { employeeId: emp?.id, isDeleted: false },
    select: {
      id: true, status: true, totalOvertimeHours: true, code: true,
      payrollPeriod: { select: { code: true, startDate: true, endDate: true } },
      timesheetlines: {
        where: { isDeleted: false, isEffective: true },
        select: {
          date: true, overtimeHours: true, hoursWorked: true, regularHours: true,
          status: true, primaryMarker: true, metadata: true,
        },
        orderBy: { date: "asc" },
      },
    },
  });
  for (const ts of sheets) {
    const otLines = ts.timesheetlines.filter((l) => {
      const oh = String(l.overtimeHours || "");
      return oh && oh !== "0:00" && oh !== "0";
    });
    console.log(JSON.stringify({
      period: ts.payrollPeriod?.code,
      status: ts.status,
      totalOT: ts.totalOvertimeHours,
      otLineCount: otLines.length,
      otLines: otLines.map((l) => ({
        date: l.date.toISOString().slice(0,10),
        ot: l.overtimeHours,
        worked: l.hoursWorked,
        reg: l.regularHours,
        status: l.status,
        marker: l.primaryMarker,
        buckets: (l.metadata as any)?.bandaiPayrollSourceRepair?.approvedBuckets || null,
        source: (l.metadata as any)?.bandaiPayrollSourceRepair?.source || null,
      })),
    }, null, 2));
  }

  const fileHits: any[] = [];
  for (const f of workbooks) {
    try { fileHits.push(...parseOt(f)); } catch (e: any) { console.log("parse fail", f, e.message); }
  }
  console.log("FILE_HITS", JSON.stringify(fileHits, null, 2));
  const sumByFile: Record<string, number> = {};
  for (const h of fileHits) {
    sumByFile[h.file] = (sumByFile[h.file] || 0) + h.totalOt;
  }
  console.log("FILE_OT_SUM_HOURS", sumByFile);
}
main().finally(() => prisma.$disconnect());
