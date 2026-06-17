import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import positionsService, {
	type PositionsResponse,
	type Position,
	type CreatePositionRequest,
	type UpdatePositionRequest,
} from "../../services/positions.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const queryKeys = {
	positions: {
		all: ["positions"] as const,
		lists: () => [...queryKeys.positions.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.positions.lists(), { params }] as const,
		details: () => [...queryKeys.positions.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.positions.details(), id] as const,
	},
};

/**
 * Hook to fetch list of positions with filters
 */
export const usePositions = (
	params?: ApiQueryParams,
	options?: {
		enabled?: boolean;
	},
) => {
	return useQuery<PositionsResponse>({
		queryKey: queryKeys.positions.list(params),
		queryFn: () => {
			return positionsService
				.clearQueryParams()
				.select([
					"id",
					"title",
					"code",
					"description",
					"sectionId",
					"section.id",
					"section.name",
					"section.code",
					"section.departmentId",
					"section.department.id",
					"section.department.name",
					"section.department.code",
					"levels",
					"minSalary",
					"maxSalary",
					"isManager",
					"isOffer",
					"isActive",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getPositions();
		},
		enabled: options?.enabled ?? true,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const usePosition = (id: string) => {
	return useQuery<Position>({
		queryKey: queryKeys.positions.detail(id),
		queryFn: () => positionsService.getPositionById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Mutation hooks
export const useCreatePosition = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreatePositionRequest) => {
			return await positionsService.createPosition(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.positions.all });
			sonnerToast.success("Position created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create position");
		},
	});
};

export const useUpdatePosition = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdatePositionRequest }) => {
			return await positionsService.updatePosition(id, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.positions.all });
			sonnerToast.success("Position updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update position");
		},
	});
};

export const useDeletePosition = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await positionsService.deletePosition(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.positions.all });
			sonnerToast.success("Position deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete position");
		},
	});
};

export const useImportPositions = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (file: File) => {
			return await positionsService.importPositions(file);
		},
		onSuccess: (data: any) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.positions.all });
			const summary = data?.data?.summary;
			if (summary) {
				sonnerToast.success(
					`Import completed: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped`,
				);
			} else {
				sonnerToast.success("Positions imported successfully");
			}
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to import positions");
		},
	});
};

