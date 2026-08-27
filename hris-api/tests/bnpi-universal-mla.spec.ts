import { expect } from "chai";
import {
	applyUniversalBandaiMlaSources,
	BANDAI_UNIVERSAL_MLA_AMOUNT,
	BANDAI_UNIVERSAL_MLA_CODE,
	type PayrollBenefitSource,
} from "../helper/payroll-benefit-source.helper";

const ORG = "cmryhwpv70000vgaktlmrubmx";
const period = {
	id: "period-1",
	startDate: new Date(Date.UTC(2026, 5, 26)),
	endDate: new Date(Date.UTC(2026, 6, 10)),
};

function mlaSource(employeeId: string, overrides: Partial<PayrollBenefitSource> = {}): PayrollBenefitSource {
	return {
		id: `row-${employeeId}`,
		employeeId,
		code: BANDAI_UNIVERSAL_MLA_CODE,
		name: "Meal Allowance",
		benefitTypeName: "Meal Allowance",
		direction: "COMPENSATION",
		reconciliationAction: "RECEIVABLE_ONLY",
		isTaxable: false,
		amount: BANDAI_UNIVERSAL_MLA_AMOUNT,
		installmentIds: [],
		startDate: period.startDate,
		endDate: null,
		payrollPeriodId: null,
		payrollPeriodCode: null,
		...overrides,
	};
}

describe("BNPI universal MLA policy (all employees, forever)", () => {
	it("injects ₱500 RECEIVABLE_ONLY MLA for every covered employee without an MLA source", () => {
		const sources: PayrollBenefitSource[] = [];
		const out = applyUniversalBandaiMlaSources(sources, {
			organizationId: ORG,
			employeeIds: ["emp-a", "emp-b"],
			period,
		});
		expect(out).to.have.length(2);
		for (const s of out) {
			expect(s.code).to.equal("MLA");
			expect(s.amount).to.equal(500);
			expect(s.direction).to.equal("COMPENSATION");
			expect(s.reconciliationAction).to.equal("RECEIVABLE_ONLY");
			expect(s.isTaxable).to.equal(false);
			expect(s.payrollPeriodId).to.equal(period.id);
		}
	});

	it("does NOT double-pay when an enrollment already resolves MLA", () => {
		const sources: PayrollBenefitSource[] = [mlaSource("emp-a")];
		const out = applyUniversalBandaiMlaSources(sources, {
			organizationId: ORG,
			employeeIds: ["emp-a"],
			period,
		});
		expect(out.filter((s) => s.employeeId === "emp-a" && s.code === "MLA")).to.have.length(1);
	});

	it("skips zero-amount MLA rows (treats them as not resolved) and injects the universal amount", () => {
		const sources: PayrollBenefitSource[] = [mlaSource("emp-a", { amount: 0 })];
		const out = applyUniversalBandaiMlaSources(sources, {
			organizationId: ORG,
			employeeIds: ["emp-a"],
			period,
		});
		const rows = out.filter((s) => s.employeeId === "emp-a" && s.code === "MLA" && s.amount > 0);
		expect(rows).to.have.length(1);
		expect(rows[0].amount).to.equal(500);
	});

	it("ignores non-Bandai organizations entirely", () => {
		const sources: PayrollBenefitSource[] = [];
		const out = applyUniversalBandaiMlaSources(sources, {
			organizationId: "org-other",
			employeeIds: ["emp-a"],
			period,
		});
		expect(out).to.have.length(0);
	});

	it("keeps existing sources untouched and appends only for missing employees", () => {
		const other: PayrollBenefitSource = {
			id: "row-dma",
			employeeId: "emp-a",
			code: "DMA",
			name: "De Minimis",
			benefitTypeName: "De Minimis",
			direction: "COMPENSATION",
			reconciliationAction: "GROSS_INCLUDED",
			isTaxable: false,
			amount: 300,
			installmentIds: [],
			startDate: period.startDate,
			endDate: null,
			payrollPeriodId: null,
			payrollPeriodCode: null,
		};
		const sources: PayrollBenefitSource[] = [other];
		const out = applyUniversalBandaiMlaSources(sources, {
			organizationId: ORG,
			employeeIds: ["emp-a"],
			period,
		});
		expect(out.map((s) => `${s.employeeId}:${s.code}`).sort()).to.deep.equal(["emp-a:DMA", "emp-a:MLA"]);
	});

	it("honors the Bandai DIRECT scope list (agency workers excluded)", () => {
		const sources: PayrollBenefitSource[] = [];
		const out = applyUniversalBandaiMlaSources(sources, {
			organizationId: ORG,
			employeeIds: ["direct-1", "agency-1"],
			scopedEmployeeIds: ["direct-1"],
			period,
		});
		expect(out.map((s) => s.employeeId)).to.deep.equal(["direct-1"]);
	});
});
