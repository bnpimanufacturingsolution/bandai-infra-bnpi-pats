export type CalendarItemType =
	| "HOLIDAY"
	| "EVENT"
	| "COMPANY_EVENT"
	| "MEETING"
	| "DEADLINE"
	| "REMINDER"
	| "BIRTHDAY";

export type ItemStatus = "ACTIVE" | "CANCELLED" | "COMPLETED" | "DRAFT";

export interface CalendarItem {
	id: string;
	calendarId?: string;
	organizationId: string;
	title: string;
	description?: string;
	type: CalendarItemType;
	startDate: string;
	endDate: string;
	isAllDay: boolean;
	timezone: string;
	recurrence?: {
		frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
		interval: number;
		daysOfWeek?: number[];
	} | null;
	location?: string;
	isVirtual?: boolean;
	meetingUrl?: string;
	assignedUserIds?: string[];
	metadata?: Record<string, any>;
	reminders?:
		| {
				type: "NOTIFICATION" | "EMAIL" | "SMS";
				minutesBefore: number;
		  }[]
		| null;
	tags: string[];
	status: ItemStatus;
	createdAt: string;
	updatedAt: string;
}

export interface CalendarData {
	id: string;
	items: CalendarItem[];
	organizationId: string;
	name: string;
	description: string | null;
	year: number;
}

export interface CreateItemForm {
	title: string;
	description: string;
	type: CalendarItemType;
	startDate: string;
	endDate: string;
	isAllDay: boolean;
	location: string;
	isVirtual: boolean;
	meetingUrl: string;
	tags: string[];
}
