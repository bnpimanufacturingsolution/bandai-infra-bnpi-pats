import { expect } from "chai";
import { buildPayslipDeductionRows } from "../helper/payslip-pdf.helper";

describe("Payslip PDF helper - deduction rows", () => {
	it("hides withholding row when taxAmount is zero", () => {
		const deductionRows = buildPayslipDeductionRows({
			id: "payroll-1",
			basicPay: 20000,
			grossPay: 20000,
			taxAmount: 0,
			sssContribution: 900,
			philHealthContribution: 500,
			pagibigContribution: 100,
			totalDeductions: 1500,
			netPay: 18500,
			loanDeductions: 0,
			otherDeductions: 0,
			lateDeduction: 0,
			earlyOutDeduction: 0,
			absentDeduction: 0,
		});

		expect(deductionRows.some(([label]) => label === "Withholding")).to.equal(false);
	});

	it("shows withholding row when taxAmount is greater than zero", () => {
		const deductionRows = buildPayslipDeductionRows({
			id: "payroll-2",
			basicPay: 30000,
			grossPay: 30000,
			taxAmount: 1200,
			sssContribution: 900,
			philHealthContribution: 500,
			pagibigContribution: 100,
			totalDeductions: 2700,
			netPay: 27300,
			loanDeductions: 0,
			otherDeductions: 0,
			lateDeduction: 0,
			earlyOutDeduction: 0,
			absentDeduction: 0,
		});

		expect(deductionRows.some(([label]) => label === "Withholding")).to.equal(true);
	});

	it("includes attendance subtotal from absent, late, and early out deductions", () => {
		const deductionRows = buildPayslipDeductionRows({
			id: "payroll-3",
			basicPay: 35000,
			grossPay: 38977.27,
			taxAmount: 4283.41,
			sssContribution: 875,
			philHealthContribution: 880.97,
			pagibigContribution: 100,
			totalDeductions: 6139.38,
			netPay: 32837.89,
			loanDeductions: 0,
			otherDeductions: 0,
			lateDeduction: 377.84,
			earlyOutDeduction: 178.98,
			absentDeduction: 3181.82,
		});

		const subtotalRow = deductionRows.find(([label]) => label === "Attendance Subtotal");
		expect(subtotalRow).to.not.equal(undefined);
		expect(subtotalRow?.[1]).to.equal(3738.64);
	});
});
