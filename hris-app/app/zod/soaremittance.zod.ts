import { z } from "zod";
import { isValidObjectId } from "~/lib/object-id";

// RemittanceStatus Enum
export const RemittanceStatus = z.enum([
	"PENDING",
	"PROCESSING",
	"REMITTED",
	"CONFIRMED",
	"FAILED",
	"REVERSED",
]);

export type RemittanceStatus = z.infer<typeof RemittanceStatus>;

// SOARemittance Schema (full, including ID)
export const SOARemittanceSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	statementOfAccountId: z.string().refine((val) => isValidObjectId(val)),
	amount: z.number(),
	paymentMethod: z.string().optional(),
	referenceNumber: z.string().optional(),
	paymentDate: z.coerce.date(),
	category: z.string().optional(),
	status: RemittanceStatus,
	notes: z.string().optional(),
	metadata: z.any().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type SOARemittance = z.infer<typeof SOARemittanceSchema>;

// Create SOARemittance Schema (excluding ID, createdAt, updatedAt)
export const CreateSoaremittanceSchema = SOARemittanceSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	paymentMethod: true,
	referenceNumber: true,
	category: true,
	status: true,
	notes: true,
	metadata: true,
});

export type CreateSoaremittance = z.infer<typeof CreateSoaremittanceSchema>;

// Update SOARemittance Schema (all fields optional)
export const UpdateSoaremittanceSchema = SOARemittanceSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateSoaremittance = z.infer<typeof UpdateSoaremittanceSchema>;

export type SOARemittanceWithRelations = SOARemittance & {};
