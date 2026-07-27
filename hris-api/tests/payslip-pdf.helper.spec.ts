/// <reference types="mocha" />

import assert from "node:assert/strict";
import {
	buildPayslipComputationRows,
	buildPayslipFormulaProof,
	extractPayrollCorrectionEarningsRows,
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

	it("expands De Minimis enrollments from payrollSourceDetails instead of one total line", () => {
		const payroll = {
			id: "payroll-dma-breakdown",
			basicPay: 25000,
			absentDeduction: 0,
			overtimePay: 7872.16,
			nightDiffPay: 1351.04,
			deMinimisAllowance: 6500,
			grossPay: 34152.18,
			taxAmount: 4475.8,
			sssContribution: 0,
			philHealthContribution: 0,
			pagibigContribution: 0,
			totalDeductions: 4475.8,
			netPay: 29676.38,
			metadata: {
				payrollSourceDetails: [
					{
						id: "b1",
						source: "employeeBenefit",
						code: "DMA",
						name: "Rice Subsidy",
						benefitTypeName: "De Minimis Allowance",
						direction: "COMPENSATION",
						reconciliationAction: "GROSS_INCLUDED",
						isTaxable: false,
						amount: 3000,
					},
					{
						id: "b2",
						source: "employeeBenefit",
						code: "DMA",
						name: "Travel Allowance",
						benefitTypeName: "De Minimis Allowance",
						direction: "COMPENSATION",
						reconciliationAction: "GROSS_INCLUDED",
						isTaxable: false,
						amount: 3500,
					},
				],
			},
		};

		const proof = buildPayslipFormulaProof(payroll);
		const labels = proof.grossRows.map((row) => row.label);
		assert.ok(!labels.includes("De Minimis Allowance"), "register total must not appear");
		assert.ok(labels.some((label) => label.startsWith("Rice Subsidy")));
		assert.ok(labels.some((label) => label.startsWith("Travel Allowance")));
		assert.ok(
			labels.includes("Benefits applied — Non-taxable"),
			"non-taxable group header expected",
		);
		assert.equal(
			proof.grossRows
				.filter((row) => row.label.startsWith("Rice Subsidy") || row.label.startsWith("Travel Allowance"))
				.reduce((sum, row) => sum + row.amount, 0),
			6500,
		);
	});

	it("groups taxable and non-taxable benefits under section headers without changing gross total", () => {
		const payroll = {
			id: "payroll-tax-groups",
			basicPay: 25000,
			absentDeduction: 0,
			overtimePay: 8102.27,
			nightDiffPay: 1295.27,
			deMinimisAllowance: 1000,
			grossPay: 35200,
			taxAmount: 3989.29,
			sssContribution: 0,
			philHealthContribution: 0,
			pagibigContribution: 0,
			totalDeductions: 3989.29,
			netPay: 31210.71,
			metadata: {
				payrollSourceDetails: [
					{
						id: "b1",
						source: "employeeBenefit",
						code: "DMA",
						name: "Rice Subsidy",
						benefitTypeName: "De Minimis Allowance",
						direction: "COMPENSATION",
						reconciliationAction: "GROSS_INCLUDED",
						isTaxable: false,
						amount: 500,
					},
					{
						id: "b2",
						source: "employeeBenefit",
						code: "PFA",
						name: "Performance Bonus",
						benefitTypeName: "Performance Bonus",
						direction: "COMPENSATION",
						reconciliationAction: "GROSS_INCLUDED",
						isTaxable: true,
						amount: 800,
					},
					{
						id: "b3",
						source: "employeeBenefit",
						code: "DMA",
						name: "Transport Allowance",
						benefitTypeName: "De Minimis Allowance",
						direction: "COMPENSATION",
						reconciliationAction: "GROSS_INCLUDED",
						isTaxable: false,
						amount: 500,
					},
				],
			},
		};

		const proof = buildPayslipFormulaProof(payroll);
		const labels = proof.grossRows.map((row) => row.label);
		const nonTaxIdx = labels.indexOf("Benefits applied — Non-taxable");
		const taxIdx = labels.indexOf("Benefits applied — Taxable");
		assert.ok(nonTaxIdx >= 0, "non-taxable header");
		assert.ok(taxIdx >= 0, "taxable header");
		assert.ok(nonTaxIdx < taxIdx, "non-taxable section before taxable");
		assert.ok(labels.some((l) => l.startsWith("Rice Subsidy")));
		assert.ok(labels.some((l) => l.startsWith("Transport Allowance")));
		assert.ok(labels.some((l) => l.startsWith("Performance Bonus")));
		// Group headers do not contribute to amount total
		assert.equal(
			proof.grossRows
				.filter((row) => row.kind === "group")
				.reduce((sum, row) => sum + row.amount, 0),
			0,
		);
		assert.equal(
			proof.grossRows
				.filter(
					(row) =>
						row.kind !== "group" &&
						(row.label.startsWith("Rice Subsidy") ||
							row.label.startsWith("Transport Allowance") ||
							row.label.startsWith("Performance Bonus")),
				)
				.reduce((sum, row) => sum + row.amount, 0),
			1800,
		);
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

	it("includes approved payroll correction retro lines in earnings (closes payslip display gap)", () => {
		const retroLabel = "Retro OT (Period 1 - Jun 2026 correction)";
		const retroAmount = 500;
		// Coherent formula: basic - absent + OT + ND + retro = gross
		const basicPay = 10000;
		const absentDeduction = 0;
		const overtimePay = 1000;
		const nightDiffPay = 200;
		const grossPay = basicPay + overtimePay + nightDiffPay + retroAmount; // 11700
		const totalDeductions = 100;
		const netPay = grossPay - totalDeductions;
		const payroll = {
			id: "payroll-with-retro",
			basicPay,
			absentDeduction,
			overtimePay,
			nightDiffPay,
			holidayPay: 0,
			otherCompensation: retroAmount,
			grossPay,
			taxAmount: totalDeductions,
			sssContribution: 0,
			philHealthContribution: 0,
			pagibigContribution: 0,
			sssSalaryLoan: 0,
			modifiedHdmf2: 0,
			totalDeductions,
			netPay,
			totalReceivable: netPay,
			metadata: {
				payrollCorrections: [
					{
						correctionId: "corr-1",
						label: retroLabel,
						amount: retroAmount,
						sourcePayrollPeriodName: "Period 1 - Jun 2026",
						status: "APPLIED",
					},
				],
			},
		};

		const extracted = extractPayrollCorrectionEarningsRows(payroll.metadata);
		assert.equal(extracted.length, 1);
		assert.equal(extracted[0].label, retroLabel);
		assert.equal(extracted[0].amount, retroAmount);

		const proof = buildPayslipFormulaProof(payroll);
		const retroRow = proof.grossRows.find((row) => row.label === retroLabel);
		assert.ok(retroRow, "Expected retro correction line in PDF earnings");
		assert.equal(retroRow!.amount, retroAmount);
		assert.equal(proof.grossGap, 0);

		const rows = buildPayslipComputationRows(payroll);
		assert.equal(findAmount(rows, retroLabel), retroAmount);
		assert.equal(findAmount(rows, "GrossPay"), payroll.grossPay);
	});

	it("does not double-count otherCompensation when payrollCorrections already cover it", () => {
		const payroll = {
			id: "payroll-no-double",
			basicPay: 10000,
			absentDeduction: 0,
			otherCompensation: 500,
			grossPay: 10500,
			taxAmount: 0,
			sssContribution: 0,
			philHealthContribution: 0,
			pagibigContribution: 0,
			totalDeductions: 0,
			netPay: 10500,
			totalReceivable: 10500,
			metadata: {
				payrollCorrections: [
					{
						correctionId: "c1",
						label: "Retro hours (P1 correction)",
						amount: 500,
					},
				],
			},
		};
		const proof = buildPayslipFormulaProof(payroll);
		const retroCount = proof.grossRows.filter((r) =>
			r.label.startsWith("Retro"),
		).length;
		const otherCompCount = proof.grossRows.filter(
			(r) => r.label === "Other Compensation",
		).length;
		assert.equal(retroCount, 1);
		assert.equal(otherCompCount, 0);
		assert.equal(proof.grossGap, 0);
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
