import { z } from "zod";

export const ShiftTimeSlotSchema = z.object({
	type: z.string().min(1),
	label: z.string().optional().nullable(),
	startTime: z.string().min(1),
	endTime: z.string().min(1),
});

export type ShiftTimeSlot = z.infer<typeof ShiftTimeSlotSchema>;
export type TimeSlot = ShiftTimeSlot;

export const ShiftTypeSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().min(1),
	isOvernight: z.boolean().default(false),
	isOff: z.boolean().default(false),
	timeSlots: z.array(ShiftTimeSlotSchema).default([]),
	shiftHour: z.number().min(0).default(0),
	isActive: z.boolean().default(true),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ShiftType = z.infer<typeof ShiftTypeSchema>;

export const ShiftTypeSnapshotSchema = z.object({
	source: z.string().optional().nullable(),
	shiftTypeId: z.string().optional().nullable(),
	shiftTypeName: z.string().optional().nullable(),
	shiftTypeCode: z.string().optional().nullable(),
	name: z.string().optional().nullable(),
	code: z.string().optional().nullable(),
	breakMinutes: z.number().min(0).optional().nullable(),
	startTime: z.string().optional().nullable(),
	endTime: z.string().optional().nullable(),
	isOvernight: z.boolean().optional(),
	isOff: z.boolean().optional(),
	timeSlots: z.array(ShiftTimeSlotSchema).optional(),
	shiftHour: z.number().min(0).optional(),
}).passthrough();

export const ScheduleTemplatePatternItemSchema = z.object({
	day: z.number().int().min(1),
	shiftTypeId: z.string().optional().nullable(),
	shiftSnapshot: ShiftTypeSnapshotSchema.optional().nullable(),
	shiftType: ShiftTypeSchema.optional().nullable(),
	shiftHour: z.number().min(0).optional(),
}).refine((value) => Boolean(value.shiftTypeId) || Boolean(value.shiftSnapshot), {
	message: "Pattern day requires either shift type selection or manual shift snapshot.",
});

export const ScheduleTemplateSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	code: z.string().min(1),
	description: z.string().optional().nullable(),
	cycleDays: z.number().int().min(1),
	graceLateMinutes: z.number().int().min(0).default(0),
	graceEarlyOutMinutes: z.number().int().min(0).default(0),
	pattern: z.array(ScheduleTemplatePatternItemSchema).default([]),
	totalHour: z.number().min(0).default(0),
	totalDay: z.number().int().min(0).default(0),
	isActive: z.boolean().default(true),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

export type ScheduleTemplate = z.infer<typeof ScheduleTemplateSchema>;

export const EmployeeScheduleAssignmentSchema = z.object({
	id: z.string().optional(),
	organizationId: z.string().optional(),
	employeeId: z.string().min(1),
	scheduleTemplateId: z.string().optional().nullable(),
	source: z.enum(["template", "manual"]).optional().nullable(),
	shiftTypeId: z.string().optional().nullable(),
	shiftSnapshot: ShiftTypeSnapshotSchema.optional().nullable(),
	reason: z.string().optional().nullable(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date().optional().nullable(),
	departmentId: z.string().optional().nullable(),
	createdByEmployeeId: z.string().optional().nullable(),
	scheduleTemplate: ScheduleTemplateSchema.optional().nullable(),
	createdAt: z.coerce.date().optional(),
	updatedAt: z.coerce.date().optional(),
}).refine(
	(value) => Boolean(value.scheduleTemplateId) || Boolean(value.shiftSnapshot),
	{
		message: "Employee schedule requires a template selection or manual shift snapshot.",
	},
);

export type EmployeeScheduleAssignment = z.infer<typeof EmployeeScheduleAssignmentSchema>;

export const ScheduleOverrideSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	employeeId: z.string().min(1),
	date: z.coerce.date(),
	shiftTypeId: z.string().optional().nullable(),
	shiftSnapshot: ShiftTypeSnapshotSchema.optional().nullable(),
	reason: z.string().optional().nullable(),
	createdByEmployeeId: z.string().optional().nullable(),
	isDeleted: z.boolean().default(false),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	shiftType: ShiftTypeSchema.optional().nullable(),
});

export type ScheduleOverride = z.infer<typeof ScheduleOverrideSchema>;

export const CreateShiftTypeSchema = ShiftTypeSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	shiftHour: true,
}).partial({
	timeSlots: true,
	isActive: true,
	isDeleted: true,
});

export const UpdateShiftTypeSchema = CreateShiftTypeSchema.partial();

export const CreateScheduleTemplateSchema = ScheduleTemplateSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	totalHour: true,
	totalDay: true,
}).partial({
	description: true,
	isActive: true,
	isDeleted: true,
});

export const UpdateScheduleTemplateSchema = CreateScheduleTemplateSchema.partial();

export const CreateEmployeeScheduleSchema = EmployeeScheduleAssignmentSchema.omit({
	id: true,
	organizationId: true,
	scheduleTemplate: true,
	createdAt: true,
	updatedAt: true,
});

export const UpdateEmployeeScheduleSchema = CreateEmployeeScheduleSchema.partial();

export const CreateScheduleOverrideSchema = ScheduleOverrideSchema.omit({
	id: true,
	organizationId: true,
	createdAt: true,
	updatedAt: true,
	shiftType: true,
}).partial({
	reason: true,
	createdByEmployeeId: true,
	isDeleted: true,
});

export const UpdateScheduleOverrideSchema = CreateScheduleOverrideSchema.partial();
