import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

import type { WorkflowInstance } from "./WorkflowInstance.zod";


// WorkflowDomain Enum
export const WorkflowDomain = z.enum(["REQUEST", "RECRUITMENT", "PAYROLL"]);

export type WorkflowDomain = z.infer<typeof WorkflowDomain>;

// WorkflowStepType Enum
export const WorkflowStepType = z.enum(["SUBMISSION", "APPROVAL", "TASK"]);

export type WorkflowStepType = z.infer<typeof WorkflowStepType>;

// WorkflowAssigneeType Enum
export const WorkflowAssigneeType = z.enum([
	"REQUESTER",
	"SUPERVISOR",
	"TARGET_DEPARTMENT_MANAGER",
	"HR",
	"SYSTEM",
]);

export type WorkflowAssigneeType = z.infer<typeof WorkflowAssigneeType>;

// WorkflowStepStatus Enum
export const WorkflowStepStatus = z.enum(["PENDING", "IN_PROGRESS", "APPROVED", "REJECTED", "COMPLETED", "SKIPPED"]);

export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatus>;

// WorkflowStepExecution Schema (full, including ID)
export const WorkflowStepExecutionSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	workflowInstanceId: z.string().refine((val) => isValidObjectId(val)),
	requestId: z.string().refine((val) => isValidObjectId(val)).optional(),
	stepNumber: z.number().int(),
	stepName: z.string().min(1),
	stepType: z.enum(["SUBMISSION", "APPROVAL", "TASK"]),
	assigneeType: z.enum([
		"REQUESTER",
		"SUPERVISOR",
		"TARGET_DEPARTMENT_MANAGER",
		"HR",
		"SYSTEM",
	]),
	assigneeRole: z.string().optional(),
	assigneeId: z.string().refine((val) => isValidObjectId(val)).optional(),
	status: z.enum(["PENDING", "IN_PROGRESS", "APPROVED", "REJECTED", "COMPLETED", "SKIPPED"]),
	completedAt: z.coerce.date().optional(),
	comments: z.string().optional(),
	metadata: z.any().optional(),
	isRequired: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type WorkflowStepExecution = z.infer<typeof WorkflowStepExecutionSchema>;

// Create WorkflowStepExecution Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateWorkflowStepExecutionSchema = WorkflowStepExecutionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	requestId: true,
	assigneeRole: true,
	assigneeId: true,
	completedAt: true,
	comments: true,
	metadata: true,
	isDeleted: true,
});

export type CreateWorkflowStepExecution = z.infer<typeof CreateWorkflowStepExecutionSchema>;

// Update WorkflowStepExecution Schema (partial, excluding immutable fields and relations)
export const UpdateWorkflowStepExecutionSchema = WorkflowStepExecutionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateWorkflowStepExecution = z.infer<typeof UpdateWorkflowStepExecutionSchema>;

export type WorkflowStepExecutionWithRelations = WorkflowStepExecution & {
	workflowInstance: WorkflowInstance;
};
