import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

const DocumentReviewStatusSchema = z.enum(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
const DocumentReviewSourceSchema = z.enum(["EMPLOYEE_UPLOAD", "HR_UPLOAD", "MIGRATION", "SYSTEM"]);


// Document Schema (full, including ID)
export const DocumentSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	type: z.string().min(1),
	number: z.string().min(1).optional().nullable(),
	issueDate: z.coerce.date().optional().nullable(),
	expiryDate: z.coerce.date().optional(),
	fileUrl: z.string().optional(),
	ext: z.string().optional(),
	documentTypeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	fieldValues: z.record(z.any()).optional().nullable(),
	reviewStatus: DocumentReviewStatusSchema.optional().nullable(),
	reviewSubmittedAt: z.coerce.date().optional().nullable(),
	reviewSubmittedById: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	reviewApprovedAt: z.coerce.date().optional().nullable(),
	reviewApprovedById: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	reviewRejectedAt: z.coerce.date().optional().nullable(),
	reviewRejectedById: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	reviewRejectionReason: z.string().optional().nullable(),
	reviewSource: DocumentReviewSourceSchema.optional().nullable(),
	metadata: z.any().optional().nullable(),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Document = z.infer<typeof DocumentSchema>;

// Create Document Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateDocumentSchema = DocumentSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	expiryDate: true,
	fileUrl: true,
	ext: true,
	isDeleted: true,
});

export type CreateDocument = z.infer<typeof CreateDocumentSchema>;

// Update Document Schema (partial, excluding immutable fields and relations)
export const UpdateDocumentSchema = DocumentSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	employeeId: true,
	isDeleted: true,
}).partial();

export type UpdateDocument = z.infer<typeof UpdateDocumentSchema>;
