/// <reference types="mocha" />

import assert from "node:assert/strict";
import {
	buildPayrollCorrectionPayslipLine,
	buildRetroPayslipLabel,
	computePayrollCorrectionAmount,
	hasOverlappingOpenDay,
	mergePayrollCorrectionsIntoMetadata,
	parsePayrollCorrectionDayDeltas,
	resolvePostApprovalStatus,
	sumAppliedCorrectionAmounts,
	validatePayrollCorrectionDayDeltas,
} from "../helper/payroll-correction.helper";
import {
	applyReadyPayrollCorrectionsToEmployeePayroll,
	buildUpdatedPayrollMoneyAfterCorrections,
} from "../app/payrollCorrection/payroll-correction.service";

describe("payroll-correction.helper", () => {
	it("parses and validates day deltas", () => {
		const raw = [
			{
				date: "2026-06-02",
				hoursType: "OT",
				beforeMinutes: 0,
				afterMinutes: 120,
			},
			{
				date: "2026-06-03T00:00:00.000Z",
				hoursType: "REGULAR",
				beforeMinutes: 480,
				afterMinutes: 480,
				deltaMinutes: 0,
			},
		];
		const parsed = parsePayrollCorrectionDayDeltas(raw);
		assert.equal(parsed.length, 1);
		assert.equal(parsed[0].deltaMinutes, 120);
		assert.equal(parsed[0].date, "2026-06-02");

		const ok = validatePayrollCorrectionDayDeltas(raw);
		assert.equal(ok.ok, true);
		assert.equal(validatePayrollCorrectionDayDeltas([]).ok, false);
	});

	it("computes OT and late money using rate context", () => {
		const rates = { hourlyRate: 100, otMultiplier: 1.5, ndPremiumMultiplier: 0.2 };
		// 60 OT minutes → 100 * 1.5 = 150
		const ot = computePayrollCorrectionAmount(
			[
				{
					date: "2026-06-01",
					hoursType: "OT",
					beforeMinutes: 0,
					afterMinutes: 60,
					deltaMinutes: 60,
				},
			],
			rates,
		);
		assert.equal(ot, 150);

		// 60 more late minutes → -100
		const late = computePayrollCorrectionAmount(
			[
				{
					date: "2026-06-01",
					hoursType: "LATE",
					beforeMinutes: 0,
					afterMinutes: 60,
					deltaMinutes: 60,
				},
			],
			rates,
		);
		assert.equal(late, -100);
	});

	it("holds negative net after approval (D3)", () => {
		assert.equal(resolvePostApprovalStatus(50).status, "READY");
		assert.equal(resolvePostApprovalStatus(0).status, "READY");
		const hold = resolvePostApprovalStatus(-10);
		assert.equal(hold.status, "APPROVED_HOLD");
		assert.equal(hold.holdReason, "NEGATIVE_DELTA_REQUIRES_HR_PATH");
	});

	it("detects overlapping open correction days", () => {
		const open = parsePayrollCorrectionDayDeltas([
			{ date: "2026-06-01", hoursType: "OT", beforeMinutes: 0, afterMinutes: 30, deltaMinutes: 30 },
		]);
		const incoming = parsePayrollCorrectionDayDeltas([
			{ date: "2026-06-01", hoursType: "REGULAR", beforeMinutes: 480, afterMinutes: 540, deltaMinutes: 60 },
		]);
		assert.equal(hasOverlappingOpenDay(open, incoming), true);
		assert.equal(
			hasOverlappingOpenDay(open, [
				{
					date: "2026-06-02",
					hoursType: "OT",
					beforeMinutes: 0,
					afterMinutes: 30,
					deltaMinutes: 30,
				},
			]),
			false,
		);
	});

	it("builds labeled payslip line and merges metadata without double ids", () => {
		const line = buildPayrollCorrectionPayslipLine({
			correctionId: "corr-1",
			requestId: "req-1",
			sourcePayrollPeriodId: "pp-a",
			sourcePayrollPeriodName: "Jun 1-15 2026",
			sourceTimesheetId: "ts-1",
			dayDeltas: [
				{
					date: "2026-06-02",
					hoursType: "OT",
					beforeMinutes: 0,
					afterMinutes: 60,
					deltaMinutes: 60,
				},
			],
			amount: 150,
			appliedAt: new Date("2026-07-01T00:00:00.000Z"),
		});
		assert.match(line.label, /Retro OT/i);
		assert.match(line.label, /Jun 1-15/);
		assert.equal(line.sourcePayrollPeriodId, "pp-a");

		const merged = mergePayrollCorrectionsIntoMetadata({ foo: 1, payrollCorrections: [line] }, [
			{ ...line, amount: 200 },
		]);
		assert.equal((merged.payrollCorrections as any[]).length, 1);
		assert.equal((merged.payrollCorrections as any[])[0].amount, 200);
		assert.equal(merged.foo, 1);
		assert.equal(sumAppliedCorrectionAmounts([line]), 150);
		assert.equal(buildRetroPayslipLabel({ sourcePeriodName: "P1" }), "Retro adjustment (P1 correction)");
	});

	it("updates payroll money fields from applied lines", () => {
		const lines = [
			buildPayrollCorrectionPayslipLine({
				correctionId: "c1",
				sourcePayrollPeriodId: "a",
				sourceTimesheetId: "t",
				dayDeltas: [],
				amount: 250,
			}),
		];
		const money = buildUpdatedPayrollMoneyAfterCorrections({
			existingMetadata: { dailyRate: 1 },
			lines,
			otherCompensation: 10,
			grossPay: 1000,
			netPay: 800,
			totalReceivable: 800,
		});
		assert.equal(money.otherCompensation, 260);
		assert.equal(money.grossPay, 1250);
		assert.equal(money.netPay, 1050);
		assert.equal(money.totalReceivable, 1050);
		assert.equal(money.appliedAmount, 250);
		assert.ok(Array.isArray((money.metadata as any).payrollCorrections));
		assert.equal((money.metadata as any).payrollCorrections[0].label.includes("Retro"), true);
	});
});

describe("payroll-correction apply idempotency (service contract)", () => {
	it("skips non-READY and already-applied rows via conditional updateMany", async () => {
		const updates: any[] = [];
		const readyRow = {
			id: "ready-1",
			status: "READY",
			appliedAt: null,
			appliedEmployeePayrollId: null,
			targetPayrollPeriodId: null,
			dayDeltas: [
				{
					date: "2026-06-01",
					hoursType: "REGULAR",
					beforeMinutes: 480,
					afterMinutes: 540,
					deltaMinutes: 60,
				},
			],
			sourcePayrollPeriodId: "pp-a",
			sourceTimesheetId: "ts-a",
			requestId: "req-1",
			metadata: { periodName: "Period A" },
		};
		const alreadyMarkedReadyButApplied = {
			id: "already",
			status: "READY",
			appliedAt: new Date(),
			appliedEmployeePayrollId: "ep-old",
			targetPayrollPeriodId: null,
			dayDeltas: [],
			sourcePayrollPeriodId: "pp-a",
			sourceTimesheetId: "ts-a",
			requestId: null,
			metadata: {},
		};

		const prisma = {
			payrollCorrection: {
				findMany: async (args: any) => {
					if (args?.where?.status === "APPLIED") return [];
					return [readyRow, alreadyMarkedReadyButApplied];
				},
				updateMany: async (args: any) => {
					updates.push(args);
					if (args.where.id === "ready-1" && args.where.status === "READY") {
						return { count: 1 };
					}
					return { count: 0 };
				},
				update: async () => ({}),
			},
		};

		const first = await applyReadyPayrollCorrectionsToEmployeePayroll({
			prisma: prisma as any,
			organizationId: "org",
			employeeId: "emp",
			targetPayrollPeriodId: "pp-b",
			employeePayrollId: "ep-b",
			existingMetadata: {},
			rateContext: { hourlyRate: 60 },
		});

		assert.equal(first.applied.length, 1);
		assert.equal(first.applied[0].correctionId, "ready-1");
		assert.equal(first.skipped.some((s) => s.id === "already"), true);
		assert.equal(updates.length, 1);
		assert.equal(updates[0].where.status, "READY");
		assert.equal(updates[0].where.appliedAt, null);

		// Second generate: no READY left; prior APPLIED for this period is re-included once
		const appliedOnPeriod = {
			...readyRow,
			status: "APPLIED",
			appliedAt: new Date(),
			appliedPayrollPeriodId: "pp-b",
			appliedEmployeePayrollId: "ep-b",
			appliedAmount: 60,
		};
		prisma.payrollCorrection.findMany = async (args: any) => {
			if (args?.where?.status === "APPLIED") return [appliedOnPeriod];
			return [];
		};
		prisma.payrollCorrection.updateMany = async (args: any) => {
			updates.push(args);
			return { count: 1 };
		};

		const second = await applyReadyPayrollCorrectionsToEmployeePayroll({
			prisma: prisma as any,
			organizationId: "org",
			employeeId: "emp",
			targetPayrollPeriodId: "pp-b",
			employeePayrollId: "ep-b",
			existingMetadata: {},
			rateContext: { hourlyRate: 60 },
		});
		assert.equal(second.applied.length, 1);
		assert.equal(second.applied[0].correctionId, "ready-1");
		assert.equal(second.appliedAmount, 60);
	});
});
