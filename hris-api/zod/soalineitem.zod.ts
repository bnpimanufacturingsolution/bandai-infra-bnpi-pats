import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// SOALineItem Schema (full, including ID)
export const SOALineItemSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	statementOfAccountId: z.string().refine((val) => isValidObjectId(val)),
	category: z.string().optional(),
	description: z.string().optional(),
	employeeId: z.string().refine((val) => isValidObjectId(val)).optional(),
	employeePayrollId: z.string().refine((val) => isValidObjectId(val)).optional(),
	employeeLoanId: z.string().refine((val) => isValidObjectId(val)).optional(),
	employeeBenefitId: z.string().refine((val) => isValidObjectId(val)).optional(),
	taxableAmount: z.number(),
	taxAmount: z.number(),
	employeeShare: z.number(),
	employerShare: z.number(),
	totalAmount: z.number(),
	metadata: z.any().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type SOALineItem = z.infer<typeof SOALineItemSchema>;

// Create SOALineItem Schema (excluding ID, createdAt, updatedAt)
export const CreateSoalineitemSchema = SOALineItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	category: true,
	description: true,
	employeeId: true,
	employeePayrollId: true,
	employeeLoanId: true,
	employeeBenefitId: true,
	taxableAmount: true,
	taxAmount: true,
	employeeShare: true,
	employerShare: true,
	totalAmount: true,
	metadata: true,
});

export type CreateSoalineitem = z.infer<typeof CreateSoalineitemSchema>;

// Update SOALineItem Schema (all fields optional)
export const UpdateSoalineitemSchema = SOALineItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateSoalineitem = z.infer<typeof UpdateSoalineitemSchema>;

export type SOALineItemWithRelations = SOALineItem & {};
