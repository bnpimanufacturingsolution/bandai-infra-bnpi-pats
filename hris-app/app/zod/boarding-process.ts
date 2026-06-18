import { z } from "zod";
import { isValidObjectId } from "~/lib/object-id";

// Enums
export const BoardingTypeSchema = z.enum(["ONBOARDING", "OFFBOARDING"]);
export type BoardingType = z.infer<typeof BoardingTypeSchema>;

export const BoardingStatusSchema = z.enum([
	"NOT_STARTED",
	"IN_PROGRESS",
	"COMPLETED",
	"CANCELLED",
]);
export type BoardingStatus = z.infer<typeof BoardingStatusSchema>;

// BoardingProcess Schema (full, including ID)
export const BoardingProcessSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().refine((val) => isValidObjectId(val)),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
	departmentId: z.string().refine((val) => isValidObjectId(val)),
	type: BoardingTypeSchema,
	status: BoardingStatusSchema,

	startDate: z.coerce.date(),
	targetDate: z.coerce.date(),
	actualCompleteDate: z.coerce.date().nullable().optional(),
	exitReason: z.string().nullable().optional(),
	assignedToId: z.string().nullable().optional(),
	assignedToName: z.string().nullable().optional(),
	metadata: z.any().nullable().optional(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),

	boardingTemplateId: z.string().refine((val) => isValidObjectId(val)),
});

export type BoardingProcess = z.infer<typeof BoardingProcessSchema>;

// Create BoardingProcess Schema (excluding ID, createdAt, updatedAt)
export const CreateBoardingProcessSchema = BoardingProcessSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	status: true, // Defaults to NOT_STARTED
	startDate: true, // Defaults to now()
	actualCompleteDate: true,
	exitReason: true,
	assignedToId: true,
	assignedToName: true,
	metadata: true,
});

export type CreateBoardingProcess = z.infer<typeof CreateBoardingProcessSchema>;

// Update BoardingProcess Schema (partial, excluding immutable fields)
export const UpdateBoardingProcessSchema = BoardingProcessSchema.omit({
	id: true,
	employeeId: true, // Typically immutable - don't reassign process to different employee
	createdAt: true,
	updatedAt: true,
}).partial();

export type UpdateBoardingProcess = z.infer<typeof UpdateBoardingProcessSchema>;
