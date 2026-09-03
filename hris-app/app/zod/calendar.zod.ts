import { z } from "zod";
import type { CalendarItem } from "./calendar-item.zod";

// CalendarType Enum
export const CalendarType = z.enum(["COMPANY", "DEPARTMENT", "REGIONAL"]);

export type CalendarType = z.infer<typeof CalendarType>;

// Calendar Schema (full, including ID)
export const CalendarSchema = z.object({
	id: z.string(),
	organizationId: z.string().min(1),
	name: z.string().min(1),
	description: z.string().optional(),
	type: z.enum(["COMPANY", "DEPARTMENT", "REGIONAL"]),
	year: z.number().int(),
	country: z.string().optional(),
	region: z.string().optional(),
	isActive: z.boolean(),
	isDeleted: z.boolean(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

// Extended Calendar Schema with optional items (for when fields parameter includes items)
export const CalendarWithItemsSchema = CalendarSchema.extend({
	items: z.array(z.any()).optional(), // Using z.any() to avoid circular dependency
});

export type Calendar = z.infer<typeof CalendarSchema>;
export type CalendarWithItems = z.infer<typeof CalendarWithItemsSchema>;

// Create Calendar Schema (excluding ID, createdAt, updatedAt, and computed fields)
export const CreateCalendarSchema = CalendarSchema.omit({
	id: true,
	isDeleted: true,
	createdAt: true,
	updatedAt: true,
}).partial({
	description: true,
	type: true,
	country: true,
	region: true,
});

export type CreateCalendar = z.infer<typeof CreateCalendarSchema>;

// Update Calendar Schema (partial, excluding immutable fields and relations)
export const UpdateCalendarSchema = CalendarSchema.omit({
	id: true,
	createdAt: true,
	updatedAt: true,
	isDeleted: true,
}).partial();

export type UpdateCalendar = z.infer<typeof UpdateCalendarSchema>;

export type CalendarWithRelations = Calendar & {
	items: CalendarItem[];
};
