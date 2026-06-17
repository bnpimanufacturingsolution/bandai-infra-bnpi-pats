import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";
import type { ApiQueryParams } from "./api-service";

export interface CalendarEvent {
	id: string;
	calendarId: string;
	title: string;
	description?: string;
	type: "HOLIDAY" | "COMPANY_EVENT" | "MEETING" | "TRAINING" | "DEADLINE" | "OTHER";
	startDate: string;
	endDate: string;
	isRecurring: boolean;
	isPaid: boolean;
	isWorkday: boolean;
	color?: string;
	createdAt: string;
	updatedAt: string;
}

export interface CreateCalendarEventRequest {
	calendarId: string;
	title: string;
	description?: string;
	type?: "HOLIDAY" | "COMPANY_EVENT" | "MEETING" | "TRAINING" | "DEADLINE" | "OTHER";
	startDate: string;
	endDate: string;
	isRecurring?: boolean;
	isPaid?: boolean;
	isWorkday?: boolean;
	color?: string;
	organizationId: string;
}

export interface UpdateCalendarEventRequest {
	calendarId?: string;
	title?: string;
	description?: string;
	type?: "HOLIDAY" | "COMPANY_EVENT" | "MEETING" | "TRAINING" | "DEADLINE" | "OTHER";
	startDate?: string;
	endDate?: string;
	isRecurring?: boolean;
	isPaid?: boolean;
	isWorkday?: boolean;
	color?: string;
}

export interface CalendarEventResponse {
	success: boolean;
	message: string;
	data: {
		calendarEvent: CalendarEvent;
	};
}

export interface CalendarEventsResponse {
	success: boolean;
	message: string;
	data: {
		calendarEvents: CalendarEvent[];
		pagination?: {
			total: number;
			page: number;
			limit: number;
		};
	};
}

class CalendarEventsService extends APIService {
	async getCalendarEvents(document: boolean = false): Promise<CalendarEventsResponse> {
		const queryString = this.document(document).getQueryString();
		const response = await hrisApiClient.get<CalendarEventsResponse>(
			`/api/calendarEvent${queryString}`,
		);
		if (!response?.data) throw new Error("Invalid calendar events response");
		return response.data;
	}

	async getCalendarEvent(id: string): Promise<CalendarEventResponse> {
		const response = await hrisApiClient.get<CalendarEventResponse>(`/api/calendarEvent/${id}`);
		if (!response?.data) throw new Error("Invalid calendar event response");
		return response.data;
	}

	async createCalendarEvent(payload: CreateCalendarEventRequest): Promise<CalendarEventResponse> {
		const response = await hrisApiClient.post<CalendarEventResponse>(
			"/api/calendarEvent",
			payload,
		);
		if (!response?.data) throw new Error("Invalid create calendar event response");
		return response.data;
	}

	async updateCalendarEvent(
		id: string,
		payload: UpdateCalendarEventRequest,
	): Promise<CalendarEventResponse> {
		const response = await hrisApiClient.patch<CalendarEventResponse>(
			`/api/calendarEvent/${id}`,
			payload,
		);
		if (!response?.data) throw new Error("Invalid update calendar event response");
		return response.data;
	}

	async deleteCalendarEvent(id: string): Promise<void> {
		await hrisApiClient.delete(`/api/calendarEvent/${id}`);
	}
}

const calendarEventsService = new CalendarEventsService();
export default calendarEventsService;

