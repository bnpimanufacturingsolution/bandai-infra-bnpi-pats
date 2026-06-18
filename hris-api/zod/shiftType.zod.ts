import { z } from "zod";
import { isValidEntityId as isValidObjectId } from "../helper/id-validation.helper";

const ShiftTimeSlotSchema = z.object({
	type: z.string().min(1),
	label: z.string().optional().nullable(),
	startTime: z.string().min(1),
	endTime: z.string().min(1),
});

// ShiftType Schema (full, including ID)
export const ShiftTypeSchema = z.object({
	id: z.string().refine((val) => isValidObjectId(val)),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().min(1),
	isOvernight: z.boolean(),
	isOff: z.boolean(),
	timeSlots: z.array(ShiftTimeSlotSchema).optional().default([]),
	shiftHour: z.number().min(0).default(0),
	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ShiftType = z.infer<typeof ShiftTypeSchema>;

// Create ShiftType Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateShiftTypeSchema = ShiftTypeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	shiftHour: true,
}).partial({
	isDeleted: true,
	isActive: true,
	timeSlots: true,
});

export type CreateShiftType = z.infer<typeof CreateShiftTypeSchema>;

// Update ShiftType Schema (partial, excluding immutable fields and relations)
export const UpdateShiftTypeSchema = ShiftTypeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
	shiftHour: true,
}).partial();

export type UpdateShiftType = z.infer<typeof UpdateShiftTypeSchema>;
