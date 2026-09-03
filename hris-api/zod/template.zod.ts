import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";


// Template Schema (full, including ID)
export const TemplateSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	description: z.string().optional(),
	type: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Template = z.infer<typeof TemplateSchema>;

// Create Template Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateTemplateSchema = TemplateSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	type: true,
	isDeleted: true,
});

export type CreateTemplate = z.infer<typeof CreateTemplateSchema>;

// Update Template Schema (partial, excluding immutable fields and relations)
export const UpdateTemplateSchema = TemplateSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateTemplate = z.infer<typeof UpdateTemplateSchema>;
