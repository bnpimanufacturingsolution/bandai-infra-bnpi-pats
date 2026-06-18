import { z } from "zod";

const toUtcStartOfDay = (value: Date) => {
	const normalized = new Date(value);
	normalized.setUTCHours(0, 0, 0, 0);
	return normalized;
};

const getTodayUtc = () => toUtcStartOfDay(new Date());

const ShiftTimeSlotSchema = z.object({
	type: z.string().min(1),
	label: z.string().optional().nullable(),
	startTime: z.string().min(1),
	endTime: z.string().min(1),
});

const ShiftSnapshotSchema = z.object({
	name: z.string().optional().nullable(),
	code: z.string().optional().nullable(),
	isOvernight: z.boolean().optional(),
	isOff: z.boolean().optional(),
	timeSlots: z.array(ShiftTimeSlotSchema).optional(),
});

export const CreateEmployeeScheduleSchema = z.object({
	employeeId: z.string().min(1),
	scheduleTemplateId: z.string().min(1).optional(),
	shiftTypeId: z.string().optional().nullable(),
	shiftSnapshot: ShiftSnapshotSchema.optional().nullable(),
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional().nullable(),
	departmentId: z.string().optional().nullable(),
	createdByEmployeeId: z.string().optional().nullable(),
	reason: z.string().optional().nullable(),
}).superRefine((value, ctx) => {
	const hasTemplate = Boolean(value.scheduleTemplateId);
	const hasManual = Boolean(value.shiftSnapshot);
	if (hasTemplate && hasManual) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Provide either scheduleTemplateId or shiftSnapshot, not both.",
			path: ["scheduleTemplateId"],
		});
	}
	if (!hasTemplate && !hasManual) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Either scheduleTemplateId or shiftSnapshot is required.",
			path: ["scheduleTemplateId"],
		});
	}
	if (value.startDate && toUtcStartOfDay(value.startDate) < getTodayUtc()) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Start date cannot be earlier than today.",
			path: ["startDate"],
		});
	}
	if (value.endDate && toUtcStartOfDay(value.endDate) < getTodayUtc()) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "End date cannot be earlier than today.",
			path: ["endDate"],
		});
	}
	if (
		value.startDate &&
		value.endDate &&
		toUtcStartOfDay(value.endDate) < toUtcStartOfDay(value.startDate)
	) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "End date must be on or after the start date.",
			path: ["endDate"],
		});
	}
});

export const UpdateEmployeeScheduleSchema = z
	.object({
		employeeId: z.string().min(1).optional(),
		scheduleTemplateId: z.string().min(1).optional(),
		shiftTypeId: z.string().optional().nullable(),
		shiftSnapshot: ShiftSnapshotSchema.optional().nullable(),
		startDate: z.coerce.date().optional(),
		endDate: z.coerce.date().optional().nullable(),
		departmentId: z.string().optional().nullable(),
		createdByEmployeeId: z.string().optional().nullable(),
		reason: z.string().optional().nullable(),
	})
	.superRefine((value, ctx) => {
		const hasTemplate = Boolean(value.scheduleTemplateId);
		const hasManual = Boolean(value.shiftSnapshot);
		if (hasTemplate && hasManual) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Provide either scheduleTemplateId or shiftSnapshot, not both.",
				path: ["scheduleTemplateId"],
			});
		}
		if (value.startDate && toUtcStartOfDay(value.startDate) < getTodayUtc()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Start date cannot be earlier than today.",
				path: ["startDate"],
			});
		}
		if (value.endDate && toUtcStartOfDay(value.endDate) < getTodayUtc()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "End date cannot be earlier than today.",
				path: ["endDate"],
			});
		}
		if (
			value.startDate &&
			value.endDate &&
			toUtcStartOfDay(value.endDate) < toUtcStartOfDay(value.startDate)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "End date must be on or after the start date.",
				path: ["endDate"],
			});
		}
	});
