import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// Custom ObjectId validator
const objectIdSchema = z.string().refine((val) => isValidObjectId(val), {
	message: "Invalid ObjectId",
});

export const ExitInterviewSchema = z.object({
	id: objectIdSchema.optional(),

	// Employee & Resignation
	employeeId: objectIdSchema,

	offBoardingCaseId: objectIdSchema,

	// Interview Details
	scheduledDate: z.date().nullable().optional(),
	conductedDate: z.date().nullable().optional(),
	conductedBy: z.string().nullable().optional(),
	conductedByName: z.string().nullable().optional(),

	status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED"]).default("SCHEDULED"),

	// Structured Feedback
	reasonForLeaving: z.string().nullable().optional(),
	satisfactionRating: z.number().int().min(1).max(5).nullable().optional(),

	// Ratings (1-5)
	workEnvironmentRating: z.number().int().min(1).max(5).nullable().optional(),
	managementRating: z.number().int().min(1).max(5).nullable().optional(),
	compensationRating: z.number().int().min(1).max(5).nullable().optional(),
	careerGrowthRating: z.number().int().min(1).max(5).nullable().optional(),
	workLifeBalanceRating: z.number().int().min(1).max(5).nullable().optional(),

	// Open Feedback
	bestAspects: z.string().nullable().optional(),
	worstAspects: z.string().nullable().optional(),
	suggestions: z.string().nullable().optional(),
	wouldRecommend: z.boolean().nullable().optional(),
	wouldConsiderReturning: z.boolean().nullable().optional(),

	additionalComments: z.string().nullable().optional(),

	// Metadata
	isDeleted: z.boolean().default(false),
	createdAt: z.date().optional(),
	updatedAt: z.date().optional(),
});

// For creating a new exit interview (omit auto-generated fields)
export const CreateExitInterviewSchema = ExitInterviewSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
});

// For updating an exit interview (all fields optional except id)
export const UpdateExitInterviewSchema = ExitInterviewSchema.partial().required({
	id: true,
});

// Type exports
export type ExitInterview = z.infer<typeof ExitInterviewSchema>;
export type CreateExitInterview = z.infer<typeof CreateExitInterviewSchema>;
export type UpdateExitInterview = z.infer<typeof UpdateExitInterviewSchema>;
