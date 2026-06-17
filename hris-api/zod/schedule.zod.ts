import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

// TimeSlot Schema
export const TimeSlotSchema = z.object({
	type: z.string().min(1),
	label: z.string().optional(),
	startTime: z.string().min(1),
	endTime: z.string().min(1),
});

export type TimeSlot = z.infer<typeof TimeSlotSchema>;
// Shift Schema
export const ShiftSchema = z.object({
	label: z.string().min(1),
	isRestDay: z.boolean().optional(),
	timeSlots: z.array(TimeSlotSchema).optional(),
});

export type Shift = z.infer<typeof ShiftSchema>;

export const RotationPatternItemSchema = z.object({
	dayIndex: z.number().int().min(0),
	scheduleCode: z.string().min(1).optional(),
	isOff: z.boolean().optional(),
});

export const RotationConfigSchema = z.object({
	cycleLength: z.number().int().min(1),
	repeats: z.boolean().optional().default(true),
	pattern: z.array(RotationPatternItemSchema).default([]),
});

// Schedule Schema (full, including ID)
export const ScheduleSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional().nullable(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date(),
	shifts: z.array(ShiftSchema),
	gracePeriodMinutes: z.number().int().min(0).default(0),
	requiredHeadcount: z.number().int().min(0).optional().nullable(),
	rotationConfig: RotationConfigSchema.optional().nullable(),
	isDefault: z.boolean(),
	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	departmentIds: z
		.array(z.string().refine((val) => isValidObjectId(val)))
		.optional()
		.default([]),
});

export type Schedule = z.infer<typeof ScheduleSchema>;

// Embedded Employee Schedule Schema (composite type stored in Employee)
export const EmployeeScheduleSchema = z.object({
	scheduleCode: z.string().min(1),
	scheduleName: z.string().min(1),
	startDate: z.coerce.date(),
	endDate: z.coerce.date().optional().nullable(),
	shifts: z.array(ShiftSchema),
	gracePeriodMinutes: z.number().int().min(0).default(0),
});

export type EmployeeSchedule = z.infer<typeof EmployeeScheduleSchema>;

// Create Schedule Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateScheduleSchema = ScheduleSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	isDeleted: true,
	isDefault: true,
	description: true,
});

export type CreateSchedule = z.infer<typeof CreateScheduleSchema>;

// Update Schedule Schema (partial, excluding immutable fields and relations)
export const UpdateScheduleSchema = ScheduleSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	organizationId: true, // Cannot change organization
}).partial();

export type UpdateSchedule = z.infer<typeof UpdateScheduleSchema>;
