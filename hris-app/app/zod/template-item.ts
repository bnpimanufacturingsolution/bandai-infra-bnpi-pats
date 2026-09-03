import { z } from "zod";
import { ChecklistCategorySchema, PrioritySchema } from "./checklist-item";

// TemplateItem Schema (full, including ID)
export const TemplateItemSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	templateId: z.string(),
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	category: ChecklistCategorySchema,
	dueOffset: z.number().int(),
	priority: PrioritySchema,
	order: z.number().int(),
	uiElement: z.string().nullable().optional(),
	metadata: z.record(z.any(), z.unknown()).nullable().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type TemplateItem = z.infer<typeof TemplateItemSchema>;

// Create TemplateItem Schema (excluding ID, createdAt, updatedAt)
export const CreateTemplateItemSchema = TemplateItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	priority: true, // Defaults to MEDIUM
	metadata: true,
	isDeleted: true, // Defaults to false
});

export type CreateTemplateItem = z.infer<typeof CreateTemplateItemSchema>;

// Update TemplateItem Schema (partial, excluding immutable fields)
export const UpdateTemplateItemSchema = TemplateItemSchema.omit({
	id: true,
	organizationId: true, // Immutable
	templateId: true, // Immutable - items shouldn't move between templates
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateTemplateItem = z.infer<typeof UpdateTemplateItemSchema>;
