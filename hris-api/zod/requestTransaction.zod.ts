import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";


// RequestTransactionEventCategory Enum
export const RequestTransactionEventCategory = z.enum(["LIFECYCLE", "WORKFLOW", "ASSIGNMENT", "BUSINESS_CHANGE", "ARTIFACT", "SYSTEM"]);

export type RequestTransactionEventCategory = z.infer<typeof RequestTransactionEventCategory>;

// RequestTransactionEventKey Enum
export const RequestTransactionEventKey = z.enum(["REQUEST_CREATED", "REQUEST_UPDATED", "REQUEST_CANCELLED", "WORKFLOW_STATE_CHANGED", "STEP_ASSIGNED", "STEP_APPROVED", "STEP_REJECTED", "STEP_COMPLETED", "STEP_SKIPPED", "STEP_DELEGATED", "DOCUMENT_GENERATED"]);

export type RequestTransactionEventKey = z.infer<typeof RequestTransactionEventKey>;

// RequestTransactionActorType Enum
export const RequestTransactionActorType = z.enum(["EMPLOYEE", "MANAGER", "HR", "SYSTEM", "UNKNOWN"]);

export type RequestTransactionActorType = z.infer<typeof RequestTransactionActorType>;

// RequestTransactionVisibility Enum
export const RequestTransactionVisibility = z.enum(["SHARED", "INTERNAL"]);

export type RequestTransactionVisibility = z.infer<typeof RequestTransactionVisibility>;

// RequestTransaction Schema (full, including ID)
export const RequestTransactionSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	requestId: z.string().refine((val) => isValidObjectId(val)),
	workflowInstanceId: z.string().refine((val) => isValidObjectId(val)).optional(),
	stepExecutionId: z.string().refine((val) => isValidObjectId(val)).optional(),
	actorEmployeeId: z.string().refine((val) => isValidObjectId(val)).optional(),
	sequenceNumber: z.number().int(),
	eventCategory: z.enum(["LIFECYCLE", "WORKFLOW", "ASSIGNMENT", "BUSINESS_CHANGE", "ARTIFACT", "SYSTEM"]),
	eventKey: z.enum(["REQUEST_CREATED", "REQUEST_UPDATED", "REQUEST_CANCELLED", "WORKFLOW_STATE_CHANGED", "STEP_ASSIGNED", "STEP_APPROVED", "STEP_REJECTED", "STEP_COMPLETED", "STEP_SKIPPED", "STEP_DELEGATED", "DOCUMENT_GENERATED"]),
	eventSource: z.string().optional(),
	actorType: z.enum(["EMPLOYEE", "MANAGER", "HR", "SYSTEM", "UNKNOWN"]),
	actorRole: z.string().optional(),
	actorDisplayName: z.string().optional(),
	title: z.string().min(1),
	description: z.string().optional(),
	comments: z.string().optional(),
	fromStateKey: z.string().optional(),
	toStateKey: z.string().optional(),
	fieldChanges: z.any().optional(),
	metadata: z.any().optional(),
	visibility: z.enum(["SHARED", "INTERNAL"]),
	isSystemGenerated: z.boolean(),
	occurredAt: z.coerce.date(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type RequestTransaction = z.infer<typeof RequestTransactionSchema>;

// Create RequestTransaction Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateRequestTransactionSchema = RequestTransactionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	workflowInstanceId: true,
	stepExecutionId: true,
	actorEmployeeId: true,
	eventSource: true,
	actorRole: true,
	actorDisplayName: true,
	description: true,
	comments: true,
	fromStateKey: true,
	toStateKey: true,
	fieldChanges: true,
	metadata: true,
});

export type CreateRequestTransaction = z.infer<typeof CreateRequestTransactionSchema>;

// Update RequestTransaction Schema (partial, excluding immutable fields and relations)
export const UpdateRequestTransactionSchema = RequestTransactionSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateRequestTransaction = z.infer<typeof UpdateRequestTransactionSchema>;

export type RequestTransactionWithRelations = RequestTransaction & {

};
