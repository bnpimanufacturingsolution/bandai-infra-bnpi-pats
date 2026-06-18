import { z } from "zod";

const timeSlotSchema = z.object({
	type: z.string().min(1),
	label: z.string().optional(),
	startTime: z.string().optional(),
	endTime: z.string().optional(),
});

export const CreateShiftTypeSchema = z.object({
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	startTime: z.string().optional().nullable(),
	endTime: z.string().optional().nullable(),
	breakMinutes: z.number().int().min(0).optional(),
	graceLateMinutes: z.number().int().min(0).optional(),
	graceEarlyOutMinutes: z.number().int().min(0).optional(),
	isOvernight: z.boolean().optional(),
	isOff: z.boolean().optional(),
	timeSlots: z.array(timeSlotSchema).optional(),
	isActive: z.boolean().optional(),
});

export const UpdateShiftTypeSchema = CreateShiftTypeSchema.partial();

export const CreateScheduleTemplateSchema = z.object({
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional(),
	cycleDays: z.number().int().min(1),
	pattern: z
		.array(
			z.object({
				day: z.number().int().min(1),
				shiftTypeId: z.string().min(1),
			}),
		)
		.min(1),
	isActive: z.boolean().optional(),
});

export const UpdateScheduleTemplateSchema = CreateScheduleTemplateSchema.partial();

export const CreateEmployeeScheduleSchema = z.object({
	employeeId: z.string().min(1),
	scheduleTemplateId: z.string().min(1),
	startDate: z.coerce.date(),
	endDate: z.coerce.date().optional().nullable(),
	departmentId: z.string().optional().nullable(),
	createdByEmployeeId: z.string().optional().nullable(),
});

export const UpdateEmployeeScheduleSchema = CreateEmployeeScheduleSchema.partial();

export const CreateScheduleOverrideSchema = z.object({
	employeeId: z.string().min(1),
	date: z.coerce.date(),
	shiftTypeId: z.string().min(1).optional().nullable(),
	shiftSnapshot: z
		.object({
			source: z.string().optional().nullable(),
			shiftTypeId: z.string().optional().nullable(),
			shiftTypeName: z.string().optional().nullable(),
			shiftTypeCode: z.string().optional().nullable(),
			name: z.string().optional().nullable(),
			code: z.string().optional().nullable(),
			isOvernight: z.boolean().optional(),
			isOff: z.boolean().optional(),
			breakMinutes: z.number().min(0).optional().nullable(),
			startTime: z.string().optional().nullable(),
			endTime: z.string().optional().nullable(),
			shiftHour: z.number().min(0).optional().nullable(),
			timeSlots: z.array(timeSlotSchema).optional(),
		})
		.passthrough()
		.optional()
		.nullable(),
	reason: z.string().optional(),
	createdByEmployeeId: z.string().optional().nullable(),
}).refine((value) => Boolean(value.shiftTypeId) || Boolean(value.shiftSnapshot), {
	message: "Either shiftTypeId or shiftSnapshot is required.",
	path: ["shiftSnapshot"],
});
