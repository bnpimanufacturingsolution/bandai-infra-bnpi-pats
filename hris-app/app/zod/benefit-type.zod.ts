import { z } from "zod";
import type { EmployeeBenefit } from "./employee-benefit.zod";

// BenefitCategory Enum
export const BenefitCategory = z.enum([
	"INSURANCE",
	"ALLOWANCE",
	"BONUS",
	"RETIREMENT",
	"HEALTH",
	"EDUCATION",
	"TRANSPORTATION",
	"OTHER",
]);

export type BenefitCategory = z.infer<typeof BenefitCategory>;

export const BenefitPayrollDirection = z.enum(["COMPENSATION", "DEDUCTION"]);

export type BenefitPayrollDirection = z.infer<typeof BenefitPayrollDirection>;

// BenefitType Schema (full, including ID)
export const BenefitTypeSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	code: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
	category: z.enum([
		"INSURANCE",
		"ALLOWANCE",
		"BONUS",
		"RETIREMENT",
		"HEALTH",
		"EDUCATION",
		"TRANSPORTATION",
		"OTHER",
	]),
	payrollDirection: BenefitPayrollDirection,
	reconciliationAction: z.string().min(1).optional(),
	minAmount: z.number().optional(),
	maxAmount: z.number().optional(),
	provider: z.string().optional(),
	coverage: z.number().optional(),
	fixedAmount: z.number().optional(),
	percentage: z.number().optional(),
	minServiceMonths: z.number().int().optional(),
	isTaxable: z.boolean(),
	defaultInstallments: z.number().int().min(1),
	payrollCycleDays: z.number().int().min(1),
	requireTermsAgreement: z.boolean(),
	defaultEligibilityMode: z
		.enum(["ENROLLED_ALWAYS", "ATTENDANCE_QUALIFIED"])
		.nullable()
		.optional(),
	defaultEligibilityDisqualifyOnAbsent: z.boolean().nullable().optional(),
	defaultEligibilityDisqualifyOnLate: z.boolean().nullable().optional(),
	defaultEligibilityDisqualifyOnUndertime: z.boolean().nullable().optional(),
	defaultEligibilityDisqualifyOnLeave: z.boolean().nullable().optional(),
	isActive: z.boolean(),
	isDefault: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	isDeleted: z.boolean(),
});

export type BenefitType = z.infer<typeof BenefitTypeSchema>;

// Create BenefitType Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateBenefitTypeSchema = BenefitTypeSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	fixedAmount: true,
	percentage: true,
	minServiceMonths: true,
	provider: true,
	coverage: true,
	minAmount: true,
	maxAmount: true,
	reconciliationAction: true,
	defaultInstallments: true,
	payrollCycleDays: true,
	requireTermsAgreement: true,
	defaultEligibilityMode: true,
	defaultEligibilityDisqualifyOnAbsent: true,
	defaultEligibilityDisqualifyOnLate: true,
	defaultEligibilityDisqualifyOnUndertime: true,
	defaultEligibilityDisqualifyOnLeave: true,
	isDefault: true,
});

export type CreateBenefitType = z.infer<typeof CreateBenefitTypeSchema>;

// Update BenefitType Schema (partial, excluding immutable fields and relations)
export const UpdateBenefitTypeSchema = BenefitTypeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateBenefitType = z.infer<typeof UpdateBenefitTypeSchema>;

export type BenefitTypeWithRelations = BenefitType & {
	employeeBenefits: EmployeeBenefit[];
};
