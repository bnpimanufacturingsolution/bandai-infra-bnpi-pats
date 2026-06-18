import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

const ScheduleTemplatePatternDaySchema = z.object({
	day: z.number().int().min(1),
	shiftTypeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	shiftSnapshot: z
		.object({
			name: z.string().optional().nullable(),
			code: z.string().optional().nullable(),
			isOvernight: z.boolean().optional(),
			isOff: z.boolean().optional(),
			shiftHour: z.number().min(0).optional(),
			timeSlots: z
				.array(
					z.object({
						type: z.string(),
						label: z.string().optional().nullable(),
						startTime: z.string(),
						endTime: z.string(),
					}),
				)
				.optional(),
		})
		.optional()
		.nullable(),
	shiftHour: z.number().min(0).optional(),
}).refine((value) => Boolean(value.shiftTypeId) || Boolean(value.shiftSnapshot), {
	message: "Either shiftTypeId or shiftSnapshot is required for each pattern day.",
});

// ScheduleTemplate Schema (full, including ID)
export const ScheduleTemplateSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	cycleDays: z.number().int(),
	graceLateMinutes: z.number().int().min(0).default(0),
	graceEarlyOutMinutes: z.number().int().min(0).default(0),
	pattern: z.array(ScheduleTemplatePatternDaySchema),
	totalHour: z.number().min(0).default(0),
	totalDay: z.number().int().min(0).default(0),
	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ScheduleTemplate = z.infer<typeof ScheduleTemplateSchema>;

// Create ScheduleTemplate Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateScheduleTemplateSchema = ScheduleTemplateSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	totalHour: true,
	totalDay: true,
}).partial({
	description: true,
	isDeleted: true,
	isActive: true,
});

export type CreateScheduleTemplate = z.infer<typeof CreateScheduleTemplateSchema>;

// Update ScheduleTemplate Schema (partial, excluding immutable fields and relations)
export const UpdateScheduleTemplateSchema = ScheduleTemplateSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	totalHour: true,
	totalDay: true,
}).partial();

export type UpdateScheduleTemplate = z.infer<typeof UpdateScheduleTemplateSchema>;
