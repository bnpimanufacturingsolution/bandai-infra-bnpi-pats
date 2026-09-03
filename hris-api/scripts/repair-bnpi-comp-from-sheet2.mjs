/**
 * Repair BNPI period compensation from the unlocked Sheet2 register.
 *
 * Operator directive (2026-08-25): recurring comp/ded cannot rely on the single
 * cut's COMP mass file — fix compensation data USING Sheet2 amounts, with proof.
 *
 * - Open-horizon codes (DMA): upsert EVERY_CUTOFF enrollments (proven §14d path).
 * - Period-scoped codes (MLA, ARP, PFA, AON, LLA, TSA, OBA, OAD, HYS, OTM, ABS):
 *   upsert rows pinned to the cutoff and supersede open-horizon peers of the
 *   same code (same doctrine as the COMP mass upload).
 * - Leave is NOT handled here (imported via the period-leave import).
 *
 * Usage (local clone 5433 via docker exec psql):
 *   node hris-api/scripts/repair-bnpi-comp-from-sheet2.mjs            # dry-run plan
 *   node hris-api/scripts/repair-bnpi-comp-from-sheet2.mjs --execute
 *   --codes=DMA,ARP   # subset (default: all mapped codes with Sheet2 money)
 *
 * Local clone is testing only — replay on VM DB later.
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const execute = process.argv.includes("--execute");
const ORG_ID = process.env.ORG_ID || "cmryhwpv70000vgaktlmrubmx";
const PERIOD_ID = process.env.PERIOD_ID || "cmryhzl500032vgakz1uy1k7l";
const PERIOD_CODE = process.env.PERIOD_CODE || "PP-20260711-20260726";
const P_START = process.env.PERIOD_START || "2026-07-11";
const P_END = process.env.PERIOD_END || "2026-07-25";
const TARGET_XLSX =
	process.env.TARGET_XLSX ||
	path.join(root, ".runtime/tally-jul11-25-20260817/hris_payroll_jul11_unlocked.xlsx");
const stamp = `Comp-from-Sheet2 ${PERIOD_CODE} ${new Date().toISOString().slice(0, 10)}`;
const evidenceDir = path.join(
	root,
	".runtime",
	`comp-from-sheet2-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 13)}`,
);

const codesArg = process.argv.find((a) => a.startsWith("--codes="));
const onlyCodes = codesArg
	? codesArg.split("--codes=")[1].split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
	: null;

// Sheet2 column label -> benefit code wiring (roles from
// COMPENSATION_CODE_PAYROLL_ROLES in bnpi-mass-upload-import.helper.ts).
const COLUMN_CODES = [
	{ label: "De Minimis Allowance", code: "DMA", mode: "open", role: "GROSS_INCLUDED", taxable: false },
	// Operator directive 2026-08-25: MLA is RECURRING — open-horizon EVERY_CUTOFF
	// like DMA, so future cutoffs pay it without re-import (a future period-scoped
	// COMP mass row supersedes it automatically).
	{ label: "Meal Allowance", code: "MLA", mode: "open", role: "RECEIVABLE_ONLY", taxable: false },
	{ label: "Attendance Recognition Program", code: "ARP", mode: "period", role: "RECEIVABLE_ONLY", taxable: true },
	{ label: "Perfect Attendance", code: "PFA", mode: "period", role: "RECEIVABLE_ONLY", taxable: true },
	{ label: "Adjustment OT/ND", code: "AON", mode: "period", role: "GROSS_INCLUDED", taxable: true },
	{ label: "Line Leader Allowance", code: "LLA", mode: "period", role: "RECEIVABLE_ONLY", taxable: true },
	{ label: "Technical Skills Allowance", code: "TSA", mode: "period", role: "GROSS_INCLUDED", taxable: true },
	{ label: "OB Allowance", code: "OBA", mode: "period", role: "GROSS_INCLUDED", taxable: true },
	{ label: "Other Compensation", code: "OAD", mode: "period", role: "GROSS_INCLUDED", taxable: true },
	{ label: "HYS Meal Allowance", code: "HYS", mode: "period", role: "GROSS_INCLUDED", taxable: true },
	{ label: "Overtime Meal Allownce", code: "OTM", mode: "period", role: "GROSS_INCLUDED", taxable: true },
	{ label: "Adjustment Basic", code: "ABS", mode: "period", role: "GROSS_INCLUDED", taxable: true },
	{ label: "MWE Tax Adjustment", code: "MTX", mode: "period", role: "GROSS_INCLUDED", taxable: true },
];

function money(v) {
	if (v == null || v === "" || v === "-") return 0;
	if (typeof v === "number" && Number.isFinite(v)) return v;
	const s = String(v).replace(/,/g, "").replace(/PHP/gi, "").trim();
	if (!s || s === "-") return 0;
	const n = Number(s);
	return Number.isFinite(n) ? n : 0;
}

function normCode(v) {
	const s = String(v ?? "").trim();
	if (!/^\d+$/.test(s)) return ""; // footer rows (GRAND TOTAL) never enroll
	return s.padStart(5, "0");
}

function loadSheet2() {
	const wb = XLSX.readFile(TARGET_XLSX, { cellDates: true });
	const ws = wb.Sheets.Sheet2;
	if (!ws) throw new Error(`Sheet2 missing in ${TARGET_XLSX}`);
	const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
	const headers = rows[3].map((h) => (h == null ? "" : String(h).trim()));
	const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
	if (idx["Emp. No."] == null) throw new Error("Sheet2 missing Emp. No. column");
	const out = {};
	const unmappedMoney = {};
	for (let i = 4; i < rows.length; i++) {
		const r = rows[i];
		if (!r) continue;
		const code = normCode(r[idx["Emp. No."]]);
		if (!code) continue;
		for (const col of COLUMN_CODES) {
			const colIdx = idx[col.label];
			if (colIdx == null) continue;
			const amount = money(r[colIdx]);
			if (!(amount > 0) || amount > 200000) continue;
			(out[col.code] ||= new Map()).set(code, {
				code,
				name: String(r[idx["Employee Name"]] || "").trim(),
				amount: Math.round((amount + Number.EPSILON) * 100) / 100,
			});
		}
		// Transparency: money columns we do not map.
		for (const [h, colIdx] of Object.entries(idx)) {
			if (!h || colIdx == null) continue;
			if (COLUMN_CODES.some((c) => c.label === h)) continue;
			if (["Emp. No.", "Employee Name", "No.", "Daily Salary", "Monthly Salary", "No. of Days", "Basic Salary", "Absent-Amt", "UT/Late-Amt", "No. of Reg OT Hrs", "Reg OT", "Leave", "NetPay", "GrossPay", "TOTAL DEDN", "TotalReceivable", "W/Tax"].includes(h)) continue;
			const v = money(r[colIdx]);
			if (v > 0) {
				unmappedMoney[h] ||= { people: 0, sum: 0 };
				unmappedMoney[h].people++;
				unmappedMoney[h].sum += v;
			}
		}
	}
	return { out, unmappedMoney, headers };
}

function runSql(sql) {
	fs.mkdirSync(evidenceDir, { recursive: true });
	return execSync(
		`docker exec -i hris-local-dev-clone psql -U postgres -d hris -v ON_ERROR_STOP=1 -A -t`,
		{ input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
	);
}

function sqlLiteral(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

function valuesSql(list) {
	return list.map((r) => `(${sqlLiteral(r.code)}, ${r.amount}::numeric)`).join(",\n");
}

function ensureTypeSql(col) {
	return `
WITH ins AS (
  INSERT INTO benefit_types (
    id, "organizationId", code, name, category,
    "payrollDirection", "reconciliationAction", "isTaxable",
    description, "isDeleted", "createdAt", "updatedAt"
  )
  SELECT substr(md5(random()::text || clock_timestamp()::text), 1, 25),
         ${sqlLiteral(ORG_ID)}, ${sqlLiteral(col.code)}, ${sqlLiteral(col.label)}, 'ALLOWANCE',
         'COMPENSATION', ${sqlLiteral(col.role)}, ${col.taxable},
         ${sqlLiteral(`BNPI Sheet2 comp repair (${col.code})`)},
         false, NOW(), NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM benefit_types
    WHERE "organizationId" = ${sqlLiteral(ORG_ID)}
      AND "isDeleted" = false
      AND upper(code) = ${sqlLiteral(col.code)}
  )
  RETURNING id
),
upd AS (
  UPDATE benefit_types
  SET name = ${sqlLiteral(col.label)},
      "payrollDirection" = 'COMPENSATION',
      "reconciliationAction" = ${sqlLiteral(col.role)},
      "isTaxable" = ${col.taxable},
      "updatedAt" = NOW()
  WHERE "organizationId" = ${sqlLiteral(ORG_ID)}
    AND "isDeleted" = false
    AND upper(code) = ${sqlLiteral(col.code)}
  RETURNING id
)
SELECT id FROM ins
UNION ALL
SELECT id FROM upd
ORDER BY 1
LIMIT 1;`;
}

function openHorizonSql(col, typeId, list) {
	return `
BEGIN;
WITH sheet AS (
  SELECT * FROM (VALUES
${valuesSql(list)}
  ) AS t(emp_code, amount)
),
emps AS (
  SELECT e.id AS employee_pk, e."employeeId" AS emp_code, s.amount
  FROM sheet s
  JOIN employees e
    ON e."organizationId" = ${sqlLiteral(ORG_ID)}
   AND e."isDeleted" = false
   AND e."employeeId" = s.emp_code
),
existing AS (
  SELECT DISTINCT ON (eb."employeeId")
    eb.id, eb."employeeId", eb."startDate"
  FROM employee_benefits eb
  WHERE eb."organizationId" = ${sqlLiteral(ORG_ID)}
    AND eb."isDeleted" = false
    AND eb."benefitTypeId" = ${sqlLiteral(typeId)}
  ORDER BY eb."employeeId",
    (eb."payrollPeriodId" IS NULL) DESC,
    eb."updatedAt" DESC
),
upd AS (
  UPDATE employee_benefits eb
  SET amount = emps.amount, "totalAmount" = emps.amount,
      "installmentAmount" = emps.amount, "remainingBalance" = emps.amount,
      "totalInstallments" = 0, "payrollPeriodId" = NULL,
      "startDate" = LEAST(COALESCE(eb."startDate", DATE '${P_START}'), DATE '${P_START}'),
      "endDate" = NULL,
      "startPayrollCutOff" = LEAST(COALESCE(eb."startPayrollCutOff", eb."startDate", DATE '${P_START}'), DATE '${P_START}'),
      "endPayrollCutOff" = NULL,
      "scheduleMode" = 'RECURRING', "recurrenceFrequency" = 'EVERY_CUTOFF',
      "isActive" = true, status = 'ACTIVE',
      notes = CASE WHEN eb.notes IS NULL OR eb.notes = '' THEN ${sqlLiteral(stamp + ` ${col.code}`)}
                   WHEN eb.notes LIKE ${sqlLiteral("%" + stamp + "%")} THEN eb.notes
                   ELSE eb.notes || ' | ' || ${sqlLiteral(stamp + ` ${col.code}`)} END,
      "updatedAt" = NOW()
  FROM emps JOIN existing x ON x."employeeId" = emps.employee_pk
  WHERE eb.id = x.id
  RETURNING 'updated' AS action, emps.emp_code
),
ins AS (
  INSERT INTO employee_benefits (
    id, "organizationId", "employeeId", "benefitTypeId",
    name, amount, "totalAmount", "installmentAmount", "remainingBalance",
    "totalInstallments", "payrollPeriodId",
    "startDate", "endDate", "startPayrollCutOff", "endPayrollCutOff",
    "scheduleMode", "recurrenceFrequency",
    "attendanceBased", "eligibilityMode",
    "eligibilityDisqualifyOnAbsent", "eligibilityDisqualifyOnLate",
    "eligibilityDisqualifyOnUndertime", "eligibilityDisqualifyOnLeave",
    "isActive", status, currency, "agreedToTerms",
    notes, "createdAt", "updatedAt", "isDeleted"
  )
  SELECT substr(md5(random()::text || clock_timestamp()::text || emps.employee_pk), 1, 25),
         ${sqlLiteral(ORG_ID)}, emps.employee_pk, ${sqlLiteral(typeId)},
         ${sqlLiteral(col.label)}, emps.amount, emps.amount, emps.amount, emps.amount,
         0, NULL,
         DATE '${P_START}', NULL, DATE '${P_START}', NULL,
         'RECURRING', 'EVERY_CUTOFF',
         false, 'ENROLLED_ALWAYS', true, false, false, false,
         true, 'ACTIVE', 'PHP', true,
         ${sqlLiteral(stamp + ` ${col.code}`)}, NOW(), NOW(), false
  FROM emps
  WHERE NOT EXISTS (SELECT 1 FROM existing x WHERE x."employeeId" = emps.employee_pk)
  RETURNING 'inserted' AS action
),
missing_emp AS (
  SELECT s.emp_code FROM sheet s
  WHERE NOT EXISTS (
    SELECT 1 FROM employees e
    WHERE e."organizationId" = ${sqlLiteral(ORG_ID)}
      AND e."isDeleted" = false AND e."employeeId" = s.emp_code
  )
)
SELECT action, count(*)::int AS n FROM (
  SELECT action FROM upd UNION ALL SELECT action FROM ins
) x GROUP BY action
UNION ALL
SELECT 'missing_employee', count(*)::int FROM missing_emp;
COMMIT;`;
}

function periodPinnedSql(col, typeId, list) {
	return `
BEGIN;
WITH sheet AS (
  SELECT * FROM (VALUES
${valuesSql(list)}
  ) AS t(emp_code, amount)
),
emps AS (
  SELECT e.id AS employee_pk, e."employeeId" AS emp_code, s.amount
  FROM sheet s
  JOIN employees e
    ON e."organizationId" = ${sqlLiteral(ORG_ID)}
   AND e."isDeleted" = false
   AND e."employeeId" = s.emp_code
),
existing AS (
  SELECT DISTINCT ON (eb."employeeId")
    eb.id, eb."employeeId"
  FROM employee_benefits eb
  WHERE eb."organizationId" = ${sqlLiteral(ORG_ID)}
    AND eb."isDeleted" = false
    AND eb."benefitTypeId" = ${sqlLiteral(typeId)}
    AND eb."payrollPeriodId" = ${sqlLiteral(PERIOD_ID)}
  ORDER BY eb."employeeId", eb."updatedAt" DESC
),
upd AS (
  UPDATE employee_benefits eb
  SET amount = emps.amount, "totalAmount" = emps.amount,
      "installmentAmount" = emps.amount, "remainingBalance" = emps.amount,
      "totalInstallments" = 0,
      "startDate" = DATE '${P_START}', "endDate" = DATE '${P_END}',
      "startPayrollCutOff" = DATE '${P_START}', "endPayrollCutOff" = DATE '${P_END}',
      "scheduleMode" = 'RECURRING', "recurrenceFrequency" = 'EVERY_CUTOFF',
      "isActive" = true, status = 'ACTIVE',
      notes = CASE WHEN eb.notes IS NULL OR eb.notes = '' THEN ${sqlLiteral(stamp + ` ${col.code}`)}
                   WHEN eb.notes LIKE ${sqlLiteral("%" + stamp + "%")} THEN eb.notes
                   ELSE eb.notes || ' | ' || ${sqlLiteral(stamp + ` ${col.code}`)} END,
      "updatedAt" = NOW()
  FROM emps JOIN existing x ON x."employeeId" = emps.employee_pk
  WHERE eb.id = x.id
  RETURNING 'updated' AS action, emps.emp_code
),
ins AS (
  INSERT INTO employee_benefits (
    id, "organizationId", "employeeId", "benefitTypeId",
    name, amount, "totalAmount", "installmentAmount", "remainingBalance",
    "totalInstallments", "payrollPeriodId",
    "startDate", "endDate", "startPayrollCutOff", "endPayrollCutOff",
    "scheduleMode", "recurrenceFrequency",
    "attendanceBased", "eligibilityMode",
    "eligibilityDisqualifyOnAbsent", "eligibilityDisqualifyOnLate",
    "eligibilityDisqualifyOnUndertime", "eligibilityDisqualifyOnLeave",
    "isActive", status, currency, "agreedToTerms",
    notes, "createdAt", "updatedAt", "isDeleted"
  )
  SELECT substr(md5(random()::text || clock_timestamp()::text || emps.employee_pk), 1, 25),
         ${sqlLiteral(ORG_ID)}, emps.employee_pk, ${sqlLiteral(typeId)},
         ${sqlLiteral(col.label)}, emps.amount, emps.amount, emps.amount, emps.amount,
         0, ${sqlLiteral(PERIOD_ID)},
         DATE '${P_START}', DATE '${P_END}', DATE '${P_START}', DATE '${P_END}',
         'RECURRING', 'EVERY_CUTOFF',
         false, 'ENROLLED_ALWAYS', true, false, false, false,
         true, 'ACTIVE', 'PHP', true,
         ${sqlLiteral(stamp + ` ${col.code}`)}, NOW(), NOW(), false
  FROM emps
  WHERE NOT EXISTS (SELECT 1 FROM existing x WHERE x."employeeId" = emps.employee_pk)
  RETURNING 'inserted' AS action
),
supersede AS (
  UPDATE employee_benefits ob
  SET "endDate" = DATE '${P_START}' - INTERVAL '1 day',
      "endPayrollCutOff" = DATE '${P_START}' - INTERVAL '1 day',
      "isActive" = false, status = 'COMPLETED',
      notes = CASE WHEN ob.notes IS NULL OR ob.notes = '' THEN ${sqlLiteral("Superseded by " + stamp + ` ${col.code}`)}
                   ELSE ob.notes || ' | ' || ${sqlLiteral("Superseded by " + stamp + ` ${col.code}`)} END,
      "updatedAt" = NOW()
  WHERE ob."organizationId" = ${sqlLiteral(ORG_ID)}
    AND ob."isDeleted" = false
    AND ob."benefitTypeId" = ${sqlLiteral(typeId)}
    AND ob."payrollPeriodId" IS NULL
    AND ob."isActive" = true
    AND ob.status IN ('ACTIVE','APPROVED')
    AND (ob."endDate" IS NULL OR ob."endDate" >= DATE '${P_START}')
  RETURNING 'superseded_open' AS action, ob.id
),
missing_emp AS (
  SELECT s.emp_code FROM sheet s
  WHERE NOT EXISTS (
    SELECT 1 FROM employees e
    WHERE e."organizationId" = ${sqlLiteral(ORG_ID)}
      AND e."isDeleted" = false AND e."employeeId" = s.emp_code
  )
)
SELECT action, count(*)::int AS n FROM (
  SELECT action FROM upd UNION ALL SELECT action FROM ins UNION ALL SELECT action FROM supersede
) x GROUP BY action
UNION ALL
SELECT 'missing_employee', count(*)::int FROM missing_emp;
COMMIT;`;
}

function main() {
	fs.mkdirSync(evidenceDir, { recursive: true });
	const { out, unmappedMoney } = loadSheet2();

	const plan = [];
	for (const col of COLUMN_CODES) {
		if (onlyCodes && !onlyCodes.includes(col.code)) continue;
		const map = out[col.code];
		const people = map ? [...map.values()] : [];
		const sum = +people.reduce((a, r) => a + r.amount, 0).toFixed(2);
		plan.push({
			code: col.code,
			label: col.label,
			mode: col.mode,
			role: col.role,
			taxable: col.taxable,
			people: people.length,
			sum,
			samples: people.slice(0, 5).map((p) => `${p.code}=₱${p.amount}`),
			skip: people.length === 0 ? "no Sheet2 money this cut" : null,
		});
	}

	const meta = {
		mode: execute ? "execute" : "dry-run",
		orgId: ORG_ID,
		period: { id: PERIOD_ID, code: PERIOD_CODE, start: P_START, end: P_END },
		targetXlsx: TARGET_XLSX,
		plan,
		unmappedMoneyColumns: unmappedMoney,
		at: new Date().toISOString(),
	};
	console.log(JSON.stringify(meta, null, 2));
	fs.writeFileSync(path.join(evidenceDir, "plan.json"), JSON.stringify(meta, null, 2));

	if (!execute) {
		console.log("DRY-RUN ONLY — re-run with --execute to apply.");
		return;
	}

	const results = [];
	for (const col of COLUMN_CODES) {
		if (onlyCodes && !onlyCodes.includes(col.code)) continue;
		const people = out[col.code] ? [...out[col.code].values()] : [];
		if (people.length === 0) continue;
		const typeId = String(runSql(ensureTypeSql(col))).trim().split("\n").filter(Boolean).pop().trim();
		const sql = col.mode === "open"
			? openHorizonSql(col, typeId, people)
			: periodPinnedSql(col, typeId, people);
		const outText = runSql(sql);
		fs.writeFileSync(path.join(evidenceDir, `${col.code}-apply.txt`), outText);
		const counts = {};
		for (const line of outText.split("\n")) {
			const m = line.match(/^\s*([a-z_]+)\s+\|\s+(\d+)\s*$/i);
			if (m) counts[m[1]] = Number(m[2]);
		}
		results.push({ code: col.code, mode: col.mode, people: people.length, sum: +people.reduce((a, r) => a + r.amount, 0).toFixed(2), ...counts });
		console.log(`${col.code}: ${JSON.stringify(counts)}`);
	}

	fs.writeFileSync(path.join(evidenceDir, "executed.json"), JSON.stringify({ stamp, results }, null, 2));
	console.log(JSON.stringify({ evidenceDir, results }, null, 2));
}

main();
