import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import {
  getPayrollPeriodOtReadiness,
  getPayrollPeriodOtPersonDetail,
} from "../helper/payroll-ot-readiness.helper";

const prisma = new PrismaClient();
const e2eDir = process.env.E2E_DIR!;

const missingP1 = JSON.parse(
  fs.readFileSync(path.join(e2eDir, "PP-20260611-20260626-per-employee.json"), "utf8"),
)
  .filter((e: any) => e.status === "missing_in_db")
  .map((e: any) => e.employeeCode as string);
const missingP2 = JSON.parse(
  fs.readFileSync(path.join(e2eDir, "PP-20260626-20260711-per-employee.json"), "utf8"),
)
  .filter((e: any) => e.status === "missing_in_db")
  .map((e: any) => e.employeeCode as string);

async function classifyMissing(periodCode: string, codes: string[]) {
  const period = await prisma.payrollPeriod.findFirst({ where: { code: periodCode } });
  if (!period) return { periodCode, error: "no period" };
  const rows = [];
  for (const code of codes) {
    const emp = await prisma.employee.findFirst({
      where: { employeeId: code, isDeleted: false },
      select: { id: true, employeeId: true, employmentStatus: true },
    });
    if (!emp) {
      rows.push({ code, reason: "no_employee_record", class: "export_gap" });
      continue;
    }
    const ts = await prisma.timesheet.findFirst({
      where: { employeeId: emp.id, payrollPeriodId: period.id, isDeleted: false },
      select: { id: true, status: true },
    });
    if (!ts) {
      rows.push({
        code,
        reason: "no_timesheet_for_period",
        class: "export_gap",
        employeeUuid: emp.id,
        employmentStatus: emp.employmentStatus,
      });
      continue;
    }
    const repair = await prisma.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM timesheet_lines l
      WHERE l."timesheetId" = ${ts.id}
        AND l."isDeleted" = false AND l."isEffective" = true
        AND (l.metadata->'bandaiPayrollSourceRepair') IS NOT NULL
    `;
    const n = Number(repair[0]?.n || 0);
    rows.push({
      code,
      reason: n === 0 ? "timesheet_exists_no_repair_apply" : "unexpected_has_repair",
      class: n === 0 ? "apply_path" : "CONFLICTING",
      timesheetId: ts.id,
      timesheetStatus: ts.status,
      repairRows: n,
    });
  }
  const byReason: Record<string, number> = {};
  for (const r of rows) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  return { periodCode, missingCount: codes.length, byReason, rows };
}

async function main() {
  const p1 = await classifyMissing("PP-20260611-20260626", missingP1);
  const p2 = await classifyMissing("PP-20260626-20260711", missingP2);

  const period2 = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260626-20260711" } });
  const period1 = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260611-20260626" } });
  const emp = await prisma.employee.findFirst({ where: { employeeId: "01713", isDeleted: false } });
  const ts2 = await prisma.timesheet.findFirst({
    where: { employeeId: emp!.id, payrollPeriodId: period2!.id, isDeleted: false },
  });
  const detail = await getPayrollPeriodOtPersonDetail(prisma, {
    payrollPeriodId: period2!.id,
    organizationId: period2!.organizationId,
    timesheetId: ts2!.id,
  });

  const readiness2 = await getPayrollPeriodOtReadiness(prisma, {
    payrollPeriodId: period2!.id,
    organizationId: period2!.organizationId,
    page: 1,
    limit: 20,
    onlyWithOt: true,
  });
  const readiness1 = await getPayrollPeriodOtReadiness(prisma, {
    payrollPeriodId: period1!.id,
    organizationId: period1!.organizationId,
    page: 1,
    limit: 5,
    onlyWithOt: true,
  });

  // demo OT not in approved-source list: count people whose ALL ot lines are demo
  const demoOnlyCount = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*)::int AS n FROM (
      SELECT t.id
      FROM timesheets t
      JOIN timesheet_lines l ON l."timesheetId" = t.id
      WHERE t."payrollPeriodId" = ${period2!.id}
        AND t."isDeleted" = false
        AND l."isDeleted" = false AND l."isEffective" = true
        AND l."overtimeHours" IS NOT NULL
        AND btrim(l."overtimeHours") NOT IN ('','0','0:00')
      GROUP BY t.id
      HAVING
        BOOL_AND(
          COALESCE(l.metadata->>'source','') ILIKE '%DEMO%'
          OR COALESCE(l.metadata->>'source','') ILIKE '%BNPI_DM4_DEMO%'
        )
        AND BOOL_OR(true)
        AND NOT BOOL_OR((l.metadata->'bandaiPayrollSourceRepair') IS NOT NULL)
    ) x
  `;

  // Live HTTP API proof if server up
  let httpProof: any = { skipped: true };
  try {
    const loginRes = await fetch("http://localhost:3001/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@bandai.local", password: "password123", appCode: "hris" }),
    });
    const loginJson: any = await loginRes.json();
    const token = loginJson?.data?.token;
    if (token) {
      const h = { Authorization: `Bearer ${token}` };
      const r1 = await fetch(
        `http://localhost:3001/api/payrollperiod/${period1!.id}/ot-readiness?page=1&limit=5&onlyWithOt=true`,
        { headers: h },
      );
      const r2 = await fetch(
        `http://localhost:3001/api/payrollperiod/${period2!.id}/ot-readiness?page=1&limit=5&onlyWithOt=true`,
        { headers: h },
      );
      const j1: any = await r1.json();
      const j2: any = await r2.json();
      const d2 = await fetch(
        `http://localhost:3001/api/payrollperiod/${period2!.id}/ot-readiness/person/${ts2!.id}`,
        { headers: h },
      );
      const dj2: any = await d2.json();
      httpProof = {
        skipped: false,
        p1: {
          status: r1.status,
          people: j1?.data?.summary?.peopleWithApprovedOt,
          hrs: j1?.data?.summary?.totalApprovedLineOtHours,
        },
        p2: {
          status: r2.status,
          people: j2?.data?.summary?.peopleWithApprovedOt,
          hrs: j2?.data?.summary?.totalApprovedLineOtHours,
        },
        felixDetail: {
          status: d2.status,
          total: dj2?.data?.totalLineOtHours,
          days: dj2?.data?.otDayCount,
          sampleDays: (dj2?.data?.days || []).slice(0, 5),
        },
      };
    }
  } catch (e: any) {
    httpProof = { skipped: true, error: e.message };
  }

  const out = {
    missingClassification: { p1, p2 },
    felixP2: {
      totalLineOtHours: detail.totalLineOtHours,
      otDayCount: detail.otDayCount,
      match27: detail.totalLineOtHours === "27:00",
      days: detail.days.map((d) => ({
        date: d.date,
        ot: d.overtimeHours,
        regOt: d.approvedBuckets?.regOtHrs,
        regNd: d.approvedBuckets?.regNdHrs,
        rd: d.approvedBuckets?.rdHrs,
        source: d.sourceLabel,
      })),
    },
    readinessHelper: {
      p1: {
        people: readiness1.summary.peopleWithApprovedOt,
        hrs: readiness1.summary.totalApprovedLineOtHours,
      },
      p2: {
        people: readiness2.summary.peopleWithApprovedOt,
        hrs: readiness2.summary.totalApprovedLineOtHours,
        sample: readiness2.people.slice(0, 5).map((p) => ({
          code: p.employeeCode,
          hrs: p.lineOtHours,
          days: p.lineDaysWithOt,
          status: p.timesheetStatus,
        })),
      },
    },
    demoOnlyTimesheetsInPeriodP2: Number(demoOnlyCount[0]?.n || 0),
    httpProof,
  };
  fs.writeFileSync(path.join(e2eDir, "02-detail-and-missing.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    p1ByReason: p1.byReason,
    p2ByReason: p2.byReason,
    felix27: detail.totalLineOtHours,
    felixDays: detail.otDayCount,
    match27: detail.totalLineOtHours === "27:00",
    readinessP1: readiness1.summary.peopleWithApprovedOt + " / " + readiness1.summary.totalApprovedLineOtHours,
    readinessP2: readiness2.summary.peopleWithApprovedOt + " / " + readiness2.summary.totalApprovedLineOtHours,
    demoOnly: Number(demoOnlyCount[0]?.n || 0),
    http: httpProof,
  }, null, 2));
}
main().finally(() => prisma.$disconnect());
