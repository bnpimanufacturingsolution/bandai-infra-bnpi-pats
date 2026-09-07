import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// Section Schema (full, including ID)
export const SectionSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	departmentId: z.string().refine((val) => isValidObjectId(val)),
	headId: z
		.union([z.string().refine((val) => isValidObjectId(val)), z.null()])
		.optional(),
	// Line leader assignment is a many-to-many join (section_line_leaders),
	// accepted as employee-id list on create/update and reconciled by the controller.
	lineLeaderIds: z.array(z.string().refine((val) => isValidObjectId(val))).optional(),
	scheduleId: z
		.union([z.string().refine((val) => isValidObjectId(val)), z.null()])
		.optional(),
	isHr: z.boolean().default(false),
	isActive: z.boolean(),
	isDefault: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	employees: z.array(z.unknown()).optional(),
	positions: z.array(z.unknown()).optional(),
});

export type Section = z.infer<typeof SectionSchema>;

// Create Section Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateSectionSchema = SectionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	employees: true,
	positions: true,
}).partial({
	description: true,
	headId: true,
	isDefault: true,
	isDeleted: true,
	lineLeaderIds: true,
});

export type CreateSection = z.infer<typeof CreateSectionSchema>;

// Update Section Schema (partial, excluding immutable fields and relations)
export const UpdateSectionSchema = SectionSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	employees: true,
	positions: true,
}).partial();

export type UpdateSection = z.infer<typeof UpdateSectionSchema>;

export type SectionWithRelations = Section & {};
