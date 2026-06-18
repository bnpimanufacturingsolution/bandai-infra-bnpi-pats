import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";
import { RequestType as PrismaRequestType } from "../generated/prisma";

import type { WorkflowStepExecution } from "./workflowstepexecution.zod";

const objectIdSchema = z.string().refine((val) => isValidObjectId(val), {
	message: "Invalid ObjectId",
});

const optionalObjectIdSchema = z.preprocess(
	(value) => {
		if (value === "" || value === null || value === undefined) return undefined;
		return value;
	},
	objectIdSchema.optional(),
);

const optionalTrimmedStringSchema = z.preprocess(
	(value) => {
		if (value === null || value === undefined) return undefined;
		if (typeof value !== "string") return value;
		const trimmed = value.trim();
		return trimmed === "" ? undefined : trimmed;
	},
	z.string().min(1).optional(),
);

const parseJsonString = (value: unknown) => {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
};

const jsonValueSchema = z.preprocess(parseJsonString, z.unknown());
const optionalJsonValueSchema = z.preprocess(
	(value) => {
		const parsed = parseJsonString(value);
		return parsed === "" ? undefined : parsed;
	},
	z.unknown().optional(),
);
const jsonArraySchema = z.preprocess(parseJsonString, z.array(z.unknown()));
const optionalJsonArraySchema = z.preprocess(
	(value) => {
		const parsed = parseJsonString(value);
		if (parsed === "" || parsed === undefined || parsed === null) return undefined;
		return parsed;
	},
	z.array(z.unknown()).optional(),
);

export const WorkflowDomain = z.enum([
	"REQUEST",
	"RECRUITMENT",
	"PAYROLL",
]);

export type WorkflowDomain = z.infer<typeof WorkflowDomain>;

export const WorkflowStepType = z.enum(["SUBMISSION", "APPROVAL", "TASK"]);

export type WorkflowStepType = z.infer<typeof WorkflowStepType>;

export const WorkflowAssigneeType = z.enum([
	"REQUESTER",
	"SUPERVISOR",
	"TARGET_DEPARTMENT_MANAGER",
	"HR",
	"SYSTEM",
]);

export type WorkflowAssigneeType = z.infer<typeof WorkflowAssigneeType>;

export const WorkflowStepStatus = z.enum([
	"PENDING",
	"IN_PROGRESS",
	"APPROVED",
	"REJECTED",
	"COMPLETED",
	"SKIPPED",
]);

export type WorkflowStepStatus = z.infer<typeof WorkflowStepStatus>;

export const WorkflowInstanceSchema = z.object({
	id: objectIdSchema,
	organizationId: z.string().min(1),
	domain: WorkflowDomain,
	domainRecordId: optionalObjectIdSchema,
	requestType: z.preprocess(
		(value) => {
			if (value === null || value === undefined) return undefined;
			if (typeof value !== "string") return value;
			const trimmed = value.trim();
			return trimmed === "" ? undefined : trimmed;
		},
		z.nativeEnum(PrismaRequestType).optional(),
	),
	code: optionalTrimmedStringSchema,
	name: optionalTrimmedStringSchema,
	description: optionalTrimmedStringSchema,
	steps: z.unknown(),
	states: z.unknown().optional(),
	currentStateKey: z.string().min(1),
	stateHistory: z.array(z.unknown()),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type WorkflowInstance = z.infer<typeof WorkflowInstanceSchema>;

export const CreateWorkflowInstanceSchema = z.object({
	organizationId: z.string().min(1),
	domain: WorkflowDomain,
	domainRecordId: optionalObjectIdSchema,
	requestType: z.preprocess(
		(value) => {
			if (value === null || value === undefined) return undefined;
			if (typeof value !== "string") return value;
			const trimmed = value.trim();
			return trimmed === "" ? undefined : trimmed;
		},
		z.nativeEnum(PrismaRequestType).optional(),
	),
	code: optionalTrimmedStringSchema,
	name: optionalTrimmedStringSchema,
	description: optionalTrimmedStringSchema,
	steps: jsonValueSchema,
	states: optionalJsonValueSchema,
	currentStateKey: z.string().min(1).default("OPEN"),
	stateHistory: optionalJsonArraySchema.default([]),
	isDeleted: z.boolean().optional().default(false),
});

export type CreateWorkflowInstance = z.infer<typeof CreateWorkflowInstanceSchema>;

export const UpdateWorkflowInstanceSchema = z.object({
	domain: WorkflowDomain.optional(),
	domainRecordId: optionalObjectIdSchema,
	requestType: z.preprocess(
		(value) => {
			if (value === null || value === undefined) return undefined;
			if (typeof value !== "string") return value;
			const trimmed = value.trim();
			return trimmed === "" ? undefined : trimmed;
		},
		z.nativeEnum(PrismaRequestType).optional(),
	),
	code: optionalTrimmedStringSchema,
	name: optionalTrimmedStringSchema,
	description: optionalTrimmedStringSchema,
	steps: jsonValueSchema.optional(),
	states: optionalJsonValueSchema,
	currentStateKey: z.string().min(1).optional(),
	stateHistory: jsonArraySchema.optional(),
	isDeleted: z.boolean().optional(),
});

export type UpdateWorkflowInstance = z.infer<typeof UpdateWorkflowInstanceSchema>;

export type WorkflowInstanceWithRelations = WorkflowInstance & {
	stepExecutions: WorkflowStepExecution[];
};
