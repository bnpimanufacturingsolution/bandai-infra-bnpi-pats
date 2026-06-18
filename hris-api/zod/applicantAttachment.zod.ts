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

export const ApplicantAttachmentTypeEnum = z.enum([
	"RESUME",
	"CONTRACT",
	"PORTFOLIO",
	"CERTIFICATE",
	"OTHER",
]);

export const ApplicantAttachmentSchema = z.object({
	id: objectIdSchema,
	organizationId: z.string().min(1),
	applicantId: objectIdSchema,
	type: ApplicantAttachmentTypeEnum,
	name: z.string().min(1),
	url: z.string().url(),
	mimeType: z.string().optional().nullable(),
	size: z.number().int().positive().optional().nullable(),
	uploadedByEmployeeId: optionalObjectIdSchema.nullable(),
	uploadedAt: z.coerce.date(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ApplicantAttachment = z.infer<typeof ApplicantAttachmentSchema>;

export const CreateApplicantAttachmentSchema = ApplicantAttachmentSchema.omit({
	id: true,
	organizationId: true,
	applicantId: true,
	url: true,
	createdAt: true,
	updatedAt: true,
	uploadedAt: true,
	uploadedByEmployeeId: true,
}).partial({
	mimeType: true,
	size: true,
	isDeleted: true,
});

export type CreateApplicantAttachment = z.infer<typeof CreateApplicantAttachmentSchema>;
