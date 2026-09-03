/**
 * Prove MLA is applied by the same builder used in payroll + preview.
 * Usage (from hris-api): npx tsx scripts/prove-mla-payroll-sources.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "../generated/prisma-postgres/index.js";
import { buildPayrollSourceAmountsByEmployeeId } from "../helper/payroll-period.helper";

const prisma = new PrismaClient();

async function main() {
	const mlaRows = await prisma.$queryRawUnsafe<
		Array<{ id: string; code: string; reconciliationAction: string | null }>
	>(`SELECT id, code, "reconciliationAction" FROM benefit_types WHERE code='MLA' AND "isDeleted"=false LIMIT 1`);
	const mla = mlaRows[0];
	if (!mla) throw new Error("MLA type missing");

	const periodsWithTs = await prisma.$queryRawUnsafe<
		Array<{
			id: string;
			code: string;
			status: string;
			startDate: Date;
			endDate: Date;
			organizationId: string;
			approved_ts: number;
		}>
	>(`
    SELECT pp.id, pp.code, pp.status, pp."startDate", pp."endDate", pp."organizationId",
           count(t.id)::int AS approved_ts
    FROM payroll_periods pp
    JOIN timesheets t ON t."payrollPeriodId" = pp.id
      AND t.status = 'APPROVED' AND t."isDeleted" = false
    WHERE pp."isDeleted" = false
    GROUP BY pp.id
    ORDER BY approved_ts DESC
    LIMIT 5
  `);

	if (!periodsWithTs.length) {
		throw new Error("No period with approved timesheets");
	}
	const period = periodsWithTs[0];

	const both = await prisma.$queryRawUnsafe<
		Array<{ employee_pk: string; emp_no: string; amount: number; ts_id: string }>
	>(
		`
    SELECT e.id AS employee_pk, e."employeeId" AS emp_no, eb.amount, t.id AS ts_id
    FROM employee_benefits eb
    JOIN employees e ON e.id = eb."employeeId"
    JOIN timesheets t ON t."employeeId" = e.id
      AND t."payrollPeriodId" = $2
      AND t.status = 'APPROVED'
      AND t."isDeleted" = false
    WHERE eb."benefitTypeId" = $1 AND eb."isDeleted" = false AND eb."isActive" = true
    LIMIT 10
  `,
		mla.id,
		period.id,
	);

	const employeeIds =
		both.length > 0
			? both.map((b) => b.employee_pk)
			: (
					await prisma.$queryRawUnsafe<Array<{ employeeId: string }>>(
						`SELECT "employeeId" FROM employee_benefits WHERE "benefitTypeId"=$1 AND "isDeleted"=false AND "isActive"=true LIMIT 10`,
						mla.id,
					)
				).map((b) => b.employeeId);

	const map = await buildPayrollSourceAmountsByEmployeeId(prisma, {
		employeeIds,
		organizationId: period.organizationId,
		payrollPeriodId: period.id,
		startDate: new Date(period.startDate),
		endDate: new Date(period.endDate),
	});

	const proofs = employeeIds.map((employeeId) => {
		const entry = map.get(employeeId);
		const details = entry?.details || [];
		const mlaLines = details.filter(
			(d) =>
				String(d.code || "").toUpperCase() === "MLA" ||
				/meal allowance/i.test(String(d.name || "")) ||
				/meal allowance/i.test(String(d.benefitTypeName || "")),
		);
		const mealAmount = mlaLines.reduce((s, d) => s + Number(d.amount || 0), 0);
		return {
			employeeId,
			mealAmount,
			receivableOnlyBenefits: entry?.amounts?.receivableOnlyBenefits ?? 0,
			mlaLines,
			detailCount: details.length,
		};
	});

	const withMeal = proofs.filter((p) => p.mealAmount > 0).length;
	const report = {
		mla,
		period: {
			id: period.id,
			code: period.code,
			status: period.status,
			approved_ts: period.approved_ts,
			startDate: period.startDate,
			endDate: period.endDate,
		},
		overlapEmployeesWithApprovedTs: both.length,
		sampleSize: proofs.length,
		withMeal,
		allHaveMeal: withMeal === proofs.length && proofs.length > 0,
		proofs,
		periodsWithTs: periodsWithTs.map((p) => ({
			code: p.code,
			approved_ts: p.approved_ts,
		})),
	};

	const outDir = path.resolve(
		__dirname,
		"../../.runtime/mla-recurring-convert-20260810",
	);
	fs.mkdirSync(outDir, { recursive: true });
	fs.writeFileSync(
		path.join(outDir, "engine-source-proof.json"),
		JSON.stringify(report, null, 2),
	);
	console.log(JSON.stringify(report, null, 2));
	if (!report.allHaveMeal) {
		console.error("FAIL: MLA not present on all sample payroll sources");
		process.exit(2);
	}
	console.log("PROOF_OK engine buildPayrollSourceAmountsByEmployeeId");
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
