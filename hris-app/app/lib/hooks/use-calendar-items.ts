import { useQuery, useMutation } from "@tanstack/react-query";
import calendarItemsService, {
	type CalendarItemsResponse,
	type CalendarItemResponse,
} from "../../services/calendar-items.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import { queryClient } from "~/lib/query-client";
import type { CalendarItem, CreateCalendarItem, UpdateCalendarItem } from "~/zod/calendar-item.zod";

/**
 * Hook to get all calendar items filtered by organization
 * @param organizationId - The organization ID
 * @param year - Optional year (not used for filtering now)
 * @param params - Optional query parameters
 * @returns Query result with calendar items
 */
export const useCalendarItems = (
	organizationId: string,
	year?: number,
	params?: ApiQueryParams,
) => {
	return useQuery<CalendarItemsResponse, Error, CalendarItem[]>({
		queryKey: ["calendar-items", organizationId, params],
		queryFn: () => {
			return calendarItemsService
				.clearQueryParams()
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 100)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getCalendarItems(organizationId, year);
		},
		enabled: !!organizationId,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to get a single calendar item
 * @param itemId - The item ID
 * @returns Query result with calendar item
 */
export const useCalendarItem = (itemId: string) => {
	return useQuery<CalendarItem, Error>({
		queryKey: ["calendar-item", itemId],
		queryFn: () => calendarItemsService.getCalendarItem(itemId),
		enabled: !!itemId,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to create a new calendar item
 * @returns Mutation function to create a calendar item
 */
export const useCreateCalendarItem = () => {
	return useMutation({
		mutationFn: async (payload: CreateCalendarItem) => {
			return await calendarItemsService.createCalendarItem(payload);
		},
		onSuccess: (data, variables) => {
			// Invalidate calendar items list for the organization
			if (variables.organizationId) {
				queryClient.invalidateQueries({
					queryKey: ["calendar-items", variables.organizationId],
				});
			}
			sonnerToast.success("Calendar item created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create calendar item");
		},
	});
};

/**
 * Hook to update a calendar item
 * @returns Mutation function to update a calendar item
 */
export const useUpdateCalendarItem = () => {
	return useMutation({
		mutationFn: async ({
			itemId,
			payload,
		}: {
			itemId: string;
			payload: UpdateCalendarItem;
		}) => {
			return await calendarItemsService.updateCalendarItem(itemId, payload);
		},
		onSuccess: (data, variables) => {
			// Invalidate specific calendar item
			queryClient.invalidateQueries({
				queryKey: ["calendar-item", variables.itemId],
			});
			// Invalidate calendar items lists
			queryClient.invalidateQueries({
				queryKey: ["calendar-items"],
			});
			sonnerToast.success("Calendar item updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update calendar item");
		},
	});
};

/**
 * Hook to delete a calendar item
 * @returns Mutation function to delete a calendar item
 */
export const useDeleteCalendarItem = () => {
	return useMutation({
		mutationFn: async ({ itemId }: { itemId: string }) => {
			return await calendarItemsService.deleteCalendarItem(itemId);
		},
		onSuccess: (_data, variables) => {
			// Remove specific calendar item from cache
			queryClient.removeQueries({
				queryKey: ["calendar-item", variables.itemId],
			});
			// Invalidate calendar items lists
			queryClient.invalidateQueries({
				queryKey: ["calendar-items"],
			});
			sonnerToast.success("Calendar item deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete calendar item");
		},
	});
};

export const useImportCalendarItems = () => {
	return useMutation({
		mutationFn: async (file: File) => {
			return await calendarItemsService.importCalendarItems(file);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["calendar-items"] });
			// GenericImportModal handles success and row-level summary details.
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import calendar items");
		},
	});
};
