import { keepPreviousData, useQuery } from "@tanstack/react-query";
import auditLogsService, {
	type AuditLogRecord,
	type AuditLogsResponse,
} from "~/services/audit-logs.service";
import type { ApiQueryParams } from "~/services/api-service";

export const auditLogsQueryKeys = {
	auditLogs: {
		all: ["audit-logs"] as const,
		lists: () => [...auditLogsQueryKeys.auditLogs.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...auditLogsQueryKeys.auditLogs.lists(), { params }] as const,
		details: () => [...auditLogsQueryKeys.auditLogs.all, "detail"] as const,
		detail: (id: string, params?: ApiQueryParams) =>
			[...auditLogsQueryKeys.auditLogs.details(), id, { params }] as const,
	},
};

export const useAuditLogs = (params?: ApiQueryParams) => {
	return useQuery<AuditLogsResponse>({
		queryKey: auditLogsQueryKeys.auditLogs.list(params),
		queryFn: () =>
			auditLogsService
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
				.getAuditLogs(),
		placeholderData: keepPreviousData,
		staleTime: 60 * 1000,
	});
};

export const useAuditLog = (id: string, params?: ApiQueryParams) => {
	return useQuery<AuditLogRecord>({
		queryKey: auditLogsQueryKeys.auditLogs.detail(id, params),
		queryFn: () => auditLogsService.getAuditLogById(id, params),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};
