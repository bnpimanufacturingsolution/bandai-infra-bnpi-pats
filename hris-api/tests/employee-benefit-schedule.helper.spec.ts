import assert from "node:assert/strict";
import {
	BENEFIT_PROGRAM_ACTIVE_STATUSES,
	buildBenefitInstallments,
	normalizeEmployeeBenefitPayload,
	planAttendanceBenefitInstallmentForPeriod,
	planRecurringInstallmentForPeriod,
	type BenefitSchedulePeriod,
} from "../helper/employee-benefit-program.helper";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

const period = (id: string, startDate: string, endDate: string): BenefitSchedulePeriod => ({
	id,
	startDate: date(startDate),
	endDate: date(endDate),
});

const benefit = (overrides: Record<string, unknown> = {}) => ({
	totalAmount: 100,
	startPayrollCutOff: date("2026-01-01"),
	endPayrollCutOff: date("2026-03-31"),
	...overrides,
});

describe("employee benefit schedule helper", () => {
	it("builds a fixed schedule from its requested installment count", () => {
		const rows = buildBenefitInstallments("benefit-1", benefit({
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 3,
		}));

		assert.deepEqual(rows.map((row) => row.amount), [33.33, 33.33, 33.34]);
		assert.deepEqual(rows.map((row) => row.scheduledDate.toISOString()), [
			"2026-01-01T00:00:00.000Z",
			"2026-01-16T00:00:00.000Z",
			"2026-01-31T00:00:00.000Z",
		]);
		assert.deepEqual(rows.map((row) => row.installmentNumber), [1, 2, 3]);
	});

	it("builds one fixed installment for a requested count of one", () => {
		const rows = buildBenefitInstallments("benefit-1", benefit({
			scheduleMode: "FIXED_INSTALLMENTS",
			totalAmount: 123.45,
			totalInstallments: 1,
		}));

		assert.deepEqual(rows.map((row) => row.amount), [123.45]);
		assert.equal(rows[0].status, "SCHEDULED");
		assert.equal(rows[0].employeeBenefitId, "benefit-1");
	});

	it("puts a fixed schedule's centavo remainder in its final row", () => {
		const rows = buildBenefitInstallments("benefit-1", benefit({
			scheduleMode: "FIXED_INSTALLMENTS",
			totalAmount: 100,
			totalInstallments: 6,
		}));

		assert.deepEqual(rows.map((row) => row.amount), [16.66, 16.66, 16.66, 16.66, 16.66, 16.7]);
		assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 100);
	});

	it("rejects fixed schedules with an invalid installment count", () => {
		const rows = buildBenefitInstallments("benefit-1", benefit({
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 0,
		}));

		assert.deepEqual(rows, []);
	});

	it("rejects fractional fixed-installment counts instead of truncating them", () => {
		const rows = buildBenefitInstallments("benefit-1", benefit({
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 2.5,
		}));

		assert.deepEqual(rows, []);
	});

	it("does not build a fixed schedule without a start date", () => {
		const rows = buildBenefitInstallments("benefit-1", benefit({
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 3,
			startPayrollCutOff: undefined,
			startDate: undefined,
		}));

		assert.deepEqual(rows, []);
	});

	it("builds time-bound rows only for overlapping payroll periods", () => {
		const rows = buildBenefitInstallments(
			"benefit-1",
			benefit({
				scheduleMode: "TIME_BOUND",
				startPayrollCutOff: date("2026-01-15"),
				endPayrollCutOff: date("2026-02-15"),
			}),
			[
				period("after", "2026-02-16", "2026-02-28"),
				period("middle", "2026-02-01", "2026-02-15"),
				period("before", "2026-01-01", "2026-01-14"),
				period("first", "2026-01-15", "2026-01-31"),
			],
		);

		assert.deepEqual(rows.map((row) => row.scheduledDate.toISOString()), [
			"2026-01-15T00:00:00.000Z",
			"2026-02-01T00:00:00.000Z",
		]);
		assert.deepEqual(rows.map((row) => row.amount), [50, 50]);
	});

	it("includes payroll periods that meet the time-bound range on either inclusive boundary", () => {
		const rows = buildBenefitInstallments(
			"benefit-1",
			benefit({
				scheduleMode: "TIME_BOUND",
				startPayrollCutOff: date("2026-01-15"),
				endPayrollCutOff: date("2026-02-01"),
			}),
			[
				period("start-boundary", "2026-01-01", "2026-01-15"),
				period("end-boundary", "2026-02-01", "2026-02-15"),
			],
		);

		assert.deepEqual(rows.map((row) => row.scheduledDate.toISOString()), [
			"2026-01-01T00:00:00.000Z",
			"2026-02-01T00:00:00.000Z",
		]);
	});

	it("returns no time-bound rows when no supplied period overlaps the range", () => {
		const rows = buildBenefitInstallments(
			"benefit-1",
			benefit({
				scheduleMode: "TIME_BOUND",
				startPayrollCutOff: date("2026-02-01"),
				endPayrollCutOff: date("2026-02-15"),
			}),
			[period("before", "2026-01-01", "2026-01-15")],
		);

		assert.deepEqual(rows, []);
	});

	it("returns no time-bound rows when periods are not supplied", () => {
		const rows = buildBenefitInstallments("benefit-1", benefit({
			scheduleMode: "TIME_BOUND",
		}));

		assert.deepEqual(rows, []);
	});

	it("ignores malformed payroll periods when building time-bound schedules", () => {
		const rows = buildBenefitInstallments(
			"benefit-1",
			benefit({
				scheduleMode: "TIME_BOUND",
				startPayrollCutOff: date("2026-01-01"),
				endPayrollCutOff: date("2026-01-31"),
			}),
			[
				period("valid", "2026-01-01", "2026-01-15"),
				{ id: "bad-start", startDate: new Date("invalid"), endDate: date("2026-01-31") },
				{ id: "bad-end", startDate: date("2026-01-16"), endDate: new Date("invalid") },
			],
		);

		assert.deepEqual(rows.map((row) => row.scheduledDate.toISOString()), [
			"2026-01-01T00:00:00.000Z",
		]);
	});

	it("ignores reversed payroll periods when building time-bound schedules", () => {
		const rows = buildBenefitInstallments(
			"benefit-1",
			benefit({
				scheduleMode: "TIME_BOUND",
				startPayrollCutOff: date("2026-01-01"),
				endPayrollCutOff: date("2026-01-31"),
			}),
			[
				period("valid", "2026-01-01", "2026-01-15"),
				period("reversed", "2026-01-31", "2026-01-16"),
			],
		);

		assert.deepEqual(rows.map((row) => row.scheduledDate.toISOString()), [
			"2026-01-01T00:00:00.000Z",
		]);
	});

	it("puts a time-bound schedule's centavo remainder in its final payroll period", () => {
		const rows = buildBenefitInstallments(
			"benefit-1",
			benefit({
				scheduleMode: "TIME_BOUND",
				startPayrollCutOff: date("2026-01-01"),
				endPayrollCutOff: date("2026-02-15"),
			}),
			[
				period("one", "2026-01-01", "2026-01-15"),
				period("two", "2026-01-16", "2026-01-31"),
				period("three", "2026-02-01", "2026-02-15"),
			],
		);

		assert.deepEqual(rows.map((row) => row.amount), [33.33, 33.33, 33.34]);
	});

	it("excludes inactive statuses at the caller boundary", () => {
		assert.equal(BENEFIT_PROGRAM_ACTIVE_STATUSES.has("CANCELLED"), false);
		assert.equal(BENEFIT_PROGRAM_ACTIVE_STATUSES.has("PENDING"), false);
		assert.equal(BENEFIT_PROGRAM_ACTIVE_STATUSES.has("ACTIVE"), true);
	});

	it("keeps six-installment scheduling for mode-less legacy benefits", () => {
		const normalized = normalizeEmployeeBenefitPayload({
			totalAmount: 600,
			startDate: date("2026-01-01"),
		});
		const rows = buildBenefitInstallments("benefit-1", normalized);

		assert.equal(normalized.totalInstallments, 6);
		assert.equal(rows.length, 6);
		assert.deepEqual(rows.map((row) => row.amount), [100, 100, 100, 100, 100, 100]);
	});

	it("does not assign a legacy six-installment count to an explicit time-bound payload", () => {
		const normalized = normalizeEmployeeBenefitPayload({
			totalAmount: 600,
			scheduleMode: "TIME_BOUND",
			startDate: date("2026-01-01"),
			endDate: date("2026-03-31"),
		});

		assert.equal(normalized.totalInstallments, undefined);
	});

	it("does not bulk-build installments for recurring benefits", () => {
		const rows = buildBenefitInstallments("benefit-1", benefit({
			scheduleMode: "RECURRING",
			totalAmount: 500,
			installmentAmount: 500,
			totalInstallments: 0,
		}));

		assert.deepEqual(rows, []);
	});

	it("plans a create for a recurring benefit in range with no existing installment", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				status: "ACTIVE",
				isActive: true,
				isDeleted: false,
				startDate: date("2026-01-01"),
				endDate: null,
				amount: 500,
				installmentAmount: 500,
				installments: [],
			},
			period("period-1", "2026-01-01", "2026-01-15"),
		);

		assert.equal(plan.action, "create");
		if (plan.action === "create") {
			assert.equal(plan.row.amount, 500);
			assert.equal(plan.row.scheduledDate.toISOString(), "2026-01-01T00:00:00.000Z");
			assert.equal(plan.row.installmentNumber, 1);
			assert.equal(plan.row.status, "SCHEDULED");
		}
	});

	it("reuses an existing installment already scheduled in the period", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-01-01"),
				amount: 500,
				installments: [
					{
						id: "i-1",
						installmentNumber: 1,
						amount: 500,
						scheduledDate: date("2026-01-01"),
						status: "SCHEDULED",
					},
				],
			},
			period("period-1", "2026-01-01", "2026-01-15"),
		);

		assert.equal(plan.action, "existing");
		if (plan.action === "existing") {
			assert.equal(plan.installment.id, "i-1");
		}
	});

	it("skips MONTHLY recurrence on semi-monthly period 1", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				recurrenceFrequency: "MONTHLY",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-01-01"),
				amount: 500,
				installments: [],
			},
			{
				...period("period-1", "2026-01-01", "2026-01-15"),
				periodNumber: 1,
				isOnlyPeriodInMonth: false,
			},
		);
		assert.equal(plan.action, "skipped");
		if (plan.action === "skipped") {
			assert.equal(plan.reason, "recurrence_frequency");
		}
	});

	it("creates MONTHLY recurrence on period 2", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				recurrenceFrequency: "MONTHLY",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-01-01"),
				amount: 500,
				installments: [],
			},
			{
				...period("period-2", "2026-01-16", "2026-01-31"),
				periodNumber: 2,
				isOnlyPeriodInMonth: false,
			},
		);
		assert.equal(plan.action, "create");
	});

	it("creates MONTHLY recurrence on sole period in month", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				recurrenceFrequency: "MONTHLY",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-01-01"),
				amount: 500,
				installments: [],
			},
			{
				...period("period-m", "2026-01-01", "2026-01-31"),
				periodNumber: 1,
				isOnlyPeriodInMonth: true,
			},
		);
		assert.equal(plan.action, "create");
	});

	it("skips YEARLY recurrence outside fiscal year end month", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				recurrenceFrequency: "YEARLY",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-01-01"),
				amount: 500,
				installments: [],
			},
			{
				...period("period-2", "2026-01-16", "2026-01-31"),
				periodNumber: 2,
				fiscalYearStartMonth: 1,
			},
		);
		assert.equal(plan.action, "skipped");
		if (plan.action === "skipped") {
			assert.equal(plan.reason, "recurrence_frequency");
		}
	});

	it("creates YEARLY recurrence on December period 2 for Jan fiscal start", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				recurrenceFrequency: "YEARLY",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-01-01"),
				amount: 500,
				installments: [],
			},
			{
				...period("period-ye", "2026-12-16", "2026-12-31"),
				periodNumber: 2,
				fiscalYearStartMonth: 1,
			},
		);
		assert.equal(plan.action, "create");
	});

	it("defaults missing recurrenceFrequency to EVERY_CUTOFF (period 1 creates)", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-01-01"),
				amount: 500,
				installments: [],
			},
			{
				...period("period-1", "2026-01-01", "2026-01-15"),
				periodNumber: 1,
			},
		);
		assert.equal(plan.action, "create");
	});

	it("skips recurring ensure before the benefit start date", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-02-01"),
				amount: 500,
				installments: [],
			},
			period("period-1", "2026-01-01", "2026-01-15"),
		);

		assert.equal(plan.action, "skipped");
		if (plan.action === "skipped") {
			assert.equal(plan.reason, "before_start");
		}
	});

	it("skips recurring ensure after the benefit end date", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-01-01"),
				endDate: date("2025-12-31"),
				amount: 500,
				installments: [],
			},
			period("period-1", "2026-01-01", "2026-01-15"),
		);

		assert.equal(plan.action, "skipped");
		if (plan.action === "skipped") {
			assert.equal(plan.reason, "after_end");
		}
	});

	it("skips recurring ensure when the benefit is inactive", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				status: "ACTIVE",
				isActive: false,
				startDate: date("2026-01-01"),
				amount: 500,
				installments: [],
			},
			period("period-1", "2026-01-01", "2026-01-15"),
		);

		assert.equal(plan.action, "skipped");
		if (plan.action === "skipped") {
			assert.equal(plan.reason, "inactive");
		}
	});

	it("uses the next installment number when prior rows exist in other periods", () => {
		const plan = planRecurringInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "RECURRING",
				status: "ACTIVE",
				isActive: true,
				startDate: date("2026-01-01"),
				amount: 250,
				installments: [
					{
						id: "i-1",
						installmentNumber: 3,
						amount: 250,
						scheduledDate: date("2025-12-16"),
						status: "DEDUCTED",
					},
				],
			},
			period("period-1", "2026-01-01", "2026-01-15"),
		);

		assert.equal(plan.action, "create");
		if (plan.action === "create") {
			assert.equal(plan.row.installmentNumber, 4);
			assert.equal(plan.row.amount, 250);
		}
	});

	it("builds attendance-based fixed installments with enrolled amount as placeholder (not split)", () => {
		const rows = buildBenefitInstallments(
			"benefit-1",
			benefit({
				scheduleMode: "FIXED_INSTALLMENTS",
				totalInstallments: 3,
				totalAmount: 150,
				installmentAmount: 150,
				attendanceBased: true,
				attendanceAmountBasis: "PER_CUTOFF",
			}),
		);

		assert.deepEqual(
			rows.map((row) => row.amount),
			[150, 150, 150],
		);
	});

	it("plans an attendance update when a due installment already exists", () => {
		const plan = planAttendanceBenefitInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "FIXED_INSTALLMENTS",
				status: "ACTIVE",
				isActive: true,
				attendanceBased: true,
				attendanceAmountBasis: "PER_DAY",
				startDate: date("2026-01-01"),
				installments: [
					{
						id: "i-1",
						installmentNumber: 1,
						amount: 50,
						scheduledDate: date("2026-01-01"),
						status: "SCHEDULED",
					},
				],
			},
			period("period-1", "2026-01-01", "2026-01-15"),
			450,
		);

		assert.equal(plan.action, "update");
		if (plan.action === "update") {
			assert.equal(plan.amount, 450);
			assert.equal(plan.installment.id, "i-1");
		}
	});

	it("plans an attendance create for TIME_BOUND when no period installment exists", () => {
		const plan = planAttendanceBenefitInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "TIME_BOUND",
				status: "ACTIVE",
				isActive: true,
				attendanceBased: true,
				attendanceAmountBasis: "PER_CUTOFF",
				startDate: date("2026-01-01"),
				endDate: date("2026-06-30"),
				installments: [],
			},
			period("period-1", "2026-01-01", "2026-01-15"),
			400,
		);

		assert.equal(plan.action, "create");
		if (plan.action === "create") {
			assert.equal(plan.row.amount, 400);
		}
	});

	it("does not create a FIXED attendance installment when none is due", () => {
		const plan = planAttendanceBenefitInstallmentForPeriod(
			{
				id: "benefit-1",
				scheduleMode: "FIXED_INSTALLMENTS",
				status: "ACTIVE",
				isActive: true,
				attendanceBased: true,
				attendanceAmountBasis: "PER_DAY",
				startDate: date("2026-01-01"),
				installments: [],
			},
			period("period-1", "2026-01-01", "2026-01-15"),
			100,
		);

		assert.equal(plan.action, "skipped");
		if (plan.action === "skipped") {
			assert.equal(plan.reason, "no_due_fixed_installment");
		}
	});
});
