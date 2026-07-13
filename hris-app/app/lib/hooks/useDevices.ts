import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import devicesService, {
	type DevicesResponse,
	type DeviceEventsResponse,
	type DeviceHealthResponse,
	type DeviceSyncPreviewResponse,
	type DeviceSyncRunsResponse,
	type DeviceImportJobProgress,
	type DeviceUserSyncJobStartRequest,
	type DeviceUserSyncJobProgress,
	type DeviceUsersResponse,
	type DeviceEventsResetScope,
	type HikvisionListenerAction,
	type HikvisionListenerStatus,
	type CreateDeviceRequest,
	type UpdateDeviceRequest,
	type ZktecoAttendanceSyncRequest,
} from "../../services/devices.service";
import { toast as sonnerToast } from "sonner";
import type { ApiQueryParams } from "~/services/api-service";

// Query keys structure
export const queryKeys = {
	devices: {
		all: ["devices"] as const,
		lists: () => [...queryKeys.devices.all, "list"] as const,
		list: (params?: ApiQueryParams) => [...queryKeys.devices.lists(), { params }] as const,
		details: () => [...queryKeys.devices.all, "detail"] as const,
		detail: (id: string) => [...queryKeys.devices.details(), id] as const,
		events: (params?: ApiQueryParams) => [...queryKeys.devices.all, "events", { params }] as const,
		health: (id?: string) => [...queryKeys.devices.all, "health", id] as const,
		hikvisionListener: () => [...queryKeys.devices.all, "hikvision-listener"] as const,
		syncPreview: (params?: { deviceId?: string; source?: string }) =>
			[...queryKeys.devices.all, "sync-preview", { params }] as const,
		importJob: (jobId?: string) => [...queryKeys.devices.all, "import-job", jobId] as const,
		users: (deviceId?: string, params?: { page?: number; limit?: number; query?: string; status?: string }) =>
			[...queryKeys.devices.all, "users", deviceId, { params }] as const,
		syncRuns: (deviceId?: string, params?: { limit?: number }) =>
			[...queryKeys.devices.all, "sync-runs", deviceId, { params }] as const,
	},
};

/**
 * Hook to fetch list of devices with filters
 */
export const useDevices = (params?: ApiQueryParams) => {
	return useQuery<DevicesResponse>({
		queryKey: queryKeys.devices.list(params),
		queryFn: () => {
			return devicesService
				.clearQueryParams()
				.select([
					"id",
					"name",
					"address",
					"port",
					"protocol",
					"config",
					"access",
					"organizationId",
					"createdAt",
					"updatedAt",
				])
				.search(params?.query)
				.paginate(params?.page || 1, params?.limit || 10)
				.sort(params?.sort, params?.order)
				.setParams({ ...params, document: true })
				.getDevices();
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useDevice = (id: string) => {
	return useQuery({
		queryKey: queryKeys.devices.detail(id),
		queryFn: () => devicesService.getDeviceById(id) as any,
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
};

export const useDeviceEvents = (
	params?: ApiQueryParams,
	options: { refetchInterval?: number | false } = {},
) => {
	return useQuery<DeviceEventsResponse>({
		queryKey: queryKeys.devices.events(params),
		queryFn: () => devicesService.getDeviceEvents(params),
		staleTime: 15 * 1000,
		refetchInterval: options.refetchInterval ?? 30 * 1000,
	});
};

export const useDeviceHealth = (deviceId?: string, enabled = true) => {
	return useQuery<DeviceHealthResponse>({
		queryKey: queryKeys.devices.health(deviceId),
		queryFn: () => devicesService.getDeviceHealth(deviceId || ""),
		enabled: Boolean(deviceId) && enabled,
		staleTime: 10 * 1000,
		refetchInterval: enabled && deviceId ? 30 * 1000 : false,
		retry: 1,
	});
};

export const useHikvisionListenerStatus = (enabled = true) => {
	return useQuery<HikvisionListenerStatus>({
		queryKey: queryKeys.devices.hikvisionListener(),
		queryFn: () => devicesService.getHikvisionListenerStatus(),
		enabled,
		staleTime: 2 * 1000,
		refetchInterval: enabled ? 5 * 1000 : false,
		retry: 1,
	});
};

export const useControlHikvisionListener = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (action: HikvisionListenerAction) => {
			return await devicesService.controlHikvisionListener(action);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.hikvisionListener() });
			queryClient.invalidateQueries({ queryKey: [...queryKeys.devices.all, "events"] });
			sonnerToast.success(`Hikvision listener ${data.action} requested`);
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to control Hikvision listener");
		},
	});
};

export const useDeviceImportJob = (jobId?: string | null, enabled = true) => {
	return useQuery<DeviceImportJobProgress>({
		queryKey: queryKeys.devices.importJob(jobId || undefined),
		queryFn: () => devicesService.getDeviceImportJob(jobId || ""),
		enabled: Boolean(jobId) && enabled,
		staleTime: 1000,
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status === "processing" ? 1500 : false;
		},
		retry: 1,
	});
};

export const useCancelDeviceImportJob = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (jobId: string) => {
			return await devicesService.cancelDeviceImportJob(jobId);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.devices.importJob(data?.jobId),
			});
			sonnerToast.success("Device log sync cancellation requested");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to cancel device log sync");
		},
	});
};

export const useDeviceUserSyncJob = (jobId?: string | null, enabled = true) => {
	return useQuery<DeviceUserSyncJobProgress>({
		queryKey: [...queryKeys.devices.all, "user-sync-job", jobId] as const,
		queryFn: () => devicesService.getDeviceUserSyncJob(jobId || ""),
		enabled: Boolean(jobId) && enabled,
		staleTime: 1000,
		refetchInterval: (query) => {
			const status = query.state.data?.status;
			return status === "processing" ? 1500 : false;
		},
		retry: 1,
	});
};

export const useStartDeviceUserSyncJob = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: DeviceUserSyncJobStartRequest = { mode: "full_refresh" }) => {
			return await devicesService.startDeviceUserSyncJob(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device-user sync started");
		},
		onError: () => {
			// The bulk sync modal renders inline start failures and retry actions.
		},
	});
};

export const usePlanHikvisionSdkUserMerge = () => {
	return useMutation({
		mutationFn: (payload: { deviceIds: string[] }) => devicesService.planHikvisionSdkUserMerge(payload),
	});
};

export const useApplyHikvisionSdkUserMerge = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: {
			planId: string;
			choices?: Record<string, Record<string, "A" | "B">>;
			applyAll?: "A" | "B";
		}) => devicesService.applyHikvisionSdkUserMerge(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["hikvision", "device-users"] });
		},
	});
};

export const useCancelDeviceUserSyncJob = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (jobId: string) => {
			return await devicesService.cancelDeviceUserSyncJob(jobId);
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({
				queryKey: [...queryKeys.devices.all, "user-sync-job", data?.jobId] as const,
			});
			sonnerToast.success("Device-user sync cancellation requested");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to cancel device-user sync");
		},
	});
};

export const useDeviceSyncPreview = (
	params: { deviceId?: string; source?: string },
	enabled = true,
) => {
	return useQuery<DeviceSyncPreviewResponse>({
		queryKey: queryKeys.devices.syncPreview(params),
		queryFn: () => devicesService.getDeviceSyncPreview(params),
		enabled,
		staleTime: 10 * 1000,
		refetchInterval: enabled ? 5 * 1000 : false,
		retry: 1,
	});
};

export const useTriggerZktecoAttendanceSync = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: ZktecoAttendanceSyncRequest = {}) => {
			return await devicesService.triggerZktecoAttendanceSync(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("ZKTeco sync started");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to start ZKTeco sync");
		},
	});
};

export const useTriggerHikvisionAttendanceImport = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: { deviceId: string; skipMissingEmployeeNo?: boolean; targetImportCount?: number | null }) => {
			return await devicesService.triggerHikvisionAttendanceImport(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device log sync started");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to start device log sync");
		},
	});
};

export const useDeviceUsers = (
	deviceId?: string,
	params: { page?: number; limit?: number; query?: string; status?: string; vendorUserId?: string; vendorUserIds?: string[] } = {},
	enabled = true,
) => {
	return useQuery<DeviceUsersResponse>({
		queryKey: queryKeys.devices.users(deviceId, params),
		queryFn: () => devicesService.getDeviceUsers(deviceId || "", params),
		enabled: Boolean(deviceId) && enabled,
		staleTime: 15 * 1000,
		retry: 1,
	});
};

export const useDeviceSyncRuns = (
	deviceId?: string,
	params: { limit?: number } = {},
	enabled = true,
) => {
	return useQuery<DeviceSyncRunsResponse>({
		queryKey: queryKeys.devices.syncRuns(deviceId, params),
		queryFn: () => devicesService.getDeviceSyncRuns(deviceId || "", params),
		enabled: Boolean(deviceId) && enabled,
		staleTime: 15 * 1000,
		retry: 1,
	});
};

export const useSyncDeviceUsers = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (deviceId: string) => {
			return await devicesService.syncDeviceUsers(deviceId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["hikvision", "device-users"] });
			sonnerToast.success("Device users synced");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to sync device users");
		},
	});
};

export const useLinkDeviceUser = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ deviceUserId, employeeId }: { deviceUserId: string; employeeId: string }) => {
			return await devicesService.linkDeviceUser(deviceUserId, employeeId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device user linked");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to link device user");
		},
	});
};

export const useUnlinkDeviceUser = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (deviceUserId: string) => {
			return await devicesService.unlinkDeviceUser(deviceUserId);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device user unlinked");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to unlink device user");
		},
	});
};

export const useCopyHikvisionDeviceUserToPeer = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: {
			sourceDeviceId: string;
			targetDeviceId: string;
				employeeNo: string;
				includeFingerprints?: boolean;
				includeFaceRecognition?: boolean;
		}) => {
			return await devicesService.copyHikvisionDeviceUserToPeer(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["hikvision", "device-users"] });
			sonnerToast.success("Hikvision device user copied");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to copy Hikvision device user");
		},
	});
};

export const useMirrorHikvisionFaceToPeers = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: { sourceDeviceId: string; employeeNo: string }) =>
			devicesService.mirrorHikvisionFaceToPeers(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["hikvision", "device-users"] });
			sonnerToast.success("Real face mirror requested for peer devices");
		},
		onError: (error: any) => sonnerToast.error(error?.message || "Failed to mirror Hikvision face"),
	});
};

export const useMockHikvisionFingerprintTally = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: {
			deviceId: string;
			vendorUserId: string;
			fingerprintCount: number;
			targetDeviceId?: string;
		}) => {
			return await devicesService.mockHikvisionFingerprintTally(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["hikvision", "device-users"] });
			sonnerToast.success("Synthetic fingerprint tally updated");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update synthetic fingerprint tally");
		},
	});
};

export const useMockHikvisionFaceTally = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: {
			deviceId: string;
			vendorUserId: string;
			faceCount: number;
			targetDeviceId?: string;
		}) => {
			return await devicesService.mockHikvisionFaceTally(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["hikvision", "device-users"] });
			sonnerToast.success("Synthetic face tally updated");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update synthetic face tally");
		},
	});
};

export const useResetDeviceEvents = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: DeviceEventsResetScope) => {
			return await devicesService.resetDeviceEvents(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Saved device events reset request completed");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to reset saved device events");
		},
	});
};

// Mutation hooks
export const useCreateDevice = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (payload: CreateDeviceRequest) => {
			return await devicesService.createDevice(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device created successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to create device");
		},
	});
};

export const useUpdateDevice = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, payload }: { id: string; payload: UpdateDeviceRequest }) => {
			return await devicesService.updateDevice(id, payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device updated successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to update device");
		},
	});
};

export const useDeleteDevice = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => devicesService.deleteDevice(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			sonnerToast.success("Device removed successfully");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to remove device");
		},
	});
};

export const useImportDeviceEnrollment = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (file: File) => {
			return await devicesService.importDeviceEnrollment(file);
		},
		onSuccess: (data: any) => {
			// Invalidate relevant queries
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["users"] });
		},
	});
};

