import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import workflowEngineService, {
	type CreateWorkflowInstanceRequest,
	type UpdateWorkflowInstanceRequest,
	type WorkflowInstance,
	type WorkflowInstanceQueryParams,
	type WorkflowInstancesResponse,
} from "~/services/workflow-engine.service";

export const workflowEngineKeys = {
	all: ["workflow-engine"] as const,
	lists: () => [...workflowEngineKeys.all, "list"] as const,
	list: (params?: WorkflowInstanceQueryParams) =>
		[...workflowEngineKeys.lists(), { params }] as const,
	details: () => [...workflowEngineKeys.all, "detail"] as const,
	detail: (id: string) => [...workflowEngineKeys.details(), id] as const,
};

const DEFAULT_FIELDS = [
	"id",
	"organizationId",
	"code",
	"name",
	"description",
	"domain",
	"domainRecordId",
	"requestType",
	"currentStateKey",
	"createdAt",
	"updatedAt",
] as const;

export const useWorkflowInstances = (
	params?: WorkflowInstanceQueryParams,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery<WorkflowInstancesResponse>({
		queryKey: workflowEngineKeys.list(params),
		queryFn: () =>
			workflowEngineService
				.clearQueryParams()
				.select(params?.fields || DEFAULT_FIELDS.join(","))
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ document: true, pagination: true, count: true, ...params })
				.getWorkflowInstances(),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});

export const useWorkflowInstance = (id: string, enabled = true) =>
	useQuery<WorkflowInstance>({
		queryKey: workflowEngineKeys.detail(id),
		queryFn: () => workflowEngineService.getWorkflowInstanceById(id),
		enabled: enabled && !!id,
		staleTime: 5 * 60 * 1000,
	});

export const useCreateWorkflowInstance = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: CreateWorkflowInstanceRequest) =>
			workflowEngineService.createWorkflowInstance(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: workflowEngineKeys.lists() });
			toast.success("Workflow instance created successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to create workflow instance");
		},
	});
};

export const useUpdateWorkflowInstance = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateWorkflowInstanceRequest }) =>
			workflowEngineService.updateWorkflowInstance(id, payload),
		onSuccess: (_, { id }) => {
			queryClient.invalidateQueries({ queryKey: workflowEngineKeys.detail(id) });
			queryClient.invalidateQueries({ queryKey: workflowEngineKeys.lists() });
			toast.success("Workflow instance updated successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to update workflow instance");
		},
	});
};

export const useDeleteWorkflowInstance = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => workflowEngineService.deleteWorkflowInstance(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: workflowEngineKeys.lists() });
			toast.success("Workflow instance deleted successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to delete workflow instance");
		},
	});
};
