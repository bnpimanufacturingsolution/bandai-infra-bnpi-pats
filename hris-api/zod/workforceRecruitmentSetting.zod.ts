import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

const optionalObjectIdSchema = z.preprocess((value) => {
	if (value === "" || value === null || value === undefined) return undefined;
	return value;
}, z.string().refine((value) => isValidObjectId(value), "Invalid ObjectId").optional());

export const WorkforceRecruitmentPolicySchema = z.object({
	id: z.string().min(1).optional(),
	departmentId: optionalObjectIdSchema.nullable().optional(),
	sectionId: optionalObjectIdSchema.nullable().optional(),
	positionId: optionalObjectIdSchema.nullable().optional(),
	levelId: optionalObjectIdSchema.nullable().optional(),
	targetHeadcount: z.coerce.number().int().min(0),
	limitBehavior: z.enum(["WARN", "BLOCK"]).default("BLOCK"),
	defaultWorkflowCode: z.string().trim().min(1).optional().nullable(),
	autoCreateJobOnApproval: z.boolean().optional(),
	jobType: z.string().trim().optional().nullable(),
	jobLocation: z.string().trim().optional().nullable(),
	jobTags: z.array(z.string().trim().min(1)).optional().default([]),
	jobDescriptionTemplate: z.string().trim().optional().nullable(),
	isActive: z.boolean().optional().default(true),
});

export const WorkforceRecruitmentSettingsSchema = z.object({
	isEnabled: z.boolean().default(true),
	enforceDepartmentManagerScope: z.boolean().default(true),
	defaultWorkflowCode: z.string().trim().min(1),
	autoCreateJobOnApproval: z.boolean().default(true),
	policies: z.array(WorkforceRecruitmentPolicySchema).default([]),
});

export const WorkforceRecruitmentRequestContextQuerySchema = z.object({
	departmentId: optionalObjectIdSchema.optional(),
	sectionId: optionalObjectIdSchema.optional(),
	positionId: optionalObjectIdSchema.optional(),
	levelId: optionalObjectIdSchema.optional(),
});
