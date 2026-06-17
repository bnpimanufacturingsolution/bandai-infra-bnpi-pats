import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import leaveSettingsService, {
	type LeaveType,
	type UpdateLeavePolicyPayload,
} from "~/services/leave-settings.service";

export const leaveSettingsQueryKeys = {
	all: ["leave-settings"] as const,
	list: () => [...leaveSettingsQueryKeys.all, "list"] as const,
};

export const useLeaveSettings = () => {
	return useQuery({
		queryKey: leaveSettingsQueryKeys.list(),
		queryFn: () => leaveSettingsService.getLeaveSettings(),
		staleTime: 5 * 60 * 1000,
	});
};

export const useUpdateLeaveSetting = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			leaveType,
			payload,
		}: {
			leaveType: LeaveType;
			payload: UpdateLeavePolicyPayload;
		}) => leaveSettingsService.updateLeaveSetting(leaveType, payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: leaveSettingsQueryKeys.all });
			toast.success("Leave setting updated successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to update leave setting");
		},
	});
};
