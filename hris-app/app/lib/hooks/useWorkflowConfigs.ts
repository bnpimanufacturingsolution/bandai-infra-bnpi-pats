import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import workflowConfigsService, {
	type CreateWorkflowConfigRequest,
	type UpdateWorkflowConfigRequest,
} from "~/services/workflow-configs.service";

export const workflowConfigsQueryKeys = {
	all: ["workflow-configs"] as const,
	list: (params?: Record<string, any>) => [...workflowConfigsQueryKeys.all, "list", params] as const,
	detail: (code: string) => [...workflowConfigsQueryKeys.all, "detail", code] as const,
};

export const useWorkflowConfigs = (params?: Record<string, any>) =>
	useQuery({
		queryKey: workflowConfigsQueryKeys.list(params),
		queryFn: () => workflowConfigsService.getWorkflowConfigs(params),
	});

export const useWorkflowConfig = (code: string, enabled = true) =>
	useQuery({
		queryKey: workflowConfigsQueryKeys.detail(code),
		queryFn: () => workflowConfigsService.getWorkflowConfig(code),
		enabled: enabled && !!code,
	});

export const useInitializeWorkflowDefaults = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => workflowConfigsService.initializeDefaults(),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: workflowConfigsQueryKeys.all });
			toast.success(
				result.created > 0
					? `Initialized ${result.created} workflow defaults`
					: "Workflow defaults are already initialized",
			);
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to initialize workflow defaults");
		},
	});
};

export const useCreateWorkflowConfig = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CreateWorkflowConfigRequest) =>
			workflowConfigsService.createWorkflowConfig(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: workflowConfigsQueryKeys.all });
			toast.success("Workflow config created");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to create workflow config");
		},
	});
};

export const useUpdateWorkflowConfig = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ code, payload }: { code: string; payload: UpdateWorkflowConfigRequest }) =>
			workflowConfigsService.updateWorkflowConfig(code, payload),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: workflowConfigsQueryKeys.all });
			queryClient.invalidateQueries({
				queryKey: workflowConfigsQueryKeys.detail(variables.code),
			});
			toast.success("Workflow config updated");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to update workflow config");
		},
	});
};

export const useResetWorkflowConfig = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (code: string) => workflowConfigsService.resetWorkflowConfig(code),
		onSuccess: (_, code) => {
			queryClient.invalidateQueries({ queryKey: workflowConfigsQueryKeys.all });
			queryClient.invalidateQueries({ queryKey: workflowConfigsQueryKeys.detail(code) });
			toast.success("Workflow config reset to default");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to reset workflow config");
		},
	});
};

export const useDeleteWorkflowConfig = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (code: string) => workflowConfigsService.deleteWorkflowConfig(code),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: workflowConfigsQueryKeys.all });
			toast.success("Workflow config deleted");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to delete workflow config");
		},
	});
};
