import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import workScheduleService from "~/services/workSchedule.service";
import type {
	CreateWorkScheduleRequest,
	UpdateWorkScheduleRequest,
	WorkSchedule,
	WorkSchedulesResponse,
} from "~/types/workSchedule";
import { toast } from "sonner";

// Query keys
const WORK_SCHEDULE_KEYS = {
	all: ["workSchedules"] as const,
	lists: () => [...WORK_SCHEDULE_KEYS.all, "list"] as const,
	list: (filters: Record<string, any>) => [...WORK_SCHEDULE_KEYS.lists(), { filters }] as const,
	details: () => [...WORK_SCHEDULE_KEYS.all, "detail"] as const,
	detail: (id: string) => [...WORK_SCHEDULE_KEYS.details(), id] as const,
};

// Get all work schedules
export const useWorkSchedules = (enabled: boolean = true) => {
	return useQuery<WorkSchedulesResponse>({
		queryKey: WORK_SCHEDULE_KEYS.lists(),
		queryFn: () => workScheduleService.getWorkSchedules(),
		enabled,
		staleTime: 5 * 60 * 1000, // 5 minutes
		retry: 3, // Retry 3 times on failure
		retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
	});
};

// Get a specific work schedule
export const useWorkSchedule = (id: string, enabled: boolean = true) => {
	return useQuery({
		queryKey: WORK_SCHEDULE_KEYS.detail(id),
		queryFn: async () => {
			const response = await workScheduleService.getWorkSchedule(id);
			return response.data.scheduleTemplate || response.data.schedule;
		},
		enabled: enabled && !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

// Create work schedule mutation
export const useCreateWorkSchedule = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (data: CreateWorkScheduleRequest) =>
			workScheduleService.createWorkSchedule(data),
		onSuccess: (response) => {
			// Invalidate and refetch work schedules list
			queryClient.invalidateQueries({ queryKey: WORK_SCHEDULE_KEYS.lists() });
			toast.success("Work schedule created successfully");
		},
		onError: (error: any) => {
			console.error("Error creating work schedule:", error);
			toast.error(error.message || "Failed to create work schedule");
		},
	});
};

// Update work schedule mutation
export const useUpdateWorkSchedule = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: UpdateWorkScheduleRequest }) =>
			workScheduleService.updateWorkSchedule(id, payload),
		onSuccess: (response, variables) => {
			// Invalidate and refetch work schedules list
			queryClient.invalidateQueries({ queryKey: WORK_SCHEDULE_KEYS.lists() });
			// Invalidate specific work schedule detail
			queryClient.invalidateQueries({ queryKey: WORK_SCHEDULE_KEYS.detail(variables.id) });
			toast.success("Work schedule updated successfully");
		},
		onError: (error: any) => {
			console.error("Error updating work schedule:", error);
			toast.error(error.message || "Failed to update work schedule");
		},
	});
};

// Delete work schedule mutation
export const useDeleteWorkSchedule = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => workScheduleService.deleteWorkSchedule(id),
		onSuccess: () => {
			// Invalidate and refetch work schedules list
			queryClient.invalidateQueries({ queryKey: WORK_SCHEDULE_KEYS.lists() });
			toast.success("Work schedule deleted successfully");
		},
		onError: (error: any) => {
			console.error("Error deleting work schedule:", error);
			toast.error(error.message || "Failed to delete work schedule");
		},
	});
};
