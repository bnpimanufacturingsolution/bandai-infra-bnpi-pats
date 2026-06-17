/// <reference types="mocha" />

import assert from "node:assert/strict";
import {
	buildPayslipComputationRows,
	buildPayslipFormulaProof,
	generatePayslipPdfBuffer,
} from "../helper/payslip-pdf.helper";

const findAmount = (rows: ReturnType<typeof buildPayslipComputationRows>, label: string) => {
	const row = rows.find((item) => item.label === label);
	assert.ok(row, `Expected payslip computation row: ${label}`);
	return row.amount;
};

describe("payslip PDF calculation proof", () => {
	it("asserts Joyce total receivable from net pay plus post-net meal allowance", () => {
		const payroll = {
			id: "payroll-joyce",
			basicPay: 12500,
			absentDeduction: 0,
			overtimePay: 1422.72,
			obAllowance: 0,
			deMinimisAllowance: 0,
			adjustmentOtNd: 0,
			grossPay: 13922.72,
			taxAmount: 525.86,
			sssContribution: 0,
			philHealthContribution: 0,
			pagibigContribution: 0,
			sssSalaryLoan: 0,
			modifiedHdmf2: 0,
			totalDeductions: 525.86,
			netPay: 13396.86,
			perfectAttendance: 0,
			mealAllowance: 500,
			lineLeaderAllowance: 0,
			totalReceivable: 13896.86,
		};

		const proof = buildPayslipFormulaProof(payroll);
		assert.equal(proof.grossRowsTotal, 13922.72);
		assert.equal(proof.grossGap, 0);
		assert.equal(proof.deductionRowsTotal, 525.86);
		assert.equal(proof.deductionGap, 0);
		assert.equal(proof.netPayGap, 0);
		assert.equal(proof.postNetTotal, 500);
		assert.equal(proof.totalReceivableGap, 0);
		assert.deepEqual(
			proof.postNetRows.map((row) => row.label),
			["Meal Allowance"],
		);
		assert.ok(!proof.grossRows.some((row) => row.label === "Meal Allowance"));

		const rows = buildPayslipComputationRows(payroll);
		assert.equal(findAmount(rows, "NetPay"), 13396.86);
		assert.equal(findAmount(rows, "Meal Allowance"), 500);
		assert.equal(findAmount(rows, "TotalReceivable"), 13896.86);
	});

	it("asserts Rio total receivable while excluding post-net allowances from gross pay", () => {
		const payroll = {
			id: "payroll-rio",
			basicPay: 9500,
			absentDeduction: 0,
			overtimePay: 3471.45,
			obAllowance: 120,
			deMinimisAllowance: 250,
			adjustmentOtNd: 113.82,
			grossPay: 13455.27,
			taxAmount: 418.24,
			sssContribution: 0,
			philHealthContribution: 0,
			pagibigContribution: 0,
			sssSalaryLoan: 411.44,
			modifiedHdmf2: 250,
			totalDeductions: 1079.68,
			netPay: 12375.59,
			perfectAttendance: 200,
			mealAllowance: 500,
			lineLeaderAllowance: 0,
			totalReceivable: 13075.59,
		};

		const proof = buildPayslipFormulaProof(payroll);
		assert.equal(proof.grossRowsTotal, 13455.27);
		assert.equal(proof.deductionRowsTotal, 1079.68);
		assert.equal(proof.netPayGap, 0);
		assert.equal(proof.postNetTotal, 700);
		assert.equal(proof.totalReceivableGap, 0);
		assert.deepEqual(
			proof.postNetRows.map((row) => row.label),
			["Perfect Attendance", "Meal Allowance"],
		);
		assert.ok(!proof.grossRows.some((row) => row.label === "Perfect Attendance"));
		assert.ok(!proof.grossRows.some((row) => row.label === "Meal Allowance"));

		const rows = buildPayslipComputationRows(payroll);
		assert.equal(findAmount(rows, "GrossPay"), 13455.27);
		assert.equal(findAmount(rows, "NetPay"), 12375.59);
		assert.equal(findAmount(rows, "Perfect Attendance"), 200);
		assert.equal(findAmount(rows, "Meal Allowance"), 500);
		assert.equal(findAmount(rows, "TotalReceivable"), 13075.59);
	});

	it("surfaces saved total receivable mismatches instead of replacing them with a fallback", () => {
		const payroll = {
			id: "payroll-mismatch",
			basicPay: 1000,
			absentDeduction: 0,
			grossPay: 1000,
			taxAmount: 100,
			sssContribution: 0,
			philHealthContribution: 0,
			pagibigContribution: 0,
			totalDeductions: 100,
			netPay: 900,
			perfectAttendance: 50,
			mealAllowance: 25,
			lineLeaderAllowance: 0,
			totalReceivable: 0,
		};

		const proof = buildPayslipFormulaProof(payroll);
		assert.equal(proof.totalReceivable, 0);
		assert.equal(proof.totalReceivableGap, 975);

	});

	it("generates a PDF buffer with a post-net receivable proof path", async () => {
		const buffer = await generatePayslipPdfBuffer({
			employee: {
				id: "employee-rio",
				employeeId: "01360",
				person: { personalInfo: { firstName: "Rio", lastName: "Marasigan" } },
			},
			payrollPeriod: {
				id: "period-2",
				name: "Period 2 April 2026",
				startDate: "2026-04-26",
				endDate: "2026-05-10",
			},
			employeePayroll: {
				id: "payroll-rio",
				basicPay: 9500,
				overtimePay: 3471.45,
				obAllowance: 120,
				deMinimisAllowance: 250,
				adjustmentOtNd: 113.82,
				grossPay: 13455.27,
				taxAmount: 418.24,
				sssContribution: 0,
				philHealthContribution: 0,
				pagibigContribution: 0,
				sssSalaryLoan: 411.44,
				modifiedHdmf2: 250,
				totalDeductions: 1079.68,
				netPay: 12375.59,
				perfectAttendance: 200,
				mealAllowance: 500,
				totalReceivable: 13075.59,
			},
			logoUrl: "data:image/png;base64,",
		});

		assert.ok(buffer.length > 1000);
		assert.equal(buffer.subarray(0, 4).toString("utf8"), "%PDF");
	});
});
