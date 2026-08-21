import { z } from "zod";
import {
	RECRUITMENT_RESUME_UPLOAD_COPY,
	validateRecruitmentResumeFile,
} from "~/lib/utils/document-file";

const trimString = (value: unknown) => (typeof value === "string" ? value.trim() : value);

const requiredTrimmedString = (fieldName: string) =>
	z.preprocess(
		trimString,
		z.string().min(1, `${fieldName} is required.`),
	);

const optionalTrimmedString = z.preprocess(
	trimString,
	z.string().optional(),
);

const optionalTextAreaString = z.preprocess(
	trimString,
	z.string().max(4000, "Keep this under 4,000 characters.").optional(),
);

const phoneSchema = z.string().superRefine((value, ctx) => {
	const match = value.trim().match(/^(\+\d+)\s*(.+)$/);
	const number = match?.[2]?.replace(/[^\d]/g, "") || "";

	if (!match || number.length < 7 || number.length > 15) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Enter a valid phone number.",
		});
	}
});

const expectedSalarySchema = z
	.string()
	.trim()
	.min(1, "Expected salary is required.")
	.refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
		message: "Expected salary must be a valid amount.",
	})
	.refine((value) => Number(value) > 0, {
		message: "Expected salary must be greater than 0.",
	});

const requiredDateOfBirthSchema = z
	.string()
	.trim()
	.min(1, "Date of birth is required.")
	.superRefine((value, ctx) => {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Enter a valid date of birth.",
			});
			return;
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const selected = new Date(date);
		selected.setHours(0, 0, 0, 0);

		if (selected > today) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Date of birth cannot be in the future.",
			});
		}
	});

const optionalFutureDateInputSchema = z
	.string()
	.trim()
	.optional()
	.superRefine((value, ctx) => {
		if (!value) return;

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Enter a valid availability date.",
			});
			return;
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const selected = new Date(date);
		selected.setHours(0, 0, 0, 0);

		if (selected < today) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Availability date cannot be in the past.",
			});
		}
	});

const resumeSchema = z.custom<File | null>((value) => value instanceof File, {
	message: "Resume is required.",
}).superRefine((file, ctx) => {
	if (!(file instanceof File)) return;

	const error = validateRecruitmentResumeFile(file);
	if (error) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: error || `File must be ${RECRUITMENT_RESUME_UPLOAD_COPY}.`,
		});
	}
});

export const JobApplicationFormSchema = z.object({
	resume: resumeSchema,
	firstName: requiredTrimmedString("First name"),
	lastName: requiredTrimmedString("Last name"),
	dateOfBirth: requiredDateOfBirthSchema,
	email: z.preprocess(
		trimString,
		z.string().min(1, "Email address is required.").email("Enter a valid email address."),
	),
	phone: phoneSchema,
	location: optionalTrimmedString,
	linkedinProfile: z.preprocess(
		trimString,
		z
			.string()
			.optional()
			.refine((value) => !value || /^https?:\/\//i.test(value), {
				message: "Enter a valid URL, including https://",
			})
			.refine(
				(value) => {
					if (!value) return true;
					try {
						new URL(value);
						return true;
					} catch {
						return false;
					}
				},
				{ message: "Enter a valid URL, including https://" },
			),
	),
	currentJobTitle: optionalTrimmedString,
	whyJoinTeam: optionalTextAreaString,
	challengingProject: optionalTextAreaString,
	expectedSalary: expectedSalarySchema,
	availabilityDate: optionalFutureDateInputSchema,
	requiresVisaSponsorship: z.boolean(),
	additionalInfo: optionalTextAreaString,
});

export type JobApplicationFormValues = z.infer<typeof JobApplicationFormSchema>;
