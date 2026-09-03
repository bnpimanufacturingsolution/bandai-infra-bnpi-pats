import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";
import { getPayrollPeriodOtReadiness } from "../helper/payroll-ot-readiness.helper";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(repoRoot, ".runtime", `ot-truth-probe-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const packs = [
  {
    periodCode: "PP-20260611-20260626",
    label: "June 11-25",
    workbook: path.join(repoRoot, "docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx"),
  },
  {
    periodCode: "PP-20260626-20260711",
    label: "June 26 - July 10",
    workbook: path.join(repoRoot, "docs/new-cutoff/june-26-10/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx"),
  },
];

const text = (v: unknown) => String(v ?? "").trim();
const numberValue = (v: unknown) => {
  const p = Number(text(v).replace(/,/g, ""));
  return Number.isFinite(p) ? p : 0;
};
const dateKey = (v: unknown) => {
  const raw = text(v);
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const timeToMin = (v: unknown) => {
  const raw = text(v);
  if (!raw || raw === "0" || raw === "0:00" || raw === "00:00") return 0;
  if (raw.includes(":")) {
    const [h, m] = raw.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 60) : 0;
};
const minToHours = (m: number) => Math.round((m / 60) * 100) / 100;
const hoursToHhMm = (hours: number) => {
  const m = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

type FileDay = {
  date: string;
  regOt: number;
  regNd: number;
  spcl: number;
  spclOt: number;
  rhol: number;
  rholOt: number;
  rd: number;
  rdOt: number;
  mappedLineOt: number;
};

function parseWorkbook(filePath: string) {
  const wb = XLSX.readFile(filePath, { cellDates: true, dense: true, raw: false, password: "9090" });
  const sheetName = wb.SheetNames.find((n) => /overtime/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  }) as unknown[][];
  let current = { name: "", employeeNo: "", department: "" };
  const byEmp = new Map<
    string,
    { name: string; department: string; days: Map<string, FileDay>; totalMappedOt: number; rowCount: number }
  >();
  let dataRows = 0;
  for (let i = 6; i < rows.length; i++) {
    const row = rows[i] || [];
    if (text(row[0]) && !/^\d{1,2}\//.test(text(row[0])) && !dateKey(row[0])) {
      // department headers sometimes in col 0
      if (!dateKey(row[4]) && text(row[0])) current.department = text(row[0]);
    }
    if (text(row[2])) current.name = text(row[2]);
    if (/^\d{3,6}$/.test(text(row[3]))) current.employeeNo = text(row[3]).padStart(5, "0");
    const directDate = dateKey(row[4]);
    const shiftedDate = directDate ? "" : dateKey(row[0]);
    const date = directDate || shiftedDate;
    const shift = shiftedDate ? 4 : 0;
    if (!date || !current.employeeNo) continue;
    dataRows += 1;
    const day: FileDay = {
      date,
      regOt: numberValue(row[7 - shift]),
      regNd: numberValue(row[8 - shift]),
      spcl: numberValue(row[9 - shift]),
      spclOt: numberValue(row[10 - shift]),
      rhol: numberValue(row[11 - shift]),
      rholOt: numberValue(row[13 - shift]),
      rd: numberValue(row[14 - shift]),
      rdOt: numberValue(row[15 - shift]),
      mappedLineOt: 0,
    };
    day.mappedLineOt = day.regOt + day.spclOt + day.rholOt + day.rdOt;
    if (!byEmp.has(current.employeeNo)) {
      byEmp.set(current.employeeNo, {
        name: current.name,
        department: current.department,
        days: new Map(),
        totalMappedOt: 0,
        rowCount: 0,
      });
    }
    const emp = byEmp.get(current.employeeNo)!;
    emp.name = current.name || emp.name;
    emp.department = current.department || emp.department;
    emp.days.set(date, day);
    emp.totalMappedOt += day.mappedLineOt;
    emp.rowCount += 1;
  }
  return { byEmp, dataRows, sheetName };
}

async function probePack(pack: (typeof packs)[0]) {
  const period = await prisma.payrollPeriod.findFirst({
    where: { code: pack.periodCode, isDeleted: false },
  });
  if (!period) return { pack, missingPeriod: true };

  const parsed = parseWorkbook(pack.workbook);
  const employeesWithMappedOt = Array.from(parsed.byEmp.entries()).filter(([, e]) => e.totalMappedOt > 0);
  const filePeopleWithOt = employeesWithMappedOt.length;
  const fileTotalMappedOtHours = employeesWithMappedOt.reduce((s, [, e]) => s + e.totalMappedOt, 0);
  const fileDayRowsWithOt = employeesWithMappedOt.reduce(
    (s, [, e]) => s + Array.from(e.days.values()).filter((d) => d.mappedLineOt > 0).length,
    0,
  );

  // DB: all timesheets + approved-source OT lines for period
  const tsStatus = await prisma.timesheet.groupBy({
    by: ["status"],
    where: { payrollPeriodId: period.id, isDeleted: false },
    _count: { _all: true },
  });

  const dbApprovedOt = await prisma.$queryRaw<
    Array<{
      employeeCode: string;
      timesheetId: string;
      status: string;
      lineOtMinutes: number | bigint;
      lineDaysWithOt: number | bigint;
    }>
  >`
    SELECT
      e."employeeId" AS "employeeCode",
      t.id AS "timesheetId",
      t.status AS status,
      COALESCE(SUM(
        CASE
          WHEN l."overtimeHours" LIKE '%:%' THEN
            COALESCE(NULLIF(split_part(l."overtimeHours", ':', 1), '')::int, 0) * 60
            + COALESCE(NULLIF(split_part(l."overtimeHours", ':', 2), '')::int, 0)
          ELSE
            ROUND(COALESCE(NULLIF(regexp_replace(l."overtimeHours", '[^0-9.\\-]', '', 'g'), '')::numeric, 0) * 60)::int
        END
      ), 0)::int AS "lineOtMinutes",
      COUNT(*) FILTER (
        WHERE l."overtimeHours" IS NOT NULL
          AND btrim(l."overtimeHours") NOT IN ('', '0', '0:00', '00:00')
      )::int AS "lineDaysWithOt"
    FROM timesheet_lines l
    JOIN timesheets t ON t.id = l."timesheetId"
    JOIN employees e ON e.id = t."employeeId"
    WHERE l."payrollPeriodId" = ${period.id}
      AND l."organizationId" = ${period.organizationId}
      AND l."isDeleted" = false
      AND l."isEffective" = true
      AND t."isDeleted" = false
      AND (l.metadata->'bandaiPayrollSourceRepair') IS NOT NULL
      AND jsonb_typeof(l.metadata->'bandaiPayrollSourceRepair') = 'object'
      AND COALESCE(l.metadata->'bandaiPayrollSourceRepair'->>'source', '') NOT ILIKE '%DEMO%'
      AND l."overtimeHours" IS NOT NULL
      AND btrim(l."overtimeHours") NOT IN ('', '0', '0:00', '00:00')
    GROUP BY e."employeeId", t.id, t.status
    HAVING COALESCE(SUM(
      CASE
        WHEN l."overtimeHours" LIKE '%:%' THEN
          COALESCE(NULLIF(split_part(l."overtimeHours", ':', 1), '')::int, 0) * 60
          + COALESCE(NULLIF(split_part(l."overtimeHours", ':', 2), '')::int, 0)
        ELSE
          ROUND(COALESCE(NULLIF(regexp_replace(l."overtimeHours", '[^0-9.\\-]', '', 'g'), '')::numeric, 0) * 60)::int
      END
    ), 0) > 0
  `;

  const dbByEmp = new Map(dbApprovedOt.map((r) => [r.employeeCode, r]));
  const dbPeople = dbApprovedOt.length;
  const dbTotalMin = dbApprovedOt.reduce((s, r) => s + Number(r.lineOtMinutes || 0), 0);

  // Per-employee file vs DB tally (all file people with OT)
  let empPerfect = 0;
  let empMismatch = 0;
  let empMissingInDb = 0;
  let empExtraInDb = 0;
  let dayMatch = 0;
  let dayMismatch = 0;
  let dayMissingLine = 0;
  const mismatches: any[] = [];
  const perEmployee: any[] = [];

  for (const [empCode, fileEmp] of employeesWithMappedOt) {
    const db = dbByEmp.get(empCode);
    const fileMin = Math.round(fileEmp.totalMappedOt * 60);
    if (!db) {
      empMissingInDb += 1;
      mismatches.push({ empCode, name: fileEmp.name, reason: "file_ot_missing_in_db", fileHours: fileEmp.totalMappedOt });
      perEmployee.push({
        employeeCode: empCode,
        name: fileEmp.name,
        status: "missing_in_db",
        fileOtHours: minToHours(fileMin),
        dbOtHours: 0,
        timesheetStatus: null,
        fileDaysWithOt: Array.from(fileEmp.days.values()).filter((d) => d.mappedLineOt > 0).length,
        match: false,
      });
      continue;
    }
    const dbMin = Number(db.lineOtMinutes || 0);
    // day-level check
    const emp = await prisma.employee.findFirst({ where: { employeeId: empCode }, select: { id: true } });
    const lines = emp
      ? await prisma.timesheetline.findMany({
          where: {
            employeeId: emp.id,
            payrollPeriodId: period.id,
            isDeleted: false,
            isEffective: true,
          },
          select: { date: true, overtimeHours: true, metadata: true },
        })
      : [];
    const lineByDate = new Map(lines.map((l) => [l.date.toISOString().slice(0, 10), l]));
    let empDayOk = true;
    for (const [date, day] of fileEmp.days) {
      if (day.mappedLineOt <= 0) continue;
      const line = lineByDate.get(date);
      const expected = Math.round(day.mappedLineOt * 60);
      const actual = timeToMin(line?.overtimeHours);
      const hasRepair = Boolean((line?.metadata as any)?.bandaiPayrollSourceRepair);
      if (!line) {
        dayMissingLine += 1;
        empDayOk = false;
      } else if (actual === expected && hasRepair) {
        dayMatch += 1;
      } else {
        dayMismatch += 1;
        empDayOk = false;
        if (mismatches.length < 40) {
          mismatches.push({
            empCode,
            date,
            expectedMin: expected,
            actualMin: actual,
            hasRepair,
            file: day,
          });
        }
      }
    }
    const totalOk = dbMin === fileMin && empDayOk;
    if (totalOk) empPerfect += 1;
    else {
      empMismatch += 1;
      if (mismatches.length < 40) {
        mismatches.push({
          empCode,
          name: fileEmp.name,
          reason: "total_or_day_mismatch",
          fileHours: minToHours(fileMin),
          dbHours: minToHours(dbMin),
          timesheetStatus: db.status,
        });
      }
    }
    perEmployee.push({
      employeeCode: empCode,
      name: fileEmp.name,
      department: fileEmp.department,
      status: totalOk ? "match" : "mismatch",
      fileOtHours: minToHours(fileMin),
      fileOtHhMm: hoursToHhMm(fileMin / 60),
      dbOtHours: minToHours(dbMin),
      dbOtHhMm: hoursToHhMm(dbMin / 60),
      timesheetStatus: db.status,
      timesheetId: db.timesheetId,
      fileDaysWithOt: Array.from(fileEmp.days.values()).filter((d) => d.mappedLineOt > 0).length,
      dbDaysWithOt: Number(db.lineDaysWithOt || 0),
      match: totalOk,
    });
  }

  // DB people not in file OT set
  for (const row of dbApprovedOt) {
    if (!parsed.byEmp.has(row.employeeCode) || (parsed.byEmp.get(row.employeeCode)?.totalMappedOt || 0) <= 0) {
      empExtraInDb += 1;
    }
  }

  // Readiness API (same as Run Payroll accordion source)
  const readiness = await getPayrollPeriodOtReadiness(prisma, {
    payrollPeriodId: period.id,
    organizationId: period.organizationId,
    page: 1,
    limit: 5,
    onlyWithOt: true,
  });

  // Spot Felix if this pack is june-26
  let felix: any = null;
  if (pack.periodCode === "PP-20260626-20260711") {
    const f = perEmployee.find((e) => e.employeeCode === "01713");
    const fileEmp = parsed.byEmp.get("01713");
    felix = {
      inPerEmployee: f || null,
      fileTotalMappedOt: fileEmp?.totalMappedOt ?? null,
      fileDayRows: fileEmp ? Array.from(fileEmp.days.values()).map((d) => ({
        date: d.date,
        regOt: d.regOt,
        regNd: d.regNd,
        rd: d.rd,
        mappedLineOt: d.mappedLineOt,
      })) : [],
    };
  }

  // status breakdown for matched people
  const statusBuckets: Record<string, number> = {};
  for (const e of perEmployee) {
    const k = e.timesheetStatus || "NONE";
    statusBuckets[k] = (statusBuckets[k] || 0) + 1;
  }

  const report = {
    pack: {
      label: pack.label,
      periodCode: pack.periodCode,
      periodId: period.id,
      workbook: pack.workbook,
      workbookExists: fs.existsSync(pack.workbook),
    },
    mappingRule: {
      lineOvertimeHours:
        "regOtHrs + spclOtHrs + rholOtHrs + rdOtHrs (NOT regNdHrs, NOT rdHrs premium alone)",
      approvedSourceGate: "metadata.bandaiPayrollSourceRepair object present, not DEMO",
      runPayrollPanel: "GET /api/payrollperiod/:id/ot-readiness?onlyWithOt=true uses approved-source OT only",
    },
    file: {
      sheetName: parsed.sheetName,
      dataRowsParsed: parsed.dataRows,
      uniqueEmployees: parsed.byEmp.size,
      peopleWithMappedOt: filePeopleWithOt,
      dayRowsWithMappedOt: fileDayRowsWithOt,
      totalMappedOtHours: Math.round(fileTotalMappedOtHours * 100) / 100,
    },
    database: {
      timesheetStatusCounts: tsStatus.map((s) => ({ status: s.status, count: s._count._all })),
      peopleWithApprovedSourceOt: dbPeople,
      totalApprovedSourceOtHours: minToHours(dbTotalMin),
    },
    runPayrollOtReadiness: {
      timesheetsTotal: readiness.summary.timesheetsTotal,
      timesheetsApproved: readiness.summary.timesheetsApproved,
      peopleWithLineOt: readiness.summary.peopleWithLineOt,
      peopleWithApprovedOt: readiness.summary.peopleWithApprovedOt,
      peopleWithPendingOtApproval: readiness.summary.peopleWithPendingOtApproval,
      totalLineOtHours: readiness.summary.totalLineOtHours,
      totalApprovedLineOtHours: readiness.summary.totalApprovedLineOtHours,
      queryMeta: readiness.queryMeta,
      sampleTop5: readiness.people.slice(0, 5).map((p) => ({
        employeeCode: p.employeeCode,
        name: p.name,
        lineOtHours: p.lineOtHours,
        lineDaysWithOt: p.lineDaysWithOt,
        timesheetStatus: p.timesheetStatus,
        approvalLabel: p.approvalLabel,
        blockerClass: p.blockerClass,
      })),
    },
    tally: {
      filePeopleWithOt,
      dbPeopleWithApprovedSourceOt: dbPeople,
      readinessPeopleWithApprovedOt: readiness.summary.peopleWithApprovedOt,
      fileTotalMappedOtHours: Math.round(fileTotalMappedOtHours * 100) / 100,
      dbTotalApprovedSourceOtHours: minToHours(dbTotalMin),
      readinessTotalApprovedLineOtHours: readiness.summary.totalApprovedLineOtHours,
      peopleCountsMatch:
        filePeopleWithOt === dbPeople &&
        dbPeople === readiness.summary.peopleWithApprovedOt,
      hoursMatchFileVsDb:
        Math.abs(fileTotalMappedOtHours - minToHours(dbTotalMin)) < 0.05,
      hoursMatchDbVsReadiness:
        Math.abs(minToHours(dbTotalMin) - readiness.summary.totalApprovedLineOtHours) < 0.05,
      empPerfect,
      empMismatch,
      empMissingInDb,
      empExtraInDb,
      dayMatch,
      dayMismatch,
      dayMissingLine,
      timesheetStatusAmongFileOtPeople: statusBuckets,
    },
    felixSpotCheck: felix,
    mismatchSamples: mismatches.slice(0, 25),
    top10FileOt: perEmployee
      .slice()
      .sort((a, b) => b.fileOtHours - a.fileOtHours)
      .slice(0, 10),
    perEmployeeCount: perEmployee.length,
  };

  fs.writeFileSync(path.join(outDir, `${pack.periodCode}-summary.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, `${pack.periodCode}-per-employee.json`), JSON.stringify(perEmployee, null, 2));
  return report;
}

async function main() {
  const reports = [];
  for (const pack of packs) {
    console.log("Probing", pack.periodCode, "...");
    reports.push(await probePack(pack));
  }
  const index = {
    stamp,
    outDir,
    mappingRule:
      "Timesheetline.overtimeHours from approved OT workbook = RegOT + SpclOT + RHolOT + RDOT (excludes ND and plain RD premium hours).",
    reports: reports.map((r: any) => ({
      period: r.pack?.periodCode || r.pack,
      filePeople: r.file?.peopleWithMappedOt,
      dbPeople: r.database?.peopleWithApprovedSourceOt,
      readinessPeople: r.runPayrollOtReadiness?.peopleWithApprovedOt,
      fileHours: r.file?.totalMappedOtHours,
      dbHours: r.database?.totalApprovedSourceOtHours,
      readinessHours: r.runPayrollOtReadiness?.totalApprovedLineOtHours,
      peopleCountsMatch: r.tally?.peopleCountsMatch,
      hoursMatchFileVsDb: r.tally?.hoursMatchFileVsDb,
      hoursMatchDbVsReadiness: r.tally?.hoursMatchDbVsReadiness,
      empPerfect: r.tally?.empPerfect,
      empMismatch: r.tally?.empMismatch,
      dayMatch: r.tally?.dayMatch,
      dayMismatch: r.tally?.dayMismatch,
    })),
  };
  fs.writeFileSync(path.join(outDir, "INDEX.json"), JSON.stringify(index, null, 2));
  console.log(JSON.stringify(index, null, 2));
  console.log("OUT_DIR", outDir);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
