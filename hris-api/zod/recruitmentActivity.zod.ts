import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

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

export const RecruitmentActivityTypeEnum = z.enum([
	"NOTE",
	"INTERVIEW",
	"REJECTION",
	"OFFER",
	"ASSIGNMENT",
	"EMAIL_EVENT",
	"SYSTEM_EVENT",
]);

export const RecruitmentActivitySchema = z.object({
	id: objectIdSchema,
	organizationId: z.string().min(1),
	applicantId: objectIdSchema,
	workflowInstanceId: optionalObjectIdSchema.nullable(),
	stepExecutionId: optionalObjectIdSchema.nullable(),
	stateKey: z.string().optional().nullable(),
	type: RecruitmentActivityTypeEnum,
	title: z.string().min(1),
	details: z.record(z.string(), z.any()).optional().nullable(),
	actorEmployeeId: optionalObjectIdSchema.nullable(),
	occurredAt: z.coerce.date(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type RecruitmentActivity = z.infer<typeof RecruitmentActivitySchema>;

export const CreateRecruitmentActivitySchema = RecruitmentActivitySchema.omit({
	id: true,
	organizationId: true,
	workflowInstanceId: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	stepExecutionId: true,
	stateKey: true,
	details: true,
	actorEmployeeId: true,
	occurredAt: true,
	isDeleted: true,
});

export type CreateRecruitmentActivity = z.infer<typeof CreateRecruitmentActivitySchema>;
