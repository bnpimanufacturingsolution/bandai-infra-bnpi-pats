import { keepPreviousData, useQuery } from "@tanstack/react-query";
import userActivityLogsService, {
	type UserActivityLogsPayload,
	type UserActivityLogRecord,
} from "~/services/user-activity-logs.service";
import type { ApiQueryParams } from "~/services/api-service";

export const userActivityLogsQueryKeys = {
	userActivityLogs: {
		all: ["user-activity-logs"] as const,
		lists: () => [...userActivityLogsQueryKeys.userActivityLogs.all, "list"] as const,
		list: (userId: string, params?: ApiQueryParams) =>
			[...userActivityLogsQueryKeys.userActivityLogs.lists(), userId, { params }] as const,
	},
};

export const useUserActivityLogs = (
	userId: string,
	params?: ApiQueryParams,
	options?: { enabled?: boolean },
) => {
	return useQuery<UserActivityLogsPayload>({
		queryKey: userActivityLogsQueryKeys.userActivityLogs.list(userId, params),
		queryFn: () =>
			userActivityLogsService
				.clearQueryParams()
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort || "occurredAt", params?.order || "desc")
				.setParams({ ...params, document: true, pagination: true, count: true })
				.getUserActivityLogs(userId),
		placeholderData: keepPreviousData,
		staleTime: 60 * 1000,
		enabled: options?.enabled ?? !!userId,
	});
};

export type { UserActivityLogRecord };
