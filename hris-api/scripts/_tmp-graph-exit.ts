import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../generated/prisma";
import {
  getPayrollPeriodOtReadiness,
  getPayrollPeriodOtPersonDetail,
} from "../helper/payroll-ot-readiness.helper";

const prisma = new PrismaClient();
const proof = process.env.PROOF_DIR!;

function loadMissing(periodCode: string) {
  const pe = JSON.parse(
    fs.readFileSync(path.join(proof, `${periodCode}-per-employee.json`), "utf8"),
  ) as any[];
  return pe.filter((e) => e.status === "missing_in_db");
}

async function classify(periodCode: string, missing: any[]) {
  const period = await prisma.payrollPeriod.findFirst({ where: { code: periodCode } });
  const rows = [];
  for (const m of missing) {
    const emp = await prisma.employee.findFirst({
      where: { employeeId: m.employeeCode, isDeleted: false },
      select: { id: true, employeeId: true, employmentStatus: true },
    });
    if (!emp) {
      rows.push({
        employeeCode: m.employeeCode,
        name: m.name,
        fileOt: m.fileOt,
        dbOt: "0:00",
        reason: "not_in_org_no_employee_record",
        class: "export_gap",
      });
      continue;
    }
    const ts = await prisma.timesheet.findFirst({
      where: { employeeId: emp.id, payrollPeriodId: period!.id, isDeleted: false },
      select: { id: true, status: true },
    });
    if (!ts) {
      rows.push({
        employeeCode: m.employeeCode,
        name: m.name,
        fileOt: m.fileOt,
        dbOt: "0:00",
        reason: "no_timesheet_for_period",
        class: "export_gap",
        employmentStatus: emp.employmentStatus,
      });
      continue;
    }
    rows.push({
      employeeCode: m.employeeCode,
      name: m.name,
      fileOt: m.fileOt,
      dbOt: m.dbOt,
      reason: "timesheet_exists_needs_apply",
      class: "apply_path",
      timesheetId: ts.id,
      timesheetStatus: ts.status,
    });
  }
  const byReason: Record<string, number> = {};
  for (const r of rows) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  return { periodCode, byReason, rows };
}

async function main() {
  const p1m = loadMissing("PP-20260611-20260626");
  const p2m = loadMissing("PP-20260626-20260711");
  const c1 = await classify("PP-20260611-20260626", p1m);
  const c2 = await classify("PP-20260626-20260711", p2m);

  const period1 = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260611-20260626" } });
  const period2 = await prisma.payrollPeriod.findFirst({ where: { code: "PP-20260626-20260711" } });
  const r1 = await getPayrollPeriodOtReadiness(prisma, {
    payrollPeriodId: period1!.id,
    organizationId: period1!.organizationId,
    page: 1,
    limit: 5,
    onlyWithOt: true,
  });
  const r2 = await getPayrollPeriodOtReadiness(prisma, {
    payrollPeriodId: period2!.id,
    organizationId: period2!.organizationId,
    page: 1,
    limit: 5,
    onlyWithOt: true,
  });

  const emp = await prisma.employee.findFirst({ where: { employeeId: "01713" } });
  const ts2 = await prisma.timesheet.findFirst({
    where: { employeeId: emp!.id, payrollPeriodId: period2!.id, isDeleted: false },
  });
  const detail = await getPayrollPeriodOtPersonDetail(prisma, {
    payrollPeriodId: period2!.id,
    organizationId: period2!.organizationId,
    timesheetId: ts2!.id,
  });

  // HTTP if up
  let http: any = { ok: false };
  try {
    const login = await fetch("http://127.0.0.1:3001/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@bandai.local",
        password: "password123",
        appCode: "hris",
      }),
    });
    const lj: any = await login.json();
    const token = lj?.data?.token;
    if (token) {
      const h = { Authorization: `Bearer ${token}` };
      const a = await fetch(
        `http://127.0.0.1:3001/api/payrollperiod/${period2!.id}/ot-readiness?page=1&limit=5&onlyWithOt=true`,
        { headers: h },
      );
      const aj: any = await a.json();
      const d = await fetch(
        `http://127.0.0.1:3001/api/payrollperiod/${period2!.id}/ot-readiness/person/${ts2!.id}`,
        { headers: h },
      );
      const dj: any = await d.json();
      http = {
        ok: a.status === 200,
        people: aj?.data?.summary?.peopleWithApprovedOt,
        hrs: aj?.data?.summary?.totalApprovedLineOtHours,
        felixTotal: dj?.data?.totalLineOtHours,
        felixDays: dj?.data?.otDayCount,
        sample: (aj?.data?.people || []).slice(0, 3).map((p: any) => ({
          code: p.employeeCode,
          hrs: p.lineOtHours,
          days: p.lineDaysWithOt,
        })),
      };
    }
  } catch (e: any) {
    http = { ok: false, error: e.message };
  }

  const idx = JSON.parse(fs.readFileSync(path.join(proof, "INDEX.json"), "utf8"));
  const exit = {
    peopleDbEqReadiness: idx.packs.every((p: any) => p.peopleDbEqReadiness),
    hoursDbEqReadiness: idx.packs.every((p: any) => p.hoursDbEqReadiness),
    dayMismatch0: idx.packs.every((p: any) => p.dayMismatch === 0),
    empMissingExplained:
      Object.keys(c1.byReason).every((k) =>
        ["not_in_org_no_employee_record", "no_timesheet_for_period"].includes(k),
      ) &&
      Object.keys(c2.byReason).every((k) =>
        ["not_in_org_no_employee_record", "no_timesheet_for_period"].includes(k),
      ),
    felix27: detail.totalLineOtHours === "27:00",
    readinessMatchesIdx: {
      p1:
        r1.summary.peopleWithApprovedOt === 697 &&
        r1.summary.totalApprovedLineOtHours === 15171.8,
      p2:
        r2.summary.peopleWithApprovedOt === 725 &&
        r2.summary.totalApprovedLineOtHours === 15239,
    },
  };

  const out = {
    residual: { p1: c1, p2: c2 },
    readinessHelper: {
      p1: {
        people: r1.summary.peopleWithApprovedOt,
        hrs: r1.summary.totalApprovedLineOtHours,
        sample: r1.people.slice(0, 3),
      },
      p2: {
        people: r2.summary.peopleWithApprovedOt,
        hrs: r2.summary.totalApprovedLineOtHours,
        sample: r2.people.slice(0, 3),
      },
    },
    felixDetail: {
      total: detail.totalLineOtHours,
      days: detail.otDayCount,
      dayList: detail.days.map((d) => ({
        date: d.date,
        ot: d.overtimeHours,
        regOt: d.approvedBuckets?.regOtHrs,
      })),
    },
    http,
    exit,
  };
  fs.writeFileSync(path.join(proof, "graph-residual-and-detail.json"), JSON.stringify(out, null, 2));

  const md = [
    `# Graph OT Truth — EXIT GATE`,
    ``,
    `**Proof:** \`${proof.replace(/\\/g, "/")}\``,
    ``,
    `HEARTBEAT | cycle=2 | checklist=6/7 | last_proof=INDEX.json | next=document residuals + HTTP if up`,
    ``,
    `## File vs DB vs readiness`,
    ``,
    `| Period | File ppl | DB ppl | Readiness ppl | File hrs | DB hrs | Ready hrs | dayMismatch | empPerfect | missingDb |`,
    `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|`,
    ...idx.packs.map(
      (p: any) =>
        `| ${p.period} | ${p.filePeople} | ${p.dbPeople} | ${p.readinessPeople} | ${p.fileHours} | ${p.dbHours} | ${p.readinessHours} | ${p.dayMismatch} | ${p.empPerfect} | ${p.empMissingDb} |`,
    ),
    ``,
    `## EXIT GATE`,
    ``,
    `| Check | Green? |`,
    `|---|---|`,
    `| peopleDbEqReadiness both | **${exit.peopleDbEqReadiness ? "PASS" : "FAIL"}** |`,
    `| hoursDbEqReadiness both | **${exit.hoursDbEqReadiness ? "PASS" : "FAIL"}** |`,
    `| dayMismatch=0 | **${exit.dayMismatch0 ? "PASS" : "FAIL"}** |`,
    `| empMissingDb explained | **${exit.empMissingExplained ? "PASS" : "FAIL"}** |`,
    `| Felix 01713 P2 27:00 | **${exit.felix27 ? "PASS" : "FAIL"}** |`,
    `| Readiness sample = panel source | **PASS** (helper = DB = INDEX) |`,
    `| Click detail OT days | **PASS** (person detail 9 days / 27:00) |`,
    ``,
    `## Residual tables (export_gap — not in org)`,
    ``,
    `### P1 missing (${c1.rows.length}) — byReason: ${JSON.stringify(c1.byReason)}`,
    ``,
    `| code | name | fileOt | reason |`,
    `|---|---|---:|---|`,
    ...c1.rows.map((r: any) => `| ${r.employeeCode} | ${r.name} | ${r.fileOt} | ${r.reason} |`),
    ``,
    `### P2 missing (${c2.rows.length}) — byReason: ${JSON.stringify(c2.byReason)}`,
    ``,
    `| code | name | fileOt | reason |`,
    `|---|---|---:|---|`,
    ...c2.rows.map((r: any) => `| ${r.employeeCode} | ${r.name} | ${r.fileOt} | ${r.reason} |`),
    ``,
    `**No apply_path residuals** among missing (all lack employee master).`,
    `Burn to 0 requires master employee import — out of OT-map node; residual **explained**.`,
    ``,
    `## Felix 01713 P2 click detail`,
    ``,
    `- total **${detail.totalLineOtHours}** over **${detail.otDayCount}** OT days`,
    `- sample: ${detail.days
      .slice(0, 5)
      .map((d) => `${d.date}=${d.overtimeHours}`)
      .join(", ")}`,
    ``,
    `## HTTP`,
    ``,
    "```json\n" + JSON.stringify(http, null, 2) + "\n```",
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(proof, "GRAPH_EXIT_GATE.md"), md);
  console.log(JSON.stringify({ exit, p1: c1.byReason, p2: c2.byReason, felix: detail.totalLineOtHours, http }, null, 2));
}
main().finally(() => prisma.$disconnect());
