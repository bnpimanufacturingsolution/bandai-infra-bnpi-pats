import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";


// WorkflowEngine Schema (full, including ID)
export const WorkflowEngineSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	name: z.string().min(1),
	description: z.string().optional(),
	type: z.string().optional(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type WorkflowEngine = z.infer<typeof WorkflowEngineSchema>;

// Create WorkflowEngine Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateWorkflowEngineSchema = WorkflowEngineSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	type: true,
	isDeleted: true,
});

export type CreateTemplate = z.infer<typeof CreateWorkflowEngineSchema>;

// Update WorkflowEngine Schema (partial, excluding immutable fields and relations)
export const UpdateWorkflowEngineSchema = WorkflowEngineSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateTemplate = z.infer<typeof UpdateWorkflowEngineSchema>;
