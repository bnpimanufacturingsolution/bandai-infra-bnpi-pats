import { z } from "zod";

const HeadcountSchema = z.preprocess(
	(value) => {
		if (value === "" || value === null || value === undefined) {
			return undefined;
		}
		return Number(value);
	},
	z
		.number("Target headcount must be a whole number")
		.int("Target headcount must be a whole number")
		.refine((value) => Number.isFinite(value), {
			message: "Target headcount must be a whole number",
		})
		.min(1, "Target headcount must be at least 1"),
);

// Level schema (nested in API response)
const LevelSchema = z.object({
	id: z.string(),
	name: z.string(),
});

// Department schema (nested in API response)
const DepartmentSchema = z.object({
	id: z.string(),
	name: z.string(),
	code: z.string().nullable().optional(),
});

// Section schema (nested in API response)
const SectionSchema = z.object({
	id: z.string(),
	name: z.string(),
	code: z.string().nullable().optional(),
	departmentId: z.string().nullable().optional(),
});

// Position schema (nested in API response)
const PositionSchema = z.object({
	id: z.string(),
	title: z.string(),
	sectionId: z.string().nullable().optional(),
	section: SectionSchema.nullable().optional(),
	description: z.string().nullable().optional(),
	maxSalary: z.number().nullable().optional(),
});

// Job schema (complete model) - supports both nested objects and IDs
const JobSchema = z.object({
	id: z.string(),
	headcountRequested: z.number().optional(),
	departmentId: z.string().nullable().optional(),
	sectionId: z.string().nullable().optional(),
	positionId: z.string().optional(),
	levelId: z.string().nullable().optional(),
	department: DepartmentSchema.nullable().optional(),
	section: SectionSchema.nullable().optional(),
	position: PositionSchema.optional(),
	level: LevelSchema.nullable().optional(),
	tags: z.array(z.string()),
	type: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	isDeleted: z.boolean().default(false).optional(),
	createdAt: z.union([z.string(), z.date()]),
	updatedAt: z.union([z.string(), z.date()]).optional(),
});

// For creating a new Job (omit auto-generated fields)
const CreateJobSchema = z.object({
	headcountRequested: HeadcountSchema,
	departmentId: z.string().nullable().optional(),
	sectionId: z.string().nullable().optional(),
	positionId: z.string().min(1, "Position is required"),
	levelId: z.string().nullable().optional(),
	tags: z.array(z.string()).default([]),
	type: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	isDeleted: z.boolean().default(false).optional(),
});

// For updating a Job (all fields optional)
const UpdateJobSchema = z.object({
	headcountRequested: HeadcountSchema.optional(),
	departmentId: z.string().nullable().optional(),
	sectionId: z.string().nullable().optional(),
	positionId: z.string().min(1, "Position is required").optional(),
	levelId: z.string().nullable().optional(),
	tags: z.array(z.string()).optional(),
	type: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	isDeleted: z.boolean().optional(),
});

export type Job = z.infer<typeof JobSchema>;
export type CreateJob = z.infer<typeof CreateJobSchema>;
export type UpdateJob = z.infer<typeof UpdateJobSchema>;
export type Tag = string;

// Schema exports
export { JobSchema, CreateJobSchema, UpdateJobSchema };
