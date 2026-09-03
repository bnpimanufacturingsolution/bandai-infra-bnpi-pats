/**
 * FAST OT truth probe — single-pass Excel parse + bulk SQL (no N+1).
 * Pattern: parse once → Map(emp:date) → one SQL dump of approved-source lines → join in memory.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import * as XLSX from "xlsx";
import { PrismaClient } from "../generated/prisma";

const prisma = new PrismaClient();
const repoRoot = path.resolve(__dirname, "..", "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(repoRoot, ".runtime", `ot-fast-probe-${stamp}`);
fs.mkdirSync(outDir, { recursive: true });

const PACKS = [
  {
    periodCode: "PP-20260611-20260626",
    label: "June 11-25",
    workbook: path.join(repoRoot, "docs/new-cutoff/june-11-25/1rptOvertimeDetails - June 11-25, 2026.xlsx"),
  },
  {
    periodCode: "PP-20260626-20260711",
    label: "June 26-July 10",
    workbook: path.join(repoRoot, "docs/new-cutoff/june-26-10/2rptOvertimeDetails - June 26 - July 10, 2026.xlsx"),
  },
] as const;

const text = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(text(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const dateKey = (v: unknown) => {
  const raw = text(v);
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
const parseHhMm = (v: unknown) => {
  const raw = text(v);
  if (!raw || raw === "0" || raw === "0:00" || raw === "00:00") return 0;
  if (raw.includes(":")) {
    const [h, m] = raw.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 60) : 0;
};
const minToH = (m: number) => Math.round((m / 60) * 100) / 100;
const hhmm = (mins: number) =>
  `${Math.floor(Math.max(0, mins) / 60)}:${String(Math.max(0, mins) % 60).padStart(2, "0")}`;

type FileDay = { regOt: number; mappedOt: number; regNd: number; rd: number };
type FileEmp = {
  name: string;
  totalMappedMin: number;
  daysWithOt: number;
  dayRows: number;
  byDate: Map<string, FileDay>;
};

function parseWorkbookFast(filePath: string) {
  const t0 = performance.now();
  // dense + raw:false is fastest reliable path for ~600KB BNPI OT workbooks
  const wb = XLSX.readFile(filePath, { cellDates: true, dense: true, raw: false, password: "9090" });
  const sheetName = wb.SheetNames.find((n) => /overtime/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  }) as unknown[][];

  let curName = "";
  let curEmp = "";
  const byEmp = new Map<string, FileEmp>();
  let dataRows = 0;

  for (let i = 6; i < rows.length; i++) {
    const row = rows[i] || [];
    if (text(row[2])) curName = text(row[2]);
    if (/^\d{3,6}$/.test(text(row[3]))) curEmp = text(row[3]).padStart(5, "0");
    const direct = dateKey(row[4]);
    const shifted = direct ? "" : dateKey(row[0]);
    const date = direct || shifted;
    const shift = shifted ? 4 : 0;
    if (!date || !curEmp) continue;
    dataRows++;
    const regOt = num(row[7 - shift]);
    const regNd = num(row[8 - shift]);
    const spclOt = num(row[10 - shift]);
    const rholOt = num(row[13 - shift]);
    const rd = num(row[14 - shift]);
    const rdOt = num(row[15 - shift]);
    const mappedOt = regOt + spclOt + rholOt + rdOt;
    if (!byEmp.has(curEmp)) {
      byEmp.set(curEmp, {
        name: curName,
        totalMappedMin: 0,
        daysWithOt: 0,
        dayRows: 0,
        byDate: new Map(),
      });
    }
    const e = byEmp.get(curEmp)!;
    e.name = curName || e.name;
    e.dayRows++;
    const mappedMin = Math.round(mappedOt * 60);
    e.byDate.set(date, { regOt, mappedOt, regNd, rd });
    e.totalMappedMin += mappedMin;
    if (mappedMin > 0) e.daysWithOt++;
  }
  return {
    byEmp,
    dataRows,
    sheetName,
    parseMs: Math.round(performance.now() - t0),
    peopleWithOt: Array.from(byEmp.values()).filter((e) => e.totalMappedMin > 0).length,
    totalMappedMin: Array.from(byEmp.values()).reduce((s, e) => s + e.totalMappedMin, 0),
  };
}

async function loadDbPeriod(periodCode: string) {
  const t0 = performance.now();
  const period = await prisma.payrollPeriod.findFirst({
    where: { code: periodCode, isDeleted: false },
    select: { id: true, organizationId: true, code: true, startDate: true, endDate: true },
  });
  if (!period) return { period: null, lines: [], statusCounts: [], ms: 0 };

  // ONE bulk pull: all approved-source OT lines for period (no N+1)
  const lines = await prisma.$queryRaw<
    Array<{
      employeeCode: string;
      timesheetId: string;
      status: string;
      date: Date;
      overtimeHours: string | null;
      regOtHrs: number | null;
    }>
  >`
    SELECT
      e."employeeId" AS "employeeCode",
      t.id AS "timesheetId",
      t.status AS status,
      l.date AS date,
      l."overtimeHours" AS "overtimeHours",
      NULLIF(l.metadata->'bandaiPayrollSourceRepair'->'approvedBuckets'->>'regOtHrs', '')::float AS "regOtHrs"
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
  `;

  const statusCounts = await prisma.timesheet.groupBy({
    by: ["status"],
    where: { payrollPeriodId: period.id, isDeleted: false },
    _count: { _all: true },
  });

  return {
    period,
    lines,
    statusCounts: statusCounts.map((s) => ({ status: s.status, count: s._count._all })),
    ms: Math.round(performance.now() - t0),
  };
}

function joinFileDb(
  file: ReturnType<typeof parseWorkbookFast>,
  db: Awaited<ReturnType<typeof loadDbPeriod>>,
) {
  // Aggregate DB by emp
  type DbEmp = {
    timesheetId: string;
    status: string;
    totalMin: number;
    daysWithOt: number;
    byDate: Map<string, number>;
  };
  const dbByEmp = new Map<string, DbEmp>();
  for (const row of db.lines) {
    const date = row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10);
    const mins = parseHhMm(row.overtimeHours);
    if (!dbByEmp.has(row.employeeCode)) {
      dbByEmp.set(row.employeeCode, {
        timesheetId: row.timesheetId,
        status: row.status,
        totalMin: 0,
        daysWithOt: 0,
        byDate: new Map(),
      });
    }
    const e = dbByEmp.get(row.employeeCode)!;
    e.byDate.set(date, mins);
    e.totalMin += mins;
    if (mins > 0) e.daysWithOt++;
  }

  const fileOtEmps = Array.from(file.byEmp.entries()).filter(([, e]) => e.totalMappedMin > 0);
  let empPerfect = 0;
  let empMismatch = 0;
  let empMissingDb = 0;
  let dayMatch = 0;
  let dayMismatch = 0;
  let dayMissing = 0;
  const mismatches: any[] = [];
  const perEmployee: any[] = [];
  const statusAmongFileOt: Record<string, number> = {};

  for (const [code, fe] of fileOtEmps) {
    const de = dbByEmp.get(code);
    if (!de) {
      empMissingDb++;
      mismatches.push({ code, name: fe.name, reason: "missing_in_db", fileH: minToH(fe.totalMappedMin) });
      perEmployee.push({
        employeeCode: code,
        name: fe.name,
        match: false,
        status: "missing_in_db",
        fileOt: hhmm(fe.totalMappedMin),
        dbOt: "0:00",
        fileDaysWithOt: fe.daysWithOt,
        dbDaysWithOt: 0,
        timesheetStatus: null,
      });
      continue;
    }
    statusAmongFileOt[de.status] = (statusAmongFileOt[de.status] || 0) + 1;
    let ok = de.totalMin === fe.totalMappedMin;
    for (const [date, fd] of fe.byDate) {
      if (fd.mappedOt <= 0) continue;
      const exp = Math.round(fd.mappedOt * 60);
      const act = de.byDate.get(date);
      if (act === undefined) {
        dayMissing++;
        ok = false;
      } else if (act === exp) dayMatch++;
      else {
        dayMismatch++;
        ok = false;
        if (mismatches.length < 30) {
          mismatches.push({ code, date, exp, act, fileRegOt: fd.regOt });
        }
      }
    }
    if (ok) empPerfect++;
    else {
      empMismatch++;
      if (mismatches.length < 30) {
        mismatches.push({
          code,
          name: fe.name,
          reason: "total_or_day_mismatch",
          fileH: minToH(fe.totalMappedMin),
          dbH: minToH(de.totalMin),
          status: de.status,
        });
      }
    }
    perEmployee.push({
      employeeCode: code,
      name: fe.name,
      match: ok,
      status: ok ? "match" : "mismatch",
      fileOt: hhmm(fe.totalMappedMin),
      dbOt: hhmm(de.totalMin),
      fileDaysWithOt: fe.daysWithOt,
      dbDaysWithOt: de.daysWithOt,
      timesheetStatus: de.status,
      timesheetId: de.timesheetId,
    });
  }

  // DB people with OT not in file set
  let empExtraDb = 0;
  for (const [code, de] of dbByEmp) {
    if (de.totalMin <= 0) continue;
    const fe = file.byEmp.get(code);
    if (!fe || fe.totalMappedMin <= 0) empExtraDb++;
  }

  const dbPeopleWithOt = Array.from(dbByEmp.values()).filter((e) => e.totalMin > 0).length;
  const dbTotalMin = Array.from(dbByEmp.values()).reduce((s, e) => s + e.totalMin, 0);
  const filePeopleWithOt = fileOtEmps.length;
  const fileTotalMin = fileOtEmps.reduce((s, [, e]) => s + e.totalMappedMin, 0);

  return {
    filePeopleWithOt,
    dbPeopleWithOt,
    fileTotalOtHours: minToH(fileTotalMin),
    dbTotalOtHours: minToH(dbTotalMin),
    peopleCountsMatch: filePeopleWithOt === dbPeopleWithOt,
    hoursMatch: Math.abs(fileTotalMin - dbTotalMin) <= 1,
    empPerfect,
    empMismatch,
    empMissingDb,
    empExtraDb,
    dayMatch,
    dayMismatch,
    dayMissing,
    statusAmongFileOt,
    mismatches: mismatches.slice(0, 25),
    top10: perEmployee
      .slice()
      .sort((a, b) => parseHhMm(b.fileOt) - parseHhMm(a.fileOt))
      .slice(0, 10),
    perEmployee,
    // Felix
    felix01713: perEmployee.find((p) => p.employeeCode === "01713") || null,
  };
}

async function main() {
  const tAll = performance.now();
  const results: any[] = [];

  for (const pack of PACKS) {
    const tPack = performance.now();
    const file = parseWorkbookFast(pack.workbook);
    const db = await loadDbPeriod(pack.periodCode);
    if (!db.period) {
      results.push({ pack, error: "period_missing" });
      continue;
    }
    const join = joinFileDb(file, db);

    // Readiness-equivalent: same SQL aggregate the UI uses (approved-source only)
    const readiness = await prisma.$queryRaw<
      Array<{ people: number | bigint; minutes: number | bigint }>
    >`
      SELECT
        COUNT(*)::int AS people,
        COALESCE(SUM(x.mins), 0)::int AS minutes
      FROM (
        SELECT
          t.id,
          SUM(
            CASE
              WHEN l."overtimeHours" LIKE '%:%' THEN
                COALESCE(NULLIF(split_part(l."overtimeHours", ':', 1), '')::int, 0) * 60
                + COALESCE(NULLIF(split_part(l."overtimeHours", ':', 2), '')::int, 0)
              ELSE 0
            END
          )::int AS mins
        FROM timesheet_lines l
        JOIN timesheets t ON t.id = l."timesheetId"
        WHERE l."payrollPeriodId" = ${db.period.id}
          AND l."isDeleted" = false AND l."isEffective" = true
          AND t."isDeleted" = false
          AND (l.metadata->'bandaiPayrollSourceRepair') IS NOT NULL
          AND jsonb_typeof(l.metadata->'bandaiPayrollSourceRepair') = 'object'
          AND l."overtimeHours" IS NOT NULL
          AND btrim(l."overtimeHours") NOT IN ('', '0', '0:00', '00:00')
        GROUP BY t.id
        HAVING SUM(
          CASE
            WHEN l."overtimeHours" LIKE '%:%' THEN
              COALESCE(NULLIF(split_part(l."overtimeHours", ':', 1), '')::int, 0) * 60
              + COALESCE(NULLIF(split_part(l."overtimeHours", ':', 2), '')::int, 0)
            ELSE 0
          END
        ) > 0
      ) x
    `;

    const packReport = {
      pack: {
        label: pack.label,
        periodCode: pack.periodCode,
        periodId: db.period.id,
        workbook: path.basename(pack.workbook),
      },
      timingMs: {
        excelParse: file.parseMs,
        dbBulk: db.ms,
        packTotal: Math.round(performance.now() - tPack),
      },
      mappingRule:
        "line OT minutes = RegOT+SpclOT+RHolOT+RDOT hours (excludes ND & plain RD premium). Approved-source gate = bandaiPayrollSourceRepair.",
      file: {
        dataRows: file.dataRows,
        uniqueEmployees: file.byEmp.size,
        peopleWithMappedOt: file.peopleWithOt,
        totalMappedOtHours: minToH(file.totalMappedMin),
        sheetName: file.sheetName,
      },
      database: {
        timesheetStatusCounts: db.statusCounts,
        approvedSourceLineRows: db.lines.length,
        peopleWithApprovedSourceOt: join.dbPeopleWithOt,
        totalApprovedSourceOtHours: join.dbTotalOtHours,
      },
      runPayrollEquivalent: {
        peopleWithApprovedOt: Number(readiness[0]?.people || 0),
        totalApprovedOtHours: minToH(Number(readiness[0]?.minutes || 0)),
      },
      tally: {
        peopleFile: join.filePeopleWithOt,
        peopleDb: join.dbPeopleWithOt,
        peopleReadiness: Number(readiness[0]?.people || 0),
        hoursFile: join.fileTotalOtHours,
        hoursDb: join.dbTotalOtHours,
        hoursReadiness: minToH(Number(readiness[0]?.minutes || 0)),
        peopleFileEqDb: join.peopleCountsMatch,
        peopleDbEqReadiness: join.dbPeopleWithOt === Number(readiness[0]?.people || 0),
        hoursFileEqDb: join.hoursMatch,
        hoursDbEqReadiness:
          Math.abs(join.dbTotalMinApprox ?? join.dbTotalOtHours - minToH(Number(readiness[0]?.minutes || 0))) <
            0.05 ||
          Math.abs(join.dbTotalOtHours - minToH(Number(readiness[0]?.minutes || 0))) < 0.05,
        empPerfect: join.empPerfect,
        empMismatch: join.empMismatch,
        empMissingDb: join.empMissingDb,
        empExtraDb: join.empExtraDb,
        dayMatch: join.dayMatch,
        dayMismatch: join.dayMismatch,
        dayMissing: join.dayMissing,
        timesheetStatusAmongFileOtPeople: join.statusAmongFileOt,
      },
      felix01713: join.felix01713,
      top10FileOt: join.top10,
      mismatchSamples: join.mismatches,
    };

    // fix hoursDbEqReadiness without broken field
    packReport.tally.hoursDbEqReadiness =
      Math.abs(join.dbTotalOtHours - minToH(Number(readiness[0]?.minutes || 0))) < 0.05;

    fs.writeFileSync(
      path.join(outDir, `${pack.periodCode}-summary.json`),
      JSON.stringify(packReport, null, 2),
    );
    fs.writeFileSync(
      path.join(outDir, `${pack.periodCode}-per-employee.json`),
      JSON.stringify(join.perEmployee, null, 2),
    );
    results.push(packReport);
    console.log(
      JSON.stringify({
        period: pack.periodCode,
        parseMs: file.parseMs,
        dbMs: db.ms,
        people: `${join.filePeopleWithOt}/${join.dbPeopleWithOt}/${Number(readiness[0]?.people || 0)}`,
        hours: `${join.fileTotalOtHours}/${join.dbTotalOtHours}/${minToH(Number(readiness[0]?.minutes || 0))}`,
        perfect: join.empPerfect,
        mismatch: join.empMismatch,
        missing: join.empMissingDb,
      }),
    );
  }

  const index = {
    stamp,
    outDir,
    totalMs: Math.round(performance.now() - tAll),
    method:
      "FAST: XLSX dense parse once + single bulk SQL of approved-source lines + in-memory join (no N+1, no per-emp hydrate)",
    mappingRule:
      "Timesheetline.overtimeHours := RegOT + SpclOT + RHolOT + RDOT from rptOvertimeDetails (NOT ND, NOT plain RDHrs).",
    packs: results.map((r) => ({
      period: r.pack.periodCode,
      timingMs: r.timingMs,
      filePeople: r.file.peopleWithMappedOt,
      dbPeople: r.database.peopleWithApprovedSourceOt,
      readinessPeople: r.runPayrollEquivalent.peopleWithApprovedOt,
      fileHours: r.file.totalMappedOtHours,
      dbHours: r.database.totalApprovedSourceOtHours,
      readinessHours: r.runPayrollEquivalent.totalApprovedOtHours,
      peopleFileEqDb: r.tally.peopleFileEqDb,
      peopleDbEqReadiness: r.tally.peopleDbEqReadiness,
      hoursFileEqDb: r.tally.hoursFileEqDb,
      hoursDbEqReadiness: r.tally.hoursDbEqReadiness,
      empPerfect: r.tally.empPerfect,
      empMismatch: r.tally.empMismatch,
      empMissingDb: r.tally.empMissingDb,
      dayMatch: r.tally.dayMatch,
      dayMismatch: r.tally.dayMismatch,
      felix: r.felix01713,
    })),
  };
  fs.writeFileSync(path.join(outDir, "INDEX.json"), JSON.stringify(index, null, 2));

  // Markdown report
  const md = [
    `# OT Truth Fast Probe — ${stamp}`,
    ``,
    `## Method (quickest reliable path on this host)`,
    ``,
    `| Step | Technique | Why fast |`,
    `|---|---|---|`,
    `| Excel | \`xlsx\` dense + password 9090, single pass | Workbooks ~600KB; no streaming needed |`,
    `| DB | One bulk SQL of all approved-source lines/period | Avoids N+1 timesheet hydrates |`,
    `| Join | In-memory Map empCode → dates | O(rows) not O(emps × query) |`,
    `| Run Payroll | Same gate as ot-readiness helper | People/hours must equal panel |`,
    ``,
    `## Mapping rule`,
    ``,
    `\`timesheet_lines.overtimeHours\` from report = **RegOT + SpclOT + RHolOT + RDOT** hours.`,
    `**Excluded from line OT:** Reg NDHrs, plain RDHrs (premium), Spcl Hrs, RHol Hrs (non-OT premium).`,
    `**Approved source gate:** \`metadata.bandaiPayrollSourceRepair\` object (not DEMO seed).`,
    ``,
    `## Pack tallies`,
    ``,
    `| Period | File people | DB people | Readiness people | File hrs | DB hrs | Readiness hrs | Emp perfect | Emp mismatch | Day match | Day mismatch |`,
    `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`,
    ...results.map(
      (r) =>
        `| ${r.pack.periodCode} | ${r.file.peopleWithMappedOt} | ${r.database.peopleWithApprovedSourceOt} | ${r.runPayrollEquivalent.peopleWithApprovedOt} | ${r.file.totalMappedOtHours} | ${r.database.totalApprovedSourceOtHours} | ${r.runPayrollEquivalent.totalApprovedOtHours} | ${r.tally.empPerfect} | ${r.tally.empMismatch} | ${r.tally.dayMatch} | ${r.tally.dayMismatch} |`,
    ),
    ``,
    `## Timing`,
    ``,
    `| Period | Excel parse ms | DB bulk ms | Pack total ms |`,
    `|---|---:|---:|---:|`,
    ...results.map(
      (r) =>
        `| ${r.pack.periodCode} | ${r.timingMs.excelParse} | ${r.timingMs.dbBulk} | ${r.timingMs.packTotal} |`,
    ),
    ``,
    `**Total wall:** ${index.totalMs} ms`,
    ``,
    `## Felix Aguila 01713 (screenshot pack June 26–10)`,
    ``,
    results.find((r) => r.pack.periodCode === "PP-20260626-20260711")?.felix01713
      ? "```json\n" +
        JSON.stringify(
          results.find((r) => r.pack.periodCode === "PP-20260626-20260711")!.felix01713,
          null,
          2,
        ) +
        "\n```"
      : "_not found_",
    ``,
    `## Evidence paths`,
    ``,
    `- \`${outDir.replace(/\\/g, "/")}/INDEX.json\``,
    `- \`*-summary.json\` / \`*-per-employee.json\` per period`,
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "REPORT.md"), md);
  console.log(JSON.stringify(index, null, 2));
  console.log("OUT", outDir);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
