import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildEmployeePayrollComputationView } from "../app/employeepayroll/employeepayroll.controller";
import { EmployeePayrollComputationViewSchema } from "../zod/employeepayroll.zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const dumpPath = path.join(
	repoRoot,
	"test-results",
	"employee-payroll-source-dump",
	"01360-2026-04-26-2026-05-10.json",
);

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const assertMoney = (label: string, actual: number, expected: number) => {
	if (money(actual) !== money(expected)) {
		throw new Error(`${label}: expected ${expected}, got ${actual}`);
	}
};

const dump = JSON.parse(fs.readFileSync(dumpPath, "utf8"));
const employeePayroll = dump.existingEmployeePayroll;

if (!employeePayroll) {
	throw new Error(`Missing existingEmployeePayroll in ${dumpPath}`);
}

const view = EmployeePayrollComputationViewSchema.parse(
	buildEmployeePayrollComputationView(employeePayroll),
);

assertMoney("GrossPay rows total", view.grossPayFormula.rowsTotal, 13455.27);
assertMoney("GrossPay target", view.grossPayFormula.targetGrossPay, 13455.27);
assertMoney("GrossPay gap", view.grossPayFormula.gap, 0);
assertMoney("Total deductions rows total", view.deductionFormula.rowsTotal, 1079.68);
assertMoney("Total deductions target", view.deductionFormula.targetTotalDeductions, 1079.68);
assertMoney("Total deductions gap", view.deductionFormula.gap, 0);
assertMoney("NetPay", view.netPayFormula.netPay, 12375.59);
assertMoney("NetPay gap", view.netPayFormula.gap, 0);
assertMoney("TotalReceivable", view.totalReceivableFormula.totalReceivable, 13075.59);
assertMoney("TotalReceivable gap", view.totalReceivableFormula.gap, 0);

const requiredGrossFields = ["basicPay", "absentDeduction", "overtimePay", "obAllowance", "deMinimisAllowance", "adjustmentOtNd"];
const grossFields = new Set(view.grossPayRows.map((row) => row.field));
for (const field of requiredGrossFields) {
	if (!grossFields.has(field)) throw new Error(`GrossPay row missing ${field}`);
}

console.log(
	JSON.stringify(
		{
			ok: true,
			employee: "01360",
			grossPay: view.grossPayFormula.targetGrossPay,
			totalDeductions: view.deductionFormula.targetTotalDeductions,
			netPay: view.netPayFormula.netPay,
			totalReceivable: view.totalReceivableFormula.totalReceivable,
			gaps: {
				grossPay: view.grossPayFormula.gap,
				totalDeductions: view.deductionFormula.gap,
				netPay: view.netPayFormula.gap,
				totalReceivable: view.totalReceivableFormula.gap,
			},
		},
		null,
		2,
	),
);
