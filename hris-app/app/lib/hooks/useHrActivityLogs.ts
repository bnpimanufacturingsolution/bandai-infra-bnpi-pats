import { keepPreviousData, useQuery } from "@tanstack/react-query";
import hrAuditLogsService, { type HrAuditLogsPayload } from "~/services/hr-audit-logs.service";
import type { ApiQueryParams } from "~/services/api-service";

export const hrAuditLogsQueryKeys = {
	hrAuditLogs: {
		all: ["hr-audit-logs"] as const,
		lists: () => [...hrAuditLogsQueryKeys.hrAuditLogs.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...hrAuditLogsQueryKeys.hrAuditLogs.lists(), { params }] as const,
	},
};

export const useHrAuditLogs = (params?: ApiQueryParams) => {
	return useQuery<HrAuditLogsPayload>({
		queryKey: hrAuditLogsQueryKeys.hrAuditLogs.list(params),
		queryFn: () =>
			hrAuditLogsService
				.select([
					"id",
					"employeeId",
					"type",
					"severity",
					"entity",
					"changes",
					"metadata",
					"description",
					"payload",
					"timestamp",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort || "timestamp", params?.order || "desc")
				.setParams({ ...params, document: true, pagination: true, count: true })
				.getHrAuditLogs(),
		placeholderData: keepPreviousData,
		staleTime: 60 * 1000,
	});
};

export const useHrActivityLogs = useHrAuditLogs;
