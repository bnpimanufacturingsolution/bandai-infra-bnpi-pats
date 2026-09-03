import { z } from "zod";

// Enums
export const ChecklistCategorySchema = z.enum([
	"HR_DOCUMENTATION",
	"IT_SETUP",
	"WORKSPACE_SETUP",
	"TRAINING",
	"COMPLIANCE",
	"ACCESS_MANAGEMENT",
	"EQUIPMENT",
	"BENEFITS",
	"KNOWLEDGE_TRANSFER",
	"EXIT_INTERVIEW",
	"ORIENTATION",
	"SECURITY",
	"PAYROLL",
	"OTHER",
]);
export type ChecklistCategory = z.infer<typeof ChecklistCategorySchema>;

export enum ChecklistStatus {
	PENDING = "PENDING",
	IN_PROGRESS = "IN_PROGRESS",
	FOR_REVIEW = "FOR_REVIEW",
	COMPLETED = "COMPLETED",
	SKIPPED = "SKIPPED",
	BLOCKED = "BLOCKED",
}

export const ChecklistStatusSchema = z.nativeEnum(ChecklistStatus);

export const PrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type Priority = z.infer<typeof PrioritySchema>;

// ChecklistItem Schema (full, including ID)
export const ChecklistItemSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	processId: z.string(),
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	category: ChecklistCategorySchema,
	status: ChecklistStatusSchema,
	priority: PrioritySchema,
	dueDate: z.coerce.date(),
	completedDate: z.coerce.date().nullable().optional(),
	completedBy: z.string().nullable().optional(),
	completedByName: z.string().nullable().optional(),
	order: z.number().int(),
	uiElement: z.string().nullable().optional(),
	comments: z.string().nullable().optional(),
	metadata: z.any().nullable().optional(),
	isOptional: z.boolean().optional(),
	estimatedTime: z.number().int().optional(),
	dependencies: z.array(z.string()),
	viewedAt: z.coerce.date().nullable().optional(),
	startedAt: z.coerce.date().nullable().optional(),
	reminderSent: z.coerce.date().nullable().optional(),
	isDeleted: z.boolean().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// Create ChecklistItem Schema (excluding ID, createdAt, updatedAt)
export const CreateChecklistItemSchema = ChecklistItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	status: true, // Defaults to PENDING
	priority: true, // Defaults to MEDIUM
	completedDate: true,
	completedBy: true,
	completedByName: true,
	comments: true,
	metadata: true,
});

export type CreateChecklistItem = z.infer<typeof CreateChecklistItemSchema>;

// Update ChecklistItem Schema (partial, excluding immutable fields)
export const UpdateChecklistItemSchema = ChecklistItemSchema.omit({
	id: true,
	processId: true, // Typically immutable - don't move items between processes
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateChecklistItem = z.infer<typeof UpdateChecklistItemSchema>;
