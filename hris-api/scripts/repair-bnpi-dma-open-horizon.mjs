/**
 * Repair BNPI De Minimis Allowance (DMA) as open-horizon EVERY_CUTOFF.
 *
 * Root cause: workbook/mass seeds pinned payrollPeriodId + short endDate
 * (e.g. 2026-04-26..2026-05-10). Jul COMP mass has 0 DMA rows, so Jul app DMA=0
 * while Sheet2 still pays De Minimis.
 *
 * Amount source (operator choice): latest Sheet2 Jul amount per employee.
 *
 * Usage (local Docker clone hris-local-dev-clone on 5433):
 *   node hris-api/scripts/repair-bnpi-dma-open-horizon.mjs
 *   node hris-api/scripts/repair-bnpi-dma-open-horizon.mjs --execute
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
const START_FLOOR = process.env.DMA_START_FLOOR || "2026-07-11";
const TARGET_XLSX =
	process.env.TARGET_XLSX ||
	path.join(root, ".runtime/tally-jul11-25-20260817/hris_payroll_jul11_unlocked.xlsx");
const evidenceDir = path.join(
	root,
	".runtime",
	`dma-open-horizon-repair-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
);

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
	if (!s || s === "undefined" || s === "null") return "";
	// Sheet2 footer rows (GRAND TOTAL) must not become enrollments.
	if (!/^\d+$/.test(s)) return "";
	return s.padStart(5, "0");
}

function loadSheet2Dma() {
	const wb = XLSX.readFile(TARGET_XLSX, { cellDates: true });
	const ws = wb.Sheets.Sheet2;
	if (!ws) throw new Error(`Sheet2 missing in ${TARGET_XLSX}`);
	const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
	const headers = rows[3].map((h) => (h == null ? "" : String(h).trim()));
	const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
	if (idx["Emp. No."] == null || idx["De Minimis Allowance"] == null) {
		throw new Error(
			`Sheet2 missing Emp. No. or De Minimis Allowance. Headers: ${headers.slice(0, 20).join("|")}`,
		);
	}
	const byCode = new Map();
	for (let i = 4; i < rows.length; i++) {
		const r = rows[i];
		if (!r) continue;
		const code = normCode(r[idx["Emp. No."]]);
		if (!code) continue;
		const amount = money(r[idx["De Minimis Allowance"]]);
		// Catalog DMA is typically ₱150–₱3500; reject footer/misaligned cells.
		if (!(amount > 0) || amount > 20000) continue;
		byCode.set(code, {
			code,
			name: String(r[idx["Employee Name"]] || "").trim(),
			amount: Math.round((amount + Number.EPSILON) * 100) / 100,
		});
	}
	return byCode;
}

function runSql(sql) {
	fs.mkdirSync(evidenceDir, { recursive: true });
	return execSync(
		`docker exec -i hris-local-dev-clone psql -U postgres -d hris -v ON_ERROR_STOP=1`,
		{
			input: sql,
			encoding: "utf8",
			maxBuffer: 40 * 1024 * 1024,
		},
	);
}

function sqlLiteral(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
	fs.mkdirSync(evidenceDir, { recursive: true });
	const sheet = loadSheet2Dma();
	const amounts = [...sheet.values()];
	const amountHist = {};
	for (const row of amounts) {
		const key = String(row.amount);
		amountHist[key] = (amountHist[key] || 0) + 1;
	}

	const meta = {
		mode: execute ? "execute" : "dry-run",
		orgId: ORG_ID,
		startFloor: START_FLOOR,
		targetXlsx: TARGET_XLSX,
		sheetDmaPositive: amounts.length,
		amountHist,
		at: new Date().toISOString(),
	};
	console.log(JSON.stringify(meta, null, 2));
	fs.writeFileSync(path.join(evidenceDir, "meta.json"), JSON.stringify(meta, null, 2));

	const before = runSql(`
SELECT
  count(*)::int AS total_dma,
  count(*) FILTER (WHERE eb."payrollPeriodId" IS NULL)::int AS open_horizon,
  count(*) FILTER (
    WHERE eb."isActive" = true
      AND eb.status IN ('ACTIVE','APPROVED')
      AND (eb."endDate" IS NULL OR eb."endDate" >= DATE '2026-07-11')
      AND eb."startDate" <= DATE '2026-07-25'
  )::int AS applies_jul11_25,
  count(*) FILTER (WHERE eb."endDate" < DATE '2026-07-11')::int AS ended_before_jul
FROM employee_benefits eb
JOIN benefit_types bt ON bt.id = eb."benefitTypeId"
WHERE eb."organizationId" = ${sqlLiteral(ORG_ID)}
  AND eb."isDeleted" = false
  AND upper(bt.code) = 'DMA';
`);
	console.log("--- BEFORE ---");
	console.log(before);
	fs.writeFileSync(path.join(evidenceDir, "before.txt"), before);

	const valuesSql = amounts
		.map((r) => `(${sqlLiteral(r.code)}, ${r.amount}::numeric)`)
		.join(",\n");

	if (!execute) {
		const preview = {
			wouldUpsert: amounts.length,
			samples: amounts.slice(0, 12),
			hint: "Re-run with --execute to apply open-horizon DMA from Jul Sheet2 amounts",
		};
		console.log(JSON.stringify(preview, null, 2));
		fs.writeFileSync(path.join(evidenceDir, "dry-run.json"), JSON.stringify(preview, null, 2));
		return;
	}

	const stamp = "DMA open-horizon repair from Jul Sheet2 2026-08-18";
	const apply = runSql(`
BEGIN;

WITH sheet AS (
  SELECT * FROM (VALUES
${valuesSql}
  ) AS t(emp_code, amount)
),
dma_type AS (
  SELECT id, name
  FROM benefit_types
  WHERE "organizationId" = ${sqlLiteral(ORG_ID)}
    AND "isDeleted" = false
    AND upper(code) = 'DMA'
  ORDER BY "updatedAt" DESC
  LIMIT 1
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
    eb.id,
    eb."employeeId",
    eb."startDate"
  FROM employee_benefits eb
  JOIN dma_type dt ON dt.id = eb."benefitTypeId"
  WHERE eb."organizationId" = ${sqlLiteral(ORG_ID)}
    AND eb."isDeleted" = false
  ORDER BY eb."employeeId",
    (eb."payrollPeriodId" IS NULL) DESC,
    eb."updatedAt" DESC
),
upd AS (
  UPDATE employee_benefits eb
  SET
    amount = emps.amount,
    "totalAmount" = emps.amount,
    "installmentAmount" = emps.amount,
    "remainingBalance" = emps.amount,
    "totalInstallments" = 0,
    "payrollPeriodId" = NULL,
    "startDate" = LEAST(COALESCE(eb."startDate", DATE '${START_FLOOR}'), DATE '${START_FLOOR}'),
    "endDate" = NULL,
    "startPayrollCutOff" = LEAST(COALESCE(eb."startPayrollCutOff", eb."startDate", DATE '${START_FLOOR}'), DATE '${START_FLOOR}'),
    "endPayrollCutOff" = NULL,
    "scheduleMode" = 'RECURRING',
    "recurrenceFrequency" = 'EVERY_CUTOFF',
    "isActive" = true,
    status = 'ACTIVE',
    name = COALESCE(eb.name, (SELECT name FROM dma_type)),
    notes = CASE
      WHEN eb.notes IS NULL OR eb.notes = '' THEN ${sqlLiteral(stamp)}
      WHEN eb.notes LIKE ${sqlLiteral("%" + stamp + "%")} THEN eb.notes
      ELSE eb.notes || ' | ' || ${sqlLiteral(stamp)}
    END,
    "updatedAt" = NOW()
  FROM emps
  JOIN existing x ON x."employeeId" = emps.employee_pk
  WHERE eb.id = x.id
  RETURNING eb.id, emps.emp_code, eb.amount
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
  SELECT
    substr(md5(random()::text || clock_timestamp()::text || emps.employee_pk), 1, 25),
    ${sqlLiteral(ORG_ID)},
    emps.employee_pk,
    (SELECT id FROM dma_type),
    (SELECT name FROM dma_type),
    emps.amount,
    emps.amount,
    emps.amount,
    emps.amount,
    0,
    NULL,
    DATE '${START_FLOOR}',
    NULL,
    DATE '${START_FLOOR}',
    NULL,
    'RECURRING',
    'EVERY_CUTOFF',
    false,
    'ENROLLED_ALWAYS',
    true,
    false,
    false,
    false,
    true,
    'ACTIVE',
    'PHP',
    true,
    ${sqlLiteral(stamp)},
    NOW(),
    NOW(),
    false
  FROM emps
  WHERE NOT EXISTS (
    SELECT 1 FROM existing x WHERE x."employeeId" = emps.employee_pk
  )
  RETURNING id, "employeeId", amount
),
missing_emp AS (
  SELECT s.emp_code, s.amount
  FROM sheet s
  WHERE NOT EXISTS (
    SELECT 1 FROM employees e
    WHERE e."organizationId" = ${sqlLiteral(ORG_ID)}
      AND e."isDeleted" = false
      AND e."employeeId" = s.emp_code
  )
)
SELECT 'updated' AS action, count(*)::int AS n FROM upd
UNION ALL
SELECT 'inserted', count(*)::int FROM ins
UNION ALL
SELECT 'missing_employee', count(*)::int FROM missing_emp;

COMMIT;

SELECT
  count(*)::int AS total_dma,
  count(*) FILTER (WHERE eb."payrollPeriodId" IS NULL)::int AS open_horizon,
  count(*) FILTER (
    WHERE eb."isActive" = true
      AND eb.status IN ('ACTIVE','APPROVED')
      AND (eb."endDate" IS NULL OR eb."endDate" >= DATE '2026-07-11')
      AND eb."startDate" <= DATE '2026-07-25'
  )::int AS applies_jul11_25,
  count(*) FILTER (WHERE eb."endDate" < DATE '2026-07-11')::int AS ended_before_jul
FROM employee_benefits eb
JOIN benefit_types bt ON bt.id = eb."benefitTypeId"
WHERE eb."organizationId" = ${sqlLiteral(ORG_ID)}
  AND eb."isDeleted" = false
  AND upper(bt.code) = 'DMA';

SELECT e."employeeId", eb.amount, eb."startDate"::date, eb."endDate"::date,
       eb."payrollPeriodId" IS NULL AS open_h, eb."scheduleMode", eb."recurrenceFrequency"
FROM employee_benefits eb
JOIN employees e ON e.id = eb."employeeId"
JOIN benefit_types bt ON bt.id = eb."benefitTypeId"
WHERE e."employeeId" IN ('00374','01360','00032','01484')
  AND eb."isDeleted" = false
  AND upper(bt.code) = 'DMA'
ORDER BY e."employeeId";
`);

	console.log("--- AFTER ---");
	console.log(apply);
	fs.writeFileSync(path.join(evidenceDir, "after.txt"), apply);
	console.log(`evidence: ${evidenceDir}`);
}

main();
