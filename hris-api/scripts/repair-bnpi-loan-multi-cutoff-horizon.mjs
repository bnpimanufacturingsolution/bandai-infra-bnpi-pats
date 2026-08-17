/**
 * Repair BNPI EmployeeLoan date windows so recurring loans apply across cutoffs.
 *
 * Usage (local Docker clone hris-local-dev-clone):
 *   node hris-api/scripts/repair-bnpi-loan-multi-cutoff-horizon.mjs
 *   node hris-api/scripts/repair-bnpi-loan-multi-cutoff-horizon.mjs --execute
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const execute = process.argv.includes("--execute");
const MIN_TERM = 24;
const HORIZON_FLOOR = "2026-12-31";
const evidenceDir = path.join(root, ".runtime", "prior-deduction-recur-20260817");

function runSql(sql) {
	fs.mkdirSync(evidenceDir, { recursive: true });
	const out = execSync(
		`docker exec -i hris-local-dev-clone psql -U postgres -d hris -v ON_ERROR_STOP=1`,
		{
			input: sql,
			encoding: "utf8",
			maxBuffer: 20 * 1024 * 1024,
		},
	);
	return out;
}

function main() {
	const meta = {
		mode: execute ? "execute" : "dry-run",
		minTermMonths: MIN_TERM,
		horizonFloor: HORIZON_FLOOR,
		at: new Date().toISOString(),
	};
	console.log(JSON.stringify(meta, null, 2));

	const before = runSql(`
SELECT
  count(*) FILTER (WHERE el."endDate" < DATE '2026-07-11') AS ended_before_jul11,
  count(*) FILTER (
    WHERE el."endDate" >= DATE '2026-07-11'
      AND el."startDate" <= DATE '2026-07-25'
  ) AS overlaps_jul11_25,
  count(*) AS total_active
FROM employee_loans el
WHERE el."isDeleted" = false
  AND el.status IN ('ACTIVE', 'APPROVED');
`);
	console.log("--- BEFORE ---");
	console.log(before);

	if (!execute) {
		console.log(
			JSON.stringify(
				{
					wouldUpdateLoanTypes: `maxTermMonths = GREATEST(maxTermMonths, ${MIN_TERM})`,
					wouldUpdateLoans: `ACTIVE/APPROVED/PENDING with endDate < ${HORIZON_FLOOR}`,
					hint: "Re-run with --execute to apply",
				},
				null,
				2,
			),
		);
		fs.writeFileSync(
			path.join(evidenceDir, "loan-horizon-repair-dry-run.json"),
			JSON.stringify({ meta, before }, null, 2),
		);
		return;
	}

	const apply = runSql(`
BEGIN;

UPDATE loan_types
SET "maxTermMonths" = GREATEST(COALESCE("maxTermMonths", 0), ${MIN_TERM}),
    "updatedAt" = NOW()
WHERE "isDeleted" = false
  AND COALESCE("maxTermMonths", 0) < ${MIN_TERM};

UPDATE employee_loans el
SET
  "termMonths" = GREATEST(COALESCE(el."termMonths", 0), ${MIN_TERM}),
  "endDate" = GREATEST(
    el."endDate",
    (el."startDate" + (${MIN_TERM} || ' months')::interval)::date,
    DATE '${HORIZON_FLOOR}'
  ),
  notes = CASE
    WHEN el.notes IS NULL OR el.notes = '' THEN 'multi-cutoff horizon repair 2026-08-17'
    WHEN el.notes LIKE '%multi-cutoff horizon repair 2026-08-17%' THEN el.notes
    ELSE el.notes || ' | multi-cutoff horizon repair 2026-08-17'
  END,
  "updatedAt" = NOW()
WHERE el."isDeleted" = false
  AND el.status IN ('ACTIVE', 'APPROVED', 'PENDING')
  AND el."endDate" < DATE '${HORIZON_FLOOR}';

COMMIT;

SELECT
  count(*) FILTER (WHERE el."endDate" < DATE '2026-07-11') AS ended_before_jul11,
  count(*) FILTER (
    WHERE el."endDate" >= DATE '2026-07-11'
      AND el."startDate" <= DATE '2026-07-25'
  ) AS overlaps_jul11_25,
  count(*) AS total_active
FROM employee_loans el
WHERE el."isDeleted" = false
  AND el.status IN ('ACTIVE', 'APPROVED');

SELECT name, "maxTermMonths" FROM loan_types WHERE "isDeleted" = false ORDER BY name;

SELECT e."employeeId", lt.name, el."monthlyPayment", el."startDate"::date, el."endDate"::date
FROM employee_loans el
JOIN employees e ON e.id = el."employeeId"
JOIN loan_types lt ON lt.id = el."loanTypeId"
WHERE e."employeeId" = '00032' AND el."isDeleted" = false
ORDER BY lt.name;
`);
	console.log("--- AFTER ---");
	console.log(apply);
	fs.writeFileSync(
		path.join(evidenceDir, "loan-horizon-repair-execute.txt"),
		`BEFORE\n${before}\nAFTER\n${apply}\n`,
		"utf8",
	);
}

main();
