import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import systemProvisioningService, {
	type BootstrapAdminPayload,
	type HrSetupPayload,
	type SystemProvisioningInitializePayload,
	type ProvisioningLeavePolicyUpdate,
	type ProvisioningPayrollSettingsPayload,
	type ProvisioningPayrollSettingsResponse,
	type ProvisioningTimesheetPayload,
	type SystemProvisioningPreview,
	type SystemProvisioningStatus,
} from "~/services/system-provisioning.service";
import type { LeavePolicyConfig } from "~/services/leave-settings.service";
import type { PayrollCycleConfig } from "~/services/payroll-periods.service";
import type { TimesheetConfig } from "~/services/timesheet.service";

export const systemProvisioningQueryKeys = {
	all: ["system-provisioning"] as const,
	status: () => [...systemProvisioningQueryKeys.all, "status"] as const,
	preview: () => [...systemProvisioningQueryKeys.all, "preview"] as const,
	timesheetSettings: () => [...systemProvisioningQueryKeys.all, "timesheet-settings"] as const,
	payrollSettings: () => [...systemProvisioningQueryKeys.all, "payroll-settings"] as const,
	leaveSettings: () => [...systemProvisioningQueryKeys.all, "leave-settings"] as const,
};

export const useSystemProvisioningStatus = (enabled = true) =>
	useQuery<SystemProvisioningStatus>({
		queryKey: systemProvisioningQueryKeys.status(),
		queryFn: () => systemProvisioningService.getStatus(),
		enabled,
		staleTime: 30 * 1000,
		retry: false,
	});

export const useBootstrapAdmin = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: BootstrapAdminPayload) => systemProvisioningService.bootstrapAdmin(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: systemProvisioningQueryKeys.all });
			toast.success("Bootstrap admin created successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to create bootstrap admin");
		},
	});
};

export const useSystemProvisioningPreview = (enabled = true) =>
	useQuery<SystemProvisioningPreview>({
		queryKey: systemProvisioningQueryKeys.preview(),
		queryFn: () => systemProvisioningService.getPreview(),
		enabled,
		staleTime: 30 * 1000,
		retry: false,
	});

export const useInitializeSystemProvisioning = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload?: SystemProvisioningInitializePayload) =>
			systemProvisioningService.initialize(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: systemProvisioningQueryKeys.all });
			toast.success("System initialized successfully");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to initialize system");
		},
	});
};

export const useUpdateProvisioningHrSettings = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: HrSetupPayload) => systemProvisioningService.updateHrSettings(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: systemProvisioningQueryKeys.all });
			toast.success("HR setup values saved");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to save HR setup values");
		},
	});
};

export const useProvisioningTimesheetSettings = (enabled = true) =>
	useQuery<TimesheetConfig>({
		queryKey: systemProvisioningQueryKeys.timesheetSettings(),
		queryFn: () => systemProvisioningService.getTimesheetSettings(),
		enabled,
		retry: false,
	});

export const useUpdateProvisioningTimesheetSettings = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ProvisioningTimesheetPayload) =>
			systemProvisioningService.updateTimesheetSettings(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: systemProvisioningQueryKeys.all });
			toast.success("Timesheet settings saved");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to save timesheet settings");
		},
	});
};

export const useProvisioningPayrollSettings = (enabled = true) =>
	useQuery<ProvisioningPayrollSettingsResponse>({
		queryKey: systemProvisioningQueryKeys.payrollSettings(),
		queryFn: () => systemProvisioningService.getPayrollSettings(),
		enabled,
		retry: false,
	});

export const useUpdateProvisioningPayrollSettings = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: ProvisioningPayrollSettingsPayload) =>
			systemProvisioningService.updatePayrollSettings(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: systemProvisioningQueryKeys.all });
			toast.success("Payroll settings saved");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to save payroll settings");
		},
	});
};

export const useProvisioningLeaveSettings = (enabled = true) =>
	useQuery<LeavePolicyConfig[]>({
		queryKey: systemProvisioningQueryKeys.leaveSettings(),
		queryFn: () => systemProvisioningService.getLeaveSettings(),
		enabled,
		retry: false,
	});

export const useUpdateProvisioningLeaveSettings = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (policies: ProvisioningLeavePolicyUpdate[]) =>
			systemProvisioningService.updateLeaveSettings(policies),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: systemProvisioningQueryKeys.all });
			toast.success("Leave settings saved");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to save leave settings");
		},
	});
};

export const useActivateSystemProvisioning = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => systemProvisioningService.activate(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: systemProvisioningQueryKeys.all });
			toast.success("System setup activated");
		},
		onError: (error: any) => {
			toast.error(error?.message || "Failed to activate system setup");
		},
	});
};
