import { useMemo } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import devicesService, {
	type DevicesResponse,
	type DeviceEventsResponse,
	type DeviceHealthResponse,
	type DeviceSyncPreviewResponse,
	type DeviceSyncRunsResponse,
	type DeviceActivityResponse,
	type DeviceImportJobProgress,
	type DeviceUserSyncJobStartRequest,
	type DeviceUserSyncJobProgress,
	type DeviceUserMergeJobProgress,
	type DeviceUserMergeApplyPayload,
	type DeviceUserExportRequest,
	type DeviceUserImportPreviewRequest,
	type DeviceUserImportExecuteRequest,
	type DeviceUsersResponse,
	type DeviceEventsResetScope,
	type HikvisionListenerAction,
	type HikvisionListenerStatus,
	type CreateDeviceRequest,
	type UpdateDeviceRequest,
	type ZktecoAttendanceSyncRequest,
} from "../../services/devices.service";
import {
	buildDeviceReachabilitySummary,
	type DeviceReachabilitySummary,
} from "../device-reachability";
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
		events: (params?: ApiQueryParams) =>
			[...queryKeys.devices.all, "events", { params }] as const,
		health: (id?: string) => [...queryKeys.devices.all, "health", id] as const,
		hikvisionListener: () => [...queryKeys.devices.all, "hikvision-listener"] as const,
		syncPreview: (params?: { deviceId?: string; source?: string }) =>
			[...queryKeys.devices.all, "sync-preview", { params }] as const,
		importJob: (jobId?: string) => [...queryKeys.devices.all, "import-job", jobId] as const,
		users: (
			deviceId?: string,
			params?: {
				page?: number;
				limit?: number;
				query?: string;
				status?: string;
				employeeId?: string;
			},
		) => [...queryKeys.devices.all, "users", deviceId, { params }] as const,
		employeeUsers: (
			employeeId?: string,
			params?: { page?: number; limit?: number; query?: string; status?: string },
		) => [...queryKeys.devices.all, "employee-users", employeeId, { params }] as const,
		syncRuns: (deviceId?: string, params?: { limit?: number }) =>
			[...queryKeys.devices.all, "sync-runs", deviceId, { params }] as const,
		activity: (
			deviceId?: string,
			params?: {
				limit?: number;
				status?: string;
				source?: string;
				runId?: string;
				search?: string;
			},
		) => [...queryKeys.devices.all, "activity", deviceId, { params }] as const,
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

export type DeviceHealthMapEntry = {
	deviceId: string;
	health?: DeviceHealthResponse;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	errorMessage?: string | null;
	reachability: DeviceReachabilitySummary;
};

/**
 * Parallel per-device health map for admin tables and device filters.
 * Source of truth: GET /api/device/:id/health (summary.status online|degraded|offline).
 */
export const useDeviceHealthMap = (deviceIds: string[], enabled = true) => {
	// Stabilize identity so parent .map() arrays do not thrash useQueries.
	const deviceIdsKey = (deviceIds || [])
		.map((id) => String(id || "").trim())
		.filter(Boolean)
		.sort()
		.join("|");
	const uniqueIds = useMemo(
		() => (deviceIdsKey ? deviceIdsKey.split("|") : []),
		[deviceIdsKey],
	);

	const queries = useQueries({
		queries: uniqueIds.map((deviceId) => ({
			queryKey: queryKeys.devices.health(deviceId),
			queryFn: () => devicesService.getDeviceHealth(deviceId),
			enabled: enabled && Boolean(deviceId),
			staleTime: 15 * 1000,
			refetchInterval: enabled ? 45 * 1000 : false,
			retry: 1,
		})),
	});

	const byId = useMemo(() => {
		const map = new Map<string, DeviceHealthMapEntry>();
		uniqueIds.forEach((deviceId, index) => {
			const query = queries[index];
			const health = query?.data as DeviceHealthResponse | undefined;
			const isLoading = Boolean(query?.isLoading || query?.isPending);
			const isError = Boolean(query?.isError);
			const errorMessage =
				isError && query?.error
					? String((query.error as any)?.message || query.error || "Health check failed")
					: null;
			map.set(deviceId, {
				deviceId,
				health,
				isLoading,
				isFetching: Boolean(query?.isFetching),
				isError,
				errorMessage,
				reachability: buildDeviceReachabilitySummary({
					isLoading: isLoading && !health,
					isError: isError && !health,
					summaryStatus: health?.summary?.status,
					checkedAt: health?.summary?.checkedAt,
					networkOk: health?.checks?.network?.ok,
					deviceApiOk: health?.checks?.deviceApi?.ok,
					errorMessage,
				}),
			});
		});
		return map;
	}, [queries, uniqueIds]);

	const isLoadingAny = queries.some((query) => query.isLoading || query.isPending);
	const isFetchingAny = queries.some((query) => query.isFetching);

	return {
		byId,
		deviceIds: uniqueIds,
		isLoadingAny,
		isFetchingAny,
		get: (deviceId?: string | null) => {
			if (!deviceId) return undefined;
			return byId.get(String(deviceId));
		},
	};
};

export const useHikvisionListenerStatus = (enabled = true) => {
	return useQuery<HikvisionListenerStatus>({
		queryKey: queryKeys.devices.hikvisionListener(),
		queryFn: () => devicesService.getHikvisionListenerStatus(),
		enabled,
		staleTime: 2 * 1000,
		// Listener modal must settle quickly; one failed status should not hang "Checking…".
		// The API now uses a single SSH status round-trip with a hard budget.
		refetchInterval: enabled ? 15 * 1000 : false,
		retry: 0,
		// Keep last successful snapshot visible while a quieter refresh runs.
		placeholderData: (previous) => previous,
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
		mutationFn: (payload: { deviceIds: string[] }) =>
			devicesService.planHikvisionSdkUserMerge(payload),
	});
};

export const useApplyHikvisionSdkUserMerge = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: DeviceUserMergeApplyPayload) =>
			devicesService.applyHikvisionSdkUserMerge(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["hikvision", "device-users"] });
		},
	});
};

export const useStartHikvisionSdkUserMergeJob = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: DeviceUserMergeApplyPayload) =>
			devicesService.startHikvisionSdkUserMergeJob(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["hikvision", "device-users"] });
		},
	});
};

export const useHikvisionSdkUserMergeJob = (jobId?: string | null, enabled = true) => {
	return useQuery<DeviceUserMergeJobProgress>({
		queryKey: ["hikvision", "sdk-user-merge-job", jobId],
		queryFn: () => devicesService.getHikvisionSdkUserMergeJob(jobId || ""),
		enabled: Boolean(jobId) && enabled,
		refetchInterval: (query) => (query.state.data?.status === "processing" ? 1500 : false),
		refetchIntervalInBackground: true,
		retry: false,
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
		mutationFn: async (payload: {
			deviceId: string;
			skipMissingEmployeeNo?: boolean;
			targetImportCount?: number | null;
			targetAttendanceCount?: number | null;
			targetOperationsCount?: number | null;
			includeAttendance?: boolean;
			includeOperations?: boolean;
			sourceGroup?: "all" | "attendance" | "operations" | "needsReview" | string;
			from?: string | null;
			to?: string | null;
			dryRun?: boolean;
			execute?: boolean;
			timeWindow?: "all" | "7d" | "30d" | "90d" | string;
		}) => {
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
	params: {
		page?: number;
		limit?: number;
		query?: string;
		status?: string;
		vendorUserId?: string;
		vendorUserIds?: string[];
		employeeId?: string;
	} = {},
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

export const useEmployeeDeviceUsers = (
	employeeId?: string,
	params: {
		page?: number;
		limit?: number;
		query?: string;
		status?: string;
	} = {},
	enabled = true,
) => {
	return useQuery<DeviceUsersResponse>({
		queryKey: queryKeys.devices.employeeUsers(employeeId, params),
		queryFn: () => devicesService.getEmployeeDeviceUsers(employeeId || "", params),
		enabled: Boolean(employeeId) && enabled,
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

export const usePreviewDeviceUserExport = () => {
	return useMutation({
		mutationFn: async (payload: DeviceUserExportRequest) => {
			return await devicesService.previewDeviceUserExport(payload);
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to preview device-user export");
		},
	});
};

export const useDeviceActivity = (
	deviceId?: string,
	params: {
		limit?: number;
		status?: string;
		source?: string;
		runId?: string;
		search?: string;
	} = {},
	enabled = true,
	options: { refetchInterval?: number | false } = {},
) => {
	return useQuery<DeviceActivityResponse>({
		queryKey: queryKeys.devices.activity(deviceId, params),
		queryFn: () => devicesService.getDeviceActivity(deviceId || "", params),
		enabled: Boolean(deviceId) && enabled,
		staleTime: 10 * 1000,
		refetchInterval: options.refetchInterval ?? false,
		retry: 1,
	});
};

export const useExportDeviceUsers = () => {
	return useMutation({
		mutationFn: async (payload: DeviceUserExportRequest) => {
			return await devicesService.exportDeviceUsers(payload);
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to export device users");
		},
	});
};

export const usePreviewDeviceUserImport = () => {
	return useMutation({
		mutationFn: async (payload: DeviceUserImportPreviewRequest) => {
			return await devicesService.previewDeviceUserImport(payload);
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to preview device-user import");
		},
	});
};

export const useExecuteDeviceUserImport = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (payload: DeviceUserImportExecuteRequest) => {
			return await devicesService.executeDeviceUserImport(payload);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices.all });
			queryClient.invalidateQueries({ queryKey: ["hikvision", "device-users"] });
			sonnerToast.success("Device-user import executed");
		},
		onError: (error: any) => {
			sonnerToast.error(error?.message || "Failed to execute device-user import");
		},
	});
};

export const useLinkDeviceUser = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({
			deviceUserId,
			employeeId,
		}: {
			deviceUserId: string;
			employeeId: string;
		}) => {
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
			targetDeviceId?: string;
			targetDeviceIds?: string[];
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
		onError: (error: any) =>
			sonnerToast.error(error?.message || "Failed to mirror Hikvision face"),
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
