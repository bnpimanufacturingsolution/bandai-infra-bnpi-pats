import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import boardingProcessService, {
	type BoardingProcessWithChecklistItems,
	type BoardingProcessResponse,
} from "~/services/boardingProcess.service";
import type {
	CreateBoardingProcess,
	UpdateBoardingProcess,
	BoardingType,
} from "~/zod/boarding-process";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const boardingProcessQueryKeys = {
	boardingProcesses: {
		all: ["boardingProcesses"] as const,
		lists: () => [...boardingProcessQueryKeys.boardingProcesses.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...boardingProcessQueryKeys.boardingProcesses.lists(), { params }] as const,
		details: () => [...boardingProcessQueryKeys.boardingProcesses.all, "detail"] as const,
		detail: (id: string) =>
			[...boardingProcessQueryKeys.boardingProcesses.details(), id] as const,
		byEmployee: (employeeId: string, type?: BoardingType) =>
			[
				...boardingProcessQueryKeys.boardingProcesses.all,
				"byEmployee",
				employeeId,
				type,
			] as const,
	},
};

/**
 * Hook to fetch list of boarding processes with filters
 */
export const useBoardingProcesses = (params?: ApiQueryParams) => {
	return useQuery<BoardingProcessResponse>({
		queryKey: boardingProcessQueryKeys.boardingProcesses.list(params),
		queryFn: () => {
			return boardingProcessService
				.document(params?.document !== false)
				.count(params?.count || false)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.filter(
					typeof params?.filter === "string"
						? undefined
						: (params?.filter as
								| Record<string, any>[]
								| Record<string, any>
								| undefined),
				)
				.select(params?.fields)
				.setParams(params || {})
				.getBoardingProcesses();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
		enabled: params !== undefined,
	});
};

/**
 * Hook to fetch a single boarding process by ID
 */
/**
 * Hook to fetch a single boarding process by ID
 */
export const useBoardingProcess = (
	id: string,
	options: { includeChecklistItems?: boolean; fields?: string; category?: string } = {
		includeChecklistItems: true,
	},
) => {
	return useQuery<BoardingProcessWithChecklistItems>({
		queryKey: [...boardingProcessQueryKeys.boardingProcesses.detail(id), options.category],
		queryFn: () => boardingProcessService.getBoardingProcessById(id, options),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to fetch boarding process by employee ID
 */
export const useBoardingProcessByEmployee = (
	employeeId: string,
	type?: BoardingType,
	includeChecklistItems: boolean = true,
) => {
	return useQuery<BoardingProcessWithChecklistItems | null>({
		queryKey: boardingProcessQueryKeys.boardingProcesses.byEmployee(employeeId, type),
		queryFn: () =>
			boardingProcessService.getBoardingProcessByEmployeeId(
				employeeId,
				type,
				includeChecklistItems,
			),
		enabled: !!employeeId,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Mutation hook to create a new boarding process
 */
export const useCreateBoardingProcess = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateBoardingProcess) => {
			return await boardingProcessService.createBoardingProcess(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: boardingProcessQueryKeys.boardingProcesses.all,
			});
			sonnerToast.success("Boarding process created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create boarding process");
		},
	});
};

/**
 * Mutation hook to update an existing boarding process
 */
export const useUpdateBoardingProcess = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateBoardingProcess }) => {
			return await boardingProcessService.updateBoardingProcess(id, payload);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: boardingProcessQueryKeys.boardingProcesses.all,
			});
			queryClient.invalidateQueries({
				queryKey: boardingProcessQueryKeys.boardingProcesses.detail(data.id),
			});
			sonnerToast.success("Boarding process updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update boarding process");
		},
	});
};

/**
 * Mutation hook to delete a boarding process
 */
export const useDeleteBoardingProcess = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await boardingProcessService.deleteBoardingProcess(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: boardingProcessQueryKeys.boardingProcesses.all,
			});
			sonnerToast.success("Boarding process deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete boarding process");
		},
	});
};
