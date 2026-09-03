import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import yearlyScheduleService from "~/services/yearlySchedule.service";
import type {
	YearlySchedule,
	YearlySchedulePayload,
	YearlySchedulesResponse,
} from "~/types/yearlySchedule";
import { toast } from "sonner";

const YEARLY_KEYS = {
	all: ["yearlySchedules"] as const,
	lists: () => [...YEARLY_KEYS.all, "list"] as const,
	list: (filters: Record<string, any>) => [...YEARLY_KEYS.lists(), { filters }] as const,
	details: () => [...YEARLY_KEYS.all, "detail"] as const,
	detail: (id: string) => [...YEARLY_KEYS.details(), id] as const,
};

export const useYearlySchedules = (enabled: boolean = true) => {
	return useQuery<YearlySchedulesResponse>({
		queryKey: YEARLY_KEYS.lists(),
		queryFn: async () => yearlyScheduleService.getYearlySchedules(),
		enabled,
		staleTime: 5 * 60 * 1000,
	});
};

export const useYearlySchedule = (id: string, enabled: boolean = true) => {
	return useQuery<YearlySchedule>({
		queryKey: YEARLY_KEYS.detail(id),
		queryFn: async () =>
			(await yearlyScheduleService.getYearlySchedule(id)).data.yearlyschedule,
		enabled: enabled && !!id,
		staleTime: 5 * 60 * 1000,
	});
};

export const useCreateYearlySchedule = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (payload: YearlySchedulePayload) =>
			yearlyScheduleService.createYearlySchedule(payload),
		onSuccess: () => {
			toast.success("Yearly schedule created");
			qc.invalidateQueries({ queryKey: YEARLY_KEYS.lists() });
		},
		onError: (e: any) => toast.error(e?.message || "Failed to create yearly schedule"),
	});
};

export const useUpdateYearlySchedule = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, payload }: { id: string; payload: Partial<YearlySchedulePayload> }) =>
			yearlyScheduleService.updateYearlySchedule(id, payload),
		onSuccess: (_res, vars) => {
			toast.success("Yearly schedule updated");
			qc.invalidateQueries({ queryKey: YEARLY_KEYS.detail(vars.id) });
			qc.invalidateQueries({ queryKey: YEARLY_KEYS.lists() });
		},
		onError: (e: any) => toast.error(e?.message || "Failed to update yearly schedule"),
	});
};

export const useDeleteYearlySchedule = () => {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => yearlyScheduleService.deleteYearlySchedule(id),
		onSuccess: () => {
			toast.success("Yearly schedule deleted");
			qc.invalidateQueries({ queryKey: YEARLY_KEYS.lists() });
		},
		onError: (e: any) => toast.error(e?.message || "Failed to delete yearly schedule"),
	});
};

