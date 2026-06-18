import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// Entity Schema
export const EntitySchema = z.object({
	type: z.string().min(1),
	id: z.string().refine((val) => isValidObjectId(val)),
});

export type Entity = z.infer<typeof EntitySchema>;

// Changes Schema
export const ChangesSchema = z.object({
	before: z.any().optional(),
	after: z.any().optional(),
});

export type Changes = z.infer<typeof ChangesSchema>;

// RequestMetadata Schema
export const RequestMetadataSchema = z.object({
	userAgent: z.string().min(1),
	ip: z.string().min(1),
	path: z.string().min(1),
	method: z.string().min(1),
});

export type RequestMetadata = z.infer<typeof RequestMetadataSchema>;

const objectIdSchema = z.string().refine((val) => isValidObjectId(val), {
	message: "Invalid ObjectId",
});

// AuditLogging Schema (full, including ID)
export const AuditLoggingSchema = z.object({
	id: objectIdSchema,
	employeeId: objectIdSchema.nullable().optional(),
	type: z.string().min(1),
	severity: z.string().min(1),
	entity: EntitySchema,
	changes: ChangesSchema.optional(),
	metadata: RequestMetadataSchema.optional(),
	description: z.string().optional(),
	payload: z.any().optional(),
	archiveStatus: z.boolean().optional(),
	archiveDate: z.coerce.date().nullable().optional(),
	isDeleted: z.boolean().optional(),
	timestamp: z.coerce.date().optional(),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});

export type AuditLogging = z.infer<typeof AuditLoggingSchema>;

// Create AuditLogging Schema
export const CreateAuditLoggingSchema = z.object({
	employeeId: objectIdSchema.optional(),
	type: z.string().min(1),
	severity: z.string().min(1),
	entity: EntitySchema,
	changes: ChangesSchema.optional(),
	metadata: RequestMetadataSchema.optional(),
	description: z.string().optional(),
	payload: z.any().optional(),
	archiveStatus: z.boolean().optional(),
	archiveDate: z.coerce.date().optional(),
	isDeleted: z.boolean().optional(),
	timestamp: z.coerce.date().optional(),
});

export type CreateAuditLogging = z.infer<typeof CreateAuditLoggingSchema>;

// Update AuditLogging Schema
export const UpdateAuditLoggingSchema = z
	.object({
		employeeId: objectIdSchema.nullable().optional(),
		type: z.string().min(1).optional(),
		severity: z.string().min(1).optional(),
		entity: EntitySchema.optional(),
		changes: ChangesSchema.nullable().optional(),
		metadata: RequestMetadataSchema.nullable().optional(),
		description: z.string().nullable().optional(),
		payload: z.any().optional(),
		archiveStatus: z.boolean().optional(),
		archiveDate: z.coerce.date().nullable().optional(),
		isDeleted: z.boolean().optional(),
		timestamp: z.coerce.date().optional(),
	})
	.strict();

export type UpdateAuditLogging = z.infer<typeof UpdateAuditLoggingSchema>;

export type AuditLoggingWithRelations = AuditLogging & {
};
