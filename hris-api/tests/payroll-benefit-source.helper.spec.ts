import assert from "node:assert/strict";
import {
	resolvePayrollBenefitSource,
	type PayrollBenefitSourceInput,
} from "../helper/payroll-benefit-source.helper";
import { buildBenefitInstallments } from "../helper/employee-benefit-program.helper";
import {
	buildPayrollSourceAmountsByEmployeeId,
	markPayrollBenefitInstallmentsDeducted,
} from "../helper/payroll-period.helper";

const period = {
	id: "period-1",
	startDate: new Date("2026-01-01T00:00:00.000Z"),
	endDate: new Date("2026-01-15T23:59:59.999Z"),
};

const benefit = (overrides: Partial<PayrollBenefitSourceInput> = {}): PayrollBenefitSourceInput => ({
	id: "benefit-1",
	employeeId: "employee-1",
	organizationId: "org-1",
	amount: 6000,
	totalAmount: 6000,
	startDate: new Date("2026-01-01T00:00:00.000Z"),
	endDate: null,
	payrollPeriodId: null,
	status: "ACTIVE",
	isActive: true,
	isDeleted: false,
	benefitType: {
		code: "UFD",
		name: "Uniform Deduction",
		payrollDirection: "DEDUCTION",
		reconciliationAction: "DEDUCTION",
		isTaxable: false,
		isDeleted: false,
	},
	installments: [],
	...overrides,
});

describe("resolvePayrollBenefitSource", () => {
	it("uses only the due installment instead of total amount", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				installments: [
					{ id: "i-1", amount: 1000, scheduledDate: new Date("2026-01-01T00:00:00.000Z"), status: "SCHEDULED" },
					{ id: "i-2", amount: 1000, scheduledDate: new Date("2026-01-16T00:00:00.000Z"), status: "SCHEDULED" },
				],
			}),
			period,
		);

		assert.equal(result?.amount, 1000);
		assert.deepEqual(result?.installmentIds, ["i-1"]);
	});

	it("includes an installment on the period start boundary", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				installments: [{ id: "i-1", amount: 250, scheduledDate: period.startDate, status: "SCHEDULED" }],
			}),
			period,
		);

		assert.equal(result?.amount, 250);
	});

	it("includes an installment on the period end boundary", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				installments: [{ id: "i-1", amount: 300, scheduledDate: period.endDate, status: "SCHEDULED" }],
			}),
			period,
		);

		assert.equal(result?.amount, 300);
	});

	it("does not apply installments outside the period", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				installments: [{ id: "i-1", amount: 300, scheduledDate: new Date("2026-01-16T00:00:00.000Z"), status: "SCHEDULED" }],
			}),
			period,
		);

		assert.equal(result, null);
	});

	it("ignores installments already processed or waived", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				installments: [
					{ id: "i-1", amount: 500, scheduledDate: period.startDate, status: "DEDUCTED" },
					{ id: "i-2", amount: 600, scheduledDate: period.startDate, status: "WAIVED" },
				],
			}),
			period,
		);

		assert.equal(result, null);
	});

	it("uses a valid recurring amount when no installments exist", () => {
		const result = resolvePayrollBenefitSource(benefit({ amount: 1500, totalAmount: 1500 }), period);

		assert.equal(result?.amount, 1500);
		assert.deepEqual(result?.installmentIds, []);
	});

	it("does not fall back to recurring amount when a schedule exists but no installment is due", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				amount: 6000,
				installments: [{ id: "i-2", amount: 1000, scheduledDate: new Date("2026-01-16T00:00:00.000Z"), status: "SCHEDULED" }],
			}),
			period,
		);

		assert.equal(result, null);
	});

	it("excludes pending, inactive, and deleted benefits", () => {
		for (const overrides of [
			{ status: "PENDING" as const },
			{ isActive: false },
			{ isDeleted: true },
		]) {
			assert.equal(resolvePayrollBenefitSource(benefit(overrides), period), null);
		}
	});

	it("excludes benefits with invalid recurring values", () => {
		const result = resolvePayrollBenefitSource(benefit({ amount: 0, totalAmount: 0 }), period);

		assert.equal(result, null);
	});

	it("returns payroll direction and reconciliation metadata", () => {
		const result = resolvePayrollBenefitSource(benefit({ amount: 100 }), period);

		assert.equal(result?.employeeId, "employee-1");
		assert.equal(result?.direction, "DEDUCTION");
		assert.equal(result?.reconciliationAction, "DEDUCTION");
	});

	it("prefers enrollment/payroll adjustment name over benefit type name", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				name: "Rice Subsidy",
				benefitType: {
					code: "DMA",
					name: "De Minimis Allowance",
					payrollDirection: "COMPENSATION",
					reconciliationAction: "GROSS_INCLUDED",
					isTaxable: false,
					isDeleted: false,
				},
				amount: 500,
			}),
			period,
		);

		assert.equal(result?.name, "Rice Subsidy");
		assert.equal(result?.benefitTypeName, "De Minimis Allowance");
		assert.equal(result?.code, "DMA");
	});

	it("falls back to benefit type name when enrollment name is blank", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				name: "   ",
				benefitType: {
					code: "DMA",
					name: "De Minimis Allowance",
					payrollDirection: "COMPENSATION",
					reconciliationAction: "GROSS_INCLUDED",
					isTaxable: false,
					isDeleted: false,
				},
				amount: 500,
			}),
			period,
		);

		assert.equal(result?.name, "De Minimis Allowance");
		assert.equal(result?.benefitTypeName, "De Minimis Allowance");
	});

	it("resolves the due fixed-installment row generated for the payroll period", () => {
		const generated = buildBenefitInstallments("benefit-1", {
			scheduleMode: "FIXED_INSTALLMENTS",
			totalAmount: 1000,
			totalInstallments: 3,
			startDate: period.startDate,
		}).map((row) => ({ ...row, id: `fixed-${row.installmentNumber}` }));

		const result = resolvePayrollBenefitSource(
			benefit({
				installments: generated,
			}),
			period,
		);

		assert.equal(result?.amount, 333.33);
		assert.deepEqual(result?.installmentIds, ["fixed-1"]);
	});

	it("resolves the due time-bound row generated from overlapping payroll periods", () => {
		const generated = buildBenefitInstallments(
			"benefit-1",
			{
				scheduleMode: "TIME_BOUND",
				totalAmount: 1750,
				startDate: period.startDate,
				endDate: new Date("2026-01-31T23:59:59.999Z"),
			},
			[
				period,
				{
					id: "period-2",
					startDate: new Date("2026-01-16T00:00:00.000Z"),
					endDate: new Date("2026-01-31T23:59:59.999Z"),
				},
				{
					id: "outside-range",
					startDate: new Date("2026-02-01T00:00:00.000Z"),
					endDate: new Date("2026-02-15T23:59:59.999Z"),
				},
			],
		).map((row) => ({ ...row, id: `time-bound-${row.installmentNumber}` }));

		const result = resolvePayrollBenefitSource(
			benefit({
				endDate: new Date("2026-01-31T23:59:59.999Z"),
				installments: generated,
			}),
			period,
		);

		assert.equal(result?.amount, 875);
		assert.deepEqual(result?.installmentIds, ["time-bound-1"]);
	});

	it("excludes a generated installment outside the benefit date range", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				startDate: new Date("2026-01-16T00:00:00.000Z"),
				installments: [{ id: "future", amount: 900, scheduledDate: new Date("2026-01-16T00:00:00.000Z"), status: "SCHEDULED" }],
			}),
			period,
		);

		assert.equal(result, null);
	});

	it("excludes a benefit assigned to a different payroll period", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				payrollPeriodId: "period-2",
				installments: [{ id: "wrong-benefit-period", amount: 750, scheduledDate: period.startDate, status: "SCHEDULED" }],
			}),
			period,
		);

		assert.equal(result, null);
	});

	it("excludes a scheduled installment linked to another payroll period", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				installments: [{
					id: "wrong-installment-period",
					amount: 750,
					scheduledDate: period.startDate,
					status: "SCHEDULED",
					payrollCutOffId: "period-2",
				}],
			}),
			period,
		);

		assert.equal(result, null);
	});

	it("retains a deducted installment only for the payroll period that deducted it", () => {
		const result = resolvePayrollBenefitSource(
			benefit({
				installments: [{
					id: "rerun-installment",
					amount: 750,
					scheduledDate: period.startDate,
					status: "DEDUCTED",
					payrollCutOffId: period.id,
				}],
			}),
			period,
		);

		assert.equal(result?.amount, 750);
		assert.deepEqual(result?.installmentIds, ["rerun-installment"]);
	});
});

describe("payroll benefit source integration", () => {
	const prismaFor = (benefits: PayrollBenefitSourceInput[]) => ({
		employeeBenefit: { findMany: async () => benefits },
		employeeLoan: { findMany: async () => [] },
		timesheet: { findMany: async () => [] },
		employeeBenefitInstallment: {
			create: async (args: any) => ({ id: "created-1", ...args.data }),
			update: async (args: any) => ({ id: args.where.id, ...args.data }),
		},
	});

	it("maps compensation benefits into compensation totals", async () => {
		const sources = await buildPayrollSourceAmountsByEmployeeId(prismaFor([
			benefit({
				benefitType: {
					...benefit().benefitType!,
					code: "DMA",
					name: "De Minimis Allowance",
					payrollDirection: "COMPENSATION",
					reconciliationAction: "GROSS_INCLUDED",
				},
				amount: 1250,
				totalAmount: 1250,
			}),
		] as any) as any, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		assert.equal(sources.get("employee-1")?.amounts.totalCompensationBenefits, 1250);
		assert.equal(sources.get("employee-1")?.amounts.grossIncludedBenefits, 1250);
	});

	it("maps deduction benefits into deduction totals", async () => {
		const sources = await buildPayrollSourceAmountsByEmployeeId(prismaFor([
			benefit({ amount: 1000, totalAmount: 6000, installments: [
				{ id: "i-1", amount: 1000, scheduledDate: period.startDate, status: "SCHEDULED" },
			] }),
		] as any) as any, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		assert.equal(sources.get("employee-1")?.amounts.deductionBenefits, 1000);
		assert.equal(sources.get("employee-1")?.amounts.uniformDeductionBenefits, 1000);
	});

	it("does not create a source when a scheduled benefit has no due installment", async () => {
		const sources = await buildPayrollSourceAmountsByEmployeeId(prismaFor([
			benefit({ installments: [
				{ id: "i-2", amount: 1000, scheduledDate: new Date("2026-01-16T00:00:00.000Z"), status: "SCHEDULED" },
			] }),
		] as any) as any, {
			employeeIds: ["employee-1"],
			organizationId: "org-1",
			payrollPeriodId: period.id,
			startDate: period.startDate,
			endDate: period.endDate,
		});

		assert.equal(sources.has("employee-1"), false);
	});

	it("aggregates generated compensation installments without changing reconciliation buckets", async () => {
		const sources = await buildPayrollSourceAmountsByEmployeeId(prismaFor([
			benefit({
				id: "compensation-1",
				benefitType: { ...benefit().benefitType!, code: "DMA", payrollDirection: "COMPENSATION", reconciliationAction: "GROSS_INCLUDED" },
				installments: [{ id: "compensation-installment-1", amount: 125, scheduledDate: period.startDate, status: "SCHEDULED" }],
			}),
			benefit({
				id: "compensation-2",
				benefitType: { ...benefit().benefitType!, code: "DMA", payrollDirection: "COMPENSATION", reconciliationAction: "GROSS_INCLUDED" },
				installments: [{ id: "compensation-installment-2", amount: 275, scheduledDate: period.endDate, status: "SCHEDULED" }],
			}),
		] as any) as any, {
			employeeIds: ["employee-1"], organizationId: "org-1", payrollPeriodId: period.id, startDate: period.startDate, endDate: period.endDate,
		});

		assert.equal(sources.get("employee-1")?.amounts.totalCompensationBenefits, 400);
		assert.equal(sources.get("employee-1")?.amounts.grossIncludedBenefits, 400);
	});

	it("aggregates generated deduction installments once for the current payroll period", async () => {
		const sources = await buildPayrollSourceAmountsByEmployeeId(prismaFor([
			benefit({ id: "deduction-1", installments: [{ id: "deduction-installment-1", amount: 125, scheduledDate: period.startDate, status: "SCHEDULED" }] }),
			benefit({ id: "deduction-2", installments: [{ id: "deduction-installment-2", amount: 275, scheduledDate: period.endDate, status: "SCHEDULED" }] }),
		] as any) as any, {
			employeeIds: ["employee-1"], organizationId: "org-1", payrollPeriodId: period.id, startDate: period.startDate, endDate: period.endDate,
		});

		assert.equal(sources.get("employee-1")?.amounts.deductionBenefits, 400);
		assert.deepEqual(sources.get("employee-1")?.installmentIds, ["deduction-installment-1", "deduction-installment-2"]);
	});

	it("uses the legacy recurring amount only when no generated installment rows exist", async () => {
		const sources = await buildPayrollSourceAmountsByEmployeeId(prismaFor([
			benefit({ amount: 425, totalAmount: 1200, installments: [] }),
		] as any) as any, {
			employeeIds: ["employee-1"], organizationId: "org-1", payrollPeriodId: period.id, startDate: period.startDate, endDate: period.endDate,
		});

		assert.equal(sources.get("employee-1")?.amounts.deductionBenefits, 425);
		assert.deepEqual(sources.get("employee-1")?.installmentIds, []);
	});

	it("marks each installment deducted exactly once with payroll linkage", async () => {
		const calls: any[] = [];
		const prisma = {
			employeeBenefitInstallment: {
				updateMany: async (args: any) => {
					calls.push(args);
					return { count: 1 };
				},
				findFirst: async () => null,
			},
		} as any;

		const count = await markPayrollBenefitInstallmentsDeducted(prisma, ["i-1", "i-1", "i-2"], {
			payrollPeriodId: period.id,
			payrollRunId: "run-1",
		});

		assert.equal(count, 2);
		assert.equal(calls.length, 2);
		assert.equal(calls[0].where.status, "SCHEDULED");
		assert.equal(calls[0].data.status, "DEDUCTED");
		assert.equal(calls[0].data.payrollCutOffId, period.id);
		assert.equal(calls[0].data.payrollRunId, "run-1");
	});

	it("fails closed when an installment was concurrently consumed", async () => {
		const prisma = {
			employeeBenefitInstallment: {
				updateMany: async () => ({ count: 0 }),
				findFirst: async () => null,
			},
		} as any;

		await assert.rejects(
			markPayrollBenefitInstallmentsDeducted(prisma, ["i-1"], { payrollPeriodId: period.id }),
			/already processed or is unavailable/,
		);
	});
});
