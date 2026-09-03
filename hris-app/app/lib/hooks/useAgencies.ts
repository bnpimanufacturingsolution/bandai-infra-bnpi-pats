import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import agenciesService, {
	type AgenciesResponse,
	type Agency,
	type CreateAgencyRequest,
	type UpdateAgencyRequest,
} from "~/services/agencies.service";
import type { ApiQueryParams } from "~/services/api-service";

export const agenciesQueryKeys = {
	agencies: {
		all: ["agencies"] as const,
		lists: () => [...agenciesQueryKeys.agencies.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...agenciesQueryKeys.agencies.lists(), { params }] as const,
		details: () => [...agenciesQueryKeys.agencies.all, "detail"] as const,
		detail: (id: string) => [...agenciesQueryKeys.agencies.details(), id] as const,
	},
};

export const useAgencies = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery<AgenciesResponse>({
		queryKey: agenciesQueryKeys.agencies.list(params),
		queryFn: () =>
			agenciesService
				.clearQueryParams()
				.select([
					"id",
					"name",
					"code",
					"status",
					"contactName",
					"contactEmail",
					"contactPhone",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true, count: true, pagination: true })
				.getAgencies(),
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000,
	});

export const useAgency = (id: string) =>
	useQuery<Agency>({
		queryKey: agenciesQueryKeys.agencies.detail(id),
		queryFn: () => agenciesService.getAgencyById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});

export const useCreateAgency = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: CreateAgencyRequest) => agenciesService.createAgency(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: agenciesQueryKeys.agencies.all });
			sonnerToast.success("Agency created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create agency");
		},
	});
};

export const useUpdateAgency = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateAgencyRequest }) =>
			agenciesService.updateAgency(id, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: agenciesQueryKeys.agencies.all });
			sonnerToast.success("Agency updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update agency");
		},
	});
};

export const useDeleteAgency = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => agenciesService.deleteAgency(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: agenciesQueryKeys.agencies.all });
			sonnerToast.success("Agency deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete agency");
		},
	});
};

export const useImportAgencies = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (file: File) => agenciesService.importAgencies(file),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: agenciesQueryKeys.agencies.all });
			sonnerToast.success("Agencies imported successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import agencies");
		},
	});
};
