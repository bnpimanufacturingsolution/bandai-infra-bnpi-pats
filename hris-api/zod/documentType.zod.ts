import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

const DocumentTypeFieldOptionSchema = z.object({
	label: z.string().min(1, "Option label is required"),
	value: z.string().min(1, "Option value is required"),
});

const DocumentTypeFieldValidationSchema = z
	.object({
		preset: z
			.enum(["PH_SSS", "PH_TIN", "PH_PAGIBIG", "PH_PHILHEALTH", "CUSTOM"])
			.optional()
			.nullable(),
		pattern: z.string().optional().nullable(),
		message: z.string().optional().nullable(),
		normalize: z.enum(["digits", "trim", "none"]).optional().nullable(),
		minLength: z.number().int().positive().optional().nullable(),
		maxLength: z.number().int().positive().optional().nullable(),
		allowHyphens: z.boolean().optional().default(true),
	})
	.optional()
	.nullable();

const MetadataScopeSchema = z.union([z.string(), z.array(z.string())]).optional().default("");

export const DocumentRuleMetadataSchema = z
	.object({
		priorityLevel: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().default("MEDIUM"),
		requiredForPayroll: z.boolean().optional().default(false),
		requiredForOnboarding: z.boolean().optional().default(false),
		requireFileForCompliance: z.boolean().optional().default(false),
		requiredForDepartments: MetadataScopeSchema,
		requiredForPositions: MetadataScopeSchema,
		requiredForEmploymentTypes: MetadataScopeSchema,
		requiredForRoles: MetadataScopeSchema,
	})
	.passthrough();

export const DocumentTypeFieldSchema = z.object({
	key: z.string().min(1, "Field key is required"),
	label: z.string().min(1, "Field label is required"),
	type: z.enum(["text", "number", "date", "select", "boolean", "file"]),
	required: z.boolean().optional().default(false),
	helperText: z.string().optional().nullable(),
	placeholder: z.string().optional().nullable(),
	options: z.array(DocumentTypeFieldOptionSchema).optional().default([]),
	validation: DocumentTypeFieldValidationSchema,
});

export const DocumentTypeSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	code: z.string().min(1),
	name: z.string().min(1),
	category: z.string().optional().nullable(),
	uploadBy: z.enum(["HR", "EMPLOYEE", "BOTH"]).default("HR"),
	isRequired: z.boolean().optional().default(false),
	isEmployeeVisible: z.boolean().optional().default(true),
	isActive: z.boolean().optional().default(true),
	displayOrder: z.number().int().optional().default(0),
	fields: z.array(DocumentTypeFieldSchema).optional().default([]),
	metadata: DocumentRuleMetadataSchema.optional().nullable(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export const CreateDocumentTypeSchema = DocumentTypeSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
});

export const UpdateDocumentTypeSchema = CreateDocumentTypeSchema.partial();

export type DocumentTypeField = z.infer<typeof DocumentTypeFieldSchema>;
export type DocumentRuleMetadata = z.infer<typeof DocumentRuleMetadataSchema>;
export type DocumentType = z.infer<typeof DocumentTypeSchema>;
export type CreateDocumentType = z.infer<typeof CreateDocumentTypeSchema>;
export type UpdateDocumentType = z.infer<typeof UpdateDocumentTypeSchema>;
