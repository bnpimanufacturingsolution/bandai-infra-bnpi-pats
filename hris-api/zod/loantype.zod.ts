import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { EmployeeLoan } from "./employeeloan.zod";

// LoanCategory Enum
export const LoanCategory = z.enum([
	"SALARY_LOAN",
	"EMERGENCY_LOAN",
	"HOUSING_LOAN",
	"CALAMITY_LOAN",
	"SSS_LOAN",
	"PAGIBIG_LOAN",
	"OTHER",
]);

export type LoanCategory = z.infer<typeof LoanCategory>;

// LoanType Schema (full, including ID)
export const LoanTypeSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
	category: z.enum([
		"SALARY_LOAN",
		"EMERGENCY_LOAN",
		"HOUSING_LOAN",
		"CALAMITY_LOAN",
		"SSS_LOAN",
		"PAGIBIG_LOAN",
		"OTHER",
	]),
	maxAmount: z.number().optional(),
	minAmount: z.number().optional(),
	interestRate: z.number(),
	maxTermMonths: z.number().int(),
	minServiceMonths: z.number().int().optional(),
	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type LoanType = z.infer<typeof LoanTypeSchema>;

// Create LoanType Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateLoanTypeSchema = LoanTypeSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	maxAmount: true,
	minAmount: true,
	minServiceMonths: true,
});

export type CreateLoanType = z.infer<typeof CreateLoanTypeSchema>;

// Update LoanType Schema (partial, excluding immutable fields and relations)
export const UpdateLoanTypeSchema = LoanTypeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateLoanType = z.infer<typeof UpdateLoanTypeSchema>;

export type LoanTypeWithRelations = LoanType & {
	employeeLoans: EmployeeLoan[];
};
