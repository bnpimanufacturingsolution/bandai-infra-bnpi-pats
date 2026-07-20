/// <reference types="mocha" />

import assert from "node:assert/strict";
import { buildEmployeePayrollComputationView } from "../app/employeepayroll/employeepayroll.controller";

describe("buildEmployeePayrollComputationView · payroll corrections", () => {
	it("includes labeled PayrollCorrection retro lines in grossPayRows", () => {
		const view = buildEmployeePayrollComputationView({
			basicPay: 10000,
			absentDeduction: 0,
			lateUndertimeAmount: 0,
			overtimePay: 500,
			nightDiffPay: 0,
			holidayPay: 0,
			obAllowance: 0,
			deMinimisAllowance: 0,
			adjustmentOtNd: 0,
			otherCompensation: 250,
			grossPay: 10750,
			taxAmount: 0,
			sssContribution: 0,
			philHealthContribution: 0,
			pagibigContribution: 0,
			totalDeductions: 0,
			netPay: 10750,
			totalReceivable: 10750,
			metadata: {
				payrollCorrections: [
					{
						correctionId: "corr-1",
						label: "Retro OT (Period 1 - Jun 2026 correction)",
						amount: 250,
						sourcePayrollPeriodName: "Period 1 - Jun 2026",
						requestId: "req-abc",
						status: "APPLIED",
						dayDeltas: [
							{
								date: "2026-06-02",
								hoursType: "OT",
								beforeMinutes: 0,
								afterMinutes: 120,
								deltaMinutes: 120,
							},
						],
					},
				],
			},
		});

		const correctionRows = view.grossPayRows.filter((r: any) =>
			String(r.field || "").startsWith("payrollCorrection:"),
		);
		assert.equal(correctionRows.length, 1);
		assert.equal(correctionRows[0].label, "Retro OT (Period 1 - Jun 2026 correction)");
		assert.equal(correctionRows[0].amount, 250);
		assert.equal(correctionRows[0].operation, "ADD");
		assert.equal(correctionRows[0].field, "payrollCorrection:corr-1");
		assert.match(String(correctionRows[0].explanation || ""), /Period 1 - Jun 2026/);

		// otherCompensation fully explained by correction → no residual Other Compensation row
		const otherComp = view.grossPayRows.filter((r: any) => r.field === "otherCompensation");
		assert.equal(otherComp.length, 0);

		const rowsTotal = view.grossPayRows.reduce(
			(sum: number, item: any) =>
				sum + (item.operation === "SUBTRACT" ? -item.amount : item.amount),
			0,
		);
		assert.equal(Math.round(rowsTotal * 100) / 100, 10750);
		assert.equal(view.grossPayFormula.targetGrossPay, 10750);
		assert.equal(view.grossPayFormula.gap, 0);
	});

	it("keeps residual Other Compensation when above correction total", () => {
		const view = buildEmployeePayrollComputationView({
			basicPay: 1000,
			absentDeduction: 0,
			lateUndertimeAmount: 0,
			overtimePay: 0,
			nightDiffPay: 0,
			holidayPay: 0,
			obAllowance: 0,
			deMinimisAllowance: 0,
			adjustmentOtNd: 0,
			otherCompensation: 300,
			grossPay: 1300,
			taxAmount: 0,
			sssContribution: 0,
			philHealthContribution: 0,
			pagibigContribution: 0,
			totalDeductions: 0,
			netPay: 1300,
			metadata: {
				payrollCorrections: [
					{
						correctionId: "corr-2",
						label: "Retro hours",
						amount: 100,
					},
				],
			},
		});

		const correctionRows = view.grossPayRows.filter((r: any) =>
			String(r.field || "").startsWith("payrollCorrection:"),
		);
		assert.equal(correctionRows.length, 1);
		assert.equal(correctionRows[0].amount, 100);

		const residual = view.grossPayRows.find((r: any) => r.field === "otherCompensation");
		assert.ok(residual);
		assert.equal(residual!.amount, 200);
	});
});
