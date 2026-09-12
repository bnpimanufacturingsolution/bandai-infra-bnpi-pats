import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

const idSchema = z.string().refine((val) => isValidObjectId(val), {
	message: "Invalid ID format",
});

const optionalIdSchema = idSchema.optional().nullable();

export const OnboardingChecklistStatusSchema = z.enum(["DRAFT", "ACTIVE", "COMPLETED"]);
export type OnboardingChecklistStatus = z.infer<typeof OnboardingChecklistStatusSchema>;

export const OnboardingItemStatusSchema = z.enum(["PENDING", "COMPLETED"]);
export type OnboardingItemStatus = z.infer<typeof OnboardingItemStatusSchema>;

// ---------------------------------------------------------------------------
// Templates (admin-managed builder payloads)
// ---------------------------------------------------------------------------

export const CreateOnboardingTemplateSchema = z.object({
	organizationId: z.string().optional(),
	name: z.string().min(1, "Template name is required"),
	description: z.string().max(2000).optional().nullable(),
	isActive: z.boolean().optional(),
});
export type CreateOnboardingTemplate = z.infer<typeof CreateOnboardingTemplateSchema>;

export const UpdateOnboardingTemplateSchema = z
	.object({
		name: z.string().min(1).optional(),
		description: z.string().max(2000).optional().nullable(),
		isActive: z.boolean().optional(),
	})
	.refine((val) => Object.keys(val).length > 0, { message: "No update fields provided" });
export type UpdateOnboardingTemplate = z.infer<typeof UpdateOnboardingTemplateSchema>;

export const CreateOnboardingSectionSchema = z.object({
	title: z.string().min(1, "Section title is required"),
	order: z.coerce.number().int().optional(),
});
export type CreateOnboardingSection = z.infer<typeof CreateOnboardingSectionSchema>;

export const UpdateOnboardingSectionSchema = z
	.object({
		title: z.string().min(1).optional(),
		order: z.coerce.number().int().optional(),
	})
	.refine((val) => Object.keys(val).length > 0, { message: "No update fields provided" });
export type UpdateOnboardingSection = z.infer<typeof UpdateOnboardingSectionSchema>;

export const CreateOnboardingItemSchema = z.object({
	sectionId: idSchema.optional(),
	parentId: optionalIdSchema,
	number: z.string().max(20).optional(),
	title: z.string().min(1, "Item title is required"),
	description: z.string().max(4000).optional().nullable(),
	responsibleDepartmentId: z.string().trim().max(64).optional().nullable(),
	responsibleDepartmentName: z.string().trim().max(200).optional().nullable(),
	order: z.coerce.number().int().optional(),
});
export type CreateOnboardingItem = z.infer<typeof CreateOnboardingItemSchema>;

export const BulkCreateOnboardingItemsSchema = z.object({
	items: z.array(CreateOnboardingItemSchema).min(1, "At least one item is required"),
});
export type BulkCreateOnboardingItems = z.infer<typeof BulkCreateOnboardingItemsSchema>;

// Structure-only update: status/signature fields are intentionally excluded.
export const UpdateOnboardingItemSchema = z
	.object({
		sectionId: idSchema.optional(),
		parentId: optionalIdSchema,
		number: z.string().max(20).optional(),
		title: z.string().min(1).optional(),
		description: z.string().max(4000).optional().nullable(),
		responsibleDepartmentId: z.string().trim().max(64).optional().nullable(),
		responsibleDepartmentName: z.string().trim().max(200).optional().nullable(),
		order: z.coerce.number().int().optional(),
	})
	.refine((val) => Object.keys(val).length > 0, { message: "No update fields provided" });
export type UpdateOnboardingItem = z.infer<typeof UpdateOnboardingItemSchema>;

// Full-tree replace used by the builder "Save" action.
export const TemplateTreeItemSchema = z.object({
	id: optionalIdSchema,
	tempId: z.string().min(1).optional(),
	parentId: optionalIdSchema,
	parentTempId: z.string().optional().nullable(),
	number: z.string().max(20).optional(),
	title: z.string().min(1, "Item title is required"),
	description: z.string().max(4000).optional().nullable(),
	responsibleDepartmentId: z.string().trim().max(64).optional().nullable(),
	responsibleDepartmentName: z.string().trim().max(200).optional().nullable(),
	order: z.coerce.number().int().optional(),
});
export type TemplateTreeItem = z.infer<typeof TemplateTreeItemSchema>;

export const TemplateTreeSectionSchema = z.object({
	id: optionalIdSchema,
	tempId: z.string().min(1).optional(),
	title: z.string().min(1, "Section title is required"),
	order: z.coerce.number().int().optional(),
	items: z.array(TemplateTreeItemSchema).default([]),
});
export type TemplateTreeSection = z.infer<typeof TemplateTreeSectionSchema>;

export const ReplaceOnboardingTemplateTreeSchema = z.object({
	name: z.string().min(1).optional(),
	description: z.string().max(2000).optional().nullable(),
	isActive: z.boolean().optional(),
	sections: z.array(TemplateTreeSectionSchema),
});
export type ReplaceOnboardingTemplateTree = z.infer<typeof ReplaceOnboardingTemplateTreeSchema>;

// ---------------------------------------------------------------------------
// Checklist instances (per onboarding employee)
// ---------------------------------------------------------------------------

export const CreateOnboardingChecklistSchema = z.object({
	employeeId: idSchema,
	templateId: optionalIdSchema,
	title: z.string().min(1).max(200).optional(),
	targetDate: z.coerce.date().optional().nullable(),
});
export type CreateOnboardingChecklist = z.infer<typeof CreateOnboardingChecklistSchema>;

export const UpdateOnboardingChecklistSchema = z
	.object({
		title: z.string().min(1).max(200).optional(),
		status: OnboardingChecklistStatusSchema.optional(),
		targetDate: z.coerce.date().optional().nullable(),
	})
	.refine((val) => Object.keys(val).length > 0, { message: "No update fields provided" });
export type UpdateOnboardingChecklist = z.infer<typeof UpdateOnboardingChecklistSchema>;

// ---------------------------------------------------------------------------
// Sign / unsign
// ---------------------------------------------------------------------------

export const SignOnboardingItemSchema = z.object({
	password: z.string().min(1, "Password is required to sign"),
	remarks: z.string().max(1000).optional().nullable(),
});
export type SignOnboardingItem = z.infer<typeof SignOnboardingItemSchema>;

export const UnsignOnboardingItemSchema = z.object({
	reason: z.string().max(1000).optional().nullable(),
});
export type UnsignOnboardingItem = z.infer<typeof UnsignOnboardingItemSchema>;
