import type { CreateCalendarItem, UpdateCalendarItem, CalendarItem } from "~/zod/calendar-item.zod";
import { hrisApiClient } from "../lib/api-client";
import { APIService } from "./api-service";

export interface CalendarItemResponse {
	success: boolean;
	message: string;
	data: CalendarItem;
}

export interface CalendarItemsResponse {
	success: boolean;
	message: string;
	data: {
		items: CalendarItem[];
		pagination?: {
			total: number;
			page: number;
			limit: number;
			totalPages?: number;
			hasNext?: boolean;
			hasPrev?: boolean;
		};
	};
}

class CalendarItemsService extends APIService {
	/**
	 * Get all calendar items filtered by organization
	 * @param organizationId - The organization ID
	 * @param year - Optional year to filter by (not used for now)
	 * @returns Promise<CalendarItemsResponse> - Calendar items response with pagination
	 */
	async getCalendarItems(organizationId: string, year?: number): Promise<CalendarItemsResponse> {
		try {
			// Merge organizationId filter with any existing filters
			const existingFilter = this.queryParams.filter;
			if (existingFilter) {
				// If filter already exists, merge with organizationId
				const mergedFilter = `${existingFilter},organizationId:${organizationId}`;
				this.queryParams.filter = mergedFilter;
			} else {
				// Otherwise, just set organizationId filter
				this.filter({ organizationId });
			}
			const queryString = this.getQueryString();
			const endpoint = `/api/calendar-item${queryString}`;

			const response = await hrisApiClient.get<any>(endpoint);

			if (!response?.data) {
				throw new Error("Failed to fetch calendar items - no data in response");
			}

			// Transform response to match expected format
			const apiData = response.data;
			if (apiData.data && apiData.data.calendarItems) {
				return {
					success: apiData.success || true,
					message: apiData.message || "Success",
					data: {
						items: apiData.data.calendarItems,
						pagination: apiData.data.pagination,
					},
				} as CalendarItemsResponse;
			} else if (apiData.calendarItems) {
				return {
					success: apiData.success || true,
					message: apiData.message || "Success",
					data: {
						items: apiData.calendarItems,
						pagination: apiData.pagination,
					},
				} as CalendarItemsResponse;
			} else {
				throw new Error("Invalid API response structure");
			}
		} catch (error: any) {
			console.error("Error fetching calendar items:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching calendar items",
			);
		}
	}

	/**
	 * Get a single calendar item by ID
	 * @param itemId - The item ID
	 * @returns Promise<CalendarItem> - Calendar item data
	 */
	async getCalendarItem(itemId: string): Promise<CalendarItem> {
		try {
			const endpoint = `/api/calendar-item/${itemId}`;
			const response = await hrisApiClient.get<any>(endpoint);

			if (!response.data) {
				throw new Error("Calendar item not found");
			}

			// Extract calendar item from nested structure: response.data.data
			let calendarItemData = response.data;
			if (
				calendarItemData &&
				typeof calendarItemData === "object" &&
				"data" in calendarItemData
			) {
				calendarItemData = calendarItemData.data;
			}

			if (!calendarItemData) {
				throw new Error("Calendar item data is undefined");
			}

			return calendarItemData as CalendarItem;
		} catch (error: any) {
			console.error("Error fetching calendar item:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error fetching calendar item",
			);
		}
	}

	/**
	 * Create a new calendar item
	 * @param payload - The calendar item data (must include organizationId and year)
	 * @returns Promise<CalendarItem> - Created calendar item
	 */
	async createCalendarItem(payload: CreateCalendarItem): Promise<CalendarItem> {
		try {
			const response = await hrisApiClient.post<any>(`/api/calendar-item`, payload);

			if (!response.data) {
				throw new Error("Failed to create calendar item");
			}

			// Extract calendar item from nested structure: response.data.data
			let calendarItemData = response.data;
			if (
				calendarItemData &&
				typeof calendarItemData === "object" &&
				"data" in calendarItemData
			) {
				calendarItemData = calendarItemData.data;
			}

			if (!calendarItemData) {
				throw new Error("Calendar item data is undefined");
			}

			return calendarItemData as CalendarItem;
		} catch (error: any) {
			console.error("Error creating calendar item:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error creating calendar item",
			);
		}
	}

	/**
	 * Update a calendar item
	 * @param itemId - The item ID
	 * @param payload - The updated calendar item data
	 * @returns Promise<CalendarItem> - Updated calendar item
	 */
	async updateCalendarItem(itemId: string, payload: UpdateCalendarItem): Promise<CalendarItem> {
		try {
			const response = await hrisApiClient.patch<any>(
				`/api/calendar-item/${itemId}`,
				payload,
			);

			if (!response.data) {
				throw new Error("Failed to update calendar item");
			}

			// Extract calendar item from nested structure: response.data.data
			let calendarItemData = response.data;
			if (
				calendarItemData &&
				typeof calendarItemData === "object" &&
				"data" in calendarItemData
			) {
				calendarItemData = calendarItemData.data;
			}

			if (!calendarItemData) {
				throw new Error("Calendar item data is undefined");
			}

			return calendarItemData as CalendarItem;
		} catch (error: any) {
			console.error("Error updating calendar item:", error);
			throw new Error(
				error.errors?.[0]?.message || error.message || "Error updating calendar item",
			);
		}
	}

	/**
	 * Delete a calendar item
	 * @param itemId - The item ID
	 * @returns Promise<void>
	 */
	async deleteCalendarItem(itemId: string): Promise<void> {
		await hrisApiClient.delete(`/api/calendar-item/${itemId}`);
	}

	async importCalendarItems(file: File): Promise<any> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await hrisApiClient.post<any>("/api/calendar-item/import", formData, {
			headers: { "Content-Type": "multipart/form-data" },
		});
		return response.data || response;
	}
}

const calendarItemsService = new CalendarItemsService();
export default calendarItemsService;
