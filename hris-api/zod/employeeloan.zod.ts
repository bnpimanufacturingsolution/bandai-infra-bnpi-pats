import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { Employee } from "./employee.zod";
import type { LoanType } from "./loantype.zod";

// LoanStatus Enum
export const LoanStatus = z.enum([
	"PENDING",
	"APPROVED",
	"ACTIVE",
	"PAID",
	"DEFAULTED",
	"CANCELLED",
]);

export type LoanStatus = z.infer<typeof LoanStatus>;

// EmployeeLoan Schema (full, including ID)
export const EmployeeLoanSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
	loanTypeId: z.string().refine((val) => isValidObjectId(val)),
	principalAmount: z.number(),
	interestRate: z.number(),
	totalAmount: z.number(),
	termMonths: z.number().int(),
	monthlyPayment: z.number(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date(),
	amountPaid: z.number(),
	balance: z.number(),
	status: z.enum(["PENDING", "APPROVED", "ACTIVE", "PAID", "DEFAULTED", "CANCELLED"]),
	approvedBy: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional(),
	approvedAt: z.coerce.date().optional(),
	notes: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type EmployeeLoan = z.infer<typeof EmployeeLoanSchema>;

// Create EmployeeLoan Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateEmployeeLoanSchema = EmployeeLoanSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	approvedBy: true,
	approvedAt: true,
	notes: true,
});

export type CreateEmployeeLoan = z.infer<typeof CreateEmployeeLoanSchema>;

// Update EmployeeLoan Schema (partial, excluding immutable fields and relations)
export const UpdateEmployeeLoanSchema = EmployeeLoanSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateEmployeeLoan = z.infer<typeof UpdateEmployeeLoanSchema>;

export type EmployeeLoanWithRelations = EmployeeLoan & {
	employee: Employee;
	loanType: LoanType;
};
