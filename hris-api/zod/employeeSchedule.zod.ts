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

const PatternDaySchema = z.object({
	day: z.number().int().min(1).max(28).optional(),
	shiftTypeId: z.string().optional().nullable(),
	shiftSnapshot: ShiftSnapshotSchema.optional().nullable(),
	isOff: z.boolean().optional(),
	startTime: z.string().optional().nullable(),
	endTime: z.string().optional().nullable(),
});

export const CreateEmployeeScheduleSchema = z.object({
	employeeId: z.string().min(1),
	scheduleTemplateId: z.string().min(1).optional(),
	shiftTypeId: z.string().optional().nullable(),
	shiftSnapshot: ShiftSnapshotSchema.optional().nullable(),
	pattern: z.array(PatternDaySchema).min(7).max(28).optional(),
	startDate: z.coerce.date().optional(),
	endDate: z.coerce.date().optional().nullable(),
	departmentId: z.string().optional().nullable(),
	createdByEmployeeId: z.string().optional().nullable(),
	reason: z.string().optional().nullable(),
	graceLateMinutes: z.number().int().min(0).optional(),
	graceEarlyOutMinutes: z.number().int().min(0).optional(),
}).superRefine((value, ctx) => {
	const hasTemplate = Boolean(value.scheduleTemplateId);
	const hasManual = Boolean(value.shiftSnapshot);
	const hasPattern = Array.isArray(value.pattern) && value.pattern.length > 0;
	const modeCount = [hasTemplate, hasManual, hasPattern].filter(Boolean).length;
	if (modeCount > 1) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Provide only one of scheduleTemplateId, shiftSnapshot, or pattern.",
			path: ["scheduleTemplateId"],
		});
	}
	if (modeCount === 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "Either scheduleTemplateId, shiftSnapshot, or pattern is required.",
			path: ["scheduleTemplateId"],
		});
	}
	if (hasPattern) {
		const length = value.pattern?.length || 0;
		if (![7, 14, 21, 28].includes(length)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Weekly hours pattern must be 7, 14, 21, or 28 days.",
				path: ["pattern"],
			});
		}
		(value.pattern || []).forEach((day, index) => {
			if (day.isOff) return;
			if (day.shiftSnapshot || day.shiftTypeId) return;
			if (day.startTime && day.endTime) return;
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Each work day needs start/end times or a shift snapshot.",
				path: ["pattern", index],
			});
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
		pattern: z.array(PatternDaySchema).min(7).max(28).optional(),
		startDate: z.coerce.date().optional(),
		endDate: z.coerce.date().optional().nullable(),
		departmentId: z.string().optional().nullable(),
		createdByEmployeeId: z.string().optional().nullable(),
		reason: z.string().optional().nullable(),
	})
	.superRefine((value, ctx) => {
		const hasTemplate = Boolean(value.scheduleTemplateId);
		const hasManual = Boolean(value.shiftSnapshot);
		const hasPattern = Array.isArray(value.pattern) && value.pattern.length > 0;
		if ([hasTemplate, hasManual, hasPattern].filter(Boolean).length > 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Provide only one of scheduleTemplateId, shiftSnapshot, or pattern.",
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
