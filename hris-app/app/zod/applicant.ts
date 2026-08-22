import { z } from "zod";
import { isValidObjectId } from "~/lib/object-id";

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

const objectIdSchema = z.string().refine((val) => isValidObjectId(val));
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
	job: z
		.object({
			id: objectIdSchema,
			positionId: objectIdSchema,
			levelId: objectIdSchema,
			position: z
				.object({
					id: objectIdSchema,
					title: z.string().optional().nullable(),
					departmentId: z.string().optional().nullable(),
					department: z.object({ id: z.string().optional(), name: z.string().optional() }).optional().nullable(),
				})
				.optional()
				.nullable(),
			level: z.object({ id: objectIdSchema, name: z.string().optional().nullable() }).optional().nullable(),
		})
		.optional()
		.nullable(),
	position: z
		.object({
			id: objectIdSchema,
			title: z.string().optional().nullable(),
		})
		.optional()
		.nullable(),
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
