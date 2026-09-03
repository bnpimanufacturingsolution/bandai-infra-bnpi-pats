import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

export const ApplicationSourceEnum = z.enum([
	"WEBSITE",
	"REFERRAL",
	"JOB_BOARD",
	"SOCIAL_MEDIA",
	"RECRUITER",
	"INTERNAL",
	"WALK_IN",
	"OTHER",
]);

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

const emptyToUndefined = (value: unknown) => {
	if (value === "" || value === null || value === undefined) return undefined;
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? trimmed : undefined;
	}
	return value;
};

const optionalPositiveNumberSchema = z.preprocess(
	emptyToUndefined,
	z.coerce.number().positive().optional(),
);

const optionalPositiveIntSchema = z.preprocess(
	emptyToUndefined,
	z.coerce.number().int().positive().optional(),
);

const optionalDateSchema = z.preprocess(emptyToUndefined, z.coerce.date().optional());

const optionalUrlSchema = z.preprocess(
	emptyToUndefined,
	z.string().url("Invalid URL").optional(),
);

export const ApplicantSubmissionDetailsSchema = z
	.object({
		location: z.string().trim().min(1).max(200).optional(),
		currentJobTitle: z.string().trim().min(1).max(200).optional(),
		whyJoinTeam: z.string().trim().min(1).max(4000).optional(),
		challengingProject: z.string().trim().min(1).max(4000).optional(),
		requiresVisaSponsorship: z.boolean().optional(),
		additionalInfo: z.string().trim().min(1).max(4000).optional(),
	})
	.strict();

export const ApplicantSchema = z.object({
	id: objectIdSchema,
	organizationId: z.string().min(1),
	applicantId: z.string().optional().nullable(),
	personId: optionalObjectIdSchema.nullable(),
	portfolioUrl: optionalUrlSchema.nullable(),
	jobId: optionalObjectIdSchema.nullable(),
	positionId: optionalObjectIdSchema.nullable(),
	departmentId: optionalObjectIdSchema.nullable(),
	appliedDate: z.coerce.date(),
	applicationSource: ApplicationSourceEnum.optional().nullable(),
	workflowInstanceId: optionalObjectIdSchema.nullable(),
	currentWorkflowStateKey: z.string().min(1),
	currentStepExecutionId: optionalObjectIdSchema.nullable(),
	lastCompletedStepExecutionId: optionalObjectIdSchema.nullable(),
	expectedSalary: optionalPositiveNumberSchema.nullable(),
	currency: z.preprocess(emptyToUndefined, z.string().trim().min(3).max(3).optional().default("PHP")),
	availabilityDate: optionalDateSchema.nullable(),
	noticePeriod: optionalPositiveIntSchema.nullable(),
	referredBy: optionalObjectIdSchema.nullable(),
	referralBonus: optionalPositiveNumberSchema.nullable(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	convertedToEmployeeId: optionalObjectIdSchema.nullable(),
});

export type Applicant = z.infer<typeof ApplicantSchema>;

export const CreateApplicantSchema = ApplicantSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	workflowInstanceId: true,
	currentWorkflowStateKey: true,
	currentStepExecutionId: true,
	lastCompletedStepExecutionId: true,
	convertedToEmployeeId: true,
}).partial({
	organizationId: true,
	applicantId: true,
	personId: true,
	jobId: true,
	positionId: true,
	departmentId: true,
	appliedDate: true,
	applicationSource: true,
	expectedSalary: true,
	currency: true,
	availabilityDate: true,
	noticePeriod: true,
	referredBy: true,
	referralBonus: true,
	isDeleted: true,
	portfolioUrl: true,
});

export type CreateApplicant = z.infer<typeof CreateApplicantSchema>;

export const UpdateApplicantSchema = ApplicantSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
	workflowInstanceId: true,
	currentWorkflowStateKey: true,
	currentStepExecutionId: true,
	lastCompletedStepExecutionId: true,
	convertedToEmployeeId: true,
}).partial();

export type UpdateApplicant = z.infer<typeof UpdateApplicantSchema>;

export const ApplicantActionEnum = z.enum([
	"ADVANCE",
	"APPROVE_STEP",
	"REJECT_STEP",
	"COMPLETE_STEP",
	"ASSIGN_RECRUITER",
	"SCHEDULE_INTERVIEW",
	"SEND_OFFER",
	"SAVE_PRE_HIRE_SETUP",
	"MARK_ONBOARDING_READY",
	"MARK_HIRED",
]);

export const ApplicantActionSchema = z
	.object({
		action: ApplicantActionEnum,
		comments: z.string().trim().optional(),
		targetStateKey: z.string().trim().optional(),
		stepExecutionId: optionalObjectIdSchema,
		metadata: z.record(z.string(), z.any()).optional(),
	})
	.superRefine((data, ctx) => {
		if (
			(data.action === "APPROVE_STEP" ||
				data.action === "REJECT_STEP" ||
				data.action === "COMPLETE_STEP") &&
			!data.stepExecutionId
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["stepExecutionId"],
				message: "stepExecutionId is required for step actions",
			});
		}

		if (data.action === "REJECT_STEP" && !data.comments?.trim()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["comments"],
				message: "comments are required when rejecting a step",
			});
		}
	});

export type ApplicantAction = z.infer<typeof ApplicantActionSchema>;
