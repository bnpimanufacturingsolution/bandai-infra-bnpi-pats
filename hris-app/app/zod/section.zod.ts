import { z } from "zod";

export const SectionSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	departmentId: z.string().min(1),
	headId: z.string().nullable().optional(),
	scheduleId: z.string().nullable().optional(),
	isHr: z.boolean().default(false),
	isActive: z.boolean(),
	isDefault: z.boolean().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Section = z.infer<typeof SectionSchema>;

export const CreateSectionSchema = SectionSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	headId: true,
	isDefault: true,
});

export type CreateSection = z.infer<typeof CreateSectionSchema>;

export const UpdateSectionSchema = SectionSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateSection = z.infer<typeof UpdateSectionSchema>;
