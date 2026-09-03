import { z } from "zod";

export const CalendarItemType = z.enum([
	"HOLIDAY",
	"EVENT",
	"COMPANY_EVENT",
	"MEETING",
	"DEADLINE",
	"REMINDER",
	"BIRTHDAY",
]);

export const ItemStatus = z.enum(["ACTIVE", "CANCELLED", "COMPLETED", "DRAFT"]);

// Recurrence pattern schema
export const RecurrenceSchema = z.object({
	frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
	interval: z.number().int().positive().default(1),
	endDate: z.string().datetime().optional(),
	daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
	monthDay: z.number().int().min(1).max(31).optional(),
	yearMonth: z.number().int().min(1).max(12).optional(),
});

// Reminder schema - THIS IS AN ARRAY OF OBJECTS
export const ReminderSchema = z.object({
	type: z.enum(["EMAIL", "NOTIFICATION", "SMS"]),
	minutesBefore: z.number().int().positive(),
});

// Metadata schema - properly typed with union of supported value types
export const MetadataSchema = z.record(
	z.string(),
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(z.union([z.string(), z.number(), z.boolean()])),
	]),
);

// Base CalendarItem Schema (without validation)
const BaseCalendarItemSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	year: z.number().int().min(2000).max(2100), // Year for grouping calendar items
	title: z.string().min(1, "Title is required"),
	description: z.string().optional(),
	type: CalendarItemType,

	// Date/Time fields
	startDate: z.coerce.date(),
	endDate: z.coerce.date(),
	isAllDay: z.boolean().default(false),
	timezone: z.string().default("UTC"),

	// Recurrence pattern - can be null or a valid recurrence object
	recurrence: RecurrenceSchema.nullable().optional(),

	// Additional metadata
	metadata: MetadataSchema.nullable().optional(),

	// Reminders - ARRAY OF REMINDER OBJECTS
	reminders: z.array(ReminderSchema).nullable().optional(),

	// Tags
	tags: z.array(z.string()).default([]),

	// Status
	status: ItemStatus.default("ACTIVE"),

	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

// Full CalendarItem Schema with validation
export const CalendarItemSchema = BaseCalendarItemSchema.refine(
	(data) => data.endDate >= data.startDate,
	{
		message: "End date must be after or equal to start date",
		path: ["endDate"],
	},
);

export type CalendarItem = z.infer<typeof CalendarItemSchema>;

// Create CalendarItem Schema (excluding ID, createdAt, updatedAt)
export const CreateCalendarItemSchema = BaseCalendarItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
})
	.extend({
		// Year can be optional - will be derived from startDate if not provided
		year: z.number().int().min(2000).max(2100).optional(),
		// Make optional fields explicitly optional with defaults
		isAllDay: z.boolean().optional().default(false),
		timezone: z.string().optional().default("UTC"),
		tags: z.array(z.string()).optional().default([]),
		status: ItemStatus.optional().default("ACTIVE"),
		recurrence: RecurrenceSchema.nullable().optional(),
		metadata: MetadataSchema.nullable().optional(),
		reminders: z.array(ReminderSchema).nullable().optional(),
	})
	.refine((data: any) => data.endDate >= data.startDate, {
		message: "End date must be after or equal to start date",
		path: ["endDate"],
	})
	.transform((data: any) => {
		// Derive year from startDate if not provided
		if (!data.year && data.startDate) {
			const startDate =
				data.startDate instanceof Date ? data.startDate : new Date(data.startDate);
			data.year = startDate.getFullYear();
		}
		return data;
	});

export type CreateCalendarItem = z.infer<typeof CreateCalendarItemSchema>;

// Update CalendarItem Schema (partial, excluding immutable fields)
export const UpdateCalendarItemSchema = BaseCalendarItemSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	organizationId: true,
})
	.partial()
	.refine(
		(data: any) => {
			// Validate date range if both dates are present
			if (data.startDate && data.endDate) {
				return data.endDate >= data.startDate;
			}
			return true;
		},
		{
			message: "End date must be after or equal to start date",
			path: ["endDate"],
		},
	)
	.transform((data: any) => {
		// Update year if startDate is being updated
		if (data.startDate && !data.year) {
			const startDate =
				data.startDate instanceof Date ? data.startDate : new Date(data.startDate);
			data.year = startDate.getFullYear();
		}
		return data;
	});

export type UpdateCalendarItem = z.infer<typeof UpdateCalendarItemSchema>;

// Helper function to validate if a user can see a calendar item
export const canUserViewItem = (item: CalendarItem, userId: string): boolean => {
	// All items are visible since we removed assignedUserIds
	return true;
};

// Helper to check if an item is recurring
export const isRecurring = (item: CalendarItem | CreateCalendarItem): boolean => {
	return item.recurrence !== undefined && item.recurrence !== null;
};

// Helper to generate recurring dates
export const generateRecurringDates = (
	item: CalendarItem,
	fromDate: Date,
	toDate: Date,
	maxOccurrences: number = 1000,
): Array<{ startDate: Date; endDate: Date }> => {
	if (!item.recurrence) return [];

	const occurrences: Array<{ startDate: Date; endDate: Date }> = [];
	const {
		frequency,
		interval,
		endDate: recurrenceEndDate,
		daysOfWeek,
		monthDay,
		yearMonth,
	} = item.recurrence;

	let currentDate = new Date(item.startDate);
	const duration = item.endDate.getTime() - item.startDate.getTime();
	const maxDate = recurrenceEndDate ? new Date(recurrenceEndDate) : toDate;
	let count = 0;

	while (currentDate <= maxDate && currentDate <= toDate && count < maxOccurrences) {
		if (currentDate >= fromDate) {
			let shouldInclude = true;

			if (frequency === "WEEKLY" && daysOfWeek && daysOfWeek.length > 0) {
				shouldInclude = daysOfWeek.includes(currentDate.getDay());
			}

			if (frequency === "MONTHLY" && monthDay) {
				shouldInclude = currentDate.getDate() === monthDay;
			}

			if (frequency === "YEARLY" && yearMonth && monthDay) {
				shouldInclude =
					currentDate.getMonth() + 1 === yearMonth && currentDate.getDate() === monthDay;
			}

			if (shouldInclude) {
				const occurrenceEnd = new Date(currentDate.getTime() + duration);
				occurrences.push({
					startDate: new Date(currentDate),
					endDate: occurrenceEnd,
				});
				count++;
			}
		}

		// Move to next occurrence
		switch (frequency) {
			case "DAILY":
				currentDate.setDate(currentDate.getDate() + interval);
				break;
			case "WEEKLY":
				currentDate.setDate(currentDate.getDate() + 7 * interval);
				break;
			case "MONTHLY":
				currentDate.setMonth(currentDate.getMonth() + interval);
				break;
			case "YEARLY":
				currentDate.setFullYear(currentDate.getFullYear() + interval);
				break;
		}
	}

	return occurrences;
};

// Helper to create a holiday with proper defaults
export const createHolidayDefaults = (
	title: string,
	startDate: Date,
	endDate: Date,
	recurrence?: z.infer<typeof RecurrenceSchema>,
): CreateCalendarItem => ({
	organizationId: "",
	year: startDate.getFullYear(),
	title,
	startDate,
	endDate,
	type: "HOLIDAY",
	isAllDay: true,
	timezone: "UTC",
	status: "ACTIVE",
	tags: ["holiday"],
	recurrence: recurrence || null,
});

// Helper to create yearly recurring holiday
export const createYearlyHoliday = (
	title: string,
	month: number,
	day: number,
	endYear?: number,
): CreateCalendarItem => {
	const currentYear = new Date().getFullYear();
	const startDate = new Date(currentYear, month - 1, day);
	const endDate = new Date(currentYear, month - 1, day);

	return createHolidayDefaults(title, startDate, endDate, {
		frequency: "YEARLY",
		interval: 1,
		endDate: endYear ? new Date(endYear, 11, 31).toISOString() : undefined,
		monthDay: day,
		yearMonth: month,
	});
};

// Helper to create an event with proper defaults
export const createEventDefaults = (
	title: string,
	startDate: Date,
	endDate: Date,
	assignedUserIds: string[],
): CreateCalendarItem => ({
	organizationId: "",
	year: startDate.getFullYear(),
	title,
	startDate,
	endDate,
	type: "EVENT",
	isAllDay: false,
	timezone: "UTC",
	status: "ACTIVE",
	tags: ["event"],
});
