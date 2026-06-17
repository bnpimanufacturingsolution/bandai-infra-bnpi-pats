import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import checklistItemsService, {
	type ChecklistItemsResponse,
} from "~/services/checklistItems.service";
import type {
	ChecklistItem,
	CreateChecklistItem,
	UpdateChecklistItem,
	ChecklistStatus,
} from "~/zod/checklist-item";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";
import { employeesQueryKeys } from "./useEmployees";
import { boardingProcessQueryKeys } from "./useBoardingProcess";

// Query keys structure
export const checklistItemsQueryKeys = {
	checklistItems: {
		all: ["checklistItems"] as const,
		lists: () => [...checklistItemsQueryKeys.checklistItems.all, "list"] as const,
		list: (params?: ApiQueryParams) =>
			[...checklistItemsQueryKeys.checklistItems.lists(), { params }] as const,
		details: () => [...checklistItemsQueryKeys.checklistItems.all, "detail"] as const,
		detail: (id: string) => [...checklistItemsQueryKeys.checklistItems.details(), id] as const,
		byProcess: (processId: string) =>
			[...checklistItemsQueryKeys.checklistItems.all, "byProcess", processId] as const,
	},
};

/**
 * Hook to fetch list of checklist items with filters
 */
export const useChecklistItems = (params?: ApiQueryParams) => {
	return useQuery<ChecklistItemsResponse>({
		queryKey: checklistItemsQueryKeys.checklistItems.list(params),
		queryFn: () => {
			return checklistItemsService
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
				.getChecklistItems();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
		enabled: params !== undefined,
	});
};

/**
 * Hook to fetch a single checklist item by ID
 */
export const useChecklistItem = (id: string) => {
	return useQuery<ChecklistItem>({
		queryKey: checklistItemsQueryKeys.checklistItems.detail(id),
		queryFn: () => checklistItemsService.getChecklistItemById(id),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Hook to fetch checklist items by process ID
 */
export const useChecklistItemsByProcess = (processId: string) => {
	return useQuery<ChecklistItem[]>({
		queryKey: checklistItemsQueryKeys.checklistItems.byProcess(processId),
		queryFn: () => checklistItemsService.getChecklistItemsByProcessId(processId),
		enabled: !!processId,
		staleTime: 5 * 60 * 1000,
	});
};

/**
 * Mutation hook to create a new checklist item
 */
export const useCreateChecklistItem = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateChecklistItem) => {
			return await checklistItemsService.createChecklistItem(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: checklistItemsQueryKeys.checklistItems.all,
			});
			sonnerToast.success("Checklist item created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create checklist item");
		},
	});
};

/**
 * Mutation hook to update an existing checklist item
 */
export const useUpdateChecklistItem = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateChecklistItem }) => {
			return await checklistItemsService.updateChecklistItem(id, payload);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: checklistItemsQueryKeys.checklistItems.all,
			});
			queryClient.invalidateQueries({
				queryKey: checklistItemsQueryKeys.checklistItems.detail(data.id),
			});

			// Invalidate boarding process queries to refresh the boarding process data
			queryClient.invalidateQueries({
				queryKey: boardingProcessQueryKeys.boardingProcesses.all,
			});

			// Invalidate employee queries to refresh employee data with boarding processes
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.all,
			});

			sonnerToast.success("Checklist item updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update checklist item");
		},
	});
};

/**
 * Mutation hook to update checklist item status
 */
export const useUpdateChecklistItemStatus = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			id,
			status,
			completedBy,
			completedByName,
			comments,
		}: {
			id: string;
			status: ChecklistStatus;
			completedBy?: string;
			completedByName?: string;
			comments?: string;
		}) => {
			return await checklistItemsService.updateChecklistItemStatus(
				id,
				status,
				completedBy,
				completedByName,
				comments,
			);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: checklistItemsQueryKeys.checklistItems.all,
			});
			queryClient.invalidateQueries({
				queryKey: checklistItemsQueryKeys.checklistItems.detail(data.id),
			});

			// Invalidate boarding process queries to refresh the boarding process data
			queryClient.invalidateQueries({
				queryKey: boardingProcessQueryKeys.boardingProcesses.all,
			});

			// Invalidate employee queries to refresh employee data with boarding processes
			queryClient.invalidateQueries({
				queryKey: employeesQueryKeys.employees.all,
			});

			sonnerToast.success("Checklist item status updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update checklist item status");
		},
	});
};

/**
 * Mutation hook to delete a checklist item
 */
export const useDeleteChecklistItem = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			return await checklistItemsService.deleteChecklistItem(id);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: checklistItemsQueryKeys.checklistItems.all,
			});
			sonnerToast.success("Checklist item deleted successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to delete checklist item");
		},
	});
};
