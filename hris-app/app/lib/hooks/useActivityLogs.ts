import { keepPreviousData, useQuery } from "@tanstack/react-query";
import activityLogsService, {
	type ActivityLogRecord,
	type ActivityLogsResponse,
} from "~/services/activity-logs.service";
import type { ApiQueryParams } from "~/services/api-service";

export const activityLogsQueryKeys = {
	activityLogs: {
		all: ["activity-logs"] as const,
		lists: () => [...activityLogsQueryKeys.activityLogs.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...activityLogsQueryKeys.activityLogs.lists(), { params }] as const,
		details: () => [...activityLogsQueryKeys.activityLogs.all, "detail"] as const,
		detail: (id: string, params?: ApiQueryParams) =>
			[...activityLogsQueryKeys.activityLogs.details(), id, { params }] as const,
	},
};

export const useActivityLogs = (params?: ApiQueryParams) => {
	return useQuery<ActivityLogsResponse>({
		queryKey: activityLogsQueryKeys.activityLogs.list(params),
		queryFn: () =>
			activityLogsService
				.select([
					"id",
					"employeeId",
					"ip",
					"path",
					"method",
					"page",
					"action",
					"description",
					"entityType",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort || "createdAt", params?.order || "desc")
				.setParams({ ...params, document: true, pagination: true, count: true })
				.getActivityLogs(),
		placeholderData: keepPreviousData,
		staleTime: 60 * 1000,
	});
};

export const useActivityLog = (id: string, params?: ApiQueryParams) => {
	return useQuery<ActivityLogRecord>({
		queryKey: activityLogsQueryKeys.activityLogs.detail(id, params),
		queryFn: () => activityLogsService.getActivityLogById(id, params),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};
