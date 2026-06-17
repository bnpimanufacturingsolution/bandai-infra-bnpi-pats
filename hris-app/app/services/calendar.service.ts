import type {
	Calendar,
	CalendarWithRelations,
	CreateCalendar,
	UpdateCalendar,
} from "~/zod/calendar.zod";
import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";

export interface CalendarResponse {
	success: boolean;
	message: string;
	data: {
		calendar: Calendar;
	};
}

export interface CalendarsResponse {
	success?: boolean;
	message?: string;
	data?: {
		calendars: (Calendar & { items?: any[] })[];
		pagination?: {
			total: number;
			page: number;
			limit: number;
			totalPages?: number;
			hasNext?: boolean;
			hasPrev?: boolean;
		};
	};
	// Support direct response format as well
	calendars?: (Calendar & { items?: any[] })[];
	pagination?: {
		total: number;
		page: number;
		limit: number;
		totalPages?: number;
		hasNext?: boolean;
		hasPrev?: boolean;
	};
}

export interface CalendarWithRelationsResponse {
	success: boolean;
	message: string;
	data: {
		calendar: CalendarWithRelations;
	};
}

class CalendarService extends APIService {
	/**
	 * Get all calendars with optional filtering, pagination, and sorting
	 * Uses query parameters set via method chaining (select, search, paginate, sort, setParams)
	 * @returns Promise<CalendarsResponse> - Calendars response with pagination
	 */
	async getCalendars(): Promise<CalendarsResponse> {
		try {
			// Set the auth token for HRIS API client

			const queryString = this.getQueryString();
			const endpoint = `/api/calendar${queryString}`;

			console.log("Fetching calendars from HRIS API:", endpoint);

			const response = await hrisApiClient.get<any>(endpoint);

			console.log("Raw API Response:", response);
			console.log("Response.data:", response.data);

			if (!response.data) {
				throw new Error("Failed to fetch calendars - no data in response");
			}

			// The API returns { data: { calendars: [...], pagination: {...} } }
			// Wrap it in the expected format if needed
			const apiData = response.data;

			// Check if response.data has the nested structure
			if (apiData.data && apiData.data.calendars) {
				// Already in correct format: { data: { calendars, pagination } }
				return apiData as CalendarsResponse;
			} else if (apiData.calendars) {
				// Direct format: { calendars, pagination }
				// Wrap it
				return {
					data: {
						calendars: apiData.calendars,
						pagination: apiData.pagination,
					},
				} as CalendarsResponse;
			} else {
				console.error("Unexpected API response structure:", apiData);
				throw new Error("Invalid API response structure");
			}
		} catch (error: any) {
			throw new Error(
				(error.errors && error.errors[0] && error.errors[0].message) ||
					error.message ||
					"Error fetching calendars",
			);
		}
	}

	async getCalendar(id: string): Promise<Calendar> {
		try {
			const endpoint = `/api/calendar/${id}`;
			const response = await hrisApiClient.get<any>(endpoint);
			console.log("Raw API Response for getCalendar:", response);

			if (!response.data) {
				throw new Error("Calendar not found");
			}

			// Extract calendar from nested structure: response.data.data or response.data
			let calendarData = response.data;
			if (calendarData && typeof calendarData === "object" && "data" in calendarData) {
				calendarData = calendarData.data;
			}

			if (!calendarData) {
				throw new Error("Calendar data is undefined");
			}

			return calendarData as Calendar;
		} catch (error: any) {
			console.error("Error fetching calendar:", error);
			throw new Error(
				(error.errors && error.errors[0] && error.errors[0].message) ||
					error.message ||
					"Error fetching calendar",
			);
		}
	}

	async getCalendarWithRelations(id: string): Promise<CalendarWithRelationsResponse> {
		const response = await hrisApiClient.get<any>(
			`/api/calendar/${id}?fields=items,id,organizationId,name,description,year`,
		);
		console.log("Raw API Response for getCalendarWithRelations:", response);
		if (!response?.data) throw new Error("Invalid calendar response");

		// Check if response is already wrapped
		if (response.data.data?.calendar) {
			return response.data;
		}

		// If response.data is the calendar directly, wrap it
		return {
			success: true,
			message: "Calendar fetched successfully",
			data: {
				calendar: response.data,
			},
		};
	}

	async createCalendar(payload: CreateCalendar): Promise<CalendarResponse> {
		try {
			const response = await hrisApiClient.post<CalendarResponse>("/api/calendar", payload);
			if (!response?.data) throw new Error("Invalid create calendar response");
			return response.data;
		} catch (error: any) {
			console.error("Error creating calendar:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error creating calendar",
			);
		}
	}

	async updateCalendar(id: string, payload: UpdateCalendar): Promise<CalendarResponse> {
		try {
			const response = await hrisApiClient.patch<CalendarResponse>(
				`/api/calendar/${id}`,
				payload,
			);
			if (!response?.data) throw new Error("Invalid update calendar response");
			return response.data;
		} catch (error: any) {
			console.error("Error updating calendar:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error updating calendar",
			);
		}
	}

	async deleteCalendar(id: string): Promise<void> {
		try {
			await hrisApiClient.delete(`/api/calendar/${id}`);
		} catch (error: any) {
			console.error("Error deleting calendar:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error deleting calendar",
			);
		}
	}
}

const calendarService = new CalendarService();
export default calendarService;

