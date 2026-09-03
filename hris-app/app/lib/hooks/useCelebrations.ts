import { useQuery } from "@tanstack/react-query";
import celebrationsService, {
	type GetBirthdayCelebrantsParams,
} from "~/services/celebrations.service";
import type { BirthdayCelebrantsResponseData } from "~/types/celebrations";

export const celebrationsQueryKeys = {
	all: ["celebrations"] as const,
	birthdays: (params: GetBirthdayCelebrantsParams) =>
		[
			...celebrationsQueryKeys.all,
			"birthdays",
			params.month,
			params.year,
			params.type || "ALL",
			params.search || "",
		] as const,
};

export const useBirthdayCelebrants = (params: GetBirthdayCelebrantsParams) => {
	return useQuery<BirthdayCelebrantsResponseData>({
		queryKey: celebrationsQueryKeys.birthdays(params),
		queryFn: () => celebrationsService.getBirthdayCelebrants(params),
		enabled: params.month >= 1 && params.month <= 12 && params.year >= 1900,
		staleTime: 60 * 1000,
	});
};
