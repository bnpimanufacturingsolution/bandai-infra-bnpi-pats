import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// Page Schema
export const PageSchema = z.object({
	url: z.string().min(1),
	title: z.string().min(1),
});

export type Page = z.infer<typeof PageSchema>;

// Headers Schema
export const HeadersSchema = z.object({
	userAgent: z.string().min(1),
});

export type Headers = z.infer<typeof HeadersSchema>;

// ActivityLogArchive Schema
export const ActivityLogArchiveSchema = z.object({
	status: z.boolean(),
	date: z.coerce.date(),
});

export type ActivityLogArchive = z.infer<typeof ActivityLogArchiveSchema>;

const objectIdSchema = z.string().refine((val) => isValidObjectId(val), {
	message: "Invalid ObjectId",
});

// ActivityLogging Schema (full, including ID)
export const ActivityLoggingSchema = z.object({
	id: objectIdSchema,
	employeeId: objectIdSchema.nullable().optional(),
	headers: HeadersSchema.optional(),
	ip: z.string().min(1),
	path: z.string().min(1),
	method: z.string().min(1),
	page: PageSchema.optional(),
	action: z.string().min(1),
	description: z.string().min(1),
	payload: z.any().optional(),
	organizationId: objectIdSchema.nullable().optional(),
	entityType: z.string().optional(),
	archive: ActivityLogArchiveSchema.nullable().optional(),
	isDeleted: z.boolean().optional(),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
});

export type ActivityLogging = z.infer<typeof ActivityLoggingSchema>;

// Create ActivityLogging Schema
export const CreateActivityLoggingSchema = z.object({
	employeeId: objectIdSchema.optional(),
	headers: HeadersSchema.optional(),
	ip: z.string().min(1),
	path: z.string().min(1),
	method: z.string().min(1),
	page: PageSchema.optional(),
	action: z.string().min(1),
	description: z.string().min(1).optional().default(""),
	payload: z.any().optional(),
	organizationId: objectIdSchema.optional(),
	entityType: z.string().optional(),
	archive: ActivityLogArchiveSchema.optional(),
	isDeleted: z.boolean().optional(),
});

export type CreateActivityLogging = z.infer<typeof CreateActivityLoggingSchema>;

// Update ActivityLogging Schema
export const UpdateActivityLoggingSchema = z
	.object({
		employeeId: objectIdSchema.nullable().optional(),
		headers: HeadersSchema.optional(),
		ip: z.string().min(1).optional(),
		path: z.string().min(1).optional(),
		method: z.string().min(1).optional(),
		page: PageSchema.nullable().optional(),
		action: z.string().min(1).optional(),
		description: z.string().min(1).optional(),
		payload: z.any().optional(),
		organizationId: objectIdSchema.nullable().optional(),
		entityType: z.string().nullable().optional(),
		archive: ActivityLogArchiveSchema.nullable().optional(),
	})
	.strict();

export type UpdateActivityLogging = z.infer<typeof UpdateActivityLoggingSchema>;

export type ActivityLoggingWithRelations = ActivityLogging & {
};
