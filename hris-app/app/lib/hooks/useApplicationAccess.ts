import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast as sonnerToast } from "sonner";
import { applicationAccessService } from "../../services/application-access.service";
import type {
	ApplicationAccessListResponse,
	ApplicationAccessDetailResponse,
	UpdateApplicationAccessPayload,
} from "../../services/application-access.service";

// Query keys structure
export const queryKeys = {
	applicationAccess: {
		all: ["applicationAccess"] as const,
		lists: () => [...queryKeys.applicationAccess.all, "list"] as const,
		list: (params?: { page?: number; limit?: number; search?: string }) =>
			[...queryKeys.applicationAccess.lists(), { params }] as const,
		details: () => [...queryKeys.applicationAccess.all, "detail"] as const,
		detail: (employeeId: string) =>
			[...queryKeys.applicationAccess.details(), employeeId] as const,
		catalog: () => [...queryKeys.applicationAccess.all, "catalog"] as const,
	},
};

export interface ApplicationAccessListParams {
	page?: number;
	limit?: number;
	search?: string;
}

/**
 * Training & Performance access list (admin-only, Phase 3 backend).
 */
export const useApplicationAccessList = (params?: ApplicationAccessListParams) => {
	return useQuery<ApplicationAccessListResponse>({
		queryKey: queryKeys.applicationAccess.list(params),
		queryFn: () => applicationAccessService.list(params),
		staleTime: 30 * 1000,
	});
};

/**
 * Single employee's access configuration + effective access + provisioning.
 */
export const useApplicationAccessDetail = (employeeId: string) => {
	return useQuery<ApplicationAccessDetailResponse>({
		queryKey: queryKeys.applicationAccess.detail(employeeId),
		queryFn: () => applicationAccessService.get(employeeId),
		enabled: !!employeeId,
		staleTime: 15 * 1000,
	});
};

/**
 * Assignable LMS roles / EPMR subrole vocabulary from the backend catalog.
 */
export const useApplicationAccessCatalog = () => {
	return useQuery({
		queryKey: queryKeys.applicationAccess.catalog(),
		queryFn: () => applicationAccessService.getCatalog(),
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Full-replacement access configuration update (Phase 3 PUT contract).
 * The backend recomputes effective access and flips provisioning to PENDING.
 */
export const useUpdateApplicationAccess = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			employeeId,
			payload,
		}: {
			employeeId: string;
			payload: UpdateApplicationAccessPayload;
		}) => {
			return applicationAccessService.update(employeeId, payload);
		},
		onSuccess: (_data, variables) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.applicationAccess.lists() });
			queryClient.invalidateQueries({
				queryKey: queryKeys.applicationAccess.detail(variables.employeeId),
			});
			sonnerToast.success("Training & Performance access updated");
		},
		onError: (error: any) => {
			sonnerToast.error(
				error?.message || "Failed to update Training & Performance access",
			);
		},
	});
};
