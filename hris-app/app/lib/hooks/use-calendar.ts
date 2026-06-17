import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo } from "react";
import calendarService, {
	type CalendarsResponse,
	type CalendarResponse,
	type CalendarWithRelationsResponse,
} from "../../services/calendar.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import { queryClient } from "~/lib/query-client";
import type {
	Calendar,
	CalendarWithRelations,
	CreateCalendar,
	UpdateCalendar,
} from "~/zod/calendar.zod";
import type { CalendarItem } from "~/zod/calendar-item.zod";
import type { Holiday } from "~/components/ui/calendar";

// Calendar Event interface for display
export interface CalendarEvent {
	id: string;
	date: number;
	month: number;
	year: number;
	title: string;
	time: string;
	type: "HOLIDAY" | "MEETING" | "DEADLINE" | "EVENT" | "COMPANY_EVENT" | "REMINDER" | "OTHER";
	color: string;
	description: string | null | undefined;
	isAllDay: boolean;
}

// Helper function to get event color based on type
export const getEventColor = (type: string): string => {
	switch (type) {
		case "HOLIDAY":
			return "bg-emerald-500";
		case "MEETING":
			return "bg-blue-500";
		case "DEADLINE":
			return "bg-red-500";
		case "EVENT":
		case "COMPANY_EVENT":
			return "bg-purple-500";
		case "REMINDER":
			return "bg-amber-500";
		default:
			return "bg-gray-500";
	}
};

// Helper function to format event time
export const formatEventTime = (startDate: Date | string, isAllDay: boolean): string => {
	if (isAllDay) return "All Day";
	const date = typeof startDate === "string" ? new Date(startDate) : startDate;
	return date.toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
};

export const useCalendars = (params?: ApiQueryParams) => {
	return useQuery<CalendarsResponse>({
		queryKey: ["calendars", params],
		queryFn: () => {
			const service = calendarService.clearQueryParams();

			// Only use select if fields is not provided in params
			if (!params?.fields) {
				service.select([
					"id",
					"organizationId",
					"name",
					"description",
					"type",
					"year",
					"country",
					"region",
					"isActive",
					"createdAt",
					"updatedAt",
					"items",
				]);
			}

			return service
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getCalendars();
		},
		staleTime: 5 * 60 * 1000,
	});
};

export const useCalendar = (id: string, params?: ApiQueryParams) => {
	return useQuery<Calendar, Error>({
		queryKey: ["calendar-by-id", id, params],
		queryFn: () => {
			const service = calendarService.clearQueryParams();
			if (params?.fields) {
				service.setParams({ fields: params.fields });
			}
			return service.getCalendar(id);
		},
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};

export const useCalendarWithRelations = (id: string, params?: ApiQueryParams) => {
	console.log("useCalendarWithRelations called with id:", id);

	return useQuery<CalendarWithRelationsResponse, Error, CalendarWithRelations>({
		queryKey: ["calendar-by-id", id, "relations", params],
		queryFn: () => {
			console.log("Fetching calendar with relations for id:", id);
			return calendarService.getCalendarWithRelations(id);
		},
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
		select: (data) => {
			console.log("Raw API response:", data);
			console.log("Selected calendar data:", data.data.calendar);
			return data.data.calendar;
		},
	});
};

/**
 * Helper function to transform calendar items into Holiday format for the Calendar component
 * Processes date ranges and creates individual holiday entries for each day
 * @param items - Array of calendar items
 * @returns Array of holidays
 */
export const transformCalendarItemsToHolidays = (items: CalendarItem[] | undefined): Holiday[] => {
	if (!items || items.length === 0) return [];

	const holidays: Holiday[] = [];

	items.forEach((item) => {
		const startDate = new Date(item.startDate);
		const endDate = new Date(item.endDate);

		// Create a copy of the start date to iterate
		const currentDate = new Date(startDate);

		// Loop through each day in the date range
		while (currentDate <= endDate) {
			holidays.push({
				date: new Date(currentDate),
				name: item.title,
				// Map EVENT type to COMPANY, HOLIDAY to GOVERNMENT
				type: item.type === "HOLIDAY" ? "GOVERNMENT" : "COMPANY",
				description: item.description || undefined,
				id: item.id, // Add id to link back to calendar item
			});

			// Move to the next day
			currentDate.setDate(currentDate.getDate() + 1);
		}
	});

	return holidays;
};

/**
 * Hook to transform calendar items into calendar events for display
 * Processes date ranges and creates individual events for each day
 * @param items - Array of calendar items
 * @returns Array of calendar events
 */
export const useCalendarEvents = (items: CalendarItem[] | undefined): CalendarEvent[] => {
	return useMemo(() => {
		if (!items || items.length === 0) return [];

		const processedEvents: CalendarEvent[] = [];

		items.forEach((item) => {
			const startDate = new Date(item.startDate);
			const endDate = new Date(item.endDate);

			// Create a copy of the start date to iterate
			const currentDate = new Date(startDate);

			// Loop through each day in the date range
			while (currentDate <= endDate) {
				processedEvents.push({
					id: item.id,
					date: currentDate.getDate(),
					month: currentDate.getMonth(),
					year: currentDate.getFullYear(),
					title: item.title,
					time: formatEventTime(item.startDate, item.isAllDay),
					type: item.type as CalendarEvent["type"],
					color: getEventColor(item.type),
					description: item.description,
					isAllDay: item.isAllDay,
				});

				// Move to the next day
				currentDate.setDate(currentDate.getDate() + 1);
			}
		});

		return processedEvents;
	}, [items]);
};

export const useCreateCalendar = () => {
	return useMutation({
		mutationFn: async (payload: CreateCalendar) => {
			return await calendarService.createCalendar(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["calendars"] });
			sonnerToast.success("Calendar created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error.errors?.[0]?.message || error.message || "Failed to create calendar");
		},
	});
};

export const useUpdateCalendar = () => {
	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateCalendar }) => {
			return await calendarService.updateCalendar(id, payload);
		},
		onSuccess: (data, variables) => {
			// Invalidate list + specific detail view
			queryClient.invalidateQueries({ queryKey: ["calendars"] });
			queryClient.invalidateQueries({
				queryKey: ["calendar-by-id", variables.id],
			});
			// Optionally set updated data immediately for instant UI update
			queryClient.setQueryData(["calendar-by-id", variables.id], data);
			sonnerToast.success("Calendar updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error.errors?.[0]?.message || error.message || "Failed to update calendar");
		},
	});
};

export const useDeleteCalendar = () => {
	return useMutation({
		mutationFn: async (id: string) => {
			return await calendarService.deleteCalendar(id);
		},
		onSuccess: (_data, id) => {
			queryClient.invalidateQueries({ queryKey: ["calendars"] });
			queryClient.removeQueries({ queryKey: ["calendar-by-id", id] });
			sonnerToast.success("Calendar deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error.errors?.[0]?.message || error.message || "Failed to delete calendar");
		},
	});
};
