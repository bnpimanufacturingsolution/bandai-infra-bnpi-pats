import { z } from "zod";

// Level Schema (full, including ID)
export const LevelSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	rank: z.number().int().optional(),
	description: z.string().optional(),
	isManager: z.boolean().default(false),
	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Level = z.infer<typeof LevelSchema>;

// Create Level Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateLevelSchema = LevelSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	rank: true,
	description: true,
	isDeleted: true,
});

export type CreateLevel = z.infer<typeof CreateLevelSchema>;

// Update Level Schema (partial, excluding immutable fields and relations)
export const UpdateLevelSchema = LevelSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateLevel = z.infer<typeof UpdateLevelSchema>;

export type LevelWithRelations = Level & {};
