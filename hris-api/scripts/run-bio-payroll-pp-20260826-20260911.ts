/**
 * Bio-attendance payroll run for PP-20260826-20260911 (26 Aug → 10 Sep 2026).
 *
 * Operator request (2026-09-03): generate payroll from the biometric attendance
 * "from the 25 until now", using the new auto-approve default.
 *
 * Scope guards (Project Truth day-status pipeline):
 * - Lines are materialized ONLY from existing attendance obligations with
 *   evidence (stored status != EXPECTED). Bare no-evidence days stay out of
 *   payroll (REVIEW queue truth) — no fleet-wide obligation creation.
 * - No future-day lines: materialization is bounded to today (Manila).
 * - Overtime stays policy-gated (requireManagerApprovedOvertime=true): raw punch
 *   excess never auto-pays.
 * - Auto-approve: org config enableAutoApprove=true (operator default). Drafts
 *   are approved with SYSTEM_AUTO_APPROVE provenance + metadata.autoApproved,
 *   mirroring the submit-path auto-approval patch.
 * - Rollback: period had ZERO timesheets before this run; created timesheet ids
 *   are recorded in the evidence dir for clean reversal.
 *
 * Usage:
 *   npx tsx scripts/run-bio-payroll-pp-20260826-20260911.mts            # dry-run plan
 *   npx tsx scripts/run-bio-payroll-pp-20260826-20260911.mts --execute  # real run
 */
import { PrismaClient } from "../generated/prisma";
import { generatePayrollFromTimesheets } from "../helper/payroll-period.helper";
import { materializeTimesheetLinesFromObligations } from "../helper/attendance-obligation.helper";
import { buildTimesheetAutoApprovalPatch } from "../helper/timesheet-config.helper";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PERIOD_CODE = "PP-20260826-20260911";
const EXECUTE = process.argv.includes("--execute");
const MANILA_TODAY = "2026-09-03";

const p = new PrismaClient();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidenceDir = join(".runtime", `bio-payroll-${PERIOD_CODE}-${stamp}`);
mkdirSync(evidenceDir, { recursive: true });

function dump(name: string, data: unknown) {
	const file = join(evidenceDir, name);
	writeFileSync(file, JSON.stringify(data, null, 2));
	console.log(`  evidence: ${file}`);
}

function materializeErrorsThrow(err: Error): never {
	throw err;
}

async function main() {
	console.log(`=== Bio payroll run ${PERIOD_CODE} mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"} ===`);
	const period = await p.payrollPeriod.findFirst({
		where: { code: PERIOD_CODE, isDeleted: false },
	});
	if (!period) throw new Error("PERIOD_NOT_FOUND");
	const organizationId = period.organizationId;
	console.log(`period ${period.id} ${period.startDate.toISOString().slice(0, 10)} → ${period.endDate.toISOString().slice(0, 10)} status=${period.status} org=${organizationId}`);

	const calculator = period.calculatorId;
	if (!calculator) throw new Error("NO_CALCULATOR_ASSIGNED");
	console.log(`calculator ${calculator}`);

	// --- Scope freeze -------------------------------------------------------
	const eligible = (await p.$queryRawUnsafe(
		`SELECT id, "employeeId", "basicSalary", "payFrequency", "employmentStatus"
		FROM employees
		WHERE "organizationId" = $1 AND "isDeleted" = false
			AND "workforceSource" = 'DIRECT'
			AND "employmentStatus" IN ('ACTIVE','ONBOARDING')
			AND ("employmentStartDate" IS NULL OR "employmentStartDate" <= $2)
		ORDER BY "employeeId"`,
		organizationId,
		period.endDate,
	)) as any[];
	const withBasic = eligible.filter((e) => Number(e.basicSalary) > 0);
	console.log(`eligible DIRECT employees: ${eligible.length} (basicSalary>0: ${withBasic.length})`);

	const existingTimesheets = (await p.$queryRawUnsafe(
		`SELECT id, "employeeId", status FROM timesheets WHERE "payrollPeriodId" = $1 AND "isDeleted" = false`,
		period.id,
	)) as any[];
	if (existingTimesheets.length > 0 && !EXECUTE) {
		console.log(`existing timesheets in period: ${existingTimesheets.length} (run continues in dry-run read-only view)`);
	}

	const obligations = (await p.$queryRawUnsafe(
		`SELECT o.id, o."employeeId", o.status, o.date::text
		FROM attendance_obligations o
		INNER JOIN employees e ON e.id = o."employeeId"
		WHERE o."payrollPeriodId" = $1 AND o."isDeleted" = false
			AND e."workforceSource" = 'DIRECT'
			AND UPPER(o.status) <> 'EXPECTED'
			AND o.date <= $2::date
		ORDER BY o."employeeId", o.date`,
		period.id,
		MANILA_TODAY,
	)) as any[];
	const obByEmployee = new Map<string, any[]>();
	for (const o of obligations) {
		if (!obByEmployee.has(o.employeeId)) obByEmployee.set(o.employeeId, []);
		obByEmployee.get(o.employeeId)!.push(o);
	}
	const statusCounts: Record<string, number> = {};
	for (const o of obligations) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
	console.log(`evidence obligations (<= ${MANILA_TODAY}, non-EXPECTED): ${obligations.length}`, statusCounts);

	const plan = {
		periodId: period.id,
		periodCode: PERIOD_CODE,
		organizationId,
		eligibleEmployees: eligible.length,
		eligibleWithBasicSalary: withBasic.length,
		existingTimesheetsBefore: existingTimesheets.length,
		evidenceObligations: obligations.length,
		evidenceEmployees: obByEmployee.size,
		evidenceStatusCounts: statusCounts,
		excluded: {
			expectedObligations: "skipped (no biometric/schedule evidence — day-status REVIEW truth)",
			futureDays: "bounded to " + MANILA_TODAY,
		},
		mode: EXECUTE ? "EXECUTE" : "DRY_RUN",
	};
	dump("01-plan.json", plan);

	if (!EXECUTE) {
		console.log("DRY-RUN: no writes. Re-run with --execute to create drafts, materialize lines, auto-approve, and generate payroll.");
		return;
	}

	// Operator rule (2026-09-03): employees with NO attendance evidence get NO
	// payroll. Scope drafts + approval + generation to evidence-backed people only.
	const evidenceEmployeeIds = Array.from(obByEmployee.keys());
	const eligibleById = new Map(eligible.map((e) => [e.id, e]));
	const evidenceEligible = evidenceEmployeeIds
		.map((id) => eligibleById.get(id))
		.filter((e): e is any => Boolean(e) && Number(e.basicSalary) > 0);
	console.log(`evidence-backed eligible employees (basicSalary>0): ${evidenceEligible.length}`);

	// --- Phase A: create missing drafts (evidence-backed employees only) ----
	const existingByEmployee = new Set(existingTimesheets.map((t) => t.employeeId));
	const missing = evidenceEligible.filter((e) => !existingByEmployee.has(e.id));
	const codePrefix = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${Date.now()}`;
	let created = 0;
	const createdIds: string[] = [];
	for (const e of missing) {
		try {
			const ts = await p.timesheet.create({
				data: {
					code: `${codePrefix}-${e.id}`,
					organizationId,
					employeeId: e.id,
					payrollPeriodId: period.id,
					totalDays: 0,
					totalHoursWorked: "0:00",
					totalRegularHours: "0:00",
					totalOvertimeHours: "0:00",
					totalUndertimeHours: "0:00",
					totalLateHours: "0:00",
					totalEarlyOutHours: "0:00",
					status: "DRAFT",
					notes: "Bio-attendance payroll run 2026-09-03 (auto-approve default)",
					editPermissionStatus: "NONE",
				},
				select: { id: true },
			});
			createdIds.push(ts.id);
			created++;
		} catch (err: any) {
			// Concurrent draft preparer (DEV watcher) may have created it first.
			const existing = await p.timesheet.findFirst({
				where: { organizationId, payrollPeriodId: period.id, employeeId: e.id, isDeleted: false },
				select: { id: true },
			});
			if (existing) createdIds.push(existing.id);
			else materializeErrorsThrow(err);
		}
	}
	console.log(`drafts created: ${created}`);

	// --- Phase B: materialize lines from evidence obligations ---------------
	let materialized = 0;
	const materializeErrors: any[] = [];
	for (const [employeeId, empObligations] of obByEmployee) {
		const timesheet = await p.timesheet.findFirst({
			where: { organizationId, payrollPeriodId: period.id, employeeId, isDeleted: false },
			select: { id: true },
		});
		if (!timesheet) continue;
		try {
			// Materialize the full evidence range for this employee (<= today).
			const fromDate = empObligations[0].date;
			const toDate = MANILA_TODAY;
			const lines = await materializeTimesheetLinesFromObligations(p, {
				organizationId,
				employeeId,
				payrollPeriodId: period.id,
				timesheetId: timesheet.id,
				fromDate,
				toDate,
				skipEnsureAttendanceObligations: true,
			});
			materialized += lines.length;
		} catch (err: any) {
			materializeErrors.push({ employeeId, error: err.message });
		}
	}
	console.log(`lines materialized: ${materialized} (errors: ${materializeErrors.length})`);
	dump("02-materialize.json", { materialized, errors: materializeErrors });

	// --- Phase C: auto-approve evidence-backed DIRECT drafts (org default) --
	// Scope: DIRECT employees with materialized evidence lines only. A
	// concurrent draft-preparer also creates AGENCY drafts for this period;
	// those (and line-less DIRECT drafts) stay untouched.
	const now = new Date();
	const patch = buildTimesheetAutoApprovalPatch(null, now);
	const approved = await p.$executeRawUnsafe(
		`UPDATE timesheets t
		SET status = 'APPROVED',
			"approvedBy" = $1,
			"approvalDate" = $2,
			metadata = $3::jsonb
		FROM employees e
		WHERE t."employeeId" = e.id
			AND t."payrollPeriodId" = $4
			AND t."isDeleted" = false
			AND e."workforceSource" = 'DIRECT'
			AND t.status IN ('DRAFT','REVISED','REJECTED','SUBMITTED')
			AND EXISTS (
				SELECT 1 FROM timesheet_lines tl
				WHERE tl."timesheetId" = t.id AND tl."isDeleted" = false AND tl."isEffective" = true
			)`,
		patch.approvedBy,
		patch.approvalDate,
		JSON.stringify(patch.metadata),
		period.id,
	);
	console.log(`auto-approved DIRECT timesheets with lines: ${approved}`);
	dump("03-auto-approve.json", { approved, actor: patch.approvedBy, at: now.toISOString(), scope: "DIRECT-only" });

	// --- Phase D: generate payroll (engine identical to endpoint) -----------
	const runId = `bio-payroll-${stamp}`;
	let processed = 0;
	const progressErrors: any[] = [];
	const result = await generatePayrollFromTimesheets(p, period.id, organizationId, "SYSTEM_AUTO_APPROVE", {
		generationRunId: runId,
		onProgress: ({ processed: done, success, failed, employeeId, error }) => {
			processed = done;
			if (failed > 0 && error) progressErrors.push({ employeeId, error });
			if (done % 100 === 0) console.log(`  progress ${done} (success=${success} failed=${failed})`);
		},
	});
	console.log(`generation done: success=${result.generated} failed=${result.errors} total=${result.total}`);
	dump("04-generation.json", {
		runId,
		...result,
		processed,
		progressErrors: progressErrors.slice(0, 50),
	});

	// --- Phase E: reread proof ----------------------------------------------
	const payrollCount = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt,
			SUM("grossPay")::text AS gross, SUM("netPay")::text AS net, SUM("totalReceivable")::text AS tr
		FROM employee_payrolls WHERE "payrollPeriodId" = $1 AND "isDeleted" = false`,
		period.id,
	)) as any[];
	const lineCounts = (await p.$queryRawUnsafe(
		`SELECT tl.status, COUNT(*)::int AS cnt
		FROM timesheet_lines tl
		INNER JOIN timesheets t ON t.id = tl."timesheetId"
		WHERE t."payrollPeriodId" = $1 AND tl."isDeleted" = false AND tl."isEffective" = true
		GROUP BY tl.status ORDER BY 2 DESC`,
		period.id,
	)) as any[];
	const locked = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS locked FROM timesheets WHERE "payrollPeriodId" = $1 AND "lockedAt" IS NOT NULL`,
		period.id,
	)) as any[];
	const tsStatus = (await p.$queryRawUnsafe(
		`SELECT status, COUNT(*)::int AS cnt FROM timesheets WHERE "payrollPeriodId" = $1 AND "isDeleted" = false GROUP BY status`,
		period.id,
	)) as any[];
	const proof = {
		payrollRows: payrollCount[0],
		lineStatusCounts: lineCounts,
		lockedTimesheets: locked[0],
		timesheetStatusAfter: tsStatus,
	};
	console.log("PROOF", JSON.stringify(proof, null, 1));
	dump("05-reread-proof.json", proof);
	dump("06-created-timesheet-ids.json", { createdIds });
	console.log(`=== DONE (${EXECUTE ? "EXECUTE" : "DRY-RUN"}) evidence in ${evidenceDir} ===`);
}

main()
	.then(() => p.$disconnect())
	.catch((e) => {
		console.error("ERR", e);
		process.exit(1);
	});
