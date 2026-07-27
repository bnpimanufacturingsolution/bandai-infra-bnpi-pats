import assert from "node:assert/strict";
import { normalizeEmployeeBenefitPayload } from "../helper/employee-benefit-program.helper";
import {
	CreateEmployeeBenefitSchema,
	UpdateEmployeeBenefitSchema,
} from "../zod/employeebenefit.zod";

const validBenefit = {
	organizationId: "org-1",
	employeeId: "550e8400-e29b-41d4-a716-446655440000",
	benefitTypeId: "550e8400-e29b-41d4-a716-446655440001",
	totalAmount: 1200,
	installmentAmount: 100,
	remainingBalance: 1200,
};

describe("employee benefit schedule contract", () => {
	it("accepts a fixed-installments schedule with an installment count", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 12,
		});

		assert.equal(parsed.scheduleMode, "FIXED_INSTALLMENTS");
		assert.equal(parsed.totalInstallments, 12);
	});

	it("accepts a time-bound schedule with an end date", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "TIME_BOUND",
			endDate: "2026-12-31",
		});

		assert.equal(parsed.scheduleMode, "TIME_BOUND");
		assert.equal(parsed.endDate.toISOString(), "2026-12-31T00:00:00.000Z");
	});

	it("rejects a fixed-installments schedule without an installment count", () => {
		const result = CreateEmployeeBenefitSchema.safeParse({
			...validBenefit,
			scheduleMode: "FIXED_INSTALLMENTS",
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.some((issue) => issue.path.includes("totalInstallments")));
		}
	});

	it("rejects a time-bound schedule without an end date", () => {
		const result = CreateEmployeeBenefitSchema.safeParse({
			...validBenefit,
			scheduleMode: "TIME_BOUND",
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.some((issue) => issue.path.includes("endDate")));
		}
	});

	it("rejects a time-bound schedule whose end date precedes its start date", () => {
		const result = CreateEmployeeBenefitSchema.safeParse({
			...validBenefit,
			scheduleMode: "TIME_BOUND",
			startDate: "2026-02-01",
			endDate: "2026-01-31",
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.some((issue) => issue.path.includes("endDate")));
		}
	});

	it("rejects an unknown schedule mode", () => {
		const result = CreateEmployeeBenefitSchema.safeParse({
			...validBenefit,
			scheduleMode: "OPEN_ENDED",
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.some((issue) => issue.path.includes("scheduleMode")));
		}
	});

	it("persists a fixed-installments mode through payload normalization", () => {
		const normalized = normalizeEmployeeBenefitPayload({
			...validBenefit,
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 12,
		});

		assert.equal(normalized.scheduleMode, "FIXED_INSTALLMENTS");
	});

	it("persists a time-bound mode through payload normalization", () => {
		const normalized = normalizeEmployeeBenefitPayload({
			...validBenefit,
			scheduleMode: "TIME_BOUND",
			endDate: "2026-12-31",
		});

		assert.equal(normalized.scheduleMode, "TIME_BOUND");
	});

	it("keeps mode-less legacy payloads mode-less through normalization", () => {
		const normalized = normalizeEmployeeBenefitPayload(validBenefit);

		assert.equal(normalized.scheduleMode, undefined);
	});

	it("keeps the six-installment default for mode-less legacy payloads", () => {
		const parsed = CreateEmployeeBenefitSchema.parse(validBenefit);

		assert.equal(parsed.scheduleMode, undefined);
		assert.equal(parsed.totalInstallments, 6);
	});

	it("derives a legacy installment amount using the default installment count", () => {
		const normalized = normalizeEmployeeBenefitPayload({
			...validBenefit,
			totalAmount: 1200,
			installmentAmount: undefined,
		});

		assert.equal(normalized.installmentAmount, 200);
	});

	it("rejects a fixed-installments update without an installment count", () => {
		const result = UpdateEmployeeBenefitSchema.safeParse({
			scheduleMode: "FIXED_INSTALLMENTS",
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.some((issue) => issue.path.includes("totalInstallments")));
		}
	});

	it("rejects a time-bound update without an end date", () => {
		const result = UpdateEmployeeBenefitSchema.safeParse({
			scheduleMode: "TIME_BOUND",
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.some((issue) => issue.path.includes("endDate")));
		}
	});

	it("accepts a mode-less partial update for legacy benefits", () => {
		const parsed = UpdateEmployeeBenefitSchema.parse({ notes: "Legacy update" });

		assert.deepEqual(parsed, { notes: "Legacy update" });
	});

	it("accepts a recurring schedule without an end date or installment count", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
			amount: 500,
		});

		assert.equal(parsed.scheduleMode, "RECURRING");
		assert.equal(parsed.totalInstallments, 0);
		assert.equal(parsed.endDate, undefined);
	});

	it("accepts a recurring schedule with an optional end date", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
			endDate: "2026-12-31",
			amount: 500,
		});

		assert.equal(parsed.scheduleMode, "RECURRING");
		assert.equal(parsed.endDate.toISOString(), "2026-12-31T00:00:00.000Z");
		assert.equal(parsed.totalInstallments, 0);
	});

	it("rejects a recurring schedule whose end date precedes its start date", () => {
		const result = CreateEmployeeBenefitSchema.safeParse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-02-01",
			endDate: "2026-01-31",
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.some((issue) => issue.path.includes("endDate")));
		}
	});

	it("does not apply the legacy six-installment default to recurring creates", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
		});

		assert.equal(parsed.totalInstallments, 0);
	});

	it("persists a recurring mode through payload normalization with per-period amounts", () => {
		const normalized = normalizeEmployeeBenefitPayload({
			...validBenefit,
			scheduleMode: "RECURRING",
			amount: 500,
			totalAmount: 500,
			installmentAmount: undefined,
			totalInstallments: undefined,
		});

		assert.equal(normalized.scheduleMode, "RECURRING");
		assert.equal(normalized.totalInstallments, 0);
		assert.equal(normalized.installmentAmount, 500);
		assert.equal(normalized.totalAmount, 500);
		assert.equal(normalized.recurrenceFrequency, "EVERY_CUTOFF");
	});

	it("defaults recurring create recurrenceFrequency to EVERY_CUTOFF", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
			amount: 500,
		});
		assert.equal(parsed.recurrenceFrequency, "EVERY_CUTOFF");
	});

	it("accepts RECURRING MONTHLY and YEARLY frequencies", () => {
		for (const recurrenceFrequency of ["MONTHLY", "YEARLY"] as const) {
			const parsed = CreateEmployeeBenefitSchema.parse({
				...validBenefit,
				scheduleMode: "RECURRING",
				startDate: "2026-01-01",
				amount: 500,
				recurrenceFrequency,
			});
			assert.equal(parsed.recurrenceFrequency, recurrenceFrequency);
		}
	});

	it("rejects recurrenceFrequency on non-RECURRING create", () => {
		const result = CreateEmployeeBenefitSchema.safeParse({
			...validBenefit,
			scheduleMode: "TIME_BOUND",
			startDate: "2026-01-01",
			endDate: "2026-06-30",
			amount: 500,
			recurrenceFrequency: "MONTHLY",
		});
		assert.equal(result.success, false);
	});

	it("normalizes MONTHLY frequency and clears it for time-bound", () => {
		const monthly = normalizeEmployeeBenefitPayload({
			...validBenefit,
			scheduleMode: "RECURRING",
			recurrenceFrequency: "MONTHLY",
			amount: 500,
		});
		assert.equal(monthly.recurrenceFrequency, "MONTHLY");
		const timeBound = normalizeEmployeeBenefitPayload({
			...validBenefit,
			scheduleMode: "TIME_BOUND",
			recurrenceFrequency: "MONTHLY",
			amount: 500,
			endDate: "2026-06-30",
		});
		assert.equal(timeBound.recurrenceFrequency, null);
	});

	it("accepts a recurring partial update without requiring end date or installment count", () => {
		const parsed = UpdateEmployeeBenefitSchema.parse({
			scheduleMode: "RECURRING",
			amount: 750,
		});

		assert.equal(parsed.scheduleMode, "RECURRING");
		assert.equal(parsed.amount, 750);
	});

	it("accepts attendance-based PER_DAY with any schedule mode", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
			amount: 50,
			attendanceBased: true,
			attendanceAmountBasis: "PER_DAY",
		});

		assert.equal(parsed.attendanceBased, true);
		assert.equal(parsed.attendanceAmountBasis, "PER_DAY");
	});

	it("accepts attendance-based PER_CUTOFF", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "TIME_BOUND",
			startDate: "2026-01-01",
			endDate: "2026-06-30",
			amount: 500,
			attendanceBased: true,
			attendanceAmountBasis: "PER_CUTOFF",
		});

		assert.equal(parsed.attendanceBased, true);
		assert.equal(parsed.attendanceAmountBasis, "PER_CUTOFF");
	});

	it("rejects attendance-based without an amount basis", () => {
		const result = CreateEmployeeBenefitSchema.safeParse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
			attendanceBased: true,
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.some((issue) => issue.path.includes("attendanceAmountBasis")));
		}
	});

	it("rejects amount basis when attendance-based is false", () => {
		const result = CreateEmployeeBenefitSchema.safeParse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
			attendanceBased: false,
			attendanceAmountBasis: "PER_DAY",
		});

		assert.equal(result.success, false);
		if (!result.success) {
			assert.ok(result.error.issues.some((issue) => issue.path.includes("attendanceAmountBasis")));
		}
	});

	it("normalizes attendance-based amounts as enrolled (not split)", () => {
		const normalized = normalizeEmployeeBenefitPayload({
			...validBenefit,
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 4,
			totalAmount: 200,
			amount: 200,
			installmentAmount: undefined,
			attendanceBased: true,
			attendanceAmountBasis: "PER_CUTOFF",
		});

		assert.equal(normalized.attendanceBased, true);
		assert.equal(normalized.attendanceAmountBasis, "PER_CUTOFF");
		assert.equal(normalized.installmentAmount, 200);
		assert.equal(normalized.totalAmount, 200);
	});

	it("defaults attendanceBased to false and clears basis", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
		});

		assert.equal(parsed.attendanceBased, false);
		assert.equal(parsed.attendanceAmountBasis, null);
	});

	it("defaults eligibility to ENROLLED_ALWAYS with absent flag default true", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
		});

		assert.equal(parsed.eligibilityMode, "ENROLLED_ALWAYS");
		assert.equal(parsed.eligibilityDisqualifyOnAbsent, true);
		assert.equal(parsed.eligibilityDisqualifyOnLate, false);
		assert.equal(parsed.eligibilityDisqualifyOnUndertime, false);
		assert.equal(parsed.eligibilityDisqualifyOnLeave, false);
	});

	it("accepts ATTENDANCE_QUALIFIED eligibility with disqualify flags", () => {
		const parsed = CreateEmployeeBenefitSchema.parse({
			...validBenefit,
			scheduleMode: "RECURRING",
			startDate: "2026-01-01",
			eligibilityMode: "ATTENDANCE_QUALIFIED",
			eligibilityDisqualifyOnAbsent: true,
			eligibilityDisqualifyOnLate: true,
			eligibilityDisqualifyOnUndertime: true,
			eligibilityDisqualifyOnLeave: true,
		});

		assert.equal(parsed.eligibilityMode, "ATTENDANCE_QUALIFIED");
		assert.equal(parsed.eligibilityDisqualifyOnLate, true);
		assert.equal(parsed.eligibilityDisqualifyOnLeave, true);
	});
});
