import assert from "node:assert/strict";
import {
	formatPayrollSourceLabelWithCategory,
	formatPayrollSourcePrimaryLabel,
	getCoveredRegisterFieldsFromSourceDetails,
	getPayrollSourceDisplayRole,
	getPayrollSourceTaxability,
	groupPayrollSourceDetailsByRole,
	groupPayrollSourceDetailsByTaxability,
	isPayrollSourceDisplayedAsTaxable,
} from "../helper/payroll-source-display.helper";

describe("payroll-source-display.helper", () => {
	it("uses enrollment name as primary label and type as category", () => {
		const detail = {
			name: "Rice Subsidy",
			benefitTypeName: "De Minimis Allowance",
			code: "DMA",
			direction: "COMPENSATION",
			reconciliationAction: "GROSS_INCLUDED",
			amount: 300,
		};

		assert.equal(formatPayrollSourcePrimaryLabel(detail), "Rice Subsidy");
		assert.equal(
			formatPayrollSourceLabelWithCategory(detail),
			"Rice Subsidy (De Minimis Allowance)",
		);
		assert.equal(getPayrollSourceDisplayRole(detail), "gross");
	});

	it("covers DMA register field so aggregate deMinimis can be suppressed", () => {
		const covered = getCoveredRegisterFieldsFromSourceDetails([
			{
				name: "Rice Subsidy",
				benefitTypeName: "De Minimis Allowance",
				code: "DMA",
				direction: "COMPENSATION",
				reconciliationAction: "GROSS_INCLUDED",
				amount: 200,
			},
			{
				name: "Travel Allowance",
				benefitTypeName: "De Minimis Allowance",
				code: "DMA",
				direction: "COMPENSATION",
				reconciliationAction: "GROSS_INCLUDED",
				amount: 150,
			},
		]);

		assert.equal(covered.has("deMinimisAllowance"), true);
	});

	it("groups receivable-only and deduction details separately", () => {
		const grouped = groupPayrollSourceDetailsByRole([
			{
				name: "Rice Subsidy",
				benefitTypeName: "De Minimis Allowance",
				code: "DMA",
				direction: "COMPENSATION",
				reconciliationAction: "GROSS_INCLUDED",
				amount: 100,
			},
			{
				name: "Perfect Attendance Bonus",
				benefitTypeName: "Perfect Attendance",
				code: "PFA",
				direction: "COMPENSATION",
				reconciliationAction: "RECEIVABLE_ONLY",
				amount: 500,
			},
			{
				name: "Uniform Installment",
				benefitTypeName: "Uniform Deduction",
				code: "UFD",
				direction: "DEDUCTION",
				reconciliationAction: "DEDUCTION",
				amount: 250,
			},
		]);

		assert.equal(grouped.gross.length, 1);
		assert.equal(grouped.postNet.length, 1);
		assert.equal(grouped.deduction.length, 1);
		assert.equal(grouped.postNet[0]?.name, "Perfect Attendance Bonus");
	});

	it("splits benefits into non-taxable vs taxable (unknown defaults to taxable)", () => {
		const grouped = groupPayrollSourceDetailsByTaxability([
			{
				name: "Rice Subsidy",
				benefitTypeName: "De Minimis Allowance",
				isTaxable: false,
				amount: 500,
			},
			{
				name: "Performance Bonus",
				benefitTypeName: "Performance Bonus",
				isTaxable: true,
				amount: 800,
			},
			{
				name: "Legacy Benefit",
				amount: 100,
			},
		]);

		assert.equal(grouped.nonTaxable.length, 1);
		assert.equal(grouped.nonTaxable[0]?.name, "Rice Subsidy");
		assert.equal(grouped.taxable.length, 2);
		assert.equal(getPayrollSourceTaxability({ isTaxable: false }), "nonTaxable");
		assert.equal(getPayrollSourceTaxability({ isTaxable: true }), "taxable");
		assert.equal(getPayrollSourceTaxability({}), "unknown");
		assert.equal(isPayrollSourceDisplayedAsTaxable({}), true);
		assert.equal(isPayrollSourceDisplayedAsTaxable({ isTaxable: false }), false);
	});
});
