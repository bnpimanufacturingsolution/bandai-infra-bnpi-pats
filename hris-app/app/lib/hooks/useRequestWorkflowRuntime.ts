import { useQuery } from "@tanstack/react-query";
import requestWorkflowRuntimeService, {
	type WorkflowPermissionsResponse,
	type WorkflowStatusesResponse,
} from "~/services/request-workflow-runtime.service";

export const queryKeys = {
	requestWorkflowRuntime: {
		all: ["requestWorkflowRuntime"] as const,
		statuses: (requestType: string) =>
			[...queryKeys.requestWorkflowRuntime.all, "statuses", requestType] as const,
		permissions: (workflowCode: string) =>
			[...queryKeys.requestWorkflowRuntime.all, "permissions", workflowCode] as const,
	},
};

export const useWorkflowStatuses = (requestType: string) => {
	return useQuery<WorkflowStatusesResponse>({
		queryKey: queryKeys.requestWorkflowRuntime.statuses(requestType),
		queryFn: () => requestWorkflowRuntimeService.getStatusesByRequestType(requestType),
		enabled: !!requestType,
		staleTime: 5 * 60 * 1000,
	});
};

export const useWorkflowPermissions = (workflowCode: string) => {
	return useQuery<WorkflowPermissionsResponse>({
		queryKey: queryKeys.requestWorkflowRuntime.permissions(workflowCode),
		queryFn: () => requestWorkflowRuntimeService.getWorkflowPermissions(workflowCode),
		enabled: !!workflowCode,
		staleTime: 5 * 60 * 1000,
	});
};
