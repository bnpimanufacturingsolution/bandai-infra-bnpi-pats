import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import levelsService, {
	type LevelsResponse,
	type Level,
	type CreateLevelRequest,
	type UpdateLevelRequest,
} from "../../services/levels.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const queryKeys = {
	levels: {
		all: ["levels"] as const,
		lists: () => [...queryKeys.levels.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.levels.lists(), { params }] as const,
		details: () => [...queryKeys.levels.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.levels.details(), id] as const,
	},
};

/**
 * Hook to fetch list of levels with filters
 */
export const useLevels = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<LevelsResponse>({
		queryKey: queryKeys.levels.list(params),
		queryFn: () => {
			return levelsService
				.clearQueryParams()
				.select([
					"id",
					"name",
					"rank",
					"description",
					"isManager",
					"isActive",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getLevels();
		},
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useLevel = (id: string) => {
	return useQuery<Level>({
		queryKey: queryKeys.levels.detail(id),
		queryFn: () => levelsService.getLevel(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Mutation hooks
export const useCreateLevel = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateLevelRequest) => {
			return await levelsService.createLevel(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.levels.all });
			sonnerToast.success("Level created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create level");
		},
	});
};

export const useUpdateLevel = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateLevelRequest }) => {
			return await levelsService.updateLevel(id, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.levels.all });
			sonnerToast.success("Level updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update level");
		},
	});
};

export const useDeleteLevel = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await levelsService.deleteLevel(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.levels.all });
			sonnerToast.success("Level deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete level");
		},
	});
};

export const useImportLevels = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (file: File) => {
			return await levelsService.importLevels(file);
		},
		onSuccess: (data: any) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.levels.all });
			const summary = data?.data?.summary;
			if (summary) {
				sonnerToast.success(
					`Import completed: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
				);
			} else {
				sonnerToast.success("Levels imported successfully");
			}
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import levels");
		},
	});
};
