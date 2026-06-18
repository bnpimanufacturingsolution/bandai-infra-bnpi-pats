import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

const optionalObjectIdSchema = (message: string) =>
	z.preprocess((value) => {
		if (value === "" || value === null || value === undefined) return undefined;
		return value;
	}, z.string().refine((value) => isValidObjectId(value), message).optional());

// Job schema (complete model)
const JobSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	departmentId: optionalObjectIdSchema("Invalid department ID").nullable().optional(),
	sectionId: optionalObjectIdSchema("Invalid section ID").nullable().optional(),
	sourceRequestId: optionalObjectIdSchema("Invalid source request ID").nullable().optional(),
	headcountRequested: z.number().int().min(1).default(1),
	positionId: z.string().refine((val) => isValidObjectId(val)),
	levelId: optionalObjectIdSchema("Invalid level ID").nullable().optional(),
	tags: z.array(z.string()),
	type: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	isDeleted: z.boolean().default(false),
	createdAt: z.date(),
	updatedAt: z.date(),
});

// For creating a new Job (omit auto-generated fields)
const CreateJobSchema = z.object({
	organizationId: z.string().min(1).optional(),
	departmentId: optionalObjectIdSchema("Invalid department ID").nullable().optional(),
	sectionId: optionalObjectIdSchema("Invalid section ID").nullable().optional(),
	sourceRequestId: optionalObjectIdSchema("Invalid source request ID").nullable().optional(),
	headcountRequested: z.coerce.number().int().min(1).default(1),
	positionId: z.string().refine((val) => isValidObjectId(val), {
		message: "Invalid position ID",
	}),
	levelId: optionalObjectIdSchema("Invalid level ID").nullable().optional(),
	tags: z.array(z.string()).default([]),
	type: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	isDeleted: z.boolean().default(false).optional(),
});

// For updating a Job (all fields optional)
const UpdateJobSchema = z.object({
	organizationId: z.string().min(1).optional(),
	departmentId: optionalObjectIdSchema("Invalid department ID").nullable().optional(),
	sectionId: optionalObjectIdSchema("Invalid section ID").nullable().optional(),
	sourceRequestId: optionalObjectIdSchema("Invalid source request ID").nullable().optional(),
	headcountRequested: z.coerce.number().int().min(1).optional(),
	positionId: z
		.string()
		.refine((val) => isValidObjectId(val), {
			message: "Invalid position ID",
		})
		.optional(),
	levelId: optionalObjectIdSchema("Invalid level ID").nullable().optional(),
	tags: z.array(z.string()).optional(),
	type: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	isDeleted: z.boolean().optional(),
});

export type Job = z.infer<typeof JobSchema>;
export type CreateJob = z.infer<typeof CreateJobSchema>;
export type UpdateJob = z.infer<typeof UpdateJobSchema>;

// Schema exports
export { JobSchema, CreateJobSchema, UpdateJobSchema };
