import { describe, expect, it } from "vitest";
import type { BenefitType } from "./benefit-type.zod";
import {
	CreateEmployeeBenefitSchema,
	EmployeeBenefitSchema,
	UpdateEmployeeBenefitSchema,
} from "./employee-benefit.zod";

const createBenefitInput = {
	organizationId: "org-1",
	employeeId: "employee-1",
	benefitTypeId: "benefit-type-1",
	name: "Health plan enrollment",
	description: "Monthly HMO benefit",
	amount: 1200,
	startDate: "2026-06-01",
	isActive: true,
};

describe("EmployeeBenefitSchema", () => {
	it("parses employee benefit records and keeps the relation type on the canonical benefit type module", () => {
		const benefitType = {
			id: "benefit-type-1",
			organizationId: "org-1",
			code: "HMO",
			name: "Health plan",
			category: "HEALTH",
			payrollDirection: "COMPENSATION",
			isTaxable: false,
			defaultInstallments: 1,
			payrollCycleDays: 30,
			requireTermsAgreement: false,
			isActive: true,
			isDefault: false,
			createdAt: new Date("2026-06-01T00:00:00.000Z"),
			updatedAt: new Date("2026-06-01T00:00:00.000Z"),
			isDeleted: false,
		} satisfies BenefitType;

		const parsed = EmployeeBenefitSchema.parse({
			id: "employee-benefit-1",
			organizationId: "org-1",
			employeeId: "employee-1",
			benefitTypeId: benefitType.id,
			name: "Health plan enrollment",
			description: "Monthly HMO benefit",
			amount: 1200,
			startDate: "2026-06-01",
			isActive: true,
			isDeleted: false,
			createdAt: "2026-06-01T00:00:00.000Z",
			updatedAt: "2026-06-01T00:00:00.000Z",
		});

		expect(parsed).toMatchObject({
			id: "employee-benefit-1",
			organizationId: "org-1",
			benefitTypeId: "benefit-type-1",
			amount: 1200,
		});
		expect(benefitType.code).toBe("HMO");
	});
});

describe("employee benefit schedule modes", () => {
	it("requires an end date for a time-bound create payload", () => {
		expect(
		CreateEmployeeBenefitSchema.safeParse({
			...createBenefitInput,
			scheduleMode: "TIME_BOUND",
		}).success,
	).toBe(false);
	});

	it("accepts a time-bound create payload with an end date", () => {
		expect(
		CreateEmployeeBenefitSchema.safeParse({
			...createBenefitInput,
			scheduleMode: "TIME_BOUND",
			endDate: "2026-06-30",
		}).success,
	).toBe(true);
	});

	it("requires a positive integer installment count for fixed schedules", () => {
		for (const totalInstallments of [undefined, 0, -1, 1.5]) {
			expect(
				CreateEmployeeBenefitSchema.safeParse({
					...createBenefitInput,
					scheduleMode: "FIXED_INSTALLMENTS",
					totalInstallments,
				}).success,
			).toBe(false);
		}
	});

	it("accepts a fixed schedule with a positive integer installment count", () => {
		expect(
		CreateEmployeeBenefitSchema.safeParse({
			...createBenefitInput,
			scheduleMode: "FIXED_INSTALLMENTS",
			totalInstallments: 3,
		}).success,
	).toBe(true);
	});

	it("keeps existing records without a schedule mode readable", () => {
		expect(
		EmployeeBenefitSchema.safeParse({
			id: "legacy-benefit-1",
			...createBenefitInput,
			isDeleted: false,
			createdAt: "2026-06-01T00:00:00.000Z",
			updatedAt: "2026-06-01T00:00:00.000Z",
		}).success,
	).toBe(true);
	});

	it("rejects an invalid schedule mode on update", () => {
		expect(
		UpdateEmployeeBenefitSchema.safeParse({ scheduleMode: "SIX_PAYMENTS" }).success,
	).toBe(false);
	});

	it("accepts a recurring create payload without an end date or installment count", () => {
		expect(
			CreateEmployeeBenefitSchema.safeParse({
				...createBenefitInput,
				scheduleMode: "RECURRING",
			}).success,
		).toBe(true);
	});

	it("accepts a recurring create payload with an optional end date", () => {
		expect(
			CreateEmployeeBenefitSchema.safeParse({
				...createBenefitInput,
				scheduleMode: "RECURRING",
				endDate: "2026-12-31",
			}).success,
		).toBe(true);
	});

	it("rejects a recurring create payload when end date precedes start date", () => {
		expect(
			CreateEmployeeBenefitSchema.safeParse({
				...createBenefitInput,
				scheduleMode: "RECURRING",
				startDate: "2026-06-15",
				endDate: "2026-06-01",
			}).success,
		).toBe(false);
	});

	it("accepts attendance-based PER_DAY and PER_CUTOFF creates", () => {
		expect(
			CreateEmployeeBenefitSchema.safeParse({
				...createBenefitInput,
				scheduleMode: "RECURRING",
				attendanceBased: true,
				attendanceAmountBasis: "PER_DAY",
			}).success,
		).toBe(true);
		expect(
			CreateEmployeeBenefitSchema.safeParse({
				...createBenefitInput,
				scheduleMode: "TIME_BOUND",
				endDate: "2026-06-30",
				attendanceBased: true,
				attendanceAmountBasis: "PER_CUTOFF",
			}).success,
		).toBe(true);
	});

	it("requires amount basis when attendance-based is enabled", () => {
		expect(
			CreateEmployeeBenefitSchema.safeParse({
				...createBenefitInput,
				scheduleMode: "RECURRING",
				attendanceBased: true,
			}).success,
		).toBe(false);
	});

	it("rejects amount basis when attendance-based is disabled", () => {
		expect(
			CreateEmployeeBenefitSchema.safeParse({
				...createBenefitInput,
				scheduleMode: "RECURRING",
				attendanceBased: false,
				attendanceAmountBasis: "PER_DAY",
			}).success,
		).toBe(false);
	});

	it("accepts RECURRING recurrenceFrequency EVERY_CUTOFF MONTHLY YEARLY", () => {
		for (const recurrenceFrequency of ["EVERY_CUTOFF", "MONTHLY", "YEARLY"] as const) {
			expect(
				CreateEmployeeBenefitSchema.safeParse({
					...createBenefitInput,
					scheduleMode: "RECURRING",
					recurrenceFrequency,
				}).success,
			).toBe(true);
		}
	});

	it("rejects recurrenceFrequency on non-RECURRING create", () => {
		expect(
			CreateEmployeeBenefitSchema.safeParse({
				...createBenefitInput,
				scheduleMode: "TIME_BOUND",
				endDate: "2026-06-30",
				recurrenceFrequency: "MONTHLY",
			}).success,
		).toBe(false);
	});
});
