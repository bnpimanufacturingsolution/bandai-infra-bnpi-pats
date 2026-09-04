import { PrismaClient } from "../generated/prisma";
import { generatePayrollFromTimesheets } from "../helper/payroll-period.helper";
import { materializeTimesheetLinesFromObligations } from "../helper/attendance-obligation.helper";
import { buildTimesheetAutoApprovalPatch } from "../helper/timesheet-config.helper";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PERIOD_CODE = process.argv[2] || "PP-20260811-20260826";
const EXECUTE = process.argv.includes("--execute");

const p = new PrismaClient();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const evidenceDir = join(".runtime", `bio-payroll-${PERIOD_CODE}-${stamp}`);
mkdirSync(evidenceDir, { recursive: true });

function dump(name: string, data: unknown) {
	writeFileSync(join(evidenceDir, name), JSON.stringify(data, null, 2));
}

const CONN_ERROR = /Can't reach database|Server has closed the connection|Connection.*(refused|reset|closed|timed out)|P1001|P1008|P1017|P2024|socket hang up|ECONNRESET|ETIMEDOUT|ECONNREFUSED/i;

async function withRetry<T>(fn: () => Promise<T>, attempts = 10, label = "", perAttemptTimeoutMs = 60000): Promise<T> {
	for (let i = 0; i < attempts; i++) {
		try {
			return await Promise.race([
				fn(),
				new Promise<never>((_, rej) =>
					setTimeout(() => rej(new Error(`PER_ATTEMPT_TIMEOUT_${perAttemptTimeoutMs}MS (${label})`)), perAttemptTimeoutMs),
				),
			]);
		} catch (e: any) {
			const msg = String(e?.message || e);
			const isConn = CONN_ERROR.test(msg) || msg.includes("PER_ATTEMPT_TIMEOUT");
			if (!isConn || i === attempts - 1) throw e;
			const delay = 1500 * Math.pow(2, Math.min(i, 5));
			console.log(`  retry ${i + 1}/${attempts} (${label}): ${msg.slice(0, 120)} — wait ${delay}ms`);
			try { await p.$disconnect(); } catch {}
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw new Error("unreachable");
}

async function main() {
	console.log(`=== Bio payroll run ${PERIOD_CODE} mode=${EXECUTE ? "EXECUTE" : "DRY-RUN"} ===`);
	const period = await p.payrollPeriod.findFirst({
		where: { code: PERIOD_CODE, isDeleted: false },
	});
	if (!period) throw new Error("PERIOD_NOT_FOUND");
	const organizationId = period.organizationId;
	const periodEndStr = period.endDate.toISOString().slice(0, 10);
	console.log(`period ${period.id} ${period.startDate.toISOString().slice(0, 10)} → ${periodEndStr} status=${period.status} org=${organizationId}`);

	const calculator = period.calculatorId;
	if (!calculator) throw new Error("NO_CALCULATOR");

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
		periodEndStr,
	)) as any[];
	const obByEmployee = new Map<string, any[]>();
	for (const o of obligations) {
		if (!obByEmployee.has(o.employeeId)) obByEmployee.set(o.employeeId, []);
		obByEmployee.get(o.employeeId)!.push(o);
	}
	const statusCounts: Record<string, number> = {};
	for (const o of obligations) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
	console.log(`evidence obligations (non-EXPECTED, ≤ ${periodEndStr}): ${obligations.length}`, statusCounts);

	const plan = {
		periodId: period.id,
		periodCode: PERIOD_CODE,
		organizationId,
		evidenceObligations: obligations.length,
		evidenceEmployees: obByEmployee.size,
		evidenceStatusCounts: statusCounts,
		mode: EXECUTE ? "EXECUTE" : "DRY_RUN",
	};
	dump("01-plan.json", plan);

	if (!EXECUTE) {
		console.log("DRY-RUN: no writes. Re-run with --execute to create drafts, materialize lines, auto-approve, and generate payroll.");
		return;
	}

	const evidenceEmployeeIds = Array.from(obByEmployee.keys());
	const existingTimesheets = (await p.$queryRawUnsafe(
		`SELECT id, "employeeId", status FROM timesheets WHERE "payrollPeriodId" = $1 AND "isDeleted" = false`,
		period.id,
	)) as any[];
	const existingByEmp = new Set(existingTimesheets.map((t) => t.employeeId));
	const codePrefix = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${Date.now()}`;
	let created = 0;
	const createdIds: string[] = [];
	for (const eid of evidenceEmployeeIds) {
		if (existingByEmp.has(eid)) continue;
		try {
			const ts = await p.timesheet.create({
				data: {
					code: `${codePrefix}-${eid}`,
					organizationId,
					employeeId: eid,
					payrollPeriodId: period.id,
					totalDays: 0,
					totalHoursWorked: "0:00",
					totalRegularHours: "0:00",
					totalOvertimeHours: "0:00",
					totalUndertimeHours: "0:00",
					totalLateHours: "0:00",
					totalEarlyOutHours: "0:00",
					status: "DRAFT",
					notes: `Bio-attendance payroll run ${stamp} (auto-approve default)`,
					editPermissionStatus: "NONE",
				},
				select: { id: true },
			});
			createdIds.push(ts.id);
			created++;
		} catch (_) {
			const existing = await p.timesheet.findFirst({
				where: { organizationId, payrollPeriodId: period.id, employeeId: eid, isDeleted: false },
				select: { id: true },
			});
			if (existing) createdIds.push(existing.id);
		}
	}
	console.log(`drafts created: ${created}`);

	let materialized = 0;
	const materializeErrors: any[] = [];
	let processedEmployees = 0;
	let skippedDays = 0;
	// Cleanup: soft-delete phantom lines derived from EXPECTED (no-punch)
	// obligations by the earlier range-materialization runs.
	const cleaned = await withRetry(
		() =>
			p.$executeRawUnsafe(
				`UPDATE timesheet_lines tl
				SET "isDeleted" = true, "isEffective" = false
				FROM timesheets t
				WHERE tl."timesheetId" = t.id
					AND t."payrollPeriodId" = $1
					AND tl."isDeleted" = false
					AND tl.metadata->'source'->>'type' = 'ATTENDANCE_OBLIGATION'
					AND tl.metadata->'source'->>'status' = 'EXPECTED'`,
				period.id,
			),
		8,
		"phantom-cleanup",
	);
	console.log(`phantom EXPECTED-derived lines cleaned: ${cleaned}`);
	// Exact completion skip-set: existing effective (employeeId|date) lines.
	const existingLineKeys = new Set<string>(
		(
			(await withRetry(
				() =>
					p.$queryRawUnsafe(
						`SELECT t."employeeId" AS eid, tl.date::text AS d
						FROM timesheet_lines tl
						INNER JOIN timesheets t ON t.id = tl."timesheetId"
						WHERE t."payrollPeriodId" = $1 AND tl."isDeleted" = false AND tl."isEffective" = true`,
						period.id,
					),
				8,
				"existing-lines",
			)) as any[]
		).map((r) => `${r.eid}|${String(r.d).slice(0, 10)}`),
	);
	for (const [employeeId, empObligations] of obByEmployee) {
		await withRetry(async () => {
			const timesheet = await p.timesheet.findFirst({
				where: { organizationId, payrollPeriodId: period.id, employeeId, isDeleted: false },
				select: { id: true },
			});
			if (!timesheet) return;
			// Per-DAY materialization: the range fromDate=toDate=each evidence date so
			// the helper's internal range query can never pick up EXPECTED
			// (no-punch) obligations and turn them into ABSENT charges.
			for (const ob of empObligations) {
				const dayKey = `${employeeId}|${String(ob.date).slice(0, 10)}`;
				if (existingLineKeys.has(dayKey)) {
					skippedDays++;
					continue;
				}
				const lines = await materializeTimesheetLinesFromObligations(p, {
					organizationId,
					employeeId,
					payrollPeriodId: period.id,
					timesheetId: timesheet.id,
					fromDate: ob.date,
					toDate: ob.date,
					skipEnsureAttendanceObligations: true,
				});
				materialized += lines.length;
				existingLineKeys.add(dayKey);
			}
		}, 8, `materialize-${employeeId}`);
		processedEmployees++;
		if (processedEmployees % 25 === 0) {
			console.log(`  materialized ${processedEmployees}/${obByEmployee.size} employees (new lines: ${materialized}, skipped: ${skippedDays})`);
		}
	}
	console.log(`lines materialized: ${materialized} (errors: ${materializeErrors.length}, skipped existing: ${skippedDays})`);
	dump("02-materialize.json", { materialized, errors: materializeErrors });

	const now = new Date();
	const patch = buildTimesheetAutoApprovalPatch(null, now);
	const approved = await withRetry(() =>
		p.$executeRawUnsafe(
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
			patch.approvedBy, patch.approvalDate, JSON.stringify(patch.metadata), period.id,
		),
	8,
	"auto-approve",
	);
	console.log(`auto-approved: ${approved}`);
	dump("03-auto-approve.json", { approved, actor: patch.approvedBy, at: now.toISOString() });

	const runId = `bio-payroll-${stamp}`;
	const result = await withRetry(
		() =>
			generatePayrollFromTimesheets(p, period.id, organizationId, "SYSTEM_AUTO_APPROVE", {
				generationRunId: runId,
				onProgress: ({ processed: done, success, failed }) => {
					if (done % 25 === 0) console.log(`  progress ${done} (success=${success} failed=${failed})`);
				},
			}),
		4,
		"generate",
		30 * 60 * 1000,
	);
	console.log(`generation: success=${result.generated} failed=${result.errors} total=${result.total}`);
	dump("04-generation.json", { runId, ...result });

	const payrollCount = (await p.$queryRawUnsafe(
		`SELECT COUNT(*)::int AS cnt, SUM("grossPay")::text AS gross, SUM("netPay")::text AS net, SUM("totalReceivable")::text AS tr
		FROM employee_payrolls WHERE "payrollPeriodId" = $1 AND "isDeleted" = false`,
		period.id,
	)) as any[];
	const tsStatus = (await p.$queryRawUnsafe(
		`SELECT t.status, COUNT(*)::int AS cnt FROM timesheets t
		INNER JOIN employees e ON e.id = t."employeeId"
		WHERE t."payrollPeriodId" = $1 AND t."isDeleted" = false AND e."workforceSource" = 'DIRECT'
		GROUP BY t.status`,
		period.id,
	)) as any[];
	const proof = { payrollRows: payrollCount[0], timesheetStatusAfter: tsStatus };
	console.log("PROOF", JSON.stringify(proof, null, 1));
	dump("05-reread-proof.json", proof);
	console.log(`=== DONE evidence in ${evidenceDir} ===`);
}

main()
	.then(() => p.$disconnect())
	.catch((e) => { console.error("ERR", e.message); process.exit(1); });