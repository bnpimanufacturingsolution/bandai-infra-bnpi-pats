import { z } from "zod";

import { BoardingTypeSchema } from "./boarding-process";

// Valid HRIS roles for boarding templates
export const HrisRoleSchema = z.enum([
	"hris-employee",
	"hris-employee-manager",
	"hris-hr-user",
	"hris-hr-manager",
]);

export type HrisRole = z.infer<typeof HrisRoleSchema>;

// BoardingTemplate Schema (full, including ID)
export const BoardingTemplateSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	role: HrisRoleSchema,
	name: z.string().min(1),
	description: z.string().nullable().optional(),
	type: BoardingTypeSchema,
	isDefault: z.boolean(),
	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type BoardingTemplate = z.infer<typeof BoardingTemplateSchema>;

// Create BoardingTemplate Schema (excluding ID, createdAt, updatedAt)
export const CreateBoardingTemplateSchema = BoardingTemplateSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	isDefault: true, // Defaults to false
	isActive: true, // Defaults to true
	isDeleted: true, // Defaults to false
});

export type CreateBoardingTemplate = z.infer<typeof CreateBoardingTemplateSchema>;

// Update BoardingTemplate Schema (partial, excluding immutable fields)
export const UpdateBoardingTemplateSchema = BoardingTemplateSchema.omit({
	id: true,
	organizationId: true, // Immutable
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateBoardingTemplate = z.infer<typeof UpdateBoardingTemplateSchema>;
