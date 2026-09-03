import { useQuery } from "@tanstack/react-query";
import calendarItemsService from "~/services/calendar-items.service";
import type { CalendarItem } from "~/zod/calendar-item.zod";

export const holidayQueryKeys = {
	all: ["holidays"] as const,
	list: (organizationId?: string) => [...holidayQueryKeys.all, "list", organizationId] as const,
};

type HolidayType = "regular" | "special-non-working" | "special-working";

export interface LeaveHolidayItem {
	id: string;
	title: string;
	startDate: string;
	endDate: string;
	holidayType?: HolidayType;
}

const isHolidayType = (value: unknown): value is HolidayType =>
	value === "regular" || value === "special-non-working" || value === "special-working";

export const useHolidays = (organizationId?: string) => {
	return useQuery<LeaveHolidayItem[]>({
		queryKey: holidayQueryKeys.list(organizationId),
		queryFn: async () => {
			const response = await calendarItemsService
				.clearQueryParams()
				.paginate(1, 200)
				.setParams({
					document: true,
					pagination: false,
					filter: {
						type: "HOLIDAY",
					},
				})
				.getCalendarItems(organizationId || "");

			const items = response?.data?.items || [];

			return items.map((item: CalendarItem) => {
				const metadata =
					item.metadata && typeof item.metadata === "object" ? item.metadata : null;
				const holidayType = metadata?.holidayType;

				return {
					id: item.id,
					title: item.title,
					startDate:
						item.startDate instanceof Date
							? item.startDate.toISOString()
							: new Date(item.startDate).toISOString(),
					endDate:
						item.endDate instanceof Date
							? item.endDate.toISOString()
							: new Date(item.endDate).toISOString(),
					holidayType: isHolidayType(holidayType) ? holidayType : undefined,
				};
			});
		},
		enabled: !!organizationId,
		staleTime: 5 * 60 * 1000,
	});
};
