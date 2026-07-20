import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import workforceRecruitmentSettingsService from "~/services/workforce-recruitment-settings.service";

export const workforceRecruitmentSettingsKeys = {
	all: ["workforce-recruitment-settings"] as const,
	settings: () => [...workforceRecruitmentSettingsKeys.all, "settings"] as const,
	requestContext: (params?: Record<string, string | null | undefined>) =>
		[...workforceRecruitmentSettingsKeys.all, "request-context", params] as const,
};

export const useWorkforceRecruitmentSettings = () =>
	useQuery({
		queryKey: workforceRecruitmentSettingsKeys.settings(),
		queryFn: () => workforceRecruitmentSettingsService.getSettings(),
		staleTime: 5 * 60 * 1000,
	});

export const useUpdateWorkforceRecruitmentSettings = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (payload: Parameters<
			typeof workforceRecruitmentSettingsService.updateSettings
		>[0]) => workforceRecruitmentSettingsService.updateSettings(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: workforceRecruitmentSettingsKeys.all });
			toast.success("Workforce recruitment settings saved");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to save workforce recruitment settings");
		},
	});
};

export const useWorkforceRecruitmentRequestContext = (params?: {
	departmentId?: string | null;
	sectionId?: string | null;
	positionId?: string | null;
	levelId?: string | null;
}, options?: { enabled?: boolean }) =>
	useQuery({
		queryKey: workforceRecruitmentSettingsKeys.requestContext(params),
		queryFn: () => workforceRecruitmentSettingsService.getRequestContext(params),
		enabled: options?.enabled ?? true,
		staleTime: 60 * 1000,
	});
