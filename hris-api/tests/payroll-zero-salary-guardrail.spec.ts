/// <reference types="mocha" />

import assert from "node:assert/strict";
import { applyZeroSalaryGuardrail } from "../helper/payroll-period.helper";

describe("applyZeroSalaryGuardrail", () => {
	it("leaves deductions intact when gross pay is positive", () => {
		const result = applyZeroSalaryGuardrail(5000, 1000, 500);
		assert.deepEqual(result, {
			guardedLoanDeductions: 1000,
			guardedDeductionBenefits: 500,
			applied: false,
		});
	});

	it("zeroes out loan and benefit deductions when gross pay is exactly zero", () => {
		const result = applyZeroSalaryGuardrail(0, 1000, 500);
		assert.deepEqual(result, {
			guardedLoanDeductions: 0,
			guardedDeductionBenefits: 0,
			applied: true,
		});
	});

	it("zeroes out deductions when gross pay is negative (should not occur, but is defensive)", () => {
		const result = applyZeroSalaryGuardrail(-100, 800, 200);
		assert.deepEqual(result, {
			guardedLoanDeductions: 0,
			guardedDeductionBenefits: 0,
			applied: true,
		});
	});

	it("does not apply when gross pay is a small positive amount (boundary)", () => {
		const result = applyZeroSalaryGuardrail(0.01, 500, 300);
		assert.deepEqual(result, {
			guardedLoanDeductions: 500,
			guardedDeductionBenefits: 300,
			applied: false,
		});
	});

	it("handles zero deductions with zero gross pay as a no-op", () => {
		const result = applyZeroSalaryGuardrail(0, 0, 0);
		assert.deepEqual(result, {
			guardedLoanDeductions: 0,
			guardedDeductionBenefits: 0,
			applied: true,
		});
	});

	it("guards only loan and benefit deductions — does not touch other source amounts", () => {
		const result = applyZeroSalaryGuardrail(0, 2500, 750);
		assert.equal(result.guardedLoanDeductions, 0);
		assert.equal(result.guardedDeductionBenefits, 0);
		assert.equal(result.applied, true);
	});
});
