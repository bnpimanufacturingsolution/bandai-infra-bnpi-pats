import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

const ShiftTimeSlotSchema = z.object({
	type: z.string().min(1),
	label: z.string().optional().nullable(),
	startTime: z.string().min(1),
	endTime: z.string().min(1),
});

const ShiftSnapshotSchema = z
	.object({
		source: z.string().optional().nullable(),
		shiftTypeId: z.string().optional().nullable(),
		shiftTypeName: z.string().optional().nullable(),
		shiftTypeCode: z.string().optional().nullable(),
		name: z.string().optional().nullable(),
		code: z.string().optional().nullable(),
		isOvernight: z.boolean().optional().default(false),
		isOff: z.boolean().optional().default(false),
		breakMinutes: z.number().min(0).optional().nullable(),
		startTime: z.string().optional().nullable(),
		endTime: z.string().optional().nullable(),
		shiftHour: z.number().min(0).optional().nullable(),
		timeSlots: z.array(ShiftTimeSlotSchema).optional().default([]),
	})
	.passthrough();

const ScheduleOverrideBaseSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	employeeId: z.string().refine((val) => isValidObjectId(val)),
	date: z.coerce.date(),
	shiftTypeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	shiftSnapshot: ShiftSnapshotSchema.optional().nullable(),
	reason: z.string().optional(),
	createdByEmployeeId: z
		.string()
		.refine((val) => isValidObjectId(val))
		.optional()
		.nullable(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const hasShiftSource = (value: { shiftTypeId?: string | null; shiftSnapshot?: unknown }) =>
	Boolean(value.shiftTypeId) || Boolean(value.shiftSnapshot);

// ScheduleOverride Schema (full, including ID)
export const ScheduleOverrideSchema = ScheduleOverrideBaseSchema.refine(hasShiftSource, {
	message: "Either shiftTypeId or shiftSnapshot is required.",
	path: ["shiftSnapshot"],
});

export type ScheduleOverride = z.infer<typeof ScheduleOverrideSchema>;

// Create ScheduleOverride Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateScheduleOverrideSchema = ScheduleOverrideBaseSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	reason: true,
	createdByEmployeeId: true,
	isDeleted: true,
	shiftTypeId: true,
	shiftSnapshot: true,
}).refine(hasShiftSource, {
	message: "Either shiftTypeId or shiftSnapshot is required.",
	path: ["shiftSnapshot"],
});

export type CreateScheduleOverride = z.infer<typeof CreateScheduleOverrideSchema>;

// Update ScheduleOverride Schema (partial, excluding immutable fields and relations)
export const UpdateScheduleOverrideSchema = ScheduleOverrideBaseSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateScheduleOverride = z.infer<typeof UpdateScheduleOverrideSchema>;

export type ScheduleOverrideWithRelations = ScheduleOverride & {

};
