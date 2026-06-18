import { z } from "zod";

import type { Employee } from "./employee.zod";
import { LevelSchema } from "./level.zod";

// PositionLevel junction table schema
const PositionLevelSchema = z.object({
	id: z.string(),
	positionId: z.string(),
	levelId: z.string(),
	level: LevelSchema.optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

// Position Schema (full, including ID)
export const PositionSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	title: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	sectionId: z.string().nullable().optional(),
	levelIds: z.array(z.string()).optional(),
	levels: z.array(PositionLevelSchema).optional(),
	minSalary: z.number().optional(),
	maxSalary: z.number().optional(),
	isManager: z.boolean().optional().default(false),
	isOffer: z.boolean().optional(),
	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type Position = z.infer<typeof PositionSchema>;

// Create Position Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreatePositionSchema = PositionSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	minSalary: true,
	maxSalary: true,
});

export type CreatePosition = z.infer<typeof CreatePositionSchema>;

// Update Position Schema (partial, excluding immutable fields and relations)
export const UpdatePositionSchema = PositionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdatePosition = z.infer<typeof UpdatePositionSchema>;

export type PositionWithRelations = Position & {
	employees: Employee[];
};
